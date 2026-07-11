const mongoose = require('mongoose');

// Append-only: a new override document is inserted, never mutated, so a
// superseded override's who/when/why survives for the audit trail even after
// a later override takes precedence.
const overrideSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    nurseId: { type: String, required: true },
    overrideType: { type: String, enum: ['fixed_score', 'positionFloor', 'dismiss_auto'], required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    note: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Override', overrideSchema);
