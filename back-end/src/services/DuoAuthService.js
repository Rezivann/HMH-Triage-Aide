const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const {
  duoClientId,
  duoClientSecret,
  duoIssuer,
  duoAuthorizationUrl,
  duoTokenUrl,
  duoJwksUrl,
  duoRedirectUri,
  duoStateSecret,
} = require('../config/env');

let jwks = null;
function getJwks() {
  // Lazy + cached - jose fetches/caches keys internally per JWKSet instance,
  // this just avoids constructing a new one on every callback request.
  if (!jwks) jwks = createRemoteJWKSet(new URL(duoJwksUrl));
  return jwks;
}

function base64url(buffer) {
  return buffer.toString('base64url');
}

// PKCE (RFC 7636) - the verifier/nonce never touch the browser directly,
// they ride inside the signed `state` JWT through the redirect round-trip,
// matching this codebase's existing preference for self-contained signed
// tokens over server-side session storage (see trackToken/photoToken).
function buildAuthorizationUrl() {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const nonce = base64url(crypto.randomBytes(16));

  const state = jwt.sign({ codeVerifier, nonce }, duoStateSecret, { expiresIn: '5m' });

  const url = new URL(duoAuthorizationUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', duoClientId);
  url.searchParams.set('redirect_uri', duoRedirectUri);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

// Throws on any failure (expired/invalid state, Duo error response, bad
// signature, nonce mismatch) - the controller decides how to surface that
// as a redirect, this just never returns a half-verified identity.
async function completeLogin({ code, state }) {
  const { codeVerifier, nonce } = jwt.verify(state, duoStateSecret);

  const tokenRes = await fetch(duoTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: duoRedirectUri,
      client_id: duoClientId,
      client_secret: duoClientSecret,
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`duo token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const { id_token: idToken } = await tokenRes.json();
  if (!idToken) throw new Error('duo token response missing id_token');

  const { payload } = await jwtVerify(idToken, getJwks(), {
    issuer: duoIssuer,
    audience: duoClientId,
  });

  if (payload.nonce !== nonce) throw new Error('duo id_token nonce mismatch');

  // Prefer a human-readable, directory-stable identity over the opaque
  // `sub` claim so nurseDirectory.js can be keyed by something a hospital
  // admin can actually read and match against staff records.
  const identity = payload.email || payload.preferred_username || payload.sub;
  return { identity };
}

module.exports = { buildAuthorizationUrl, completeLogin };
