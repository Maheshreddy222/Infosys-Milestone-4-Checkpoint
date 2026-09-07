const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/events.controller');
const { requireAuth, requireRole } = require('../middleware/requireAuth');

router.get('/', ctrl.listEvents);
router.post('/', requireAuth, requireRole('admin'), ctrl.createEvent);
router.get('/:id', ctrl.getEvent);
router.patch('/:id/stop-registrations', requireAuth, requireRole('admin'), ctrl.stopRegistrations);
router.patch('/:id/reopen-registrations', requireAuth, requireRole('admin'), ctrl.reopenRegistrations);
router.delete('/:id', requireAuth, requireRole('admin'), ctrl.deleteEvent);

module.exports = router;
