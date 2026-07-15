import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAcuityPolicy } from '../hooks/useAcuityPolicy';
import MotionButton from '../../../shared/components/MotionButton';
import { fadeUp } from '../../../shared/motion';

// Scale is 0-1000, 1000 = brink of death - mirrors back-end's
// utils/queueSort.js clamp so the projection column below never shows a
// number the real ranking couldn't actually produce.
const MAX_SCORE = 1000;
const PROJECTION_MINUTES = [10, 30, 60];

// baseline + min(minutes * rate, cap), clamped - same formula as
// back-end/src/utils/queueSort.js's computeEffectiveScore, reimplemented
// here (not imported - separate app) purely off the in-progress draft
// values so the projection updates live as a nurse types, before saving.
function projectScore(category, minutes) {
  const decay = Math.min(minutes * category.decayWeightPerMinute, category.decayCap);
  return Math.min(MAX_SCORE, category.baselineScore + decay);
}

// Nurse-editable clinical policy: per-category baseline score, decay rate,
// and decay cap (back-end/src/controllers/fakeAcuityPolicyStore.js), plus
// the global adjustmentRange bounding how far Claude's synthesizeAcuity call
// can nudge a category's baseline for a specific patient - Claude only ever
// picks the category and the nudge, never these numbers themselves.
export default function AcuityPolicyPanel() {
  const { policy, error, save } = useAcuityPolicy();
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (policy) {
      setDraft({
        categories: policy.categories,
        adjustmentRange: policy.adjustmentRange,
        emergencyScoreThreshold: policy.emergencyScoreThreshold,
        minutesPerQueuePosition: policy.minutesPerQueuePosition,
      });
    }
  }, [policy]);

  if (error) return <p role="alert">{error.message}</p>;
  if (!draft)
    return (
      <div className="card">
        <p>Loading acuity policy...</p>
      </div>
    );

  function updateCategory(key, field, value) {
    setDraft((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        [key]: { ...prev.categories[key], [field]: Number(value) },
      },
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await save({
        categories: draft.categories,
        adjustmentRange: draft.adjustmentRange,
        emergencyScoreThreshold: draft.emergencyScoreThreshold,
        minutesPerQueuePosition: draft.minutesPerQueuePosition,
        note,
      });
      setNote('');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="card"
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      exit="hidden"
    >
      <h2>Acuity policy</h2>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Baseline score</th>
              <th>Decay / min</th>
              <th>Decay cap</th>
              {PROJECTION_MINUTES.map((minutes) => (
                <th key={minutes}>Score @ {minutes}min</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(draft.categories).map(([key, category]) => {
              const threshold = draft.emergencyScoreThreshold;
              const baselinePastThreshold = category.baselineScore >= threshold;
              const projections = PROJECTION_MINUTES.map((minutes) => projectScore(category, minutes));
              const anyPastThreshold = baselinePastThreshold || projections.some((score) => score >= threshold);

              return (
                <tr key={key}>
                  <td>
                    <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
                      {category.label}
                      {anyPastThreshold && <span className="badge badge--danger">Emergency</span>}
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={category.baselineScore}
                      onChange={(event) => updateCategory(key, 'baselineScore', event.target.value)}
                      className={baselinePastThreshold ? 'field--danger' : undefined}
                      style={{ width: '5rem' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={category.decayWeightPerMinute}
                      onChange={(event) => updateCategory(key, 'decayWeightPerMinute', event.target.value)}
                      style={{ width: '5rem' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={category.decayCap}
                      onChange={(event) => updateCategory(key, 'decayCap', event.target.value)}
                      style={{ width: '5rem' }}
                    />
                  </td>
                  {PROJECTION_MINUTES.map((minutes, index) => (
                    <td
                      key={minutes}
                      className={`tabular-nums${projections[index] >= threshold ? ' field--danger' : ''}`}
                    >
                      {Math.round(projections[index])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <label>
        Claude adjustment range (+/-)
        <input
          type="number"
          min="0"
          value={draft.adjustmentRange}
          onChange={(event) => setDraft((prev) => ({ ...prev, adjustmentRange: Number(event.target.value) }))}
          style={{ width: '6rem' }}
        />
      </label>

      <label>
        Emergency score threshold (0-{MAX_SCORE})
        <input
          type="number"
          min="0"
          max={MAX_SCORE}
          value={draft.emergencyScoreThreshold}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, emergencyScoreThreshold: Number(event.target.value) }))
          }
          style={{ width: '6rem' }}
        />
      </label>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        A session whose score reaches this - at intake or after decay - skips the queue and sends the patient
        straight to the front desk. Categories/times above this threshold are outlined in red and tagged
        "Emergency".
      </p>

      <label>
        Minutes per queue position (patient wait estimate)
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={draft.minutesPerQueuePosition}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, minutesPerQueuePosition: Number(event.target.value) }))
          }
          style={{ width: '6rem' }}
        />
      </label>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        Shown to patients on their own track page as "approximately N minutes" - just position times this
        number, not a per-category estimate.
      </p>

      <div className="row">
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Reason for change (required)"
          required
          style={{ flex: 1, minWidth: '10rem' }}
        />
        <MotionButton type="submit" className="btn-primary" disabled={submitting}>
          Save policy
        </MotionButton>
      </div>

      {submitError && <p role="alert">{submitError}</p>}
      {policy?.lastChanged && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          Last changed by {policy.lastChanged.nurseId} - "{policy.lastChanged.note}"
        </p>
      )}
    </motion.form>
  );
}
