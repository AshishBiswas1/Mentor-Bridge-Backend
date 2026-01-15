const http = require('http');
const dotenv = require('dotenv');
const app = require('./app');
const { Server } = require('socket.io');

dotenv.config({ path: './.env' });

const server = http.createServer(app);

// Configure Socket.IO CORS using same allowlist approach as app.js
const rawSocketOrigins = [process.env.FRONTEND_URL, 'https://mentor-bridge-frontend-git-dev-c0b7d3-ashishs-projects-21c10b17.vercel.app', 'http://localhost:3000'];
const socketAllowedOrigins = rawSocketOrigins.filter(Boolean).map((o) => String(o).replace(/\/$/, ''));


const io = new Server(server, {
  cors: {
    origin: socketAllowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  // connection log removed per request

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    // join-session log removed per request
  });

  // Relay collaborative editor changes to everyone in the same session
  socket.on('code-change', (payload) => {
    try {
      if (!payload || !payload.link) return;
      // Broadcast to other sockets in the room (including sender — clients will ignore duplicates)
      io.to(payload.link).emit('code-change', payload);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('code-change relay failed', e && e.message ? e.message : e);
    }
  });

  // Relay cursor position/presence updates to the session room
  socket.on('cursor-change', (payload) => {
    try {
      if (!payload || !payload.link) return;
      io.to(payload.link).emit('cursor-change', payload);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('cursor-change relay failed', e && e.message ? e.message : e);
    }
  });

  socket.on('disconnect', () => {
    // disconnect log removed per request
  });
});

// Initialize dedicated signaling namespace for multi-room video
const initSignaling = require('./util/signalSocket');
const signalNs = io.of('/signal');
initSignaling(signalNs);

// Initialize chat socket on root namespace
const { initChatSocket } = require('./util/chatSocket');
initChatSocket(io);

const port = process.env.PORT || 8000;

server.listen(port, () => {console.log(`The server is running on port: ${port}`)});
