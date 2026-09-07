const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireRole } = require('../middleware/requireAuth');

// Milestone 2 — admin accounts only (see requireRole).
router.use(requireAuth);
router.use(requireRole('admin'));
const ctrl = require('../controllers/sessionAnalytics.controller');

router.get('/', ctrl.getSessionAnalytics); // GET /api/events/:eventId/session-analytics

module.exports = router;
