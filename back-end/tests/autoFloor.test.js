const { computeAutoFloor, assignAutoFloorPositions } = require('../src/utils/queueSort');

describe('computeAutoFloor', () => {
  it('reserves at least 1 slot for any non-empty queue', () => {
    expect(computeAutoFloor(1)).toBe(1);
    expect(computeAutoFloor(5)).toBe(1);
  });

  it('reserves ceil(10%) of the queue size', () => {
    expect(computeAutoFloor(10)).toBe(1);
    expect(computeAutoFloor(11)).toBe(2);
    expect(computeAutoFloor(30)).toBe(3);
  });
});

function session(id, effectiveScore, autoFloor = null) {
  return { sessionId: id, effectiveScore, autoFloor };
}

describe('assignAutoFloorPositions', () => {
  it('gives the earliest-floored patient the best position within the zone', () => {
    const sessions = [
      session('natural-high', 90),
      session('floor-late', 10, { active: true, flooredAt: '2026-01-01T00:02:00Z' }),
      session('floor-early', 5, { active: true, flooredAt: '2026-01-01T00:00:00Z' }),
    ];
    // queueSize 3 -> floorSize = ceil(0.3) = 1, so only one floor slot exists
    const ranked = assignAutoFloorPositions(sessions);
    expect(ranked[0].sessionId).toBe('floor-early');
    expect(ranked[0].floorEffective).toBe(true);
  });

  it('auto-floored patients displace natural patients, not the reverse', () => {
    const sessions = [
      session('natural', 90),
      session('floored', 1, { active: true, flooredAt: '2026-01-01T00:00:00Z' }),
    ];
    // queueSize 2 -> floorSize = 1
    const ranked = assignAutoFloorPositions(sessions);
    expect(ranked[0].sessionId).toBe('floored');
    expect(ranked[1].sessionId).toBe('natural');
  });

  it('fits every floored patient in the zone when there is room, all flagged floorEffective:true', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => session(`natural-${i}`, 100 - i));
    sessions.push(
      session('floor-1', 1, { active: true, flooredAt: '2026-01-01T00:00:00Z' }),
      session('floor-2', 2, { active: true, flooredAt: '2026-01-01T00:01:00Z' })
    );
    // queueSize 12 -> floorSize = ceil(1.2) = 2, both floored patients fit
    const ranked = assignAutoFloorPositions(sessions);
    expect(ranked.find((s) => s.sessionId === 'floor-1').floorEffective).toBe(true);
    expect(ranked.find((s) => s.sessionId === 'floor-2').floorEffective).toBe(true);
  });

  it('cascades overflow floored patients below the zone and flags floorEffective:false', () => {
    const sessions = [
      session('natural-a', 90),
      session('natural-b', 80),
      session('floor-1', 10, { active: true, flooredAt: '2026-01-01T00:00:00Z' }),
      session('floor-2', 5, { active: true, flooredAt: '2026-01-01T00:01:00Z' }),
    ];
    // queueSize 4 -> floorSize = ceil(0.4) = 1, only floor-1 fits in the zone
    const ranked = assignAutoFloorPositions(sessions);
    expect(ranked.find((s) => s.sessionId === 'floor-1').floorEffective).toBe(true);
    expect(ranked.find((s) => s.sessionId === 'floor-2').floorEffective).toBe(false);
  });

  it('never produces duplicate or non-positive positions', () => {
    const sessions = Array.from({ length: 20 }, (_, i) =>
      session(`s${i}`, Math.random() * 100, i % 3 === 0 ? { active: true, flooredAt: new Date(i).toISOString() } : null)
    );
    const ranked = assignAutoFloorPositions(sessions);
    const positions = ranked.map((s) => s.position);
    expect(positions.every((p) => p >= 1)).toBe(true);
    expect(new Set(positions).size).toBe(positions.length);
  });
});
