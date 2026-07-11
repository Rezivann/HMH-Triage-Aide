const express = require('express');
const nurseAuth = require('../middleware/nurseAuth');
const auditLog = require('../middleware/auditLog');
const dashboardController = require('../controllers/dashboardController');
const { nodeEnv } = require('../config/env');

const router = express.Router();

// Dev-only - real Duo SSO replaces this route entirely, not just its logic.
if (nodeEnv !== 'production') {
  router.post('/dev-login', dashboardController.devLogin);
}

router.use(nurseAuth, auditLog);

router.get('/queue', dashboardController.listQueue);
router.get('/session/:id', dashboardController.getSessionDetail);
router.post('/claim/:id', dashboardController.claim);
router.post('/override/:id', dashboardController.override);

module.exports = router;
