const express = require('express');
const { getMessages, saveMessage } = require('../controller/chatController');

const router = express.Router();

router.post('/messages', saveMessage);
router.get('/:sessionId', getMessages);

module.exports = router;
