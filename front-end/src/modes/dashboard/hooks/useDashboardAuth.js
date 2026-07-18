import { useCallback, useState } from 'react';
import { request, NURSE_TOKEN_STORAGE_KEY } from '../../../shared/api/apiClient';

const NURSE_ID_STORAGE_KEY = 'hmhtriageaide.nurseId';

// Calls the backend's /dashboard/dev-login route - currently the only
// nurse-login mechanism (Duo SSO has been removed).
export function useDashboardAuth() {
  const [nurseId, setNurseId] = useState(() => sessionStorage.getItem(NURSE_ID_STORAGE_KEY));
  const [error, setError] = useState(null);

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

  const logout = useCallback(() => {
    sessionStorage.removeItem(NURSE_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(NURSE_ID_STORAGE_KEY);
    setNurseId(null);
  }, []);

  return { nurseId, isAuthenticated: !!nurseId, login, logout, error };
}
