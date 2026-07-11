// Pure business logic, no external calls - the two safety-valve checks that
// happen right after Stage 3 CV findings come back, before anything is
// written to the queue.

// Hard-coded categorical escalation that bypasses acuity scoring entirely,
// regardless of what the model outputs (gunshot, suspected domestic
// violence, certain pediatric presentations).
const HARD_FLAG_CATEGORIES = ['gunshot', 'suspected_domestic_violence', 'pediatric_high_risk'];

function forceEscalate(findings) {
  if (!findings?.hardFlags) return false;
  return findings.hardFlags.some((flag) => HARD_FLAG_CATEGORIES.includes(flag));
}

// Guarantees a top-10% queue slot (see utils/queueSort.js computeAutoFloor)
// when the pipeline itself doesn't trust its own output - failed capture
// quality, disagreement between CV and LLM findings, or either confidence
// score below threshold. This is a floor on trust, not on acuity.
const LOW_CONFIDENCE_THRESHOLD = 0.6;

function shouldAutoFloor(confidenceMeta) {
  if (!confidenceMeta) return false;

  const { cvConfidence, llmConfidence, captureQualityPassed, findingsAgreement } = confidenceMeta;

  if (captureQualityPassed === false) return true;
  if (findingsAgreement === false) return true;
  if (typeof cvConfidence === 'number' && cvConfidence < LOW_CONFIDENCE_THRESHOLD) return true;
  if (typeof llmConfidence === 'number' && llmConfidence < LOW_CONFIDENCE_THRESHOLD) return true;

  return false;
}

module.exports = { forceEscalate, shouldAutoFloor, HARD_FLAG_CATEGORIES, LOW_CONFIDENCE_THRESHOLD };
