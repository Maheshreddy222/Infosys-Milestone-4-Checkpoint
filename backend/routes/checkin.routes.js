const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const ctrl = require('../controllers/checkin.controller');

router.use(requireAuth);
router.use(requireRole('admin'));

router.post('/', ctrl.validateAndCheckin); // POST /api/events/:eventId/checkin (admin only)
router.post('/checkout', ctrl.checkout); // POST /api/events/:eventId/checkin/checkout (admin only)

module.exports = router;
