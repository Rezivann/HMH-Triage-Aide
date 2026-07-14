from typing import List, Optional

from pydantic import BaseModel


class ImageRefRequest(BaseModel):
    imageRef: str


# Generic pixel-space box - the patient's rough drawn prompt around the
# wound, and separately (same shape) MedSAM's own segmented mask extent.
class PixelBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


# Stage 2 - measurement.py. woundBoxPrompt is mandatory - front-end's
# WoundBoxSelector.jsx has no skip button, because MedSAM was fine-tuned
# exclusively on box prompts and fails outright without one.
class MeasurementRequest(BaseModel):
    imageRef: str
    woundBoxPrompt: PixelBox


# Stage 1 - capture_validation.py. Kept separate from MeasurementResult so a
# blur-only reject never spends a SAM call - see CaptureValidationResult.valid
# gating whether the kiosk even proceeds to /capture/measure.
class CaptureValidationResult(BaseModel):
    valid: bool
    failReasons: List[str] = []


# Stage 2 - measurement.py. Pure segmentation output, no area/measurement -
# this pipeline no longer estimates wound size in real-world units at all
# (see findings.py/vision_llm_client.py: the segmentation mask is instead
# drawn directly onto the image Claude sees, and Claude reasons about
# severity visually rather than from a computed number). woundBox/
# boundaryCoords are MedSAM's own segmentation OUTPUT (not
# MeasurementRequest.woundBoxPrompt, the patient's rough drawn box that
# PROMPTED it - MedSAM's actual mask extent can differ from that box) -
# carried forward so findings.py can crop to woundBox and overlay
# boundaryCoords for Claude's close-up view.
class MeasurementResult(BaseModel):
    valid: bool
    failReasons: List[str] = []
    boundaryCoords: Optional[List[List[float]]] = None
    woundBox: Optional[PixelBox] = None
    confidence: Optional[float] = None


# Stage 3 - findings.py. Carries measurement's output forward so
# vision_llm_client.py can crop to woundBox and draw boundaryCoords as a
# visual mask overlay for Claude, instead of injecting a computed area
# number as text context. measurementConfidence is MeasurementResult.confidence
# carried through so findings.py can assemble a complete ConfidenceMeta.cvConfidence
# without re-deriving it.
class FindingsRequest(BaseModel):
    imageRef: str
    woundBox: PixelBox
    boundaryCoords: List[List[float]]
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
