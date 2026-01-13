const express = require('express');
const authController = require('../controller/authController');

const router = express.Router();

router.post("/signup",authController.signup);

router.post('/login',authController.login);
router.post('/forgot-password',authController.forgotPassword);
router.post('/reset-password',authController.resetPassword);
// Protect all routes below this middleware
router.use('/protect',authController.protect);

//router.route('/me').get(authController.getMe);
router.post('/logout',authController.logout);

module.exports = router;