from fastapi import APIRouter

from app.config import (
    FALLBACK_AREA_MARGIN_PERCENT,
    FALLBACK_SCALE_CONFIDENCE,
    FALLBACK_SCALE_MM_PER_PIXEL,
    NAIL_AVG_WIDTH_MM,
    NAIL_WIDTH_MARGIN_MM,
)
from app.models.schemas import MeasurementRequest, MeasurementResult
from app.services.image_utils import decode_image
from app.services.nail_segmentation import get_nail_scale_factor
from app.services.wound_segmentation import measure_wound_area

router = APIRouter()

# The nail-derived scale factor's error margin is fixed by the nail-width
# assumption itself (NAIL_AVG_WIDTH_MM +/- NAIL_WIDTH_MARGIN_MM), not by
# anything SAM/MedSAM measure - derived here so it can't drift out of sync
# with those two constants.
NAIL_AREA_MARGIN_PERCENT = (NAIL_WIDTH_MARGIN_MM / NAIL_AVG_WIDTH_MM) * 100


@router.post("/measure", response_model=MeasurementResult)
def measure(req: MeasurementRequest):
    image = decode_image(req.imageRef)

    if req.nailBox is not None:
        # Precise path: the patient's index finger is pressed flat against
        # the skin next to the wound, so a real, nail-derived scale factor
        # is available.
        nail_result = get_nail_scale_factor(image, req.nailBox.model_dump())
        if not nail_result["valid"]:
            return MeasurementResult(valid=False, failReasons=nail_result["failReasons"])
        scale_factor = nail_result["scaleFactorMmPerPixel"]
        scale_confidence = nail_result["confidence"]
        area_margin_percent = NAIL_AREA_MARGIN_PERCENT
    else:
        # Fallback path: "I can't place my finger next to the wound" - no
        # reference object, so the scale factor is a rough population-average
        # guess rather than a real measurement. confidence and margin are
        # both deliberately worse than the nail path so this feeds
        # ReviewRoutingService.shouldAutoFloor once wired into the Node
        # side, rather than a fabricated number being trusted as-is.
        scale_factor = FALLBACK_SCALE_MM_PER_PIXEL
        scale_confidence = FALLBACK_SCALE_CONFIDENCE
        area_margin_percent = FALLBACK_AREA_MARGIN_PERCENT

    wound_result = measure_wound_area(image, req.woundBoxPrompt.model_dump(), scale_factor)
    if not wound_result["valid"]:
        return MeasurementResult(valid=False, failReasons=wound_result["failReasons"])

    return MeasurementResult(
        valid=True,
        scaleFactorMmPerPixel=scale_factor,
        woundAreaCm2=wound_result["areaCm2"],
        woundAreaPx=wound_result["areaPx"],
        areaMarginPercent=area_margin_percent,
        boundaryCoords=wound_result["boundaryCoords"],
        woundBox=wound_result["boundingBox"],
        confidence=min(scale_confidence, wound_result["confidence"]),
    )
