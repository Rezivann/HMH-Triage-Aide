const { webexVoiceWebhookSecret } = require('../config/env');

// Authenticates Cisco Webex AI Agent Studio's webhook calls - the voice
// channel. Agent Studio handles speech-to-text/text-to-speech; this backend
// does the actual reasoning via LlmService.sendMessage, the exact same call
// the kiosk's typed conversation already uses (see routes/voiceRoutes.js
// reusing kioskController.postMessage directly - it only ever reads
// req.body.sessionId/message, nothing kiosk-device-specific).
//
// A static shared secret, not kioskApiKeySecret - Agent Studio is a distinct
// trusted caller, same reasoning as photoAuth.js being separate from the
// kiosk device's own long-lived key.
//
// NOTE: this is a placeholder auth scheme (one static secret in a header)
// until a real Agent Studio tenant exists and its actual webhook contract
// (HMAC signature, OAuth client-credentials, etc.) is known - replace this
// once that's confirmed rather than assuming this is Agent Studio's real
// mechanism.
function voiceAuth(req, res, next) {
  if (!webexVoiceWebhookSecret) {
    return res.status(501).json({ error: 'voice_channel_not_configured' });
  }

  const providedSecret = req.header('x-webex-webhook-secret');
  if (providedSecret !== webexVoiceWebhookSecret) {
    return res.status(401).json({ error: 'invalid_voice_webhook_secret' });
  }

  req.voice = true;
  return next();
}

module.exports = voiceAuth;
