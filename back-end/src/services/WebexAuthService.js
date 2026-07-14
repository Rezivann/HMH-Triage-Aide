const jwt = require('jsonwebtoken');
const WebexCredential = require('../models/WebexCredential');
const {
  webexCcClientId,
  webexCcClientSecret,
  webexCcRedirectUri,
  webexCcStateSecret,
  webexCcScopes,
} = require('../config/env');

// Webex's OAuth endpoints are fixed, published URLs shared by every
// Integration - unlike Duo, there's no per-application discovery metadata.
const AUTHORIZE_URL = 'https://webexapis.com/v1/authorize';
const TOKEN_URL = 'https://webexapis.com/v1/access_token';

// Refresh this far ahead of actual expiry so a slow in-flight request never
// gets caught holding a token that expires mid-call.
const EXPIRY_SAFETY_MARGIN_MS = 60 * 1000;

function buildAuthorizationUrl() {
  const state = jwt.sign({}, webexCcStateSecret, { expiresIn: '5m' });

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', webexCcClientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', webexCcRedirectUri);
  url.searchParams.set('scope', webexCcScopes);
  url.searchParams.set('state', state);
  return url.toString();
}

async function storeTokenResponse(tokenRes) {
  if (!tokenRes.ok) {
    throw new Error(`Webex token request failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const body = await tokenRes.json();
  const expiresAt = new Date(Date.now() + body.expires_in * 1000);

  // Singleton - one Webex CC org per deployment, so this always replaces
  // whatever credential (if any) was stored before.
  await WebexCredential.findOneAndUpdate(
    {},
    {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt,
      scope: body.scope,
    },
    { upsert: true, new: true }
  );
}

// Called once, from the /admin/webex-cc/callback route, after an admin
// completes the consent screen in their browser.
async function completeAuthorization({ code, state }) {
  jwt.verify(state, webexCcStateSecret); // throws if expired/invalid - no payload needed

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: webexCcClientId,
      client_secret: webexCcClientSecret,
      code,
      redirect_uri: webexCcRedirectUri,
    }),
  });
  await storeTokenResponse(tokenRes);
}

async function refresh(credential) {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: webexCcClientId,
      client_secret: webexCcClientSecret,
      refresh_token: credential.refreshToken,
    }),
  });
  await storeTokenResponse(tokenRes);
}

// What ContactCenterService.js (and getConnectionStatus() below) call
// before every real API request - never returns a token within
// EXPIRY_SAFETY_MARGIN_MS of expiring.
async function getValidAccessToken() {
  const credential = await WebexCredential.findOne({});
  if (!credential) {
    throw new Error('Webex CC is not connected yet - visit /admin/webex-cc/connect once to authorize it');
  }

  if (credential.expiresAt.getTime() - Date.now() < EXPIRY_SAFETY_MARGIN_MS) {
    await refresh(credential);
    return getValidAccessToken();
  }

  return credential.accessToken;
}

// Proves the OAuth connection actually works end-to-end (real API call,
// real token) without needing any Contact Center-specific queue/task setup
// - useful right now, before a real CC tenant exists to test cjp:* calls.
async function getConnectionStatus() {
  const accessToken = await getValidAccessToken();
  const res = await fetch('https://webexapis.com/v1/people/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Webex API call failed: ${res.status} ${await res.text()}`);
  const me = await res.json();
  return { connected: true, email: me.emails?.[0], orgId: me.orgId };
}

module.exports = { buildAuthorizationUrl, completeAuthorization, getValidAccessToken, getConnectionStatus };
