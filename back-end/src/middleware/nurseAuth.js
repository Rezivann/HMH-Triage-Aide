const jwt = require('jsonwebtoken');
const { nurseSessionSecret } = require('../config/env');

// Validates the session token issued *after* Duo SSO + MFA + device health check
// succeed elsewhere - this middleware never talks to Duo directly.
function nurseAuth(req, res, next) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'missing_nurse_session' });
  }

  try {
    const payload = jwt.verify(token, nurseSessionSecret);
    req.nurse = { nurseId: payload.nurseId, siteAccess: payload.siteAccess || [] };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_nurse_session' });
  }
}

module.exports = nurseAuth;
