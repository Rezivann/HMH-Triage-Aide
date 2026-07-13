const store = require('../services/SessionStore');
const acuityPolicyStore = require('../controllers/fakeAcuityPolicyStore');
const { sortQueue } = require('../utils/queueSort');

// Not for sorting - the dashboard already re-sorts on every GET /dashboard/queue
// read via utils/queueSort.js. This job exists for the two things a read-time
// sort can't do on its own: pushing unprompted WebSocket updates, and
// catching abnormal waits as a safety valve regardless of score.
const SWEEP_INTERVAL_MS = 60 * 1000;

// TODO: move to a per-category clinical lookup, same as fakeAcuityPolicyStore.js's
// decayWeightPerMinute, once categories flow through from CV findings.
const ABNORMAL_WAIT_MINUTES = 60;

let intervalHandle = null;
let broadcastFn = null;

function setBroadcaster(fn) {
  broadcastFn = fn;
}

function minutesWaited(session, now) {
  if (!session.queuedAt) return 0;
  return (now - new Date(session.queuedAt)) / 60000;
}

async function sweep({ now = new Date() } = {}) {
  const sessions = await store.listSessions();
  const queued = sessions.filter((s) => s.rawScore !== null && s.status === 'queued');
  const ranked = sortQueue(queued, { now, categoryDecay: acuityPolicyStore.getCategoryDecay() });

  const abnormalWaits = ranked.filter((s) => minutesWaited(s, now) > ABNORMAL_WAIT_MINUTES);

  // createReviewFlag is idempotent (upserts on sessionId+reason+unresolved),
  // so this is safe to call every sweep for as long as a wait stays
  // abnormal - only the first sweep that notices actually persists anything.
  await Promise.all(abnormalWaits.map((s) => store.createReviewFlag(s.sessionId, 'abnormal_wait')));

  if (broadcastFn) {
    broadcastFn({
      type: 'queue_update',
      queue: ranked.map((s) => ({
        sessionId: s.sessionId,
        locationId: s.locationId,
        position: s.position,
        effectiveScore: s.effectiveScore,
      })),
      abnormalWaits: abnormalWaits.map((s) => s.sessionId),
    });
  }

  return { ranked, abnormalWaits };
}

function start() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    sweep().catch((err) => console.error('[escalationSweep] sweep failed:', err));
  }, SWEEP_INTERVAL_MS);
}

function stop() {
  clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { sweep, start, stop, setBroadcaster, ABNORMAL_WAIT_MINUTES, SWEEP_INTERVAL_MS };
