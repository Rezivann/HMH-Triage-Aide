import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { dashboardRequest } from '../../../shared/api/apiClient';
import MotionButton from '../../../shared/components/MotionButton';
import { fadeUpSmall } from '../../../shared/motion';

// Mirrors backend validation exactly: note is required, and a positionFloor
// conflict comes back as 409 position_conflict naming the other session -
// surfaced here rather than a generic error.
export default function OverrideModal({ sessionId, onOverridden }) {
  const [overrideType, setOverrideType] = useState('positionFloor');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await dashboardRequest(`/dashboard/override/${sessionId}`, {
        method: 'POST',
        body: { overrideType, value: value ? Number(value) : null, note },
      });
      setNote('');
      onOverridden?.();
    } catch (err) {
      setError(
        err.body?.error === 'position_conflict'
          ? `Position ${value} is already taken by ${err.body.conflictingSessionId}`
          : err.message
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="row">
      <select value={overrideType} onChange={(event) => setOverrideType(event.target.value)}>
        <option value="positionFloor">Position floor</option>
        <option value="fixed_score">Fixed score</option>
        <option value="dismiss_auto">Dismiss auto-floor</option>
      </select>

      {overrideType !== 'dismiss_auto' && (
        <input
          type="number"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Value"
          style={{ width: '6rem' }}
        />
      )}

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Reason (required)"
        required
        style={{ flex: 1, minWidth: '10rem' }}
      />

      <MotionButton type="submit" className="btn-primary" disabled={submitting}>
        Apply override
      </MotionButton>

      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            variants={fadeUpSmall}
            initial="hidden"
            animate="visible"
            exit="hidden"
            style={{ width: '100%' }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
