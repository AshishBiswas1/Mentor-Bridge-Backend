const express = require('express');
const sessionController = require('../controller/sessionController');
const authController = require('../controller/authController');

const router = express.Router();

// Public routes
router.post('/join', sessionController.joinSession);
router.get('/', sessionController.getSession);

// Protected routes
router.use(authController.protect);
router.post('/create', sessionController.createSession);

module.exports = router;