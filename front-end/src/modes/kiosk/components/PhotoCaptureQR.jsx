import { useEffect, useState } from 'react';
import { kioskRequest } from '../../../shared/api/apiClient';

// Primary photo capture path: patient scans this QR with their own phone,
// which is meant to open a session-linked mobile page giving full range of
// motion to photograph the wound. Polls session status so the kiosk screen
// advances automatically once the phone side submits the photo.
//
// TODO: the mobile capture page itself (e.g. a /kiosk-photo/:sessionId
// route) doesn't exist yet - this renders the target URL as text until a QR
// rendering library is added and that route is built.
export default function PhotoCaptureQR({ sessionId, onPhoneSubmitted }) {
  const [polling, setPolling] = useState(true);

  const qrTargetUrl = `${window.location.origin}/kiosk-photo/${sessionId}`;

  useEffect(() => {
    if (!polling || !sessionId) return undefined;

    const interval = setInterval(async () => {
      const session = await kioskRequest(`/kiosk/session/${sessionId}`);
      if (session.status === 'queued' || session.status === 'force_escalated') {
        setPolling(false);
        onPhoneSubmitted(session);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [polling, sessionId, onPhoneSubmitted]);

  return (
    <div>
      <p>Scan this code with your phone to take a photo:</p>
      <pre>{qrTargetUrl}</pre>
      <p>Waiting for photo...</p>
    </div>
  );
}
