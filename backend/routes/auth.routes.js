const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/requireAuth');

router.post('/register', ctrl.register);  // POST /api/auth/register
router.post('/login', ctrl.login);        // POST /api/auth/login
router.get('/me', requireAuth, ctrl.me);  // GET  /api/auth/me

module.exports = router;
