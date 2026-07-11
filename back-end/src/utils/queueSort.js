// Queue ranking. Pure functions - no DB, no I/O - so this can be unit tested
// directly (see tests/queueSort.test.js, tests/autoFloor.test.js,
// tests/positionGuarantee.test.js) without spinning up Mongo or Express.
//
// Expected session shape (superset of whatever the caller has):
//   {
//     sessionId, rawScore, queuedAt, decayCategory,
//     override: { type: 'fixed_score'|'positionFloor'|'dismiss_auto', value, note, at } | null,
//     autoFloor: { active: boolean, flooredAt: Date } | null,
//   }
//
// decayCategory keys into categoryDecay (a plain { categoryKey: { rate, cap } }
// map - see controllers/fakeAcuityPolicyStore.js's getCategoryDecay()). Kept
// as a plain map rather than importing the policy store directly so this
// file stays pure and testable without a store dependency.
//
// Scale: 0-1000, where 1000 is a patient at the brink of death - every
// effectiveScore is clamped to this range regardless of category, override,
// or how the raw pieces combine, so the ceiling's meaning never drifts.
const MIN_SCORE = 0;
const MAX_SCORE = 1000;

function clampScore(value) {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, value));
}

function computeAutoFloor(queueSize) {
  return Math.max(1, Math.ceil(queueSize * 0.1));
}

// Higher effectiveScore first; on an exact tie, whoever has been waiting
// longer (earlier queuedAt) ranks first - two patients should never be
// ordered arbitrarily just because their scores happened to land on the
// same number.
function compareByScore(a, b) {
  if (b.effectiveScore !== a.effectiveScore) return b.effectiveScore - a.effectiveScore;
  return new Date(a.queuedAt) - new Date(b.queuedAt);
}

// rawScore + min(minutesWaited * rate, cap), where rate/cap come from
// categoryDecay[session.decayCategory] - falls back to
// categoryDecay.unclassified for sessions with no category assigned yet.
// cap bounds how much decay alone can ever add for that category (e.g. a
// bruise should never drift near the top of the scale purely from waiting),
// independent of the rate. Runs for every patient, including auto-floored
// ones - decay never freezes. A fixed_score override replaces the rawScore+
// decay computation entirely; positionFloor does not (decay still runs
// underneath a position floor).
function computeEffectiveScore(session, { now, categoryDecay }) {
  if (session.override?.type === 'fixed_score') {
    return clampScore(session.override.value);
  }

  const { rate, cap } = categoryDecay[session.decayCategory] ?? categoryDecay.unclassified ?? { rate: 0, cap: 0 };
  const minutesWaited = Math.max(0, (now - new Date(session.queuedAt)) / 60000);
  const decay = Math.min(minutesWaited * rate, cap);
  return clampScore(session.rawScore + decay);
}

// Pass 3: auto-floored patients (dismiss_auto/any override already cleared
// their autoFloor.active upstream) reserve the top computeAutoFloor(N)
// positions, earliest-floored first. If more patients are floored than the
// zone holds, the overflow cascades below the zone and is flagged
// floorEffective: false rather than silently keeping a top slot.
function assignAutoFloorPositions(sessionsWithScores) {
  const floorSize = computeAutoFloor(sessionsWithScores.length);

  const byScoreDesc = [...sessionsWithScores].sort(compareByScore);

  const floored = byScoreDesc
    .filter((s) => s.autoFloor?.active)
    .sort((a, b) => new Date(a.autoFloor.flooredAt) - new Date(b.autoFloor.flooredAt));
  const natural = byScoreDesc.filter((s) => !s.autoFloor?.active);

  const flooredInZone = floored.slice(0, floorSize).map((s) => ({ ...s, floorEffective: true }));
  const flooredOverflow = floored.slice(floorSize).map((s) => ({ ...s, floorEffective: false }));

  const remainder = [...natural, ...flooredOverflow].sort(compareByScore);

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

function sortQueue(sessions, { now = new Date(), categoryDecay }) {
  const withScores = sessions.map((s) => ({
    ...s,
    effectiveScore: computeEffectiveScore(s, { now, categoryDecay }),
  }));

  const withAutoFloor = assignAutoFloorPositions(withScores);
  return applyPositionFloors(withAutoFloor);
}

module.exports = {
  MIN_SCORE,
  MAX_SCORE,
  computeAutoFloor,
  computeEffectiveScore,
  assignAutoFloorPositions,
  applyPositionFloors,
  sortQueue,
};
