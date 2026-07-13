import base64

import anthropic
import cv2

from app.config import ANTHROPIC_API_KEY, CLAUDE_MODEL

FINDINGS_SYSTEM_PROMPT = (
    "You are assisting emergency triage. You are given a full photo of a patient's "
    "wound plus a cropped close-up of the wound region itself, along with a wound "
    "area estimate already computed from image segmentation and a scale-reference "
    "assumption. That area is an APPROXIMATION with a stated error margin, not a "
    "precise clinical measurement - treat it as context for scale and severity, do "
    "not recompute or second-guess the number itself, and do not present it as more "
    "precise than the given margin allows. Classify the wound type and, if a "
    "standard staging scheme applies to this wound type (e.g. burn degree, pressure "
    "ulcer stage), include your best assessment of that stage - leave it unset if no "
    "standard staging scheme applies. Do not invent findings that were not visible "
    "in the image."
)

# Padding around SAM's tight wound box before cropping - a zero-padding crop
# would show Claude only the wound mask's exact extent with no surrounding
# tissue, making it hard to judge things like deformity that need context
# just outside the wound itself.
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


# Stage 3 - the only step in the pipeline that spends LLM tokens (mirrors
# back-end/src/services/LlmService.js's synthesizeAcuity, which is a
# separate, text-only Claude call on the Node side and never sees the image
# itself - this is the one place a photo actually reaches an LLM).
def classify_findings(
    image,
    wound_box: dict,
    scale_factor_mm_per_pixel: float,
    wound_area_cm2: float,
    area_margin_percent: float,
) -> dict:
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
                    {"type": "text", "text": "Full photo:"},
                    _image_block(image),
                    {"type": "text", "text": "Cropped close-up of the wound region:"},
                    _image_block(crop),
                    {
                        "type": "text",
                        "text": (
                            f"Estimated wound area (from image segmentation, approximate - not a "
                            f"precise clinical measurement): {wound_area_cm2:.2f} cm2 +/- "
                            f"{area_margin_percent:.0f}%, scale factor {scale_factor_mm_per_pixel:.4f} mm/pixel."
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
