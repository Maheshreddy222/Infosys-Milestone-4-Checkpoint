const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth } = require('../middleware/requireAuth');
const ctrl = require('../controllers/attendees.controller');

// Any signed-in account (user or admin) — Registration and Attendees are
// core pages for both roles.
router.use(requireAuth);

router.get('/', ctrl.listAttendees);
router.post('/', ctrl.registerAttendee);
router.patch('/:attendeeId/toggle', ctrl.toggleCheckin);
router.get('/:attendeeId/ticket', ctrl.getTicket);

module.exports = router;
