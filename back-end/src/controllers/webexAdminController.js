const WebexAuthService = require('../services/WebexAuthService');

// Full page redirect - Webex's one-time admin consent screen needs a real
// browser navigation, same reasoning as Duo's /dashboard/login.
function connect(req, res) {
  res.redirect(WebexAuthService.buildAuthorizationUrl());
}

async function callback(req, res) {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`Webex authorization failed: ${error}`);
  if (!code || !state) return res.status(400).send('Missing code or state');

  try {
    await WebexAuthService.completeAuthorization({ code, state });
  } catch (err) {
    console.error('Webex CC authorization failed:', err.message);
    return res.status(400).send(`Webex authorization failed: ${err.message}`);
  }

  res.send('Webex Contact Center connected. You can close this tab.');
}

async function status(req, res) {
  try {
    const connectionStatus = await WebexAuthService.getConnectionStatus();
    res.json(connectionStatus);
  } catch (err) {
    res.status(503).json({ connected: false, error: err.message });
  }
}

module.exports = { connect, callback, status };
