import { useCallback, useEffect, useState } from 'react';
import { dashboardRequest } from '../../../shared/api/apiClient';

// Mirrors useQueueSocket's shape (policy/error/refetch) plus a save() that
// PUTs the edited table and note - same note-required contract the backend
// enforces for /dashboard/override, since a policy change is audited the
// same way an override is.
export function useAcuityPolicy() {
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState(null);

  const refetch = useCallback(() => {
    dashboardRequest('/dashboard/acuity-policy')
      .then(setPolicy)
      .catch((err) => setError(err));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = useCallback(async ({ categories, adjustmentRange, note }) => {
    const updated = await dashboardRequest('/dashboard/acuity-policy', {
      method: 'PUT',
      body: { categories, adjustmentRange, note },
    });
    setPolicy(updated);
    return updated;
  }, []);

  return { policy, error, refetch, save };
}
