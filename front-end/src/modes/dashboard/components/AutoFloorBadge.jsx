// active/dormant/cascade-below states from the brief: no badge if not
// floored, "cascade-below" if the floor zone was full when this patient
// needed it (floorEffective:false), otherwise the badge is active.
export default function AutoFloorBadge({ autoFloor, floorEffective }) {
  if (!autoFloor?.active) return null;
  if (floorEffective === false) {
    return <span title="Auto-floor zone was full">Cascade-below</span>;
  }
  return <span title="Guaranteed top-10% slot">Auto-floored</span>;
}
