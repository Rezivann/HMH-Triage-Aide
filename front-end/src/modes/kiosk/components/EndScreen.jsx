import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'framer-motion';
import MotionCard from '../../../shared/components/MotionCard';

// Final kiosk screen - patient handoff after intake ends (either the photo
// or no-photo path), before they leave the kiosk for the waiting room.
export default function EndScreen({ sessionId, trackUrl }) {
  return (
    <MotionCard style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-success-soft)',
          border: '2px solid var(--color-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          color: 'var(--color-success)',
        }}
      >
        ✓
      </motion.div>
      <h2>You're all set</h2>
      <p style={{ margin: 0 }}>Scan the code below to track your status:</p>
      {trackUrl && (
        <>
          {/* White backing regardless of theme - same as PhotoCaptureQR, QR
              scanners need real light/dark module contrast the kiosk's dark
              background can't provide. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              background: '#fff',
              padding: 20,
              borderRadius: 'var(--radius-md)',
              display: 'inline-block',
              // Bigger than .card's own between-children margin (space-3) -
              // adjoining block margins collapse to the larger value, so
              // this is what actually widens the gap below the QR code
              // specifically, not just duplicating the existing spacing.
              marginBottom: 'calc(var(--space-3) + 0.5rem)',
            }}
          >
            <QRCodeSVG value={trackUrl} size={220} />
          </motion.div>
          <p
            style={{ margin: 0, wordBreak: 'break-all', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}
          >
            Or go to: <code>{trackUrl}</code>
          </p>
        </>
      )}
      <p className="tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
        Session reference: {sessionId}
      </p>
    </MotionCard>
  );
}
