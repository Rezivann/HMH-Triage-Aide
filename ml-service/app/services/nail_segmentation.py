import base64

import cv2
import httpx

from app.config import MEDSAM_API_KEY, MEDSAM_ENDPOINT_URL, NAIL_AVG_WIDTH_MM

# Calls MedSAM (bowang-lab, https://github.com/bowang-lab/MedSAM) hosted on
# the same Hugging Face Inference Endpoint as wound_segmentation.py - see
# ml-service/medsam-hf-endpoint/ - with the patient-drawn nailBox as the box
# prompt, then derives a mm-per-pixel scale factor from the resulting nail
# mask's pixel width and config.NAIL_AVG_WIDTH_MM. See config.py's
# MEDSAM_ENDPOINT_URL comment for why this uses MedSAM rather than a
# separate vanilla-SAM model.
#
# The endpoint's handler.py already does mask post-processing server-side
# (contour extraction, bounding box, confidence) and returns structured
# JSON - no local mask image decoding needed here, unlike the earlier
# FastSAM/Replicate integration this replaced.


def get_nail_scale_factor(image, nail_box: dict) -> dict:
    if not MEDSAM_API_KEY or not MEDSAM_ENDPOINT_URL:
        raise NotImplementedError(
            "nail_segmentation.get_nail_scale_factor: "
            "MEDSAM_API_KEY/MEDSAM_ENDPOINT_URL not configured yet - "
            "deploy ml-service/medsam-hf-endpoint/ first (see its README)"
        )

    box = [nail_box["x"], nail_box["y"], nail_box["x"] + nail_box["width"], nail_box["y"] + nail_box["height"]]

    _, buffer = cv2.imencode(".jpg", image)
    image_b64 = base64.b64encode(buffer).decode("utf-8")

    response = httpx.post(
        MEDSAM_ENDPOINT_URL,
        headers={"Authorization": f"Bearer {MEDSAM_API_KEY}"},
        json={"inputs": {"image": image_b64, "box": box}},
        timeout=180,  # generous - see wound_segmentation.py's identical note on cold starts
    )
    response.raise_for_status()
    result = response.json()

    if not result["valid"]:
        return {
            "valid": False,
            "failReasons": result["failReasons"],
            "scaleFactorMmPerPixel": None,
            "confidence": None,
        }

    # rotatedWidthPx (handler.py's cv2.minAreaRect, aligned to the nail's own
    # orientation) is correct regardless of how the finger is tilted in the
    # photo - boundingBox.width (axis-aligned) is a fallback only for an
    # endpoint deployment that predates this field, since it conflates width
    # and length once the finger isn't perfectly horizontal/vertical in frame.
    pixel_width = result.get("rotatedWidthPx", result["boundingBox"]["width"])

    return {
        "valid": True,
        "failReasons": [],
        "scaleFactorMmPerPixel": NAIL_AVG_WIDTH_MM / pixel_width,
        "confidence": result["confidence"],
    }
