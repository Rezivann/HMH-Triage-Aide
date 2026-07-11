import { useEffect, useState } from 'react';
import { trackRequest } from '../../../shared/api/apiClient';

const POLL_INTERVAL_MS = 5000;

// Polls GET /track/:sessionToken/status - the backend route is already the
// thinnest route in the system by design (see trackController.js), so this
// hook doesn't add anything beyond polling it on an interval.
export function useTrackerStatus(sessionToken) {
  const [status, setStatus] = useState(null); // 'waiting' | 'next' | 'with_nurse' | null
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionToken) return undefined;
    let cancelled = false;

    async function poll() {
      try {
        const data = await trackRequest(`/track/${sessionToken}/status`);
        if (cancelled) return;
        setStatus(data.status);
        setPosition(data.position);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionToken]);

  return { status, position, error };
}
