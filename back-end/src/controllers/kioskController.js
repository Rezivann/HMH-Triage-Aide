const jwt = require('jsonwebtoken');
const store = require('../services/SessionStore');
const acuityPolicyStore = require('./fakeAcuityPolicyStore');
const CvServiceClient = require('../services/CvServiceClient');
const LlmService = require('../services/LlmService');
const { forceEscalate, shouldAutoFloor } = require('../services/ReviewRoutingService');
const { trackTokenSecret, photoTokenSecret } = require('../config/env');

const cvServiceClient = new CvServiceClient();
const llmService = new LlmService();

async function createSession(req, res) {
  const { kioskId, locationId } = req.kiosk;
  const session = await store.createSession({ kioskId, locationId });

  // Minted once at session creation so the kiosk can build the tracker QR
  // (EndScreen) without a separate round-trip - same secret trackAuth.js
  // verifies against, so this is the one place that token gets signed.
  const trackToken = jwt.sign({ sessionId: session.sessionId }, trackTokenSecret);

  // Embedded in PhotoCaptureQR's QR code - lets the patient's own phone
  // (MobileCaptureApp, verified by photoAuth.js) submit a photo for this one
  // session without ever holding the kiosk device's own long-lived
  // x-kiosk-api-key.
  const photoToken = jwt.sign({ sessionId: session.sessionId }, photoTokenSecret);

  res.status(201).json({ sessionId: session.sessionId, status: session.status, trackToken, photoToken });
}

async function postMessage(req, res) {
  const { sessionId, message } = req.body;
  const session = await store.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  try {
    const { reply, status: intakeStatus } = await llmService.sendMessage(session, message);
    const updated = await store.updateSession(sessionId, {
      messages: [...session.messages, { role: 'patient', text: message }, { role: 'assistant', text: reply }],
    });

    res.json({ reply, intakeStatus, messages: updated.messages });
  } catch (err) {
    res.status(502).json({ error: 'llm_request_failed', message: err.message });
  }
}

// Real pipeline: Stage 1 (blur) -> Stage 2 (measurement) -> Stage 3 (Claude
// findings) -> LlmService.synthesizeAcuity (category + adjustment) -> queue.
// Requires imageBase64 + woundBox (mandatory, matches front-end's
// WoundBoxSelector having no skip button) and a running ml-service with real
// SAM/MedSAM/Anthropic credentials - see ml-service/scripts/test_pipeline.py
// for the equivalent direct-to-ml-service test path.
async function postRealPhoto(req, res, session, { imageBase64, woundBox }) {
  const validation = await cvServiceClient.validateCapture(imageBase64);
  if (!validation.valid) {
    return res.status(422).json({ error: 'capture_invalid', failReasons: validation.failReasons });
  }

  const measurement = await cvServiceClient.measure(imageBase64, { woundBoxPrompt: woundBox });
  if (!measurement.valid) {
    return res.status(422).json({ error: 'measurement_invalid', failReasons: measurement.failReasons });
  }

  const findings = await cvServiceClient.classifyFindings(imageBase64, measurement);

  // Persisted regardless of what happens next (force-escalated or queued
  // normally) - see models/AcuityScore.js. This is what lets the nurse
  // dashboard show the photo/findings later without ever re-running the
  // pipeline (or spending more LLM tokens to do so).
  const cvRecord = {
    imageBase64,
    woundType: findings.woundType,
    findings: findings.findings,
    woundBox: measurement.woundBox,
    boundaryCoords: measurement.boundaryCoords,
  };

  if (forceEscalate(findings.findings)) {
    return res.status(202).json({
      session: await store.updateSession(session.sessionId, { status: 'force_escalated', ...cvRecord }),
      cv: findings,
      escalated: true,
    });
  }

  // Only patient turns feed the narrative - the assistant's own follow-up
  // questions aren't part of what happened to the patient.
  const narrative = session.messages
    .filter((m) => m.role === 'patient')
    .map((m) => m.text)
    .join(' ');

  const acuity = await llmService.synthesizeAcuity(narrative, findings.findings);

  const updated = await store.updateSession(session.sessionId, {
    status: 'queued',
    rawScore: acuity.rawScore,
    decayCategory: acuity.category,
    queuedAt: new Date().toISOString(),
    autoFloor: shouldAutoFloor(findings.confidenceMeta)
      ? { active: true, flooredAt: new Date().toISOString() }
      : null,
    ...cvRecord,
  });

  res.json({ session: updated, cv: findings, acuity });
}

