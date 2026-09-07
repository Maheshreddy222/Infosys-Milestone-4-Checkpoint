const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const ctrl = require('../controllers/sessions.controller');

// Any signed-in account can VIEW the schedule ("My Schedule" is a core
// page for both roles); creating or cancelling a session is admin only.
router.use(requireAuth);

router.get('/', ctrl.listSessions);                                          // any account
router.post('/', requireRole('admin'), ctrl.createSession);                  // admin only
router.patch('/:sessionId/venue-status', requireRole('admin'), ctrl.updateVenueStatus);     // admin only
router.patch('/:sessionId/speaker-status', requireRole('admin'), ctrl.updateSpeakerStatus); // admin only
router.patch('/:sessionId/cancel', requireRole('admin'), ctrl.cancelSession); // admin only

module.exports = router;
