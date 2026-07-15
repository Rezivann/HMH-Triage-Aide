const store = require('../services/SessionStore');
const acuityPolicyStore = require('./fakeAcuityPolicyStore');
const { sortQueue } = require('../utils/queueSort');

async function getStatus(req, res) {
  const { sessionId } = req.track;
  const session = await store.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  const { telehealthViable } = session;

  if (session.status === 'left_queue') {
    return res.json({ status: 'left_queue', position: null, estimatedWaitMinutes: null, telehealthViable });
  }

  if (session.claimedBy) {
    return res.json({ status: 'with_nurse', position: null, estimatedWaitMinutes: null, telehealthViable });
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
  // Rough average (nurse-tunable, see fakeAcuityPolicyStore.js), not a
  // per-category estimate - deliberately simple for the demo.
  const estimatedWaitMinutes =
    mine?.position != null ? mine.position * acuityPolicyStore.getPolicy().minutesPerQueuePosition : null;

  res.json({ status, position: mine?.position ?? null, estimatedWaitMinutes, telehealthViable });
}

// Voluntary opt-out - the patient chooses to leave rather than wait. Blocked
// once a nurse has already claimed them (they're already being seen, so
// silently vanishing from the queue would drop them off the nurse's radar
// too) and blocked if the session is already in some other terminal state.
async function leaveQueue(req, res) {
  const { sessionId } = req.track;
  const session = await store.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  if (session.status === 'claimed') {
    return res.status(409).json({ error: 'already_claimed' });
  }
  if (session.status !== 'queued' && session.status !== 'in_intake') {
    return res.status(409).json({ error: 'session_not_active' });
  }

  await store.updateSession(sessionId, { status: 'left_queue' });
  res.json({ status: 'left_queue' });
}

module.exports = { getStatus, leaveQueue };
