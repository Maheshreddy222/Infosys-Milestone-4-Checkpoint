const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireRole } = require('../middleware/requireAuth');

// Milestone 2 — admin accounts only (see requireRole).
router.use(requireAuth);
router.use(requireRole('admin'));
const ctrl = require('../controllers/speakers.controller');

router.get('/', ctrl.listSpeakers);          // GET  /api/events/:eventId/speakers
router.post('/', ctrl.createSpeaker);        // POST /api/events/:eventId/speakers
router.post('/recommend', ctrl.recommend);   // POST /api/events/:eventId/speakers/recommend

module.exports = router;
