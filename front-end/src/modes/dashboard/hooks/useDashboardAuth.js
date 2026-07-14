import { useCallback, useEffect, useState } from 'react';
import { request, BASE_URL, NURSE_TOKEN_STORAGE_KEY } from '../../../shared/api/apiClient';

const NURSE_ID_STORAGE_KEY = 'llmtriage.nurseId';

// Dev login stub calling the backend's dev-only /dashboard/dev-login route.
// Real Duo SSO replaces the body of login() with a redirect later; nothing
// downstream changes since every dashboard call already reads the token
// from sessionStorage via apiClient.dashboardRequest.
export function useDashboardAuth() {
  const [nurseId, setNurseId] = useState(() => sessionStorage.getItem(NURSE_ID_STORAGE_KEY));
  const [error, setError] = useState(null);

  // duo-callback (back-end) redirects here with ?nurseToken=&nurseId= on
  // success, or ?authError=<reason> on failure - never both. Runs once on
  // mount; history.replaceState strips the query string afterwards so a
  // page refresh doesn't try to re-consume an already-used token.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nurseToken = params.get('nurseToken');
    const id = params.get('nurseId');
    const authError = params.get('authError');

    if (nurseToken && id) {
      sessionStorage.setItem(NURSE_TOKEN_STORAGE_KEY, nurseToken);
      sessionStorage.setItem(NURSE_ID_STORAGE_KEY, id);
      setNurseId(id);
    } else if (authError) {
      setError(new Error(authError));
    } else {
      return;
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const login = useCallback(async (id, siteAccess) => {
    setError(null);
    try {
      const data = await request('/dashboard/dev-login', { method: 'POST', body: { nurseId: id, siteAccess } });
      sessionStorage.setItem(NURSE_TOKEN_STORAGE_KEY, data.nurseToken);
      sessionStorage.setItem(NURSE_ID_STORAGE_KEY, data.nurseId);
      setNurseId(data.nurseId);
    } catch (err) {
      setError(err);
    }
  }, []);

  // Full page redirect (not a fetch) - Duo's Authorization Code flow needs
  // a real browser navigation, not an XHR.
  const loginWithDuo = useCallback(() => {
    window.location.href = `${BASE_URL}/dashboard/login`;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(NURSE_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(NURSE_ID_STORAGE_KEY);
    setNurseId(null);
  }, []);

  return { nurseId, isAuthenticated: !!nurseId, login, loginWithDuo, logout, error };
}
