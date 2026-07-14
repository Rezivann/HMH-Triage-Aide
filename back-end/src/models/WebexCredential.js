const mongoose = require('mongoose');

// Singleton document (one Webex CC org per deployment) holding the
// long-lived OAuth token pair from the one-time admin consent flow - see
// WebexAuthService.js. Unlike nurse/kiosk auth, there's no per-request
// login here: the access token is refreshed server-side via refreshToken
// whenever it's near expiry, and callers just ask WebexAuthService for a
// currently-valid token.
const webexCredentialSchema = new mongoose.Schema(
  {
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    // Absolute time the access token stops being valid - refresh proactively
    // before this, not reactively after a 401, since a hung request mid-call
    // isn't worth risking over a token a few minutes from expiring.
    expiresAt: { type: Date, required: true },
    scope: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebexCredential', webexCredentialSchema);
