const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['patient', 'assistant'], required: true },
    text: { type: String, required: true },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const sessionSchema = new mongoose.Schema(
  {
    kioskId: { type: String, required: true },
    locationId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['in_intake', 'queued', 'claimed', 'closed', 'force_escalated'],
      default: 'in_intake',
    },
    messages: { type: [messageSchema], default: [] },
    claimedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', sessionSchema);
