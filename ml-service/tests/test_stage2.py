import pytest
from fastapi.testclient import TestClient

from app.config import (
    FALLBACK_AREA_MARGIN_PERCENT,
    FALLBACK_SCALE_CONFIDENCE,
    FALLBACK_SCALE_MM_PER_PIXEL,
    NAIL_AVG_WIDTH_MM,
    NAIL_WIDTH_MARGIN_MM,
)
from app.main import app
from app.services import nail_segmentation, wound_segmentation

client = TestClient(app)

NAIL_AREA_MARGIN_PERCENT = (NAIL_WIDTH_MARGIN_MM / NAIL_AVG_WIDTH_MM) * 100


class FakeMedSamResponse:
    def __init__(self, json_body):
        self._json_body = json_body

    def raise_for_status(self):
        pass

    def json(self):
        return self._json_body


# --- Service-level unit tests: the scale-factor/area math MedSAM's raw JSON
# response feeds into, independent of routing behavior. ---


class TestNailSegmentationUnit:
    def test_valid_result_derives_scale_factor_from_rotated_width(self, monkeypatch, flat_image, box):
        # rotatedWidthPx (handler.py's cv2.minAreaRect, aligned to the nail's
        # own orientation) is the primary source now - deliberately different
        # from boundingBox.width here so the test would fail if the fallback
        # were used by mistake.
        monkeypatch.setattr(nail_segmentation, "MEDSAM_API_KEY", "test-key")
        monkeypatch.setattr(nail_segmentation, "MEDSAM_ENDPOINT_URL", "https://example.test/medsam")
        monkeypatch.setattr(
            nail_segmentation.httpx,
            "post",
            lambda *a, **k: FakeMedSamResponse(
                {
                    "valid": True,
                    "failReasons": [],
                    "areaPx": 1000,
                    "boundingBox": {"x": 0, "y": 0, "width": 40, "height": 60},
                    "rotatedWidthPx": 52.0,
                    "boundaryCoords": [[0, 0], [40, 0], [40, 60], [0, 60]],
                    "confidence": 0.9,
                }
            ),
        )

        result = nail_segmentation.get_nail_scale_factor(flat_image, box())

        assert result["valid"] is True
        assert result["scaleFactorMmPerPixel"] == pytest.approx(NAIL_AVG_WIDTH_MM / 52.0)
        assert result["confidence"] == 0.9

    def test_valid_result_falls_back_to_bounding_box_width_when_rotated_width_missing(
        self, monkeypatch, flat_image, box
    ):
        # Simulates a MedSAM endpoint deployment that predates rotatedWidthPx
        # (handler.py hasn't been redeployed yet) - must not crash, and must
        # fall back to the old axis-aligned measurement.
        monkeypatch.setattr(nail_segmentation, "MEDSAM_API_KEY", "test-key")
        monkeypatch.setattr(nail_segmentation, "MEDSAM_ENDPOINT_URL", "https://example.test/medsam")
        monkeypatch.setattr(
            nail_segmentation.httpx,
            "post",
            lambda *a, **k: FakeMedSamResponse(
                {
                    "valid": True,
                    "failReasons": [],
                    "areaPx": 1000,
                    "boundingBox": {"x": 0, "y": 0, "width": 40, "height": 60},
                    "boundaryCoords": [[0, 0], [40, 0], [40, 60], [0, 60]],
                    "confidence": 0.9,
                }
            ),
        )

        result = nail_segmentation.get_nail_scale_factor(flat_image, box())

        assert result["valid"] is True
        assert result["scaleFactorMmPerPixel"] == pytest.approx(NAIL_AVG_WIDTH_MM / 40)
        assert result["confidence"] == 0.9

    def test_invalid_medsam_result_is_passed_through(self, monkeypatch, flat_image, box):
        monkeypatch.setattr(nail_segmentation, "MEDSAM_API_KEY", "test-key")
        monkeypatch.setattr(nail_segmentation, "MEDSAM_ENDPOINT_URL", "https://example.test/medsam")
        monkeypatch.setattr(
            nail_segmentation.httpx,
            "post",
            lambda *a, **k: FakeMedSamResponse({"valid": False, "failReasons": ["no_nail_found"]}),
        )

        result = nail_segmentation.get_nail_scale_factor(flat_image, box())

        assert result["valid"] is False
        assert result["failReasons"] == ["no_nail_found"]
        assert result["scaleFactorMmPerPixel"] is None

    def test_raises_without_medsam_config(self, monkeypatch, flat_image, box):
        monkeypatch.setattr(nail_segmentation, "MEDSAM_API_KEY", None)
        monkeypatch.setattr(nail_segmentation, "MEDSAM_ENDPOINT_URL", None)

        with pytest.raises(NotImplementedError):
            nail_segmentation.get_nail_scale_factor(flat_image, box())


