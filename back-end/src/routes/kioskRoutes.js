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
router.get('/session/:id', kioskController.getSessionStatus);

module.exports = router;
