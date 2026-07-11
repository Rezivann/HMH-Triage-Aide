// Queue ranking. Pure functions - no DB, no I/O - so this can be unit tested
// directly (see tests/queueSort.test.js, tests/autoFloor.test.js,
// tests/positionGuarantee.test.js) without spinning up Mongo or Express.
//
// Expected session shape (superset of whatever the caller has):
//   {
//     sessionId, rawScore, queuedAt,
//     override: { type: 'fixed_score'|'positionFloor'|'dismiss_auto', value, note, at } | null,
//     autoFloor: { active: boolean, flooredAt: Date } | null,
//   }

function computeAutoFloor(queueSize) {
  return Math.max(1, Math.ceil(queueSize * 0.1));
}

// rawScore + min(minutesWaited * decayWeightPerMinute, scoreDecayCap).
// Runs for every patient, including auto-floored ones - decay never freezes.
// A fixed_score override replaces this entirely; positionFloor does not
// (decay still runs underneath a position floor).
function computeEffectiveScore(session, { now, decayWeightPerMinute, scoreDecayCap }) {
  if (session.override?.type === 'fixed_score') {
    return session.override.value;
  }

  const minutesWaited = Math.max(0, (now - new Date(session.queuedAt)) / 60000);
  const decay = Math.min(minutesWaited * decayWeightPerMinute, scoreDecayCap);
  return session.rawScore + decay;
}

// Pass 3: auto-floored patients (dismiss_auto/any override already cleared
// their autoFloor.active upstream) reserve the top computeAutoFloor(N)
// positions, earliest-floored first. If more patients are floored than the
// zone holds, the overflow cascades below the zone and is flagged
// floorEffective: false rather than silently keeping a top slot.
function assignAutoFloorPositions(sessionsWithScores) {
  const floorSize = computeAutoFloor(sessionsWithScores.length);

  const byScoreDesc = [...sessionsWithScores].sort((a, b) => b.effectiveScore - a.effectiveScore);

  const floored = byScoreDesc
    .filter((s) => s.autoFloor?.active)
    .sort((a, b) => new Date(a.autoFloor.flooredAt) - new Date(b.autoFloor.flooredAt));
  const natural = byScoreDesc.filter((s) => !s.autoFloor?.active);

  const flooredInZone = floored.slice(0, floorSize).map((s) => ({ ...s, floorEffective: true }));
  const flooredOverflow = floored.slice(floorSize).map((s) => ({ ...s, floorEffective: false }));

  const remainder = [...natural, ...flooredOverflow].sort((a, b) => b.effectiveScore - a.effectiveScore);

  return [...flooredInZone, ...remainder].map((s, index) => ({ ...s, position: index + 1 }));
}

// Pass 4: nurse positionFloor is a "worst allowed position", applied last so
// it supersedes auto-floor. If the patient's current (post pass-3) position
// is already at least as good as the floor, the floor is dormant and nothing
// moves. Otherwise the patient is pulled up to exactly the floor position,
// shifting everyone from there down by one - never creating a duplicate or
// zero/negative position, since this only ever permutes the existing array.
function applyPositionFloors(rankedSessions) {
  let working = [...rankedSessions];

  const floorOverrides = working
    .filter((s) => s.override?.type === 'positionFloor')
    .sort((a, b) => a.override.value - b.override.value);

  floorOverrides.forEach((target) => {
    const floorPosition = target.override.value;
    const currentIndex = working.findIndex((s) => s.sessionId === target.sessionId);
    const currentPosition = currentIndex + 1;

    if (currentPosition <= floorPosition) {
      working[currentIndex] = { ...working[currentIndex], floorState: 'dormant' };
      return;
    }

    const [patient] = working.splice(currentIndex, 1);
    const insertAt = Math.min(floorPosition - 1, working.length);
    working.splice(insertAt, 0, { ...patient, floorState: 'active' });
  });

  return working.map((s, index) => ({ ...s, position: index + 1 }));
}

function sortQueue(sessions, { now = new Date(), decayWeightPerMinute, scoreDecayCap }) {
  const withScores = sessions.map((s) => ({
    ...s,
    effectiveScore: computeEffectiveScore(s, { now, decayWeightPerMinute, scoreDecayCap }),
  }));

  const withAutoFloor = assignAutoFloorPositions(withScores);
  return applyPositionFloors(withAutoFloor);
}

module.exports = {
  computeAutoFloor,
  computeEffectiveScore,
  assignAutoFloorPositions,
  applyPositionFloors,
  sortQueue,
};
