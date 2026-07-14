import base64
import json

import anthropic
import cv2

from app.config import ANTHROPIC_API_KEY, CLAUDE_MODEL

FINDINGS_SYSTEM_PROMPT = (
    "You are assisting emergency triage. You are given a full, unaltered photo of a "
    "patient's wound plus a cropped close-up of the wound region - neither image has "
    "been marked up in any way, so judge tissue color, bleeding, and discoloration "
    "directly from what you see. Alongside the images you are also given the patient's "
    "own rough box around the wound, in pixel coordinates in the full photo's "
    "coordinate space - this is only a spatial hint for where the wound is, not a "
    "precise or verified boundary, so use it to help locate the wound but always trust "
    "what the photo itself shows over the box. Classify the wound type and, if a "
    "standard staging scheme applies to this wound type (e.g. burn degree, pressure "
    "ulcer stage), include your best assessment of that stage - leave it unset if no "
    "standard staging scheme applies. Do not invent findings that were not visible in "
    "the image."
)

# Padding around the patient's drawn wound box before cropping - a
# zero-padding crop would show Claude only the box's exact extent with no
# surrounding tissue, making it hard to judge things like deformity that need
# context just outside the wound itself.
CROP_PADDING_RATIO = 0.2

FINDINGS_TOOL = {
    "name": "submit_wound_findings",
    "description": "Submit structured findings for this wound.",
    "input_schema": {
        "type": "object",
        "properties": {
            "woundType": {"type": "string"},
            "bleeding": {"type": "boolean"},
            "boneVisible": {"type": "boolean"},
            "deformity": {"type": "boolean"},
            "stage": {
                "type": ["string", "null"],
                "description": "Clinical staging assessment if a standard scheme applies to this wound "
                "type (e.g. burn degree, pressure ulcer stage), otherwise null.",
            },
            "hardFlags": {"type": "array", "items": {"type": "string"}},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "rationale": {"type": "string"},
        },
        "required": [
            "woundType",
            "bleeding",
            "boneVisible",
            "deformity",
            "stage",
            "hardFlags",
            "confidence",
            "rationale",
        ],
    },
}


def _encode_jpeg(image) -> str:
    _, buffer = cv2.imencode(".jpg", image)
    return base64.b64encode(buffer).decode("utf-8")


def _crop_with_padding(image, wound_box):
    height, width = image.shape[:2]
    pad_x = int(wound_box["width"] * CROP_PADDING_RATIO)
    pad_y = int(wound_box["height"] * CROP_PADDING_RATIO)

    x1 = max(0, wound_box["x"] - pad_x)
    y1 = max(0, wound_box["y"] - pad_y)
    x2 = min(width, wound_box["x"] + wound_box["width"] + pad_x)
    y2 = min(height, wound_box["y"] + wound_box["height"] + pad_y)

    return image[y1:y2, x1:x2]


def _image_block(image) -> dict:
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg", "data": _encode_jpeg(image)},
    }


# The only step in the pipeline that spends LLM tokens (mirrors back-end/src/
# services/LlmService.js's synthesizeAcuity, which is a separate, text-only
# Claude call on the Node side and never sees the image itself - this is the
# one place a photo actually reaches an LLM).
#
# The image and crop sent to Claude are never modified in any way - an
# overlay baked into the pixels would change the wound tissue's actual color/
# appearance, corrupting exactly the visual judgments (bleeding, discoloration,
# tissue color) this step exists to make. The patient's drawn wound_box is
# instead passed as structured text context (pixel coordinates), so Claude
# gets a spatial reference without any pixel of the actual photo being
# altered. There is no CV segmentation model in this pipeline - wound_box is
# exactly what the patient drew, nothing has refined or verified it.
def classify_findings(image, wound_box: dict) -> dict:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("vision_llm_client.classify_findings: ANTHROPIC_API_KEY not configured - set it in .env")

    crop = _crop_with_padding(image, wound_box)

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1024,
        system=FINDINGS_SYSTEM_PROMPT,
        tools=[FINDINGS_TOOL],
        tool_choice={"type": "tool", "name": FINDINGS_TOOL["name"]},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Full photo (unaltered):"},
                    _image_block(image),
                    {"type": "text", "text": "Cropped close-up of the wound region (unaltered):"},
                    _image_block(crop),
                    {
                        "type": "text",
                        "text": (
                            "Patient's own rough box around the wound, in the full photo's pixel "
                            f"coordinates (a spatial hint only, not a verified boundary): {json.dumps(wound_box)}."
                        ),
                    },
                ],
            }
        ],
    )

    tool_use = next((block for block in message.content if block.type == "tool_use"), None)
    if not tool_use:
        raise RuntimeError("vision_llm_client.classify_findings: expected a tool_use block in the response")

    return tool_use.input
