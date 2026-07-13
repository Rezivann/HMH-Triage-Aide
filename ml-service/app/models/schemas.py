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
# before ever sending this. This becomes vanilla SAM's segmentation prompt
# box in nail_segmentation.py - SAM can't find "the nail" on its own. Always
# the patient's index fingernail, pressed flat against the skin directly
# next to the wound (same depth plane, to neutralize perspective/parallax
# error) - never the thumb, never a toe, never a different finger, so
# there's no nail-identity ambiguity to resolve.
NailBox = PixelBox


# Stage 2 - measurement.py. nailBox is optional - the kiosk's "I can't place
# my finger next to the wound" button submits without one, and measurement.py
# falls back to config.py's FALLBACK_SCALE_MM_PER_PIXEL (a rough guess, not a
# real measurement) rather than blocking submission entirely. woundBoxPrompt
# is NOT optional - front-end's WoundBoxSelector.jsx has no skip button,
# because MedSAM (unlike the nail-scale fallback) has no fallback mode: it
# was fine-tuned exclusively on box prompts and fails outright without one.
# Don't confuse this with MeasurementResult.woundBox below - this is the
# patient's rough drawn box (the PROMPT); that one is MedSAM's own segmented
# mask extent (the OUTPUT), which may differ from what the patient drew.
class MeasurementRequest(BaseModel):
    imageRef: str
    nailBox: Optional[NailBox] = None
    woundBoxPrompt: PixelBox


# Stage 1 - capture_validation.py. Kept separate from MeasurementResult so a
# blur-only reject never spends a SAM call - see CaptureValidationResult.valid
# gating whether the kiosk even proceeds to /capture/measure.
class CaptureValidationResult(BaseModel):
    valid: bool
    failReasons: List[str] = []


# Stage 2 - measurement.py. valid/failReasons duplicated here (not just in
# CaptureValidationResult) because MedSAM's own segmentation confidence is a
# second, independent retake trigger - a photo can pass the blur check and
# still fail here if MedSAM can't find a wound (or SAM can't find a nail).
# woundBox/woundAreaPx/boundaryCoords are MedSAM's own wound segmentation
# OUTPUT (not MeasurementRequest.woundBoxPrompt, the patient's rough drawn
# box that PROMPTED it - MedSAM's actual mask extent can differ from that
# box) - carried forward so findings.py can crop to woundBox for Claude's
# close-up view. areaMarginPercent is the
# error margin on woundAreaCm2 (derived from the nail-width assumption's own
# margin, or FALLBACK_AREA_MARGIN_PERCENT when there's no nail reference at
# all) - this is a measurement-uncertainty number, distinct from confidence
# (which reflects segmentation/prompt confidence, not calibration error) -
# both should be surfaced together rather than collapsed into one number.
class MeasurementResult(BaseModel):
    valid: bool
    failReasons: List[str] = []
    scaleFactorMmPerPixel: Optional[float] = None
    woundAreaCm2: Optional[float] = None
    woundAreaPx: Optional[float] = None
    areaMarginPercent: Optional[float] = None
    boundaryCoords: Optional[List[List[float]]] = None
    woundBox: Optional[PixelBox] = None
    confidence: Optional[float] = None


# Stage 3 - findings.py. Carries measurement's output forward so
# vision_llm_client.py can inject it as context in the Claude prompt and crop
# to woundBox for a close-up view alongside the full photo. measurementConfidence
# is MeasurementResult.confidence carried through so findings.py can assemble
# a complete ConfidenceMeta.cvConfidence without re-deriving it. areaMarginPercent
# is threaded through so Claude (and eventually the UI) reports "approx X cm2
# (+/-Y%)" rather than a bare precise-looking number - boundaryCoords is NOT
# threaded through, since raw polygon coordinates aren't useful to an LLM as
# text; the cropped image already shows the boundary visually.
class FindingsRequest(BaseModel):
    imageRef: str
    woundBox: PixelBox
    scaleFactorMmPerPixel: float
    woundAreaCm2: float
    areaMarginPercent: float
    measurementConfidence: float


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
