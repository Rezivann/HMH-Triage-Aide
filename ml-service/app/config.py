import os

from dotenv import load_dotenv

load_dotenv()


def _optional(name, fallback=None):
    value = os.environ.get(name)
    return fallback if value is None or value == "" else value


def _optional_float(name, fallback):
    return float(_optional(name, fallback))


def _optional_int(name, fallback):
    return int(_optional(name, fallback))


ENVIRONMENT = _optional("ENVIRONMENT", "development")
HOST = _optional("HOST", "0.0.0.0")
PORT = _optional_int("PORT", 8000)

# Stage 3 findings/synthesis - the only step in the pipeline that spends
# LLM tokens (see back-end/src/services/LlmService.js for the analogous
# pattern on the Node side).
ANTHROPIC_API_KEY = _optional("ANTHROPIC_API_KEY", None)
CLAUDE_MODEL = _optional("CLAUDE_MODEL", "claude-haiku-4-5")

# Stage 2 segmentation - MedSAM (bowang-lab, Apache 2.0) handles BOTH the
# nail (nail_segmentation.py) and the wound (wound_segmentation.py) now,
# via the same Hugging Face Inference Endpoint running the custom handler in
# ml-service/medsam-hf-endpoint/ (see its README). Originally nail
# segmentation used vanilla SAM/FastSAM on Replicate on the theory that
# MedSAM (tuned for medical imaging) would be off-distribution for an
# ordinary RGB finger photo - switched to MedSAM for both after FastSAM's
# Replicate integration proved unreliable (undocumented box_prompt format,
# coordinate convention, output shape all had to be reverse-engineered)
# while this same MedSAM endpoint worked correctly on the first real
# end-to-end test. MedSAM's own training data includes real RGB
# skin-surface photography (dermoscopy, endoscopy), not just radiological
# modalities, so it's a smaller mismatch than "medical imaging" suggests -
# still worth validating mask quality against real photos.
#
# Single generic prompt only (see wound_segmentation.py) - MedSAM has no
# semantic notion of wound type, so prompting it per-type ("bruise",
# "burn", ...) just produces false positives, it isn't a classifier.
MEDSAM_ENDPOINT_URL = _optional("MEDSAM_ENDPOINT_URL", None)
MEDSAM_API_KEY = _optional("MEDSAM_API_KEY", None)

# Reference object for converting SAM's nail pixel-width into a mm-per-pixel
# scale factor before it's applied to the wound mask. Index finger
# specifically now (not "any non-thumb finger") - nail width varies most at
# the extremes (thumb widest, pinky narrowest), so index is the more
# consistent middle reference. 12mm +/- 2mm approximates the adult
# population range (women ~8-12mm, men ~10-14mm at the index finger)
# without needing the patient's sex/hand size - still an approximation,
# revisit with the clinical team.
NAIL_AVG_WIDTH_MM = _optional_float("NAIL_AVG_WIDTH_MM", 12.0)
NAIL_WIDTH_MARGIN_MM = _optional_float("NAIL_WIDTH_MARGIN_MM", 2.0)

# Used only when the patient couldn't place their finger next to the wound
# (no nailBox, so no real reference object) - a rough population-average
# guess for mm-per-pixel at a typical close-up wound-photo distance/zoom.
# Far less reliable than the nail-derived scale factor, which is why
# FALLBACK_SCALE_CONFIDENCE is set well below LOW_CONFIDENCE_THRESHOLD and
# FALLBACK_AREA_MARGIN_PERCENT is much wider than the nail-derived margin -
# this is meant to trip ReviewRoutingService.shouldAutoFloor (back-end/src/
# services/ReviewRoutingService.js) once wired in, not be trusted as a real
# measurement. Needs calibration against real sample photos, same caveat as
# BLUR_THRESHOLD.
FALLBACK_SCALE_MM_PER_PIXEL = _optional_float("FALLBACK_SCALE_MM_PER_PIXEL", 0.3)
FALLBACK_SCALE_CONFIDENCE = _optional_float("FALLBACK_SCALE_CONFIDENCE", 0.3)
FALLBACK_AREA_MARGIN_PERCENT = _optional_float("FALLBACK_AREA_MARGIN_PERCENT", 50.0)

BLUR_THRESHOLD = _optional_float("BLUR_THRESHOLD", 125)

# Matches back-end/src/services/ReviewRoutingService.js's LOW_CONFIDENCE_THRESHOLD -
# kept as a separate constant here (not imported cross-language) but should
# stay numerically in sync if either changes.
LOW_CONFIDENCE_THRESHOLD = _optional_float("LOW_CONFIDENCE_THRESHOLD", 0.6)

LOG_LEVEL = _optional("LOG_LEVEL", "info")
