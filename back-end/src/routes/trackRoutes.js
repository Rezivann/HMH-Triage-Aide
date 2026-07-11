const express = require('express');
const trackAuth = require('../middleware/trackAuth');
const auditLog = require('../middleware/auditLog');
const trackController = require('../controllers/trackController');

const router = express.Router();

// Deliberately one thin route - see trackController.getStatus for why.
router.get('/:sessionToken/status', trackAuth, auditLog, trackController.getStatus);

module.exports = router;
