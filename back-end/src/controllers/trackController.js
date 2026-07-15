const store = require('../services/SessionStore');
const acuityPolicyStore = require('./fakeAcuityPolicyStore');
const { sortQueue } = require('../utils/queueSort');

async function getStatus(req, res) {
  const { sessionId } = req.track;
  const session = await store.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  if (session.claimedBy) {
    return res.json({ status: 'with_nurse', position: null });
  }

  // Reuses the same sortQueue the dashboard uses so this can never drift
  // from the real ranking (no separate "tracker position" calculation to
  // keep in sync). Exposes this patient's own position only - never score,
  // findings, or any other patient's data.
  const sessions = await store.listSessions({ locationIds: [session.locationId] });
  // Same status check as dashboardController.listQueue - without it, a
  // closed (e.g. Clear Queue'd) or claimed session still has its historical
  // rawScore and would keep occupying a ranked slot here forever, inflating
  // every other patient's position even though the dashboard's own queue
  // list correctly no longer shows them.
  const queued = sessions.filter((s) => s.rawScore !== null && s.status === 'queued');
  const ranked = sortQueue(queued, { now: new Date(), categoryDecay: acuityPolicyStore.getCategoryDecay() });
  const mine = ranked.find((s) => s.sessionId === sessionId);

  const status = mine?.position === 1 ? 'next' : 'waiting';
  res.json({ status, position: mine?.position ?? null });
}

module.exports = { getStatus };
