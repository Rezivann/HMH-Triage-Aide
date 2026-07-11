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

# Stage 2 measurement (SAM), hosted on Replicate. SAM_MODEL_VERSION is the
# `owner/model:version` string from the specific SAM model page you pick on
# Replicate (e.g. a segment-anything or segment-anything-2 model) - pin an
# exact version hash, not just "owner/model", so a model update upstream
# can't silently change segmentation behavior underneath this service.
SAM_API_KEY = _optional("SAM_API_KEY", None)
SAM_MODEL_VERSION = _optional("SAM_MODEL_VERSION", None)

# Known average (non-thumb) adult fingernail width in mm, used as the
# reference object for converting SAM's nail pixel-width into a mm-per-pixel
# scale factor before it's applied to the wound mask. Only ever a finger -
# the patient always points at the wound with one finger (never the thumb,
# never a toe), so there's no nail-type/finger-identity to resolve here.
# Still a rough population average across index/middle/ring/pinky - revisit
# with the clinical team.
NAIL_AVG_WIDTH_MM = _optional_float("NAIL_AVG_WIDTH_MM", 14.0)

# Used only when the patient couldn't point at the wound (no nailBox, so no
# real reference object) - a rough population-average guess for mm-per-pixel
# at a typical close-up wound-photo distance/zoom. Far less reliable than
# the nail-derived scale factor, which is why FALLBACK_SCALE_CONFIDENCE is
# set well below LOW_CONFIDENCE_THRESHOLD - this is meant to trip
# ReviewRoutingService.shouldAutoFloor (back-end/src/services/
# ReviewRoutingService.js) once wired in, not be trusted as a real
# measurement. Needs calibration against real sample photos, same caveat as
# BLUR_THRESHOLD.
FALLBACK_SCALE_MM_PER_PIXEL = _optional_float("FALLBACK_SCALE_MM_PER_PIXEL", 0.3)
FALLBACK_SCALE_CONFIDENCE = _optional_float("FALLBACK_SCALE_CONFIDENCE", 0.3)

BLUR_THRESHOLD = _optional_float("BLUR_THRESHOLD", 125)

# Matches back-end/src/services/ReviewRoutingService.js's LOW_CONFIDENCE_THRESHOLD -
# kept as a separate constant here (not imported cross-language) but should
# stay numerically in sync if either changes.
LOW_CONFIDENCE_THRESHOLD = _optional_float("LOW_CONFIDENCE_THRESHOLD", 0.6)

LOG_LEVEL = _optional("LOG_LEVEL", "info")
