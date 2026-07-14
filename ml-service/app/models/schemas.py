from typing import List, Optional

from pydantic import BaseModel


class ImageRefRequest(BaseModel):
    imageRef: str


# The patient's own rough box drawn around the wound (front-end's
# WoundBoxSelector.jsx, a mandatory step) - a spatial hint for Claude, not a
# precise measurement. There is no CV segmentation step anymore; the box is
# passed straight through to vision_llm_client.py as-is.
class PixelBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class CaptureValidationResult(BaseModel):
    valid: bool
    failReasons: List[str] = []


# Stage 2 - findings.py. woundBox is mandatory (WoundBoxSelector.jsx has no
# skip button) - it's cropped-to for Claude's close-up view and passed as a
# text hint alongside the full photo, never drawn onto the image itself.
class FindingsRequest(BaseModel):
    imageRef: str
    woundBox: PixelBox


# Mirrors ReviewRoutingService.HARD_FLAG_CATEGORIES on the Node side - keep
# these two lists numerically in sync if either changes.
HARD_FLAG_CATEGORIES = ["gunshot", "suspected_domestic_violence", "pediatric_high_risk"]


# stage is free text, not an enum - clinical staging schemes are specific to
# wound type (burn degree, pressure ulcer stage I-IV, etc.) and incompatible
# with each other, so forcing one fixed enum across all wound types would
# either be wrong for most of them or require a much larger schema than a
# demo needs. None when the wound type has no standard staging scheme.
class Findings(BaseModel):
    bleeding: bool
    boneVisible: bool
    deformity: bool
    stage: Optional[str] = None
    hardFlags: List[str] = []


# Field names/shape match kioskController.postPhoto's fakeCvResult.confidenceMeta
# exactly, since this is what eventually replaces that hardcoded object. No
# cvConfidence - there's no CV model in this pipeline anymore, only Claude's
# own confidence in its findings.
class ConfidenceMeta(BaseModel):
    llmConfidence: float
    captureQualityPassed: bool
    findingsAgreement: bool


class FindingsResult(BaseModel):
    woundType: str
    findings: Findings
    confidenceMeta: ConfidenceMeta
