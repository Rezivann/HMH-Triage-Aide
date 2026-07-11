// Temporary in-memory stand-in for the Session/AcuityScore/Override models
// and a real database layer. Every controller in this directory reads and
// writes through here so kiosk, dashboard, and track all see the same data.
// Delete this once models/ and services/ exist for real.

const sessions = new Map();
let counter = 0;

function createSession({ kioskId, locationId }) {
  counter += 1;
  const session = {
    sessionId: `sess_${counter}`,
    kioskId,
    locationId,
    status: 'in_intake',
    messages: [],
    rawScore: null,
    queuedAt: null,
    claimedBy: null,
    override: null,
    autoFloor: null,
  };
  sessions.set(session.sessionId, session);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function listSessions({ locationIds } = {}) {
  const all = Array.from(sessions.values());
  if (!locationIds) return all;
  return all.filter((s) => locationIds.includes(s.locationId));
}

function updateSession(sessionId, patch) {
  const existing = sessions.get(sessionId);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  sessions.set(sessionId, updated);
  return updated;
}

module.exports = { createSession, getSession, listSessions, updateSession };
