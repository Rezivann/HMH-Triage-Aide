const express = require('express');
const nurseAuth = require('../middleware/nurseAuth');
const auditLog = require('../middleware/auditLog');
const dashboardController = require('../controllers/dashboardController');
const duoAuthController = require('../controllers/duoAuthController');
const { nodeEnv, allowDevLoginInProduction } = require('../config/env');

const router = express.Router();

// Dev-only - real Duo SSO replaces this route entirely, not just its logic.
// allowDevLoginInProduction is a deliberate, temporary escape hatch (see
// config/env.js) for when Duo access itself is unavailable.
if (nodeEnv !== 'production' || allowDevLoginInProduction) {
  router.post('/dev-login', dashboardController.devLogin);
}

// Public - these two routes *are* the auth mechanism, so they run before
// nurseAuth rather than behind it (there's no session yet to validate).
router.get('/login', duoAuthController.login);
router.get('/duo-callback', duoAuthController.callback);

router.use(nurseAuth, auditLog);

router.get('/queue', dashboardController.listQueue);
router.get('/session/:id', dashboardController.getSessionDetail);
router.post('/claim/:id', dashboardController.claim);
router.post('/override/:id', dashboardController.override);
router.get('/acuity-policy', dashboardController.getAcuityPolicy);
router.put('/acuity-policy', dashboardController.updateAcuityPolicy);

module.exports = router;
