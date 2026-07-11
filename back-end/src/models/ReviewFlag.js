const mongoose = require('mongoose');

// Safety-valve flags surfaced explicitly to the nurse dashboard - low
// confidence, wide wound-area range, cascade-below-floor, abnormal wait.
// These are never silently absorbed into the score.
const reviewFlagSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    reason: {
      type: String,
      enum: ['low_confidence', 'wide_area_range', 'cascade_below_floor', 'abnormal_wait'],
      required: true,
    },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReviewFlag', reviewFlagSchema);