class TestWoundSegmentationUnit:
    def test_valid_result_converts_area_px_to_cm2(self, monkeypatch, flat_image, box):
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

        # 0.5 mm/px -> 0.25 mm^2/px^2 -> areaCm2 = 10000 * 0.25 / 100 = 25
        result = wound_segmentation.measure_wound_area(flat_image, box(), scale_factor_mm_per_pixel=0.5)

        assert result["valid"] is True
        assert result["areaCm2"] == pytest.approx(25.0)
        assert result["confidence"] == 0.8

    def test_invalid_medsam_result_is_passed_through(self, monkeypatch, flat_image, box):
        monkeypatch.setattr(wound_segmentation, "MEDSAM_API_KEY", "test-key")
        monkeypatch.setattr(wound_segmentation, "MEDSAM_ENDPOINT_URL", "https://example.test/medsam")
        monkeypatch.setattr(
            wound_segmentation.httpx,
            "post",
            lambda *a, **k: FakeMedSamResponse({"valid": False, "failReasons": ["no_wound_found"]}),
        )

        result = wound_segmentation.measure_wound_area(flat_image, box(), scale_factor_mm_per_pixel=0.5)

        assert result["valid"] is False
        assert result["failReasons"] == ["no_wound_found"]

    def test_raises_without_medsam_config(self, monkeypatch, flat_image, box):
        monkeypatch.setattr(wound_segmentation, "MEDSAM_API_KEY", None)
        monkeypatch.setattr(wound_segmentation, "MEDSAM_ENDPOINT_URL", None)

        with pytest.raises(NotImplementedError):
            wound_segmentation.measure_wound_area(flat_image, box(), scale_factor_mm_per_pixel=0.5)


# --- Route-level tests: the nail-present vs. fallback branching in
# measurement.py itself, with both segmentation services mocked out. ---


class TestMeasureRoute:
    def test_nail_present_uses_nail_derived_scale_and_margin(self, mocker, encode_image, flat_image, box):
        mocker.patch(
            "app.routes.measurement.get_nail_scale_factor",
            return_value={"valid": True, "failReasons": [], "scaleFactorMmPerPixel": 0.3, "confidence": 0.9},
        )
        mocker.patch(
            "app.routes.measurement.measure_wound_area",
            return_value={
                "valid": True,
                "failReasons": [],
                "areaCm2": 4.5,
                "areaPx": 5000,
                "boundaryCoords": [[0, 0]],
                "boundingBox": {"x": 1, "y": 2, "width": 3, "height": 4},
                "confidence": 0.8,
            },
        )

        response = client.post(
            "/capture/measure",
            json={"imageRef": encode_image(flat_image), "nailBox": box(), "woundBoxPrompt": box()},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is True
        assert body["scaleFactorMmPerPixel"] == 0.3
        assert body["woundAreaCm2"] == 4.5
        assert body["areaMarginPercent"] == pytest.approx(NAIL_AREA_MARGIN_PERCENT)
        assert body["confidence"] == pytest.approx(0.8)  # min(0.9, 0.8)

    def test_no_nail_box_uses_fallback_scale_and_skips_nail_call(self, mocker, encode_image, flat_image, box):
        nail_mock = mocker.patch("app.routes.measurement.get_nail_scale_factor")
        mocker.patch(
            "app.routes.measurement.measure_wound_area",
            return_value={
                "valid": True,
                "failReasons": [],
                "areaCm2": 2.0,
                "areaPx": 1000,
                "boundaryCoords": [[0, 0]],
                "boundingBox": {"x": 0, "y": 0, "width": 1, "height": 1},
                "confidence": 0.7,
            },
        )

        response = client.post(
            "/capture/measure",
            json={"imageRef": encode_image(flat_image), "woundBoxPrompt": box()},
        )

        assert response.status_code == 200
        body = response.json()
        nail_mock.assert_not_called()
        assert body["valid"] is True
        assert body["scaleFactorMmPerPixel"] == FALLBACK_SCALE_MM_PER_PIXEL
        assert body["areaMarginPercent"] == FALLBACK_AREA_MARGIN_PERCENT
        assert body["confidence"] == pytest.approx(min(FALLBACK_SCALE_CONFIDENCE, 0.7))

    def test_invalid_nail_segmentation_short_circuits_before_wound_call(self, mocker, encode_image, flat_image, box):
        mocker.patch(
            "app.routes.measurement.get_nail_scale_factor",
            return_value={
                "valid": False,
                "failReasons": ["no_nail_found"],
                "scaleFactorMmPerPixel": None,
                "confidence": None,
            },
        )
        wound_mock = mocker.patch("app.routes.measurement.measure_wound_area")

        response = client.post(
            "/capture/measure",
            json={"imageRef": encode_image(flat_image), "nailBox": box(), "woundBoxPrompt": box()},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert body["failReasons"] == ["no_nail_found"]
        wound_mock.assert_not_called()

    def test_invalid_wound_segmentation_returns_invalid_result(self, mocker, encode_image, flat_image, box):
        mocker.patch(
            "app.routes.measurement.get_nail_scale_factor",
            return_value={"valid": True, "failReasons": [], "scaleFactorMmPerPixel": 0.3, "confidence": 0.9},
        )
        mocker.patch(
            "app.routes.measurement.measure_wound_area",
            return_value={"valid": False, "failReasons": ["no_wound_found"]},
        )

        response = client.post(
            "/capture/measure",
            json={"imageRef": encode_image(flat_image), "nailBox": box(), "woundBoxPrompt": box()},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert body["failReasons"] == ["no_wound_found"]
