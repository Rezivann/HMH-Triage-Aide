const express = require('express');
const voiceAuth = require('../middleware/voiceAuth');
const auditLog = require('../middleware/auditLog');
const kioskController = require('../controllers/kioskController');

const router = express.Router();

// Reuses kioskController.postMessage exactly - it only ever reads
// req.body.sessionId/message and calls LlmService.sendMessage, never
// anything kiosk-device-specific, so the same Claude-reasoning logic serves
// both the kiosk's typed conversation and Cisco Webex AI Agent Studio's
// voice channel. Only the authentication differs (see voiceAuth.js).
router.post('/message', voiceAuth, auditLog, kioskController.postMessage);

module.exports = router;
