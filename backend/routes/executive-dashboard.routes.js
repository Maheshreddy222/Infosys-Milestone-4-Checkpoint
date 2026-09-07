const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { getExecutiveDashboard } = require('../controllers/intelligence.controller');
router.use(requireAuth);
router.use(requireRole('admin'));
router.get('/', getExecutiveDashboard);
module.exports = router;
