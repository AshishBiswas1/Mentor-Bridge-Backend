const express = require('express');
const authController = require('../controller/authController');
const userController = require('../controller/userController');

const router = express.Router();

router.route('/signup').post(authController.signup);

router.route('/login').post(authController.login);

// Protect all routes below this middleware
router.use(authController.protect);

router.route('/me').get(userController.getMe);
router.route('/logout').post(authController.logout);

module.exports = router;