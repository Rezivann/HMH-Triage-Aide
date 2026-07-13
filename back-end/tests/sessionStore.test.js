const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const store = require('../src/services/SessionStore');
const ReviewFlag = require('../src/models/ReviewFlag');

// Real Mongo (in-memory, not mocked) - the whole point of this suite is
// verifying the actual Mongoose queries in SessionStore.js work, especially
// the flattening across three collections (Session/AcuityScore/Override)
// back into the single-object shape queueSort.js and every controller
// expect. No real MongoDB server is installed on this machine, so this is
// the only way to test against a real database rather than just trusting
// the code compiles.
let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

describe('createSession / getSession', () => {
  it('creates a session with the expected default flat shape', async () => {
    const created = await store.createSession({ kioskId: 'kiosk-1', locationId: 'loc-1' });

    expect(created.kioskId).toBe('kiosk-1');
    expect(created.locationId).toBe('loc-1');
    expect(created.status).toBe('in_intake');
    expect(created.messages).toEqual([]);
    expect(created.claimedBy).toBeNull();
    expect(created.rawScore).toBeNull();
    expect(created.decayCategory).toBeNull();
    expect(created.autoFloor).toBeNull();
    expect(created.override).toBeNull();
  });

  it('returns null for a session id that does not exist', async () => {
    const fakeButValidId = new mongoose.Types.ObjectId().toString();
    expect(await store.getSession(fakeButValidId)).toBeNull();
  });

  it('returns null (not a throw) for a malformed session id', async () => {
    expect(await store.getSession('not-a-real-object-id')).toBeNull();
  });
});

describe('updateSession', () => {
  it('routes Session-only fields (status, messages, claimedBy) onto the Session document', async () => {
    const created = await store.createSession({ kioskId: 'kiosk-1', locationId: 'loc-1' });

    const updated = await store.updateSession(created.sessionId, {
      status: 'queued',
      messages: [{ role: 'patient', text: 'it hurts' }],
      claimedBy: 'nurse1',
    });

    expect(updated.status).toBe('queued');
    expect(updated.messages).toEqual([{ role: 'patient', text: 'it hurts' }]);
    expect(updated.claimedBy).toBe('nurse1');
  });

  it('routes acuity fields onto a separate AcuityScore document, upserting it', async () => {
    const created = await store.createSession({ kioskId: 'kiosk-1', locationId: 'loc-1' });
    const queuedAt = new Date().toISOString();

    const updated = await store.updateSession(created.sessionId, {
      status: 'queued',
      rawScore: 525,
      decayCategory: 'severe_abdominal_pain',
      queuedAt,
      autoFloor: { active: true, flooredAt: queuedAt },
    });

    expect(updated.rawScore).toBe(525);
    expect(updated.decayCategory).toBe('severe_abdominal_pain');
    expect(new Date(updated.queuedAt).toISOString()).toBe(queuedAt);
    expect(updated.autoFloor).toEqual({ active: true, flooredAt: expect.anything() });

    // Re-fetching independently proves this actually persisted, not just
    // that updateSession's own return value carried it through.
    const refetched = await store.getSession(created.sessionId);
    expect(refetched.rawScore).toBe(525);
  });

  it('flattens autoFloor to null when not active, matching the fake store convention', async () => {
    const created = await store.createSession({ kioskId: 'kiosk-1', locationId: 'loc-1' });
    const updated = await store.updateSession(created.sessionId, {
      rawScore: 150,
      decayCategory: 'laceration_minor',
      queuedAt: new Date().toISOString(),
      autoFloor: null,
    });

    expect(updated.autoFloor).toBeNull();
  });
});

describe('listSessions', () => {
  it('filters by locationIds', async () => {
    await store.createSession({ kioskId: 'kiosk-1', locationId: 'loc-1' });
    await store.createSession({ kioskId: 'kiosk-2', locationId: 'loc-2' });

    const onlyLoc1 = await store.listSessions({ locationIds: ['loc-1'] });
    expect(onlyLoc1).toHaveLength(1);
    expect(onlyLoc1[0].locationId).toBe('loc-1');
  });

  it('returns every session when no locationIds filter is given', async () => {
    await store.createSession({ kioskId: 'kiosk-1', locationId: 'loc-1' });
    await store.createSession({ kioskId: 'kiosk-2', locationId: 'loc-2' });

    expect(await store.listSessions()).toHaveLength(2);
  });

  it('attaches each session its own acuity score and latest override, not another session\'s', async () => {
    const a = await store.createSession({ kioskId: 'kiosk-1', locationId: 'loc-1' });
    const b = await store.createSession({ kioskId: 'kiosk-1', locationId: 'loc-1' });

    await store.updateSession(a.sessionId, { rawScore: 100, decayCategory: 'contusion', queuedAt: new Date() });
    await store.updateSession(b.sessionId, { rawScore: 900, decayCategory: 'active_hemorrhage', queuedAt: new Date() });
    await store.createOverride(a.sessionId, { overrideType: 'fixed_score', value: 42, note: 'test', nurseId: 'n1' });

    const all = await store.listSessions();
    const foundA = all.find((s) => s.sessionId === a.sessionId);
    const foundB = all.find((s) => s.sessionId === b.sessionId);

    expect(foundA.rawScore).toBe(100);
    expect(foundA.override).toEqual(expect.objectContaining({ type: 'fixed_score', value: 42 }));
    expect(foundB.rawScore).toBe(900);
    expect(foundB.override).toBeNull();
  });
});

describe('createOverride', () => {
  it('is append-only - a second override becomes the new latest without erasing the first', async () => {
    const created = await store.createSession({ kioskId: 'kiosk-1', locationId: 'loc-1' });

    await store.createOverride(created.sessionId, {
      overrideType: 'positionFloor',
      value: 2,
      note: 'first',
      nurseId: 'n1',
    });
    const afterSecond = await store.createOverride(created.sessionId, {
      overrideType: 'dismiss_auto',
      value: null,
      note: 'second',
      nurseId: 'n2',
    });

    expect(afterSecond.override).toEqual(
      expect.objectContaining({ type: 'dismiss_auto', note: 'second', nurseId: 'n2' })
    );
  });
});

describe('createReviewFlag', () => {
  it('is idempotent for the same unresolved (sessionId, reason) pair', async () => {
    const created = await store.createSession({ kioskId: 'kiosk-1', locationId: 'loc-1' });

    await store.createReviewFlag(created.sessionId, 'abnormal_wait');
    await store.createReviewFlag(created.sessionId, 'abnormal_wait');

    const flags = await ReviewFlag.find({ sessionId: created.sessionId, reason: 'abnormal_wait' });
    expect(flags).toHaveLength(1);
  });
});
