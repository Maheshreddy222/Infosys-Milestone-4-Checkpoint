const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const ctrl = require('../controllers/incidents.controller');

// Any signed-in account (user or admin) can LOG an incident — it's on
// both dashboards, but users can only report; managing/resolving/viewing
// the incident list, status changes, reports, and alerts is admin only.
router.use(requireAuth);

router.post('/', ctrl.createIncident);                                        // POST  /api/events/:eventId/incidents (any account)
router.get('/', requireRole('admin'), ctrl.listIncidents);                    // GET   /api/events/:eventId/incidents (admin only)
router.patch('/:incidentId/status', requireRole('admin'), ctrl.updateStatus); // PATCH .../status (admin only)
router.get('/alerts', requireRole('admin'), ctrl.alerts);                     // GET   .../alerts (admin only)
router.get('/:incidentId/report', requireRole('admin'), ctrl.getReport);      // GET   .../report (admin only)

module.exports = router;
