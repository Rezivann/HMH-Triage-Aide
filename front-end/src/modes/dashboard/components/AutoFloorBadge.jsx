// Mirrors ReviewRoutingService.evaluateAutoFloor's reason codes (back-end).
const REASON_LABELS = {
  capture_quality_failed: 'Photo failed capture-quality check',
  findings_disagreement: 'CV and LLM findings disagreed',
  low_llm_confidence: 'Low LLM confidence',
};

function describeReason({ reason, confidence }) {
  const label = REASON_LABELS[reason] || reason;
  if (!label) return null;
  return typeof confidence === 'number' ? `${label} (${confidence.toFixed(2)})` : label;
}

// active/dormant/cascade-below states from the brief: no badge if not
// floored, "cascade-below" if the floor zone was full when this patient
// needed it (floorEffective:false), otherwise the badge is active.
export default function AutoFloorBadge({ autoFloor, floorEffective }) {
  if (!autoFloor?.active) return null;
  const reasonText = describeReason(autoFloor);

  if (floorEffective === false) {
    return (
      <span className="badge badge--warning" title={['Auto-floor zone was full', reasonText].filter(Boolean).join(' - ')}>
        Cascade-below
      </span>
    );
  }
  return (
    <span
      className="badge badge--accent badge--pulse"
      title={['Guaranteed top-10% slot', reasonText].filter(Boolean).join(' - ')}
    >
      Auto-floored
    </span>
  );
}
