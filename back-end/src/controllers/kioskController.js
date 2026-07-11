const jwt = require('jsonwebtoken');
const store = require('./fakeSessionStore');
const { forceEscalate, shouldAutoFloor } = require('../services/ReviewRoutingService');
const { trackTokenSecret } = require('../config/env');

function createSession(req, res) {
  const { kioskId, locationId } = req.kiosk;
  const session = store.createSession({ kioskId, locationId });

  // Minted once at session creation so the kiosk can build the tracker QR
  // (EndScreen) without a separate round-trip - same secret trackAuth.js
  // verifies against, so this is the one place that token gets signed.
  const trackToken = jwt.sign({ sessionId: session.sessionId }, trackTokenSecret);

  res.status(201).json({ sessionId: session.sessionId, status: session.status, trackToken });
}

function postMessage(req, res) {
  const { sessionId, message } = req.body;
  const session = store.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  // TODO: replace with LlmService.sendMessage(session, message) once LLM_API_KEY is set.
  // LlmService exists (services/LlmService.js) but throws without a configured key -
  // not calling it here yet keeps this endpoint usable without external credentials.
  const reply = 'Thanks - can you tell me when this started?';
  const updated = store.updateSession(sessionId, {
    messages: [...session.messages, { role: 'patient', text: message }, { role: 'assistant', text: reply }],
  });

  res.json({ reply, messages: updated.messages });
}

function postPhoto(req, res) {
  // confidenceMeta/hardFlags can be overridden in the request body so this
  // endpoint is testable end-to-end (auto-floor, force-escalate) without a
  // real photo or ml-service - see services/CvServiceClient.js for the real
  // pipeline this fake result stands in for.
  const { sessionId, confidenceMeta: confidenceOverride, hardFlags } = req.body;
  const session = store.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  const confidenceMeta = {
    cvConfidence: 0.82,
    llmConfidence: 0.78,
    captureQualityPassed: true,
    findingsAgreement: true,
    ...confidenceOverride,
  };

  const fakeCvResult = {
    captureQualityPassed: confidenceMeta.captureQualityPassed,
    woundType: 'laceration',
    findings: { bleeding: false, boneVisible: false, deformity: false, hardFlags: hardFlags ?? [] },
    confidenceMeta,
  };

  // TODO: once services/CvServiceClient + LlmService.synthesizeAcuity() are wired
  // in for real, rawScore below comes from LlmService instead of a constant.
  if (forceEscalate(fakeCvResult.findings)) {
    return res.status(202).json({
      session: store.updateSession(sessionId, { status: 'force_escalated' }),
      cv: fakeCvResult,
      escalated: true,
    });
  }

  const updated = store.updateSession(sessionId, {
    status: 'queued',
    rawScore: 42,
    queuedAt: new Date().toISOString(),
    autoFloor: shouldAutoFloor(confidenceMeta)
      ? { active: true, flooredAt: new Date().toISOString() }
      : null,
  });

  res.json({ session: updated, cv: fakeCvResult });
}

function getSessionStatus(req, res) {
  const { id } = req.params;
  const session = store.getSession(id);
  if (!session) return res.status(404).json({ error: 'session_not_found' });
  res.json(session);
}

module.exports = { createSession, postMessage, postPhoto, getSessionStatus };
