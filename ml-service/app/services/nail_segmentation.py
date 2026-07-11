from app.config import SAM_API_KEY, SAM_MODEL_VERSION

# Calls SAM (hosted on Replicate - see config.py's SAM_MODEL_VERSION) with the
# patient-drawn nailBox as the segmentation prompt box, then derives a
# mm-per-pixel scale factor from the resulting nail mask's pixel width and
# config.NAIL_AVG_WIDTH_MM. Not implemented yet - the exact Replicate input/output
# field names depend on which specific SAM model version ends up pinned in
# SAM_MODEL_VERSION, which isn't set yet (see .env.example).
#
# Intended return shape once implemented:
#   { "valid": bool, "failReasons": list[str],
#     "scaleFactorMmPerPixel": float | None, "confidence": float | None }
# valid=False (e.g. SAM couldn't find a nail-shaped mask in the box) should
# feed MeasurementResult.failReasons the same way capture_quality.check_blur
# feeds CaptureValidationResult.


def get_nail_scale_factor(image, nail_box) -> dict:
    if not SAM_API_KEY or not SAM_MODEL_VERSION:
        raise NotImplementedError(
            "nail_segmentation.get_nail_scale_factor: SAM_API_KEY/SAM_MODEL_VERSION not configured yet"
        )
    raise NotImplementedError("nail_segmentation.get_nail_scale_factor: SAM call not yet implemented")
