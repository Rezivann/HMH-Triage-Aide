const jwt = require('jsonwebtoken');
const store = require('../services/SessionStore');
const acuityPolicyStore = require('./fakeAcuityPolicyStore');
const CvServiceClient = require('../services/CvServiceClient');
const LlmService = require('../services/LlmService');
const TranscriptionService = require('../services/TranscriptionService');
const { forceEscalate, isCriticalScore, evaluateAutoFloor } = require('../services/ReviewRoutingService');

function buildAutoFloor(confidenceMeta) {
  const result = evaluateAutoFloor(confidenceMeta);
  if (!result) return null;
  return { active: true, flooredAt: new Date().toISOString(), reason: result.reason, confidence: result.confidence };
}

// Second force-escalate trigger, alongside forceEscalate(findings)'s
// hardFlag check - fires once the synthesized acuity score itself crosses
// CRITICAL_SCORE_THRESHOLD, regardless of what path produced it (photo or
// verbal-only). rawScore/decayCategory/queuedAt are still persisted (unlike
// the hardFlag branch, which never computes a score at all) so the
// dashboard can show why this got escalated - status !== 'queued' already
// keeps it out of the ranked queue (see dashboardController.listQueue).
async function escalateForCriticalScore(sessionId, acuity, extraFields) {
  return store.updateSession(sessionId, {
    status: 'force_escalated',
    rawScore: acuity.rawScore,
    decayCategory: acuity.category,
    queuedAt: new Date().toISOString(),
    ...extraFields,
  });
}
const { trackTokenSecret, photoTokenSecret } = require('../config/env');

const cvServiceClient = new CvServiceClient();
const llmService = new LlmService();
const transcriptionService = new TranscriptionService();

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
    const messages = [...session.messages, { role: 'patient', text: message }, { role: 'assistant', text: reply }];

    // A high-risk/life-threatening description short-circuits the rest of
    // intake right here - no photo, no acuity synthesis, no queue. The
    // patient needs to walk to the front desk now, not wait on a CV/LLM
    // round trip that a normal submission would still have to go through.
    const escalated = intakeStatus === 'emergency';
    const updated = await store.updateSession(sessionId, {
      messages,
      ...(escalated ? { status: 'force_escalated', queuedAt: new Date().toISOString() } : {}),
    });

    res.json({ reply, intakeStatus, messages: updated.messages, escalated });
  } catch (err) {
    res.status(502).json({ error: 'llm_request_failed', message: err.message });
  }
}

// Real pipeline: Stage 1 (blur) -> Stage 2 (Claude vision findings) ->
// LlmService.synthesizeAcuity (category + adjustment) -> queue. Requires
// imageBase64 + woundBox (mandatory, matches front-end's WoundBoxSelector
// having no skip button) and a running ml-service with a real Anthropic key
// - see ml-service/scripts/test_pipeline.py for the equivalent
// direct-to-ml-service test path. No segmentation model in this pipeline -
// woundBox is exactly what the patient drew, passed straight to Claude.
async function postRealPhoto(req, res, session, { imageBase64, woundBox }) {
  const validation = await cvServiceClient.validateCapture(imageBase64);
  if (!validation.valid) {
    return res.status(422).json({ error: 'capture_invalid', failReasons: validation.failReasons });
  }

  const findings = await cvServiceClient.classifyFindings(imageBase64, woundBox);

  // Persisted regardless of what happens next (force-escalated or queued
  // normally) - see models/AcuityScore.js. This is what lets the nurse
  // dashboard show the photo/findings later without ever re-running the
  // pipeline (or spending more LLM tokens to do so).
  const cvRecord = {
    imageBase64,
    woundType: findings.woundType,
    findings: findings.findings,
    woundBox,
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

  if (isCriticalScore(acuity.rawScore)) {
    return res.status(202).json({
      session: await escalateForCriticalScore(session.sessionId, acuity, cvRecord),
      cv: findings,
      acuity,
      escalated: true,
    });
  }

  const updated = await store.updateSession(session.sessionId, {
    status: 'queued',
    rawScore: acuity.rawScore,
    decayCategory: acuity.category,
    queuedAt: new Date().toISOString(),
    autoFloor: buildAutoFloor(findings.confidenceMeta),
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

  // No real image on this path (see the module comment above) - woundType/
  // findings still persist so the dashboard has something to show while
  // testing, but imageBase64/woundBox stay unset.
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
    autoFloor: buildAutoFloor(confidenceMeta),
    ...cvRecord,
  });

  res.json({ session: updated, cv: fakeCvResult });
}

// No-photo path: intake (LlmService.sendMessage's "ready_no_photo" status)
// determined this presentation is purely internal - nothing a camera could
// usefully show - so this skips the entire CV pipeline and synthesizes
// acuity from the conversation narrative alone.
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
      llmConfidence: acuity.confidence,
      captureQualityPassed: true,
      findingsAgreement: true,
    };

    if (isCriticalScore(acuity.rawScore)) {
      return res.status(202).json({
        session: await escalateForCriticalScore(sessionId, acuity, {}),
        cv: null,
        acuity,
        escalated: true,
      });
    }

    const updated = await store.updateSession(sessionId, {
      status: 'queued',
      rawScore: acuity.rawScore,
      decayCategory: acuity.category,
      queuedAt: new Date().toISOString(),
      autoFloor: buildAutoFloor(confidenceMeta),
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

// Fallback for browsers with no SpeechRecognition API (Webex Desk) - the
// client records raw audio instead of transcribing it locally, and this
// endpoint does the transcription server-side via TranscriptionService.
async function postTranscribe(req, res) {
  const { audioBase64, mimeType } = req.body;
  if (!audioBase64) return res.status(400).json({ error: 'audioBase64_required' });

  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const transcript = await transcriptionService.transcribe(audioBuffer, mimeType || 'audio/webm');
    res.json({ transcript });
  } catch (err) {
    // Logged server-side (not just returned to the client) since the kiosk
    // device has no devtools to read the response body from.
    console.error('Transcription failed:', err.message);
    res.status(502).json({ error: 'transcription_failed', message: err.message });
  }
}

module.exports = {
  createSession,
  postMessage,
  postPhoto,
  postMobilePhoto,
  postNoPhoto,
  getSessionStatus,
  postTranscribe,
};
