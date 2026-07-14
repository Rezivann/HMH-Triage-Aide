require('dotenv').config();

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

module.exports = {
  nodeEnv: optional('NODE_ENV', 'development'),
  // Explicit opt-in escape hatch to unlock /dashboard/dev-login in
  // production - never flip this on by default. Exists only because Duo
  // account access can itself get blocked (first-enrollment lockouts,
  // support tickets), and dev-login is otherwise the sole way into the
  // dashboard. Anyone with the live URL can mint a nurse session for any
  // nurseId/siteAccess while this is true - turn it back off (unset the var
  // or set to anything but 'true') the moment real Duo access is restored.
  allowDevLoginInProduction: optional('ALLOW_DEV_LOGIN_IN_PRODUCTION', 'false') === 'true',
  port: parseInt(optional('PORT', '4000'), 10),

  databaseUrl: optional('DATABASE_URL', 'mongodb://localhost:27017/llmtriage'),

  // Frontend dev server origin (Vite default) - the three frontend modes
  // call this API cross-origin from localhost:5173, so this must be set.
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),

  // Kiosk device auth (kioskAuth.js) - long-lived API key issued at provisioning
  kioskApiKeySecret: optional('KIOSK_API_KEY_SECRET', null),

  // Nurse auth (nurseAuth.js) - Cisco Duo SSO (Generic OIDC Relying Party
  // application, Frameless Universal Prompt). Endpoint URLs come straight
  // from the application's Metadata tab in the Duo Admin Panel rather than
  // being derived from a single api host - Duo exposes full OIDC discovery
  // fields (issuer/authorization/token/jwks) for this application type.
  duoClientId: optional('DUO_CLIENT_ID', null),
  duoClientSecret: optional('DUO_CLIENT_SECRET', null),
  duoIssuer: optional('DUO_ISSUER', null),
  duoAuthorizationUrl: optional('DUO_AUTHORIZATION_URL', null),
  duoTokenUrl: optional('DUO_TOKEN_URL', null),
  duoJwksUrl: optional('DUO_JWKS_URL', null),
  // Must exactly match the Redirect URI configured on the Duo application.
  duoRedirectUri: optional('DUO_REDIRECT_URI', 'http://localhost:4000/dashboard/duo-callback'),
  // Signs the short-lived state param (PKCE verifier + nonce) carried
  // through the redirect round-trip to Duo and back - see DuoAuthService.js.
  duoStateSecret: optional('DUO_STATE_SECRET', 'dev-insecure-duo-state-secret'),
  // Secret for the session token minted after Duo validation succeeds
  nurseSessionSecret: optional('NURSE_SESSION_SECRET', 'dev-insecure-nurse-secret'),
  // Where duo-callback sends the browser after minting a nurse session.
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),

  // Tracker auth (trackAuth.js) - short-lived single-session scoped token
  trackTokenSecret: optional('TRACK_TOKEN_SECRET', 'dev-insecure-track-secret'),

  // Photo auth (photoAuth.js) - short-lived single-session scoped token
  // embedded in the kiosk's QR code, letting a patient's phone submit a
  // photo without ever holding the kiosk device's own kioskApiKeySecret
  photoTokenSecret: optional('PHOTO_TOKEN_SECRET', 'dev-insecure-photo-secret'),

  // LlmService - conversation + acuity synthesis (Anthropic Messages API)
  llmApiKey: optional('LLM_API_KEY', null),
  llmModel: optional('LLM_MODEL', 'claude-haiku-4-5'),
  llmApiVersion: optional('LLM_API_VERSION', '2023-06-01'),

  // CvServiceClient - ml-service base URL
  cvServiceUrl: optional('CV_SERVICE_URL', 'http://localhost:8000'),

  // TranscriptionService - OpenAI Whisper, for browsers with no
  // SpeechRecognition API (e.g. Webex Desk's RoomOS browser). Claude has no
  // audio-input modality, so this is a separate provider from LlmService.
  openaiApiKey: optional('OPENAI_API_KEY', null),

  // ContactCenterService / WebexAuthService - Webex Contact Center OAuth
  // Integration. Authorization/token endpoints are Webex's fixed, published
  // URLs (not per-integration like Duo's) - see WebexAuthService.js.
  webexCcClientId: optional('WEBEX_CC_CLIENT_ID', null),
  webexCcClientSecret: optional('WEBEX_CC_CLIENT_SECRET', null),
  webexCcOrgId: optional('WEBEX_CC_ORG_ID', null),
  // Must exactly match a Redirect URI configured on the Webex Integration.
  webexCcRedirectUri: optional('WEBEX_CC_REDIRECT_URI', 'http://localhost:4000/admin/webex-cc/callback'),
  // Signs the short-lived state param carried through the one-time admin
  // consent redirect round-trip - see WebexAuthService.js.
  webexCcStateSecret: optional('WEBEX_CC_STATE_SECRET', 'dev-insecure-webex-cc-state-secret'),
  // Space-separated OAuth scopes requested at admin-consent time - keep this
  // to the cjp:* Contact Center scopes actually used; least-privilege.
  webexCcScopes: optional('WEBEX_CC_SCOPES', 'cjp:task_read cjp:task_write cjp:config_read'),

  // Voice auth (voiceAuth.js) - Cisco Webex AI Agent Studio's webhook.
  // Placeholder shared-secret scheme until a real Agent Studio tenant exists
  // and its actual webhook-signing contract is known - see voiceAuth.js.
  webexVoiceWebhookSecret: optional('WEBEX_VOICE_WEBHOOK_SECRET', null),

  // Queue scoring (utils/queueSort.js) - effectiveScore = rawScore +
  // min(minutesWaited * rate, cap), both rate and cap looked up per category
  // from controllers/fakeAcuityPolicyStore.js (nurse-editable from the
  // dashboard). No global decay cap anymore - each category bounds its own
  // ceiling (a bruise should never approach the 0-1000 scale's top purely
  // from waiting, while active hemorrhage can).
};
