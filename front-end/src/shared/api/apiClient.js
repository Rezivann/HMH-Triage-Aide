const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const NURSE_TOKEN_STORAGE_KEY = 'llmtriage.nurseToken';

async function request(path, { method = 'GET', headers = {}, body, authHeader } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeader,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed: ${res.status}`);
    error.status = res.status;
    error.body = data;
    throw error;
  }

  return data;
}

// Kiosk device key - baked into device config at provisioning in production.
// VITE_KIOSK_API_KEY is a dev-only fallback so `npm run dev` works locally
// without going through Control Hub provisioning.
function kioskRequest(path, options = {}) {
  const kioskApiKey = import.meta.env.VITE_KIOSK_API_KEY;
  return request(path, { ...options, authHeader: { 'x-kiosk-api-key': kioskApiKey } });
}

// Nurse session token - set by useDashboardAuth's login step, read fresh on
// every call (not cached in a closure) so a re-login is picked up immediately.
function dashboardRequest(path, options = {}) {
  const nurseToken = sessionStorage.getItem(NURSE_TOKEN_STORAGE_KEY);
  return request(path, { ...options, authHeader: { Authorization: `Bearer ${nurseToken}` } });
}

// Tracker token lives in the URL path itself - no auth header needed.
function trackRequest(path, options = {}) {
  return request(path, options);
}

export { BASE_URL, NURSE_TOKEN_STORAGE_KEY, request, kioskRequest, dashboardRequest, trackRequest };
