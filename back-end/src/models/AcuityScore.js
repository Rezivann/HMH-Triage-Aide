const mongoose = require('mongoose');

// Kept as its own collection rather than embedded in Session, so
// jobs/escalationSweep.js can recompute effectiveScore across the whole
// active queue without loading each session's full conversation history.
const acuityScoreSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, unique: true },
    rawScore: { type: Number, required: true },
    // Keys into fakeAcuityPolicyStore.js's category map (utils/queueSort.js's
    // computeEffectiveScore) - not its own model since the policy itself is
    // global config, not per-patient data.
    decayCategory: { type: String, required: true },
    queuedAt: { type: Date, required: true },
    confidenceMeta: {
      llmConfidence: { type: Number },
      captureQualityPassed: { type: Boolean },
      findingsAgreement: { type: Boolean },
    },
    autoFloor: {
      active: { type: Boolean, default: false },
      flooredAt: { type: Date, default: null },
      // Which ReviewRoutingService.evaluateAutoFloor() condition triggered
      // this (capture_quality_failed/findings_disagreement/low_cv_confidence/
      // low_llm_confidence) - confidence is the specific number that
      // breached LOW_CONFIDENCE_THRESHOLD, null for the two boolean reasons.
      reason: { type: String, default: null },
      confidence: { type: Number, default: null },
    },

    // The captured wound photo + Stage 2/3 CV output, persisted so the nurse
    // dashboard can show the image/findings later without ever re-running
    // the pipeline (which would also spend more LLM tokens for no reason).
    // All optional/null - the no-photo path (internal complaints) has none
    // of this, and the fake-photo test path has findings but no real image.
    imageBase64: { type: String, default: null },
    woundType: { type: String, default: null },
    findings: {
      bleeding: { type: Boolean, default: null },
      boneVisible: { type: Boolean, default: null },
      deformity: { type: Boolean, default: null },
      stage: { type: String, default: null },
      hardFlags: { type: [String], default: [] },
    },
    // The patient's own drawn box around the wound (WoundBoxSelector.jsx),
    // in the original photo's pixel coordinate space - not a CV model's
    // output, there is no segmentation step in this pipeline. Stored purely
    // for the dashboard's optional box-outline toggle (drawn client-side as
    // an SVG layer on top of the <img>, never baked into imageBase64 itself
    // - same "never alter the actual photo pixels" principle
    // vision_llm_client.py follows for Claude).
    woundBox: {
      x: { type: Number, default: null },
      y: { type: Number, default: null },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AcuityScore', acuityScoreSchema);
