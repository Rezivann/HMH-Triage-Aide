from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _request_body(encode_image, flat_image, box, **overrides):
    body = {
        "imageRef": encode_image(flat_image),
        "woundBox": box(),
        "scaleFactorMmPerPixel": 0.3,
        "woundAreaCm2": 4.5,
        "areaMarginPercent": 16.7,
        "measurementConfidence": 0.85,
    }
    body.update(overrides)
    return body


class TestFindingsRoute:
    def test_assembles_findings_result_from_classifier_output(self, mocker, encode_image, flat_image, box):
        mocker.patch(
            "app.routes.findings.classify_findings",
            return_value={
                "woundType": "laceration",
                "bleeding": True,
                "boneVisible": False,
                "deformity": False,
                "stage": None,
                "hardFlags": [],
                "confidence": 0.75,
            },
        )

        response = client.post("/capture/findings", json=_request_body(encode_image, flat_image, box))

        assert response.status_code == 200
        body = response.json()
        assert body["woundType"] == "laceration"
        assert body["findings"]["bleeding"] is True
        assert body["findings"]["hardFlags"] == []
        assert body["confidenceMeta"]["cvConfidence"] == 0.85
        assert body["confidenceMeta"]["llmConfidence"] == 0.75
        assert body["confidenceMeta"]["captureQualityPassed"] is True
        # Hardcoded placeholder until a second classifier exists to compare
        # against - see ConfidenceMeta.findingsAgreement in schemas.py.
        assert body["confidenceMeta"]["findingsAgreement"] is True

    def test_passes_measurement_context_through_to_classifier(self, mocker, encode_image, flat_image, box):
        classify_mock = mocker.patch(
            "app.routes.findings.classify_findings",
            return_value={
                "woundType": "abrasion",
                "bleeding": False,
                "boneVisible": False,
                "deformity": False,
                "stage": None,
                "hardFlags": [],
                "confidence": 0.6,
            },
        )

        client.post(
            "/capture/findings",
            json=_request_body(
                encode_image, flat_image, box, woundAreaCm2=7.2, areaMarginPercent=20.0, scaleFactorMmPerPixel=0.4
            ),
        )

        _, kwargs = classify_mock.call_args
        assert kwargs["wound_box"] == box()
        assert kwargs["scale_factor_mm_per_pixel"] == 0.4
        assert kwargs["wound_area_cm2"] == 7.2
        assert kwargs["area_margin_percent"] == 20.0

    def test_hard_flag_category_is_surfaced(self, mocker, encode_image, flat_image, box):
        mocker.patch(
            "app.routes.findings.classify_findings",
            return_value={
                "woundType": "gunshot_wound",
                "bleeding": True,
                "boneVisible": True,
                "deformity": True,
                "stage": None,
                "hardFlags": ["gunshot"],
                "confidence": 0.95,
            },
        )

        response = client.post("/capture/findings", json=_request_body(encode_image, flat_image, box))

        assert response.json()["findings"]["hardFlags"] == ["gunshot"]
