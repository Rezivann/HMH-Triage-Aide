const express = require('express');
const nurseAuth = require('../middleware/nurseAuth');
const auditLog = require('../middleware/auditLog');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

// The only nurse-login mechanism now that Duo SSO has been removed - not
// gated behind nurseAuth (there's no session yet to validate). Note this
// means anyone with the URL can currently mint a nurse session for any
// nurseId/siteAccess - there is no real authentication here anymore. Revisit
// before handling real patient data.
router.post('/dev-login', dashboardController.devLogin);

router.use(nurseAuth, auditLog);

router.get('/queue', dashboardController.listQueue);
router.post('/clear-queue', dashboardController.clearQueue);
router.get('/session/:id', dashboardController.getSessionDetail);
router.post('/claim/:id', dashboardController.claim);
router.post('/override/:id', dashboardController.override);
router.get('/acuity-policy', dashboardController.getAcuityPolicy);
router.put('/acuity-policy', dashboardController.updateAcuityPolicy);

module.exports = router;
