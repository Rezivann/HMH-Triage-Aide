const jwt = require('jsonwebtoken');
const store = require('./fakeSessionStore');
const acuityPolicyStore = require('./fakeAcuityPolicyStore');
const { sortQueue } = require('../utils/queueSort');
const { pinConflictCheck } = require('../utils/pinConflictCheck');
const { nurseSessionSecret } = require('../config/env');

// Dev-only stand-in for real Duo SSO - mints a nurse session token directly.
// Not gated behind nurseAuth (there's no session yet to validate); the route
// mounting this in dashboardRoutes.js is what excludes it from production.
function devLogin(req, res) {
  const { nurseId, siteAccess } = req.body;
  if (!nurseId || !Array.isArray(siteAccess)) {
    return res.status(400).json({ error: 'nurseId_and_siteAccess_required' });
  }
  const nurseToken = jwt.sign({ nurseId, siteAccess }, nurseSessionSecret);
  res.json({ nurseToken, nurseId, siteAccess });
}

function listQueue(req, res) {
  const { siteAccess } = req.nurse;

  const queued = store.listSessions({ locationIds: siteAccess }).filter((s) => s.rawScore !== null);
  const ranked = sortQueue(queued, { now: new Date(), categoryDecay: acuityPolicyStore.getCategoryDecay() });

  res.json({ queue: ranked });
}

function getAcuityPolicy(req, res) {
  res.json(acuityPolicyStore.getPolicy());
}

// Global clinical policy, not a per-patient action - still note-required and
// audited the same way an override is, since it changes how every future
// (and every currently-queued) patient's score is computed.
function updateAcuityPolicy(req, res) {
  const { categories, adjustmentRange, note } = req.body;
  const { nurseId } = req.nurse;

  if (!note) {
    return res.status(400).json({ error: 'note_required' });
  }
  if (adjustmentRange !== undefined && (typeof adjustmentRange !== 'number' || adjustmentRange < 0)) {
    return res.status(400).json({ error: 'invalid_adjustment_range' });
  }

  const updated = acuityPolicyStore.updatePolicy({ categories, adjustmentRange, nurseId, note });
  res.json(updated);
}

function getSessionDetail(req, res) {
  const { id } = req.params;
  const session = store.getSession(id);
  if (!session) return res.status(404).json({ error: 'session_not_found' });
  res.json(session);
}

function claim(req, res) {
  const { id } = req.params;
  const { nurseId } = req.nurse;
  const session = store.getSession(id);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  // TODO: replace with ContactCenterService.queueToAgent() once services/ exists
  const updated = store.updateSession(id, { claimedBy: nurseId });
  res.json(updated);
}

function override(req, res) {
  const { id } = req.params;
  const { overrideType, value, note } = req.body;
  const { nurseId } = req.nurse;

  if (!note) {
    return res.status(400).json({ error: 'note_required' });
  }

  const validTypes = ['fixed_score', 'positionFloor', 'dismiss_auto'];
  if (!validTypes.includes(overrideType)) {
    return res.status(400).json({ error: 'invalid_override_type' });
  }

  const session = store.getSession(id);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  if (overrideType === 'positionFloor') {
    const { conflict, conflictingSessionId } = pinConflictCheck(store.listSessions(), {
      sessionId: id,
      floorPosition: value,
    });
    if (conflict) {
      return res.status(409).json({ error: 'position_conflict', conflictingSessionId });
    }
  }

  // Any override - fixed score, position floor, or explicit dismiss - clears
  // auto-floor entirely and irreversibly for this patient.
  const updated = store.updateSession(id, {
    override: { type: overrideType, value: value ?? null, note, nurseId, at: new Date().toISOString() },
    autoFloor: { active: false, flooredAt: session.autoFloor?.flooredAt ?? null },
  });

  res.json(updated);
}

module.exports = { devLogin, listQueue, getSessionDetail, claim, override, getAcuityPolicy, updateAcuityPolicy };
