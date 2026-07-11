const jwt = require('jsonwebtoken');
const { kioskApiKeySecret } = require('../config/env');

// Kiosk API keys are signed JWTs issued once at device provisioning (Control Hub)
// and baked into the device config at install - no runtime lookup or DB round-trip.
function kioskAuth(req, res, next) {
  const apiKey = req.header('x-kiosk-api-key');
  if (!apiKey) {
    return res.status(401).json({ error: 'missing_kiosk_api_key' });
  }

  try {
    const payload = jwt.verify(apiKey, kioskApiKeySecret);
    req.kiosk = { kioskId: payload.kioskId, locationId: payload.locationId };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_kiosk_api_key' });
  }
}

module.exports = kioskAuth;
