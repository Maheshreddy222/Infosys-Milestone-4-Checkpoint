const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth } = require('../middleware/requireAuth');
const ctrl = require('../controllers/analytics.controller');

router.use(requireAuth); // any signed-in account — Analytics is a core page for both roles

router.get('/', ctrl.getAnalytics);

module.exports = router;
