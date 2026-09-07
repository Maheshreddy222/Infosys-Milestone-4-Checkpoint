const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth } = require('../middleware/requireAuth');
const ctrl = require('../controllers/insights.controller');

router.use(requireAuth); // any signed-in account — AI Insights is on the user dashboard

router.post('/', ctrl.generateInsights); // POST /api/events/:eventId/insights

module.exports = router;
