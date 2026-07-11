const store = require('../controllers/fakeSessionStore');
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

function sweep({ now = new Date() } = {}) {
  const queued = store.listSessions().filter((s) => s.rawScore !== null && s.status === 'queued');
  const ranked = sortQueue(queued, { now, categoryDecay: acuityPolicyStore.getCategoryDecay() });

  const abnormalWaits = ranked.filter((s) => minutesWaited(s, now) > ABNORMAL_WAIT_MINUTES);

  // TODO: persist a ReviewFlag document per abnormal wait once models/ is
  // wired in (currently just broadcast, so the dashboard reacts immediately).
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
  intervalHandle = setInterval(() => sweep(), SWEEP_INTERVAL_MS);
}

function stop() {
  clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { sweep, start, stop, setBroadcaster, ABNORMAL_WAIT_MINUTES, SWEEP_INTERVAL_MS };
