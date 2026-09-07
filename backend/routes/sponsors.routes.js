const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireRole } = require('../middleware/requireAuth');

// Milestone 3 — admin accounts only.
router.use(requireAuth);
router.use(requireRole('admin'));
const ctrl = require('../controllers/sponsors.controller');

router.get('/', ctrl.listSponsors);                          // GET   /api/events/:eventId/sponsors
router.post('/', ctrl.createSponsor);                         // POST  /api/events/:eventId/sponsors
router.patch('/:sponsorId/performance', ctrl.updatePerformance); // PATCH /api/events/:eventId/sponsors/:sponsorId/performance
router.post('/recommend', ctrl.recommend);                    // POST  /api/events/:eventId/sponsors/recommend
router.get('/dashboard', ctrl.dashboard);                     // GET   /api/events/:eventId/sponsors/dashboard
router.post('/:sponsorId/contact', ctrl.contactSponsor);      // POST  /api/events/:eventId/sponsors/:sponsorId/contact

module.exports = router;
