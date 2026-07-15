import { useCallback, useEffect, useState } from 'react';
import { trackRequest } from '../../../shared/api/apiClient';

const POLL_INTERVAL_MS = 5000;

// Polls GET /track/:sessionToken/status - the backend route is already the
// thinnest route in the system by design (see trackController.js), so this
// hook doesn't add anything beyond polling it on an interval.
export function useTrackerStatus(sessionToken) {
  const [status, setStatus] = useState(null); // 'waiting' | 'next' | 'with_nurse' | 'left_queue' | null
  const [position, setPosition] = useState(null);
  const [estimatedWaitMinutes, setEstimatedWaitMinutes] = useState(null);
  const [telehealthViable, setTelehealthViable] = useState(null);
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
        setEstimatedWaitMinutes(data.estimatedWaitMinutes);
        setTelehealthViable(data.telehealthViable);
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

  // Immediately reflects 'left_queue' locally rather than waiting for the
  // next poll tick - the patient just pressed the button, they shouldn't see
  // a stale "waiting" state for up to POLL_INTERVAL_MS afterward.
  const leaveQueue = useCallback(async () => {
    await trackRequest(`/track/${sessionToken}/leave`, { method: 'POST' });
    setStatus('left_queue');
    setPosition(null);
    setEstimatedWaitMinutes(null);
  }, [sessionToken]);

  return { status, position, estimatedWaitMinutes, telehealthViable, error, leaveQueue };
}
