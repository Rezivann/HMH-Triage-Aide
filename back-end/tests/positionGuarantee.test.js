const { sortQueue } = require('../src/utils/queueSort');

const CONFIG = { categoryDecay: { unclassified: { rate: 0.5, cap: 50 } } };

function randomSession(id, now) {
  const hasFloor = Math.random() < 0.3;
  const isFloored = Math.random() < 0.3;
  return {
    sessionId: id,
    rawScore: Math.round(Math.random() * 100),
    queuedAt: new Date(now.getTime() - Math.random() * 120 * 60000).toISOString(),
    // Floor values are randomized without regard for collisions on purpose -
    // pinConflictCheck.js is what prevents two sessions ever being *stored*
    // with the same floor; sortQueue must stay correct even if that were
    // somehow violated, so this stresses the position-uniqueness invariant
    // harder than a clean input would.
    override: hasFloor ? { type: 'positionFloor', value: 1 + Math.floor(Math.random() * 20) } : null,
    autoFloor: isFloored
      ? { active: true, flooredAt: new Date(now.getTime() - Math.random() * 60 * 60000).toISOString() }
      : null,
  };
}

describe('position guarantee invariants', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('never assigns position 0 or below, and never duplicates a position, across randomized queues', () => {
    for (let trial = 0; trial < 50; trial++) {
      const size = 1 + Math.floor(Math.random() * 40);
      const sessions = Array.from({ length: size }, (_, i) => randomSession(`s${i}`, now));

      const ranked = sortQueue(sessions, { now, ...CONFIG });
      const positions = ranked.map((s) => s.position);

      expect(positions.every((p) => Number.isInteger(p) && p >= 1)).toBe(true);
      expect(new Set(positions).size).toBe(positions.length);
      expect(positions.length).toBe(size);
    }
  });

  it('an empty queue sorts to an empty result without error', () => {
    expect(sortQueue([], { now, ...CONFIG })).toEqual([]);
  });

  it('a single-patient queue always lands on position 1', () => {
    const sessions = [randomSession('only', now)];
    const ranked = sortQueue(sessions, { now, ...CONFIG });
    expect(ranked[0].position).toBe(1);
  });
});
