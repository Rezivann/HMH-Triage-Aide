const express = require('express');
const photoAuth = require('../middleware/photoAuth');
const auditLog = require('../middleware/auditLog');
const kioskController = require('../controllers/kioskController');

const router = express.Router();

router.post('/:photoToken/photo', photoAuth, auditLog, kioskController.postMobilePhoto);

module.exports = router;
