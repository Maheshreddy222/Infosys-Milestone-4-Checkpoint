const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth } = require('../middleware/requireAuth');
const ctrl = require('../controllers/feedback.controller');

// Any signed-in account (user or admin) — scoping to "own vs. everyone's" happens in the controller.
router.use(requireAuth);

router.get('/', ctrl.listFeedback);   // GET  /api/events/:eventId/feedback
router.post('/', ctrl.createFeedback); // POST /api/events/:eventId/feedback

module.exports = router;
