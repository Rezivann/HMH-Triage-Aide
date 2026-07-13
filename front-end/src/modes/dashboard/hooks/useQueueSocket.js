import { useCallback, useEffect, useState } from 'react';
import { dashboardRequest, NURSE_TOKEN_STORAGE_KEY, BASE_URL } from '../../../shared/api/apiClient';

// Loads the queue over HTTP, then treats each WS message as a "something
// changed, refetch" signal rather than trying to apply it directly - the
// server's queue_update push carries a reduced shape (no autoFloor/override/
// status), and GET /dashboard/queue is already the authoritative computation
// (effectiveScore is computed fresh on every read), so refetching is correct,
// not a workaround.
// enabled: DashboardApp mounts this hook before the nurse has logged in (the
// login form is rendered by the same component tree, not a separate route),
// so without this the fetch+WS effect would fire once on mount with no
// token, fail with a 401, and never retry - nothing re-triggers it once
// isAuthenticated flips true afterward, since the effect has no dependency
// on it. Pass isAuthenticated so the effect (re-)runs exactly when a real
// token actually exists.
export function useQueueSocket(enabled) {
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState(null);

  const refetch = useCallback(() => {
    dashboardRequest('/dashboard/queue')
      .then((data) => setQueue(data.queue))
      .catch((err) => setError(err));
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    refetch();

    const token = sessionStorage.getItem(NURSE_TOKEN_STORAGE_KEY);
    const wsUrl = `${BASE_URL.replace(/^http/, 'ws')}/dashboard/live?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'queue_update') refetch();
    };
    ws.onerror = () => setError(new Error('WebSocket connection failed'));

    return () => ws.close();
  }, [enabled, refetch]);

  return { queue, error, refetch };
}
