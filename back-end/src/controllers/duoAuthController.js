const jwt = require('jsonwebtoken');
const DuoAuthService = require('../services/DuoAuthService');
const nurseDirectory = require('../config/nurseDirectory');
const { nurseSessionSecret, frontendUrl } = require('../config/env');

// Full page redirect (not a fetch call) - starting an OAuth Authorization
// Code flow requires an actual browser navigation to Duo.
function login(req, res) {
  res.redirect(DuoAuthService.buildAuthorizationUrl());
}

async function callback(req, res) {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`${frontendUrl}/dashboard?authError=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return res.redirect(`${frontendUrl}/dashboard?authError=missing_code_or_state`);
  }

  let identity;
  try {
    ({ identity } = await DuoAuthService.completeLogin({ code, state }));
  } catch (err) {
    console.error('Duo login failed:', err.message);
    return res.redirect(`${frontendUrl}/dashboard?authError=duo_login_failed`);
  }

  const siteAccess = nurseDirectory.lookupSiteAccess(identity);
  if (!siteAccess) {
    return res.redirect(`${frontendUrl}/dashboard?authError=nurse_not_recognized`);
  }

  const nurseToken = jwt.sign({ nurseId: identity, siteAccess }, nurseSessionSecret);
  res.redirect(
    `${frontendUrl}/dashboard?nurseToken=${encodeURIComponent(nurseToken)}&nurseId=${encodeURIComponent(identity)}`
  );
}

module.exports = { login, callback };
