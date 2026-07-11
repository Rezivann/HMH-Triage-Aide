from fastapi import APIRouter

from app.config import FALLBACK_SCALE_MM_PER_PIXEL, FALLBACK_SCALE_CONFIDENCE
from app.models.schemas import MeasurementRequest, MeasurementResult
from app.services.image_utils import decode_image
from app.services.nail_segmentation import get_nail_scale_factor
from app.services.wound_segmentation import measure_wound_area

router = APIRouter()


@router.post("/measure", response_model=MeasurementResult)
def measure(req: MeasurementRequest):
    image = decode_image(req.imageRef)

    if req.nailBox is not None:
        # Precise path: the patient pointed at the wound, so a real,
        # nail-derived scale factor is available.
        nail_result = get_nail_scale_factor(image, req.nailBox)
        if not nail_result["valid"]:
            return MeasurementResult(valid=False, failReasons=nail_result["failReasons"])
        scale_factor = nail_result["scaleFactorMmPerPixel"]
        scale_confidence = nail_result["confidence"]
    else:
        # Fallback path: "I can't point at the wound" - no reference object,
        # so the scale factor is a rough population-average guess rather
        # than a real measurement. confidence is deliberately low so this
        # feeds ReviewRoutingService.shouldAutoFloor once wired into the
        # Node side, rather than a fabricated number being trusted as-is.
        scale_factor = FALLBACK_SCALE_MM_PER_PIXEL
        scale_confidence = FALLBACK_SCALE_CONFIDENCE

    wound_result = measure_wound_area(image, scale_factor)
    if not wound_result["valid"]:
        return MeasurementResult(valid=False, failReasons=wound_result["failReasons"])

    return MeasurementResult(
        valid=True,
        scaleFactorMmPerPixel=scale_factor,
        woundAreaCm2=wound_result["areaCm2"],
        woundBox=wound_result["boundingBox"],
        confidence=min(scale_confidence, wound_result["confidence"]),
    )
