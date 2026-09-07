const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const ctrl = require('../controllers/intelligence.controller');
router.use(requireAuth);
router.use(requireRole('admin'));
router.get('/', ctrl.getEventIntelligence);
module.exports = router;
