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

// Second, independent trigger for the same force-escalate path as
// forceEscalate above - this one fires on the synthesized acuity score
// itself rather than a categorical hardFlag, since a presentation can be
// critical without tripping any of the fixed hardFlag categories (e.g.
// severe chest pain described purely verbally, no photo at all). Same
// 0-1000 scale as utils/queueSort.js. threshold is nurse-tunable (see
// fakeAcuityPolicyStore's emergencyScoreThreshold) - callers must pass the
// current policy value in, since this module stays a pure function with no
// store import of its own. DEFAULT_CRITICAL_SCORE_THRESHOLD only exists as
// the fallback fakeAcuityPolicyStore.js seeds itself with.
const DEFAULT_CRITICAL_SCORE_THRESHOLD = 700;

function isCriticalScore(rawScore, threshold = DEFAULT_CRITICAL_SCORE_THRESHOLD) {
  return typeof rawScore === 'number' && typeof threshold === 'number' && rawScore >= threshold;
}

// Guarantees a top-10% queue slot (see utils/queueSort.js computeAutoFloor)
// when the pipeline itself doesn't trust its own output - failed capture
// quality, disagreement between CV and LLM findings, or a low confidence
// score. This is a floor on trust, not on acuity.
const LOW_CONFIDENCE_THRESHOLD = 0.6;

// Checked in this order, first match wins - a nurse reviewing why a patient
// got floored should see the single most relevant reason, not every
// condition that happened to also be true. confidence is null for the two
// boolean-only reasons (there's no single number driving the decision).
function evaluateAutoFloor(confidenceMeta) {
  if (!confidenceMeta) return null;

  const { llmConfidence, captureQualityPassed, findingsAgreement } = confidenceMeta;

  if (captureQualityPassed === false) return { reason: 'capture_quality_failed', confidence: null };
  if (findingsAgreement === false) return { reason: 'findings_disagreement', confidence: null };
  if (typeof llmConfidence === 'number' && llmConfidence < LOW_CONFIDENCE_THRESHOLD) {
    return { reason: 'low_llm_confidence', confidence: llmConfidence };
  }

  return null;
}

function shouldAutoFloor(confidenceMeta) {
  return evaluateAutoFloor(confidenceMeta) !== null;
}

module.exports = {
  forceEscalate,
  isCriticalScore,
  shouldAutoFloor,
  evaluateAutoFloor,
  HARD_FLAG_CATEGORIES,
  LOW_CONFIDENCE_THRESHOLD,
  DEFAULT_CRITICAL_SCORE_THRESHOLD,
};
