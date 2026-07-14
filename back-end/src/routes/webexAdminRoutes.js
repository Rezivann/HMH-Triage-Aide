const express = require('express');
const webexAdminController = require('../controllers/webexAdminController');

const router = express.Router();

// No auth gate yet - there's no admin-role system in this app to gate it
// behind. Low blast radius for now: /connect just redirects to Webex's own
// login+consent screen (nothing happens without a real admin approving it
// there), and /status only ever returns connection state, never the tokens
// themselves. Revisit if this needs tightening before going further than a
// single-operator deployment.
router.get('/connect', webexAdminController.connect);
router.get('/callback', webexAdminController.callback);
router.get('/status', webexAdminController.status);

module.exports = router;
