require('dotenv').config();

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

module.exports = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '4000'), 10),

  databaseUrl: optional('DATABASE_URL', 'mongodb://localhost:27017/llmtriage'),

  // Frontend dev server origin (Vite default) - the three frontend modes
  // call this API cross-origin from localhost:5173, so this must be set.
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),

  // Kiosk device auth (kioskAuth.js) - long-lived API key issued at provisioning
  kioskApiKeySecret: optional('KIOSK_API_KEY_SECRET', null),

  // Nurse auth (nurseAuth.js) - Cisco Duo SSO against hospital AD
  duoClientId: optional('DUO_CLIENT_ID', null),
  duoClientSecret: optional('DUO_CLIENT_SECRET', null),
  duoApiHost: optional('DUO_API_HOST', null),
  // Secret for the session token minted after Duo validation succeeds
  nurseSessionSecret: optional('NURSE_SESSION_SECRET', 'dev-insecure-nurse-secret'),

  // Tracker auth (trackAuth.js) - short-lived single-session scoped token
  trackTokenSecret: optional('TRACK_TOKEN_SECRET', 'dev-insecure-track-secret'),

  // LlmService - conversation + acuity synthesis (Anthropic Messages API)
  llmApiKey: optional('LLM_API_KEY', null),
  llmModel: optional('LLM_MODEL', 'claude-haiku-4-5'),
  llmApiVersion: optional('LLM_API_VERSION', '2023-06-01'),

  // CvServiceClient - ml-service base URL
  cvServiceUrl: optional('CV_SERVICE_URL', 'http://localhost:8000'),

  // ContactCenterService - Webex Contact Center
  webexCcClientId: optional('WEBEX_CC_CLIENT_ID', null),
  webexCcClientSecret: optional('WEBEX_CC_CLIENT_SECRET', null),
  webexCcOrgId: optional('WEBEX_CC_ORG_ID', null),

  // Queue scoring (utils/queueSort.js) - effectiveScore = rawScore +
  // min(minutesWaited * rate, cap), both rate and cap looked up per category
  // from controllers/fakeAcuityPolicyStore.js (nurse-editable from the
  // dashboard). No global decay cap anymore - each category bounds its own
  // ceiling (a bruise should never approach the 0-1000 scale's top purely
  // from waiting, while active hemorrhage can).
};
