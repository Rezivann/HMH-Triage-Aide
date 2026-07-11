import { useEffect, useState } from 'react';
import { useAcuityPolicy } from '../hooks/useAcuityPolicy';

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
    if (policy) setDraft({ categories: policy.categories, adjustmentRange: policy.adjustmentRange });
  }, [policy]);

  if (error) return <p role="alert">{error.message}</p>;
  if (!draft) return <p>Loading acuity policy...</p>;

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
      await save({ categories: draft.categories, adjustmentRange: draft.adjustmentRange, note });
      setNote('');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Acuity policy</h2>

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
          {Object.entries(draft.categories).map(([key, category]) => (
            <tr key={key}>
              <td>{category.label}</td>
              <td>
                <input
                  type="number"
                  value={category.baselineScore}
                  onChange={(event) => updateCategory(key, 'baselineScore', event.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={category.decayWeightPerMinute}
                  onChange={(event) => updateCategory(key, 'decayWeightPerMinute', event.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={category.decayCap}
                  onChange={(event) => updateCategory(key, 'decayCap', event.target.value)}
                />
              </td>
              {PROJECTION_MINUTES.map((minutes) => (
                <td key={minutes}>{Math.round(projectScore(category, minutes))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <label>
        Claude adjustment range (+/-)
        <input
          type="number"
          min="0"
          value={draft.adjustmentRange}
          onChange={(event) => setDraft((prev) => ({ ...prev, adjustmentRange: Number(event.target.value) }))}
        />
      </label>

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Reason for change (required)"
        required
      />

      <button type="submit" disabled={submitting}>
        Save policy
      </button>

      {submitError && <p role="alert">{submitError}</p>}
      {policy?.lastChanged && (
        <p>
          Last changed by {policy.lastChanged.nurseId} - "{policy.lastChanged.note}"
        </p>
      )}
    </form>
  );
}
