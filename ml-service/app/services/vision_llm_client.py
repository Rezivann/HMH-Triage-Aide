import base64
import json

import anthropic
import cv2
import numpy as np

from app.config import ANTHROPIC_API_KEY, CLAUDE_MODEL

FINDINGS_SYSTEM_PROMPT = (
    "You are assisting emergency triage. You are given a full, unaltered photo of a "
    "patient's wound plus a cropped close-up of the wound region - neither image has "
    "been marked up in any way, so judge tissue color, bleeding, and discoloration "
    "directly from what you see. Alongside the images you are also given an AI "
    "segmentation model's identified wound boundary as pixel coordinates (a bounding "
    "box and a simplified polygon, both in the full photo's coordinate space) - this is "
    "a rough spatial reference for where the wound is, not a precise clinical "
    "measurement, so use it only to help locate the wound, never to override what the "
    "photo itself shows. Classify the wound type and, if a standard staging scheme "
    "applies to this wound type (e.g. burn degree, pressure ulcer stage), include your "
    "best assessment of that stage - leave it unset if no standard staging scheme "
    "applies. Do not invent findings that were not visible in the image."
)

# Padding around SAM's tight wound box before cropping - a zero-padding crop
# would show Claude only the wound mask's exact extent with no surrounding
# tissue, making it hard to judge things like deformity that need context
# just outside the wound itself.
CROP_PADDING_RATIO = 0.2

# cv2.approxPolyDP epsilon as a fraction of the contour's own perimeter - a
# raw MedSAM contour can have hundreds of points, far more than useful as
# text context. Proportional to perimeter (not a fixed point count) so a
# small wound and a large wound both simplify to a similarly reasonable
# polygon rather than one being over- or under-simplified.
BOUNDARY_SIMPLIFICATION_RATIO = 0.02

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


# Reduces MedSAM's raw contour down to a compact polygon that still traces
# the same rough shape, via cv2.approxPolyDP rather than a fixed point-count
# truncation - keeps the text context short without arbitrarily discarding
# whichever points happen to come first/last in the contour.
def _simplify_boundary(boundary_coords):
    contour = np.array(boundary_coords, dtype=np.int32).reshape(-1, 1, 2)
    perimeter = cv2.arcLength(contour, True)
    epsilon = BOUNDARY_SIMPLIFICATION_RATIO * perimeter
    simplified = cv2.approxPolyDP(contour, epsilon, True)
    return simplified.reshape(-1, 2).tolist()


# Stage 3 - the only step in the pipeline that spends LLM tokens (mirrors
# back-end/src/services/LlmService.js's synthesizeAcuity, which is a
# separate, text-only Claude call on the Node side and never sees the image
# itself - this is the one place a photo actually reaches an LLM).
#
# The image and crop sent to Claude are never modified in any way - an
# overlay baked into the pixels would change the wound tissue's actual color/
# appearance, corrupting exactly the visual judgments (bleeding, discoloration,
# tissue color) this step exists to make. MedSAM's segmentation mask
# (boundary_coords) is instead passed as structured text context (a bounding
# box + simplified polygon in pixel coordinates), so Claude gets a spatial
# reference without any pixel of the actual photo being altered.
def classify_findings(image, wound_box: dict, boundary_coords: list) -> dict:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("vision_llm_client.classify_findings: ANTHROPIC_API_KEY not configured - set it in .env")

    crop = _crop_with_padding(image, wound_box)
    simplified_boundary = _simplify_boundary(boundary_coords)

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
                            "AI segmentation (MedSAM) wound location, in the full photo's pixel "
                            f"coordinates - bounding box: {json.dumps(wound_box)}, simplified boundary "
                            f"polygon (approximate extent only, not a precise measurement): "
                            f"{json.dumps(simplified_boundary)}."
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
