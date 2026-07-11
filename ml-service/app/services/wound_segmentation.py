from app.config import SAM_API_KEY, SAM_MODEL_VERSION

# Calls SAM to segment the wound itself, then converts the mask's pixel area
# into cm2 using whatever scale factor measurement.py passes in - this
# function doesn't know or care whether that came from nail_segmentation.py
# (patient pointed at the wound) or config.FALLBACK_SCALE_MM_PER_PIXEL
# (patient couldn't point at the wound). Not implemented yet, same reason as
# nail_segmentation.py: the exact Replicate input/output shape depends on
# which SAM model version SAM_MODEL_VERSION ends up pinned to.
#
# Intended return shape once implemented:
#   { "valid": bool, "failReasons": list[str],
#     "areaCm2": float | None, "boundingBox": dict | None, "confidence": float | None }
# boundingBox ({x, y, width, height}, image pixel coordinates) is SAM's own
# wound mask extent - carried forward by measurement.py so findings.py can
# crop to it for Claude's close-up view (see vision_llm_client.py).


def measure_wound_area(image, scale_factor_mm_per_pixel: float) -> dict:
    if not SAM_API_KEY or not SAM_MODEL_VERSION:
        raise NotImplementedError(
            "wound_segmentation.measure_wound_area: SAM_API_KEY/SAM_MODEL_VERSION not configured yet"
        )
    raise NotImplementedError("wound_segmentation.measure_wound_area: SAM call not yet implemented")