// Fake path: confidenceMeta/hardFlags overrides let this be exercised
// (auto-floor, force-escalate, queue ranking) without a real photo, ml-service,
// or any API keys - kept alongside the real path above rather than replaced by
// it, since testing the scoring/queue logic shouldn't require live CV/LLM calls.
async function postFakePhoto(req, res, session, { confidenceMeta: confidenceOverride, hardFlags }) {
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

  // No real image/segmentation on this path (see the module comment above) -
  // woundType/findings still persist so the dashboard has something to show
  // while testing, but imageBase64/woundBox/boundaryCoords stay unset.
  const cvRecord = { woundType: fakeCvResult.woundType, findings: fakeCvResult.findings };

  if (forceEscalate(fakeCvResult.findings)) {
    return res.status(202).json({
      session: await store.updateSession(session.sessionId, { status: 'force_escalated', ...cvRecord }),
      cv: fakeCvResult,
      escalated: true,
    });
  }

  const decayCategory = 'laceration_minor';
  const updated = await store.updateSession(session.sessionId, {
    status: 'queued',
    rawScore: acuityPolicyStore.getCategory(decayCategory).baselineScore,
    decayCategory,
    queuedAt: new Date().toISOString(),
    autoFloor: shouldAutoFloor(confidenceMeta)
      ? { active: true, flooredAt: new Date().toISOString() }
      : null,
    ...cvRecord,
  });

  res.json({ session: updated, cv: fakeCvResult });
}

// No-photo path: intake (LlmService.sendMessage's "ready_no_photo" status)
// determined this presentation is purely internal - nothing a camera could
// usefully show - so this skips the entire CV pipeline (Stage 1-3) and
// synthesizes acuity from the conversation narrative alone. cvConfidence is
// null (not 0) - there being no CV pipeline here isn't itself a low-trust
// signal the way a low score from a pipeline that DID run would be, so
// shouldAutoFloor's cvConfidence check (which only fires on an actual
// number) correctly skips it; only llmConfidence's own threshold applies,
// same as it would for any other submission.
async function postNoPhoto(req, res) {
  const { sessionId } = req.body;
  const session = await store.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  try {
    const narrative = session.messages
      .filter((m) => m.role === 'patient')
      .map((m) => m.text)
      .join(' ');

    const acuity = await llmService.synthesizeAcuity(narrative, null);

    const confidenceMeta = {
      cvConfidence: null,
      llmConfidence: acuity.confidence,
      captureQualityPassed: true,
      findingsAgreement: true,
    };

    const updated = await store.updateSession(sessionId, {
      status: 'queued',
      rawScore: acuity.rawScore,
      decayCategory: acuity.category,
      queuedAt: new Date().toISOString(),
      autoFloor: shouldAutoFloor(confidenceMeta) ? { active: true, flooredAt: new Date().toISOString() } : null,
    });

    res.json({ session: updated, cv: null, acuity });
  } catch (err) {
    res.status(502).json({ error: 'acuity_synthesis_failed', message: err.message });
  }
}

// Shared by both photo-submission routes below - the only difference between
// them is how sessionId is authorized (kiosk device key + body field, vs. a
// session-scoped photo token in the URL), never the pipeline itself.
async function submitPhoto(req, res, sessionId, { imageBase64, woundBox, confidenceMeta, hardFlags }) {
  const session = await store.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  try {
    if (imageBase64) {
      if (!woundBox) {
        return res.status(400).json({ error: 'woundBox_required_with_imageBase64' });
      }
      return await postRealPhoto(req, res, session, { imageBase64, woundBox });
    }
    return await postFakePhoto(req, res, session, { confidenceMeta, hardFlags });
  } catch (err) {
    // Surfaces ml-service/Claude failures (service down, bad API key, network
    // error) as a clear JSON error instead of a hung request - this endpoint
    // is meant to be easy to test against, not silently swallow failures.
    res.status(502).json({ error: 'cv_pipeline_failed', message: err.message });
  }
}

// Kiosk-device path (kioskAuth) - the device isn't scoped to one session, so
// sessionId comes from the request body.
async function postPhoto(req, res) {
  const { sessionId, ...payload } = req.body;
  return submitPhoto(req, res, sessionId, payload);
}

// Phone path (photoAuth) - sessionId comes only from the signed photo token
// in the URL (req.photoSession), never the request body, so a phone can only
// ever submit to the one session its QR code was minted for.
async function postMobilePhoto(req, res) {
  const { sessionId } = req.photoSession;
  return submitPhoto(req, res, sessionId, req.body);
}

async function getSessionStatus(req, res) {
  const { id } = req.params;
  const session = await store.getSession(id);
  if (!session) return res.status(404).json({ error: 'session_not_found' });
  res.json(session);
}

module.exports = { createSession, postMessage, postPhoto, postMobilePhoto, postNoPhoto, getSessionStatus };
