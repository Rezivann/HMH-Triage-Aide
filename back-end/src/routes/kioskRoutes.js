const express = require('express');
const kioskAuth = require('../middleware/kioskAuth');
const auditLog = require('../middleware/auditLog');
const kioskController = require('../controllers/kioskController');

const router = express.Router();

router.use(kioskAuth, auditLog);

router.post('/session', kioskController.createSession);
router.post('/message', kioskController.postMessage);
router.post('/photo', kioskController.postPhoto);
router.post('/no-photo', kioskController.postNoPhoto);
router.post('/transcribe', kioskController.postTranscribe);
router.get('/session/:id', kioskController.getSessionStatus);

// "Use a test image instead of the camera" flow - deliberately available in
// every environment (not just dev) per explicit request, so it can be
// exercised against the real deployed ml-service/backend, not only a local
// stack. Still behind kioskAuth like every other route on this router -
// requires the kiosk device key, not open to the public internet.
router.get('/test-images', kioskController.listTestImages);
router.get('/test-images/:filename', kioskController.getTestImage);

module.exports = router;
