const express = require('express');
const sessionController = require('../controller/sessionController');
const authController = require('../controller/authController');

const router = express.Router();

// Public routes
router.post('/join', sessionController.joinSession);
router.get('/', sessionController.getSession);
router.post('/leave', sessionController.leaveSession);

// Participant count helpers. Support both param and body/query forms.
router.route('/increment/:sessionId').post(sessionController.incrementParticipant);
router.route('/decrement/:sessionId').post(sessionController.decrementParticipant);

router.route('/check/:sessionId').get(sessionController.numberOfParticipants);
router.route('/check').get(sessionController.numberOfParticipants); // Also support query param ?link=

// Protected routes
router.use(authController.protect);
router.post('/create', sessionController.createSession);
router.post('/end', sessionController.endSession);
router.post('/disconnect-student', sessionController.disconnectStudent);
// Mentor-only endpoints
router.get('/mentor', sessionController.getMentorSessions);
router.post('/mentor-join', sessionController.mentorJoinSession);

module.exports = router;
