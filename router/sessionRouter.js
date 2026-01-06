const express = require('express');
const sessionController = require('../controller/sessionController');
const authController = require('../controller/authController');

const router = express.Router();

// Public routes
router.post('/join', sessionController.joinSession);
router.get('/', sessionController.getSession);
router.post('/leave', sessionController.leaveSession);

// Protected routes
router.use(authController.protect);
router.post('/create', sessionController.createSession);
router.post('/end', sessionController.endSession);
// Mentor-only endpoints
router.get('/mentor', sessionController.getMentorSessions);
router.post('/mentor-join', sessionController.mentorJoinSession);

module.exports = router;
