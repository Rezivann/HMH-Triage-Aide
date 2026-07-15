const express = require('express');
const trackAuth = require('../middleware/trackAuth');
const auditLog = require('../middleware/auditLog');
const trackController = require('../controllers/trackController');

const router = express.Router();

router.get('/:sessionToken/status', trackAuth, auditLog, trackController.getStatus);
router.post('/:sessionToken/leave', trackAuth, auditLog, trackController.leaveQueue);

module.exports = router;
