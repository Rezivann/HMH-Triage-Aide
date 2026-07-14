const jwt = require('jsonwebtoken');
const store = require('../services/SessionStore');
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

async function listQueue(req, res) {
  const { siteAccess } = req.nurse;

  const sessions = await store.listSessions({ locationIds: siteAccess });
  const queued = sessions.filter((s) => s.rawScore !== null);
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

async function getSessionDetail(req, res) {
  const { id } = req.params;
  const session = await store.getSession(id);
  if (!session) return res.status(404).json({ error: 'session_not_found' });
  res.json(session);
}

async function claim(req, res) {
  const { id } = req.params;
  const { nurseId } = req.nurse;
  const session = await store.getSession(id);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  // TODO: replace with ContactCenterService.queueToAgent() once a real Webex
  // CC tenant is provisioned (see services/ContactCenterService.js).
  const updated = await store.updateSession(id, { claimedBy: nurseId });
  res.json(updated);
}

async function override(req, res) {
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

  const session = await store.getSession(id);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  if (overrideType === 'positionFloor') {
    const allSessions = await store.listSessions();
    const { conflict, conflictingSessionId } = pinConflictCheck(allSessions, {
      sessionId: id,
      floorPosition: value,
    });
    if (conflict) {
      return res.status(409).json({ error: 'position_conflict', conflictingSessionId });
    }
  }

  // Append-only audit record (models/Override.js) - never overwrites a prior
  // override, unlike updateSession's fields.
  await store.createOverride(id, { overrideType, value: value ?? null, note, nurseId });

  // Any override - fixed score, position floor, or explicit dismiss - clears
  // auto-floor entirely and irreversibly for this patient. flooredAt/reason/
  // confidence are kept (not nulled) so the case history still shows why it
  // was floored before the nurse overrode it.
  const updated = await store.updateSession(id, {
    autoFloor: {
      active: false,
      flooredAt: session.autoFloor?.flooredAt ?? null,
      reason: session.autoFloor?.reason ?? null,
      confidence: session.autoFloor?.confidence ?? null,
    },
  });

  res.json(updated);
}

module.exports = { devLogin, listQueue, getSessionDetail, claim, override, getAcuityPolicy, updateAcuityPolicy };
