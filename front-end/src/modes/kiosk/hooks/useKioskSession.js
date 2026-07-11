import { useCallback, useEffect, useState } from 'react';
import { kioskRequest } from '../../../shared/api/apiClient';

// Owns the whole kiosk session lifecycle so KioskApp and its child screens
// never talk to apiClient directly. The backend's response is always treated
// as the source of truth for message history (no optimistic local echo) -
// POST /kiosk/message already returns the full updated list.
export function useKioskSession() {
  const [sessionId, setSessionId] = useState(null);
  const [trackToken, setTrackToken] = useState(null);
  const [status, setStatus] = useState('creating'); // creating | ready | error
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [photoResult, setPhotoResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    kioskRequest('/kiosk/session', { method: 'POST' })
      .then((data) => {
        if (cancelled) return;
        setSessionId(data.sessionId);
        setTrackToken(data.trackToken);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const data = await kioskRequest('/kiosk/message', {
        method: 'POST',
        body: { sessionId, message: text },
      });
      setMessages(data.messages);
      return data;
    },
    [sessionId]
  );

  const submitPhoto = useCallback(
    async (overrides = {}) => {
      const data = await kioskRequest('/kiosk/photo', {
        method: 'POST',
        body: { sessionId, ...overrides },
      });
      setPhotoResult(data);
      return data;
    },
    [sessionId]
  );

  return { sessionId, trackToken, status, error, messages, sendMessage, photoResult, submitPhoto };
}
