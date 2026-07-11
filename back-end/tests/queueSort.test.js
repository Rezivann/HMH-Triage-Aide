const { computeEffectiveScore, sortQueue } = require('../src/utils/queueSort');

const CONFIG = { decayWeightPerMinute: 1, scoreDecayCap: 50 };

describe('computeEffectiveScore', () => {
  const now = new Date('2026-01-01T00:30:00Z');

  it('adds decay proportional to minutes waited', () => {
    const session = { rawScore: 10, queuedAt: '2026-01-01T00:00:00Z', override: null };
    expect(computeEffectiveScore(session, { now, ...CONFIG })).toBe(40); // 10 + 30 * 1
  });

  it('caps decay at scoreDecayCap no matter how long the wait', () => {
    const session = { rawScore: 10, queuedAt: '2025-12-31T00:00:00Z', override: null };
    expect(computeEffectiveScore(session, { now, ...CONFIG })).toBe(60); // 10 + cap(50)
  });

  it('never applies negative decay for a queuedAt in the future', () => {
    const session = { rawScore: 10, queuedAt: '2026-01-01T01:00:00Z', override: null };
    expect(computeEffectiveScore(session, { now, ...CONFIG })).toBe(10);
  });

  it('a fixed_score override replaces the computed value entirely, ignoring decay', () => {
    const session = {
      rawScore: 10,
      queuedAt: '2026-01-01T00:00:00Z',
      override: { type: 'fixed_score', value: 99 },
    };
    expect(computeEffectiveScore(session, { now, ...CONFIG })).toBe(99);
  });
});

describe('sortQueue', () => {
  const now = new Date('2026-01-01T00:30:00Z');

  it('ranks higher effectiveScore first when nobody is floored or overridden', () => {
    const sessions = [
      { sessionId: 'a', rawScore: 10, queuedAt: now.toISOString(), override: null, autoFloor: null },
      { sessionId: 'b', rawScore: 20, queuedAt: now.toISOString(), override: null, autoFloor: null },
    ];
    const ranked = sortQueue(sessions, { now, ...CONFIG });
    expect(ranked.map((s) => s.sessionId)).toEqual(['b', 'a']);
  });

  it('a fixed_score override can push a patient ahead of a naturally higher score', () => {
    const sessions = [
      {
        sessionId: 'a',
        rawScore: 10,
        queuedAt: now.toISOString(),
        override: { type: 'fixed_score', value: 100 },
        autoFloor: null,
      },
      { sessionId: 'b', rawScore: 20, queuedAt: now.toISOString(), override: null, autoFloor: null },
    ];
    const ranked = sortQueue(sessions, { now, ...CONFIG });
    expect(ranked.map((s) => s.sessionId)).toEqual(['a', 'b']);
  });

  it('decay keeps running for an auto-floored patient rather than freezing their score', () => {
    const flooredOld = {
      sessionId: 'floored',
      rawScore: 10,
      queuedAt: '2025-12-31T00:00:00Z',
      override: null,
      autoFloor: { active: true, flooredAt: '2025-12-31T00:00:00Z' },
    };
    const score = computeEffectiveScore(flooredOld, { now, ...CONFIG });
    expect(score).toBe(60); // still decays up to the cap, same as anyone else
  });
});
