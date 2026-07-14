from fastapi import APIRouter

from app.models.schemas import MeasurementRequest, MeasurementResult
from app.services.image_utils import decode_image
from app.services.wound_segmentation import measure_wound_area

router = APIRouter()


@router.post("/measure", response_model=MeasurementResult)
def measure(req: MeasurementRequest):
    image = decode_image(req.imageRef)

    wound_result = measure_wound_area(image, req.woundBoxPrompt.model_dump())
    if not wound_result["valid"]:
        return MeasurementResult(valid=False, failReasons=wound_result["failReasons"])

    return MeasurementResult(
        valid=True,
        boundaryCoords=wound_result["boundaryCoords"],
        woundBox=wound_result["boundingBox"],
        confidence=wound_result["confidence"],
    )
