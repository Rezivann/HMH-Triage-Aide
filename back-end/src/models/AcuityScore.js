const mongoose = require('mongoose');

// Kept as its own collection rather than embedded in Session, so
// jobs/escalationSweep.js can recompute effectiveScore across the whole
// active queue without loading each session's full conversation history.
const acuityScoreSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    rawScore: { type: Number, required: true },
    queuedAt: { type: Date, required: true },
    confidenceMeta: {
      cvConfidence: { type: Number },
      llmConfidence: { type: Number },
      captureQualityPassed: { type: Boolean },
      findingsAgreement: { type: Boolean },
    },
    autoFloor: {
      active: { type: Boolean, default: false },
      flooredAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AcuityScore', acuityScoreSchema);
