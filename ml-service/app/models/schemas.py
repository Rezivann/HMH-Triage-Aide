from typing import List, Optional

from pydantic import BaseModel


class ImageRefRequest(BaseModel):
    imageRef: str


# Generic pixel-space box, reused for both the patient-drawn nail prompt and
# SAM's own wound segmentation output.
class PixelBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


# In image pixel coordinates (not on-screen/CSS pixels) - see front-end's
# NailBoxSelector.jsx, which does the CSS-pixel -> image-pixel conversion
# before ever sending this. This becomes SAM's segmentation prompt box in
# nail_segmentation.py - SAM can't find "the nail" on its own. Always the
# nail of the (non-thumb) finger the patient is pointing at the wound with -
# never a toe, so there's no separate nail-type/finger-identity to resolve.
NailBox = PixelBox


# Stage 2 - measurement.py. nailBox is optional - the kiosk's "I can't point
# at the wound" button submits without one, and measurement.py falls back to
# config.py's FALLBACK_SCALE_MM_PER_PIXEL (a rough guess, not a real
# measurement) rather than blocking submission entirely.
class MeasurementRequest(BaseModel):
    imageRef: str
    nailBox: Optional[NailBox] = None


# Stage 1 - capture_validation.py. Kept separate from MeasurementResult so a
# blur-only reject never spends a SAM call - see CaptureValidationResult.valid
# gating whether the kiosk even proceeds to /capture/measure.
class CaptureValidationResult(BaseModel):
    valid: bool
    failReasons: List[str] = []


# Stage 2 - measurement.py. valid/failReasons duplicated here (not just in
# CaptureValidationResult) because SAM's own segmentation confidence is a
# second, independent retake trigger - a photo can pass the blur check and
# still fail here if SAM can't find a nail or wound. woundBox is SAM's own
# wound segmentation output (not the patient-drawn nailBox) - carried forward
# so findings.py can crop to it for Claude's close-up view.
class MeasurementResult(BaseModel):
    valid: bool
    failReasons: List[str] = []
    scaleFactorMmPerPixel: Optional[float] = None
    woundAreaCm2: Optional[float] = None
    woundBox: Optional[PixelBox] = None
    confidence: Optional[float] = None


# Stage 3 - findings.py. Carries measurement's output forward so
# vision_llm_client.py can inject it as context in the Claude prompt and crop
# to woundBox for a close-up view alongside the full photo. measurementConfidence
# is MeasurementResult.confidence carried through so findings.py can assemble
# a complete ConfidenceMeta.cvConfidence without re-deriving it.
class FindingsRequest(BaseModel):
    imageRef: str
    woundBox: PixelBox
    scaleFactorMmPerPixel: float
    woundAreaCm2: float
    measurementConfidence: float


# Mirrors ReviewRoutingService.HARD_FLAG_CATEGORIES on the Node side - keep
# these two lists numerically in sync if either changes.
HARD_FLAG_CATEGORIES = ["gunshot", "suspected_domestic_violence", "pediatric_high_risk"]


class Findings(BaseModel):
    bleeding: bool
    boneVisible: bool
    deformity: bool
    hardFlags: List[str] = []


# Field names/shape match kioskController.postPhoto's fakeCvResult.confidenceMeta
# exactly, since this is what eventually replaces that hardcoded object.
class ConfidenceMeta(BaseModel):
    cvConfidence: float
    llmConfidence: float
    captureQualityPassed: bool
    findingsAgreement: bool


class FindingsResult(BaseModel):
    woundType: str
    findings: Findings
    confidenceMeta: ConfidenceMeta
