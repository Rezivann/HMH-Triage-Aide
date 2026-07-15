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
      enum: ['in_intake', 'queued', 'claimed', 'closed', 'force_escalated', 'left_queue'],
      default: 'in_intake',
    },
    messages: { type: [messageSchema], default: [] },
    claimedBy: { type: String, default: null },
    // Set from LlmService.sendMessage's per-turn judgment (kioskController.
    // postMessage) - exposed on the patient's own track page (trackController.
    // getStatus). Null until the first conversation turn runs.
    telehealthViable: { type: Boolean, default: null },
    // Parsed by the LLM from its mandatory first question (LlmService.js) -
    // null until asked and answered. displayId is derived from these the
    // first time both are non-null (see kioskController.postMessage) and
    // never recomputed after that, even if these somehow changed later.
    patientFirstName: { type: String, default: null },
    patientLastInitial: { type: String, default: null },
    // Human-readable stand-in for sessionId on the nurse dashboard - e.g.
    // "IvanR_0001", the trailing number only incrementing when an existing
    // session already has that same first-name+last-initial pair (see
    // kioskController.buildDisplayId). Assigned once, permanently.
    displayId: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', sessionSchema);
