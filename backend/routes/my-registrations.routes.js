const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const ctrl = require('../controllers/myRegistrations.controller');

router.use(requireAuth); // any signed-in account

router.get('/', ctrl.getMyRegistrations); // GET /api/my-registrations

module.exports = router;
