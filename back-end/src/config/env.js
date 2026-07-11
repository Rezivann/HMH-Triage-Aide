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

  // LlmService - conversation + acuity synthesis
  llmApiKey: optional('LLM_API_KEY', null),
  llmModel: optional('LLM_MODEL', 'gpt-4o'),

  // CvServiceClient - ml-service base URL
  cvServiceUrl: optional('CV_SERVICE_URL', 'http://localhost:8000'),

  // ContactCenterService - Webex Contact Center
  webexCcClientId: optional('WEBEX_CC_CLIENT_ID', null),
  webexCcClientSecret: optional('WEBEX_CC_CLIENT_SECRET', null),
  webexCcOrgId: optional('WEBEX_CC_ORG_ID', null),

  // Queue scoring (utils/queueSort.js)
  // effectiveScore = rawScore + min(minutesWaited * decayWeightPerMinute, scoreDecayCap)
  // decayWeightPerMinute is a flat placeholder here - production authors this as a
  // per-category/finding lookup table with the clinical team, not a single constant.
  decayWeightPerMinute: parseFloat(optional('DECAY_WEIGHT_PER_MINUTE', '0.5')),
  scoreDecayCap: parseInt(optional('SCORE_DECAY_CAP', '50'), 10),
};
