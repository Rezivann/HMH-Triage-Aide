import base64

import cv2
from fastapi.testclient import TestClient

from app.main import app
from app.services import vision_llm_client

client = TestClient(app)


def _request_body(encode_image, flat_image, box, **overrides):
    body = {
        "imageRef": encode_image(flat_image),
        "woundBox": box(),
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
        assert body["confidenceMeta"]["llmConfidence"] == 0.75
        assert body["confidenceMeta"]["captureQualityPassed"] is True
        # Hardcoded placeholder until a second classifier exists to compare
        # against - see ConfidenceMeta.findingsAgreement in schemas.py.
        assert body["confidenceMeta"]["findingsAgreement"] is True
        assert "cvConfidence" not in body["confidenceMeta"]

    def test_passes_wound_box_through_to_classifier(self, mocker, encode_image, flat_image, box):
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

        client.post("/capture/findings", json=_request_body(encode_image, flat_image, box))

        _, kwargs = classify_mock.call_args
        assert kwargs["wound_box"] == box()

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


class TestClassifyFindingsSendsUnalteredImages:
    def test_full_photo_bytes_sent_to_claude_match_the_source_image_exactly(self, monkeypatch, flat_image):
        # The whole point: an overlay baked into the pixels would change the
        # wound's actual visual appearance (color, tissue detail) and corrupt
        # findings like bleeding/discoloration - so what Claude receives must
        # be byte-for-byte identical to encoding the source image directly,
        # not a modified copy.
        monkeypatch.setattr(vision_llm_client, "ANTHROPIC_API_KEY", "test-key")

        captured = {}

        class FakeToolUse:
            type = "tool_use"
            input = {
                "woundType": "laceration",
                "bleeding": False,
                "boneVisible": False,
                "deformity": False,
                "stage": None,
                "hardFlags": [],
                "confidence": 0.7,
                "rationale": "test",
            }

        class FakeMessage:
            content = [FakeToolUse()]

        class FakeMessages:
            def create(self, **kwargs):
                captured.update(kwargs)
                return FakeMessage()

        class FakeAnthropic:
            def __init__(self, api_key):
                self.messages = FakeMessages()

        monkeypatch.setattr(vision_llm_client.anthropic, "Anthropic", FakeAnthropic)

        wound_box = {"x": 10, "y": 10, "width": 50, "height": 50}

        vision_llm_client.classify_findings(flat_image, wound_box)

        content = captured["messages"][0]["content"]
        image_blocks = [c for c in content if c["type"] == "image"]
        full_photo_b64 = image_blocks[0]["source"]["data"]

        _, expected_buffer = cv2.imencode(".jpg", flat_image)
        expected_b64 = base64.b64encode(expected_buffer).decode("utf-8")

        assert full_photo_b64 == expected_b64

    def test_wound_box_is_sent_as_text_not_drawn_on_the_image(self, monkeypatch, flat_image):
        monkeypatch.setattr(vision_llm_client, "ANTHROPIC_API_KEY", "test-key")
        captured = {}

        class FakeToolUse:
            type = "tool_use"
            input = {
                "woundType": "laceration",
                "bleeding": False,
                "boneVisible": False,
                "deformity": False,
                "stage": None,
                "hardFlags": [],
                "confidence": 0.7,
                "rationale": "test",
            }

        class FakeMessage:
            content = [FakeToolUse()]

        class FakeMessages:
            def create(self, **kwargs):
                captured.update(kwargs)
                return FakeMessage()

        class FakeAnthropic:
            def __init__(self, api_key):
                self.messages = FakeMessages()

        monkeypatch.setattr(vision_llm_client.anthropic, "Anthropic", FakeAnthropic)

        wound_box = {"x": 10, "y": 10, "width": 50, "height": 50}

        vision_llm_client.classify_findings(flat_image, wound_box)

        content = captured["messages"][0]["content"]
        text_blocks = [c["text"] for c in content if c["type"] == "text"]
        combined_text = " ".join(text_blocks)

        assert str(wound_box["width"]) in combined_text
        # Exactly two images (full photo + crop) - no third "mask" image.
        assert len([c for c in content if c["type"] == "image"]) == 2
