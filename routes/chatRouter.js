import {getMessages, saveMessage} from '../controller/chatController.js';
import express from 'express';

const router=express.Router();

router.post('/messages', saveMessage);
router.get('/:sessionId', getMessages);

export default router;