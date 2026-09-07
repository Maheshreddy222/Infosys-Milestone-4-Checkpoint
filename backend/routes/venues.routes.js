const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireRole } = require('../middleware/requireAuth');

// Milestone 2 — admin accounts only (see requireRole).
router.use(requireAuth);
router.use(requireRole('admin'));
const ctrl = require('../controllers/venues.controller');

router.get('/', ctrl.listVenues);           // GET  /api/events/:eventId/venues
router.post('/', ctrl.createVenue);         // POST /api/events/:eventId/venues
router.post('/recommend', ctrl.recommend);  // POST /api/events/:eventId/venues/recommend

module.exports = router;
