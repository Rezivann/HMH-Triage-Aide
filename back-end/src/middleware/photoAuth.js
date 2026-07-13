const jwt = require('jsonwebtoken');
const { photoTokenSecret } = require('../config/env');

// Short-lived, single-session scoped token carried in the URL
// (POST /mobile-capture/:photoToken/photo) - minted alongside trackToken at
// session creation (kioskController.createSession) and embedded in
// PhotoCaptureQR's QR code. Lets the patient's own phone submit a photo for
// this one session without ever holding the kiosk device's own long-lived
// x-kiosk-api-key (kioskAuth.js), which must never leave the provisioned
// device.
function photoAuth(req, res, next) {
  const { photoToken } = req.params;
  if (!photoToken) {
    return res.status(401).json({ error: 'missing_photo_token' });
  }

  try {
    const payload = jwt.verify(photoToken, photoTokenSecret);
    req.photoSession = { sessionId: payload.sessionId };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_photo_token' });
  }
}

module.exports = photoAuth;
