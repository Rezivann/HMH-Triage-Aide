import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import wound_segmentation

client = TestClient(app)


class FakeMedSamResponse:
    def __init__(self, json_body):
        self._json_body = json_body

    def raise_for_status(self):
        pass

    def json(self):
        return self._json_body


# --- Service-level unit tests: wound_segmentation.py's own handling of
# MedSAM's raw JSON response, independent of routing behavior. No area/scale
# math anymore - this is pure segmentation pass-through. ---


class TestWoundSegmentationUnit:
    def test_valid_result_passes_through_segmentation_output(self, monkeypatch, flat_image, box):
        monkeypatch.setattr(wound_segmentation, "MEDSAM_API_KEY", "test-key")
        monkeypatch.setattr(wound_segmentation, "MEDSAM_ENDPOINT_URL", "https://example.test/medsam")
        monkeypatch.setattr(
            wound_segmentation.httpx,
            "post",
            lambda *a, **k: FakeMedSamResponse(
                {
                    "valid": True,
                    "failReasons": [],
                    "areaPx": 10000,
                    "boundingBox": {"x": 0, "y": 0, "width": 100, "height": 100},
                    "boundaryCoords": [[0, 0], [100, 0], [100, 100], [0, 100]],
                    "confidence": 0.8,
                }
            ),
        )

        result = wound_segmentation.measure_wound_area(flat_image, box())

        assert result["valid"] is True
        assert result["boundaryCoords"] == [[0, 0], [100, 0], [100, 100], [0, 100]]
        assert result["boundingBox"] == {"x": 0, "y": 0, "width": 100, "height": 100}
        assert result["confidence"] == 0.8
        # No area/scale fields at all - removed from this pipeline entirely.
        assert "areaCm2" not in result
        assert "areaPx" not in result

    def test_invalid_medsam_result_is_passed_through(self, monkeypatch, flat_image, box):
        monkeypatch.setattr(wound_segmentation, "MEDSAM_API_KEY", "test-key")
        monkeypatch.setattr(wound_segmentation, "MEDSAM_ENDPOINT_URL", "https://example.test/medsam")
        monkeypatch.setattr(
            wound_segmentation.httpx,
            "post",
            lambda *a, **k: FakeMedSamResponse({"valid": False, "failReasons": ["no_wound_found"]}),
        )

        result = wound_segmentation.measure_wound_area(flat_image, box())

        assert result["valid"] is False
        assert result["failReasons"] == ["no_wound_found"]

    def test_raises_without_medsam_config(self, monkeypatch, flat_image, box):
        monkeypatch.setattr(wound_segmentation, "MEDSAM_API_KEY", None)
        monkeypatch.setattr(wound_segmentation, "MEDSAM_ENDPOINT_URL", None)

        with pytest.raises(NotImplementedError):
            wound_segmentation.measure_wound_area(flat_image, box())


# --- Route-level tests: measurement.py itself, with the segmentation service
# mocked out. No nail-present/fallback branching anymore - just segment or
# fail. ---


class TestMeasureRoute:
    def test_valid_segmentation_returns_boundary_and_box(self, mocker, encode_image, flat_image, box):
        mocker.patch(
            "app.routes.measurement.measure_wound_area",
            return_value={
                "valid": True,
                "failReasons": [],
                "boundaryCoords": [[1, 2], [3, 4]],
                "boundingBox": {"x": 1, "y": 2, "width": 3, "height": 4},
                "confidence": 0.8,
            },
        )

        response = client.post(
            "/capture/measure",
            json={"imageRef": encode_image(flat_image), "woundBoxPrompt": box()},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is True
        assert body["boundaryCoords"] == [[1, 2], [3, 4]]
        assert body["woundBox"] == {"x": 1, "y": 2, "width": 3, "height": 4}
        assert body["confidence"] == 0.8

    def test_invalid_segmentation_returns_invalid_result(self, mocker, encode_image, flat_image, box):
        mocker.patch(
            "app.routes.measurement.measure_wound_area",
            return_value={"valid": False, "failReasons": ["no_wound_found"]},
        )

        response = client.post(
            "/capture/measure",
            json={"imageRef": encode_image(flat_image), "woundBoxPrompt": box()},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert body["failReasons"] == ["no_wound_found"]

    def test_request_without_wound_box_prompt_is_rejected(self, encode_image, flat_image):
        # woundBoxPrompt is mandatory - MedSAM has no fallback mode without a
        # box prompt (unlike the old nail-scale fallback, which no longer
        # exists at all).
        response = client.post("/capture/measure", json={"imageRef": encode_image(flat_image)})

        assert response.status_code == 422
