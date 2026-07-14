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

# Stage 2 segmentation - MedSAM (bowang-lab, Apache 2.0), via a Hugging Face
# Inference Endpoint running the custom handler in
# ml-service/medsam-hf-endpoint/ (see its README). Wound-only now - there is
# no nail segmentation/scale-factor step (removed; the pipeline no longer
# estimates wound area in real-world units at all, see vision_llm_client.py's
# mask-overlay approach instead) and no vanilla-SAM/Replicate path either.
#
# Single generic prompt only (see wound_segmentation.py) - MedSAM has no
# semantic notion of wound type, so prompting it per-type ("bruise",
# "burn", ...) just produces false positives, it isn't a classifier.
MEDSAM_ENDPOINT_URL = _optional("MEDSAM_ENDPOINT_URL", None)
MEDSAM_API_KEY = _optional("MEDSAM_API_KEY", None)

BLUR_THRESHOLD = _optional_float("BLUR_THRESHOLD", 125)

# Matches back-end/src/services/ReviewRoutingService.js's LOW_CONFIDENCE_THRESHOLD -
# kept as a separate constant here (not imported cross-language) but should
# stay numerically in sync if either changes.
LOW_CONFIDENCE_THRESHOLD = _optional_float("LOW_CONFIDENCE_THRESHOLD", 0.6)

LOG_LEVEL = _optional("LOG_LEVEL", "info")
