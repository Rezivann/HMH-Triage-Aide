import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'framer-motion';
import { kioskRequest } from '../../../shared/api/apiClient';

// Primary photo capture path: patient scans this QR with their own phone,
// which opens MobileCaptureApp - a session-scoped page giving full range of
// motion to photograph the wound. Polls session status so the kiosk screen
// advances automatically once the phone side submits the photo.
//
// The QR encodes photoToken (a short-lived, session-scoped JWT minted at
// session creation - see kioskController.createSession), never the raw
// sessionId - MobileCaptureApp's only credential is this token, verified by
// photoAuth.js, so a patient's phone never needs (and never sees) the kiosk
// device's own long-lived x-kiosk-api-key.
export default function PhotoCaptureQR({ sessionId, photoToken, onPhoneSubmitted }) {
  const [polling, setPolling] = useState(true);

  const qrTargetUrl = `${window.location.origin}/kiosk-photo/${photoToken}`;

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
    // Explicit flex column - .status-pill is inline-flex and the QR backing
    // below is inline-block, so neither forces a line break on its own;
    // without this they end up sharing a line instead of stacking.
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
      <p style={{ margin: 0 }}>Scan this code with your phone to take a photo:</p>
      {/* White backing regardless of theme - QR scanners need real light/dark
          module contrast, which the kiosk's dark background can't provide. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: '#fff', padding: 20, borderRadius: 'var(--radius-md)', display: 'inline-block' }}
      >
        <QRCodeSVG value={qrTargetUrl} size={220} />
      </motion.div>
      <p style={{ margin: 0, wordBreak: 'break-all', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        Or go to: <code>{qrTargetUrl}</code>
      </p>
      <motion.p
        className="status-pill status-pill--neutral"
        animate={{ opacity: [1, 0.55, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        Waiting for photo...
      </motion.p>
    </div>
  );
}
