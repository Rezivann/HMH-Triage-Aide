const jwt = require('jsonwebtoken');
const { trackTokenSecret } = require('../config/env');

// Short-lived, single-session scoped token carried in the URL
// (GET /track/:sessionToken/status) - authorizes reading this one patient's
// status and nothing else.
function trackAuth(req, res, next) {
  const { sessionToken } = req.params;
  if (!sessionToken) {
    return res.status(401).json({ error: 'missing_track_token' });
  }

  try {
    const payload = jwt.verify(sessionToken, trackTokenSecret);
    req.track = { sessionId: payload.sessionId };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_track_token' });
  }
}

module.exports = trackAuth;
