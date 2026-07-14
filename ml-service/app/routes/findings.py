from fastapi import APIRouter

from app.models.schemas import ConfidenceMeta, Findings, FindingsRequest, FindingsResult
from app.services.image_utils import decode_image
from app.services.vision_llm_client import classify_findings

router = APIRouter()


@router.post("/findings", response_model=FindingsResult)
def findings(req: FindingsRequest):
    image = decode_image(req.imageRef)

    result = classify_findings(image, wound_box=req.woundBox.model_dump())

    return FindingsResult(
        woundType=result["woundType"],
        findings=Findings(
            bleeding=result["bleeding"],
            boneVisible=result["boneVisible"],
            deformity=result["deformity"],
            stage=result["stage"],
            hardFlags=result["hardFlags"],
        ),
        confidenceMeta=ConfidenceMeta(
            llmConfidence=result["confidence"],
            captureQualityPassed=True,  # only reachable if Stage 1 already passed
            # TODO: no independent second classifier exists yet to compare
            # Claude's findings against, so this is a placeholder until one
            # does - see ReviewRoutingService.shouldAutoFloor on the Node
            # side, which treats findingsAgreement=False as a low-confidence
            # signal same as the raw confidence score.
            findingsAgreement=True,
        ),
    )
