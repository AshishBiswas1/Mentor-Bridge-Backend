import express from 'express';
import dotenv from 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';

import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import { initChatSocket } from './util/chatSocket.js';
import {initSignaling} from './util/signalSocket.js';

const app = express();
const dotenvConfig = dotenv.config();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT;

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

initChatSocket(io);
initSignaling(io);

server.listen(PORT, () => {
  console.log(`Backend running on ${PORT}`);
});
