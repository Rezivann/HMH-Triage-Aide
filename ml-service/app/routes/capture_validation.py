from fastapi import APIRouter

from app.models.schemas import ImageRefRequest, CaptureValidationResult
from app.services.capture_quality import check_blur
from app.services.image_utils import decode_image

router = APIRouter()


@router.post("/validate", response_model=CaptureValidationResult)
def validate_capture(req: ImageRefRequest):
    image = decode_image(req.imageRef)
    result = check_blur(image)
    fail_reasons = ["blurry"] if result["isBlurry"] else []
    return CaptureValidationResult(valid=not result["isBlurry"], failReasons=fail_reasons)
