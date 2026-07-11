import { useState } from 'react';
import { dashboardRequest } from '../../../shared/api/apiClient';

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
    <form onSubmit={handleSubmit}>
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
        />
      )}

      <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason (required)" required />

      <button type="submit" disabled={submitting}>
        Apply override
      </button>

      {error && <p role="alert">{error}</p>}
    </form>
  );
}
