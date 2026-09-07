const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireRole } = require('../middleware/requireAuth');

// Milestone 3 — admin accounts only.
router.use(requireAuth);
router.use(requireRole('admin'));
const ctrl = require('../controllers/operationsAnalytics.controller');

router.get('/', ctrl.getOperationsAnalytics);                      // GET  /api/events/:eventId/operations-analytics
router.get('/live-notifications', ctrl.getLiveNotifications);      // GET  /api/events/:eventId/operations-analytics/live-notifications
router.post('/recommendations', ctrl.getOperationsRecommendations); // POST /api/events/:eventId/operations-analytics/recommendations

module.exports = router;
