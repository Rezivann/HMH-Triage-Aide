import { useCallback, useEffect, useState } from 'react';
import { kioskRequest } from '../../../shared/api/apiClient';

// Owns the whole kiosk session lifecycle so KioskApp and its child screens
// never talk to apiClient directly. The backend's response is always treated
// as the source of truth for message history (no optimistic local echo) -
// POST /kiosk/message already returns the full updated list.
export function useKioskSession() {
  const [sessionId, setSessionId] = useState(null);
  const [trackToken, setTrackToken] = useState(null);
  const [photoToken, setPhotoToken] = useState(null);
  const [status, setStatus] = useState('creating'); // creating | ready | error
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [photoResult, setPhotoResult] = useState(null);
  const [intakeStatus, setIntakeStatus] = useState('asking'); // asking | ready_for_photo | ready_no_photo

  useEffect(() => {
    let cancelled = false;
    kioskRequest('/kiosk/session', { method: 'POST' })
      .then((data) => {
        if (cancelled) return;
        setSessionId(data.sessionId);
        setTrackToken(data.trackToken);
        setPhotoToken(data.photoToken);
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
      setIntakeStatus(data.intakeStatus ?? 'asking');
      return data;
    },
    [sessionId]
  );

  // Fallback for browsers with no SpeechRecognition API (Webex Desk) - the
  // caller records raw audio client-side and this sends it to the backend's
  // Whisper-backed /kiosk/transcribe instead of transcribing locally.
  const transcribeAudio = useCallback(
    async (audioBase64, mimeType) => {
      const data = await kioskRequest('/kiosk/transcribe', {
        method: 'POST',
        body: { sessionId, audioBase64, mimeType },
      });
      return data.transcript;
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

  // Intake decided this presentation has nothing visually inspectable (e.g.
  // stomach pain) - skips photo capture entirely and synthesizes acuity from
  // the conversation narrative alone (see kioskController.postNoPhoto).
  const submitWithoutPhoto = useCallback(async () => {
    const data = await kioskRequest('/kiosk/no-photo', {
      method: 'POST',
      body: { sessionId },
    });
    setPhotoResult(data);
    return data;
  }, [sessionId]);

  return {
    sessionId,
    trackToken,
    photoToken,
    status,
    error,
    messages,
    sendMessage,
    transcribeAudio,
    photoResult,
    submitPhoto,
    submitWithoutPhoto,
    intakeStatus,
  };
}
