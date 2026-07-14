const Session = require('../models/Session');
const AcuityScore = require('../models/AcuityScore');
const Override = require('../models/Override');
const ReviewFlag = require('../models/ReviewFlag');

// Real persistence layer, replacing controllers/fakeSessionStore.js's
// in-memory Map. Deliberately keeps the exact same functional interface
// (createSession/getSession/listSessions/updateSession, sync-shaped fields
// resolved async) so kioskController/dashboardController/trackController/
// escalationSweep don't need to know a session's fields actually live across
// three collections (Session, AcuityScore, Override) - see each model's own
// file for why they're split rather than one flat document.
//
// Only Session's own fields can be set through updateSession - rawScore/
// queuedAt/decayCategory/autoFloor/imageBase64/woundType/findings/woundBox
// route to AcuityScore automatically (see ACUITY_FIELDS below), and override
// is intentionally NOT settable this way (see createOverride) since it's an
// append-only audit log, not a field to overwrite in place.
const ACUITY_FIELDS = [
  'rawScore',
  'queuedAt',
  'decayCategory',
  'autoFloor',
  'imageBase64',
  'woundType',
  'findings',
  'woundBox',
];

function toFlatSession(session, acuityScore, latestOverride) {
  if (!session) return null;
  return {
    sessionId: String(session._id),
    kioskId: session.kioskId,
    locationId: session.locationId,
    status: session.status,
    messages: session.messages.map((m) => ({ role: m.role, text: m.text })),
    claimedBy: session.claimedBy,
    rawScore: acuityScore?.rawScore ?? null,
    queuedAt: acuityScore?.queuedAt ?? null,
    decayCategory: acuityScore?.decayCategory ?? null,
    autoFloor: acuityScore?.autoFloor?.active
      ? {
          active: true,
          flooredAt: acuityScore.autoFloor.flooredAt,
          reason: acuityScore.autoFloor.reason,
          confidence: acuityScore.autoFloor.confidence,
        }
      : null,
    override: latestOverride
      ? {
          type: latestOverride.overrideType,
          value: latestOverride.value,
          note: latestOverride.note,
          nurseId: latestOverride.nurseId,
          at: latestOverride.createdAt,
        }
      : null,
    // Wound photo + Claude vision findings (see models/AcuityScore.js) -
    // null/empty for sessions with no photo (the no-photo path, or a session
    // that hasn't reached the photo step yet). woundType doubles as the
    // sentinel for "was a real findings result ever recorded" - Mongoose's
    // subdocument defaults mean acuityScore.findings is never actually
    // undefined/null itself (it's an all-null object even when never set),
    // so checking it directly wouldn't distinguish "no photo" from "photo,
    // all findings false".
    imageBase64: acuityScore?.imageBase64 ?? null,
    woundType: acuityScore?.woundType ?? null,
    findings: acuityScore?.woundType != null ? acuityScore.findings : null,
    woundBox: acuityScore?.woundType != null ? acuityScore.woundBox : null,
  };
}

async function createSession({ kioskId, locationId }) {
  const session = await Session.create({ kioskId, locationId });
  return toFlatSession(session, null, null);
}

async function getSession(sessionId) {
  let session;
  try {
    session = await Session.findById(sessionId);
  } catch (err) {
    // Malformed ObjectId (e.g. a stale/garbage sessionId) - same "not found"
    // outcome as a well-formed id that just doesn't exist, not a 500.
    if (err.name === 'CastError') return null;
    throw err;
  }
  if (!session) return null;

  const [acuityScore, latestOverride] = await Promise.all([
    AcuityScore.findOne({ sessionId }),
    Override.findOne({ sessionId }).sort({ createdAt: -1 }),
  ]);

  return toFlatSession(session, acuityScore, latestOverride);
}

async function listSessions({ locationIds } = {}) {
  const query = locationIds ? { locationId: { $in: locationIds } } : {};
  const sessions = await Session.find(query);
  const sessionIds = sessions.map((s) => s._id);

  const [acuityScores, overrides] = await Promise.all([
    AcuityScore.find({ sessionId: { $in: sessionIds } }),
    // Sorted newest-first so the first override seen per session below is
    // the latest one - same "most recent wins" rule getSession applies.
    Override.find({ sessionId: { $in: sessionIds } }).sort({ createdAt: -1 }),
  ]);

  const acuityBySessionId = new Map(acuityScores.map((a) => [String(a.sessionId), a]));
  const latestOverrideBySessionId = new Map();
  for (const override of overrides) {
    const key = String(override.sessionId);
    if (!latestOverrideBySessionId.has(key)) latestOverrideBySessionId.set(key, override);
  }

  return sessions.map((s) =>
    toFlatSession(s, acuityBySessionId.get(String(s._id)), latestOverrideBySessionId.get(String(s._id)))
  );
}

async function updateSession(sessionId, patch) {
  const sessionPatch = {};
  const acuityPatch = {};

  for (const [key, value] of Object.entries(patch)) {
    if (ACUITY_FIELDS.includes(key)) acuityPatch[key] = value;
    else sessionPatch[key] = value;
  }

  const tasks = [];
  if (Object.keys(sessionPatch).length > 0) {
    tasks.push(Session.findByIdAndUpdate(sessionId, sessionPatch));
  }
  if (Object.keys(acuityPatch).length > 0) {
    tasks.push(AcuityScore.findOneAndUpdate({ sessionId }, acuityPatch, { upsert: true }));
  }
  await Promise.all(tasks);

  return getSession(sessionId);
}

// Append-only, unlike updateSession's fields - a new override document is
// inserted, never overwriting a prior one, so a superseded override's
// who/when/why survives for the audit trail (see models/Override.js).
async function createOverride(sessionId, { overrideType, value, note, nurseId }) {
  await Override.create({ sessionId, overrideType, value, note, nurseId });
  return getSession(sessionId);
}

// Idempotent by design - jobs/escalationSweep.js calls this every sweep
// interval for as long as a session's wait stays abnormal, so this must not
// create a fresh duplicate flag each time. Upserts on (sessionId, reason,
// unresolved) instead of a plain insert, so only the first sweep that
// notices actually creates a document; later sweeps for the same ongoing
// condition are no-ops until it's resolved.
async function createReviewFlag(sessionId, reason) {
  return ReviewFlag.findOneAndUpdate(
    { sessionId, reason, resolvedAt: null },
    { $setOnInsert: { sessionId, reason } },
    { upsert: true, new: true }
  );
}

module.exports = { createSession, getSession, listSessions, updateSession, createOverride, createReviewFlag };
