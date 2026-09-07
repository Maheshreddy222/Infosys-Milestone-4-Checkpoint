const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const ctrl = require('../controllers/complaints.controller');

// Any signed-in account can file/view (own vs. everyone's is scoped in the controller).
router.use(requireAuth);

router.get('/', ctrl.listComplaints);                              // GET   /api/events/:eventId/complaints
router.post('/', ctrl.createComplaint);                             // POST  /api/events/:eventId/complaints
router.patch('/:complaintId/status', requireRole('admin'), ctrl.updateStatus); // admin only

module.exports = router;
