import { AnimatePresence, motion } from 'framer-motion';
import MotionCard from '../../../shared/components/MotionCard';

const COPY = {
  waiting: "You're in the queue. We'll let you know as your turn approaches.",
  next: "You're next.",
  with_nurse: 'A nurse is with you now.',
};

const BANNER_VARIANT = {
  waiting: 'status-banner--neutral',
  next: 'status-banner--accent',
  with_nurse: 'status-banner--success',
};

// Shows this patient's own queue position - never a score, findings, or any
// other patient's data (the backend enforces that boundary too; see
// trackController.js).
export default function StatusBand({ status, position }) {
  if (!status)
    return (
      <MotionCard>
        <p>Loading your status...</p>
      </MotionCard>
    );

  return (
    <MotionCard>
      <AnimatePresence mode="wait">
        <motion.p
          key={status}
          className={`status-banner ${BANNER_VARIANT[status] ?? 'status-banner--neutral'}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
        >
          {COPY[status] ?? 'Checking your status...'}
        </motion.p>
      </AnimatePresence>
      {position != null && (
        <p className="tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
          Position in queue:{' '}
          <AnimatePresence mode="wait">
            <motion.span
              key={position}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.25 }}
              style={{ display: 'inline-block' }}
            >
              {position}
            </motion.span>
          </AnimatePresence>
        </p>
      )}
      <p style={{ color: 'var(--color-text-faint)', fontSize: 'var(--text-sm)' }}>
        Your position may shift as other patients' medical urgency is assessed.
      </p>
    </MotionCard>
  );
}
