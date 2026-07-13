import base64

import cv2
import httpx

from app.config import MEDSAM_API_KEY, MEDSAM_ENDPOINT_URL

# Calls MedSAM (bowang-lab, https://github.com/bowang-lab/MedSAM) hosted on a
# Hugging Face Inference Endpoint - see ml-service/medsam-hf-endpoint/ for the
# custom handler that runs it, and its README for deploying MEDSAM_ENDPOINT_URL.
# Same endpoint nail_segmentation.py now uses too - see config.py's
# MEDSAM_ENDPOINT_URL comment. Deliberately MedSAM, not vanilla SAM - wound
# tissue, especially periwound/inflamed skin, has low-contrast gradual
# boundaries that base SAM
# (trained on natural images with crisp edges) tends to under- or
# over-segment; MedSAM is fine-tuned specifically for this.
#
# IMPORTANT: single generic prompt only - do NOT add per-wound-type
# prompting ("bruise", "burn", "abrasion", ...). MedSAM has no semantic
# concept of wound type; it returns a positive mask for nearly any prompted
# region regardless of whether that wound type is actually present, so
# multi-prompting by type produces false positives instead of better
# segmentation. Wound TYPE classification is Claude's job in
# vision_llm_client.py, not this function's.
#
# Licensing: MedSAM/MedSAM2 are Apache 2.0 (permissive, commercial use OK,
# keep the license notice + citation - see ml-service/NOTICE.md). MedSAM is
# built on Meta's SAM base weights, so Meta's SAM license terms also apply -
# verify the current version's patent/redistribution terms before shipping.
#
# wound_box_prompt is the patient's own rough box around the wound (drawn in
# front-end's WoundBoxSelector.jsx, a mandatory step - MedSAM was fine-tuned
# exclusively on box prompts and fails outright with a point or no prompt,
# so unlike the nail's scale factor there's no fallback path here). MedSAM's
# actual returned mask can be tighter or looser than this box - the box only
# tells it where to look, it isn't trusted as the final extent.


def measure_wound_area(image, wound_box_prompt: dict, scale_factor_mm_per_pixel: float) -> dict:
    if not MEDSAM_API_KEY or not MEDSAM_ENDPOINT_URL:
        raise NotImplementedError(
            "wound_segmentation.measure_wound_area: "
            "MEDSAM_API_KEY/MEDSAM_ENDPOINT_URL not configured yet - "
            "deploy ml-service/medsam-hf-endpoint/ first (see its README)"
        )

    box = [
        wound_box_prompt["x"],
        wound_box_prompt["y"],
        wound_box_prompt["x"] + wound_box_prompt["width"],
        wound_box_prompt["y"] + wound_box_prompt["height"],
    ]

    _, buffer = cv2.imencode(".jpg", image)
    image_b64 = base64.b64encode(buffer).decode("utf-8")

    response = httpx.post(
        MEDSAM_ENDPOINT_URL,
        headers={"Authorization": f"Bearer {MEDSAM_API_KEY}"},
        json={"inputs": {"image": image_b64, "box": box}},
        # Generous on purpose - a scaled-to-zero HF Inference Endpoint can
        # take well over a minute to cold-start a GPU container before it
        # ever starts running inference. Once warm, real calls are much
        # faster than this ceiling.
        timeout=180,
    )
    response.raise_for_status()
    result = response.json()

    if not result["valid"]:
        return {"valid": False, "failReasons": result["failReasons"]}

    area_px = result["areaPx"]
    # px^2 -> mm^2 (scale factor is mm/pixel, squared for area) -> cm^2
    area_cm2 = area_px * (scale_factor_mm_per_pixel**2) / 100

    return {
        "valid": True,
        "failReasons": [],
        "areaCm2": area_cm2,
        "areaPx": area_px,
        "boundaryCoords": result["boundaryCoords"],
        "boundingBox": result["boundingBox"],
        "confidence": result["confidence"],
    }
