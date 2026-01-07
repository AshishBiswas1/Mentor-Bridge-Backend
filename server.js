const http = require('http');
const dotenv = require('dotenv');
const app = require('./app');
const { Server } = require('socket.io');

dotenv.config({ path: './.env' });

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`User ${socket.id} joined session ${sessionId}`);
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
    console.log('User disconnected:', socket.id);
  });
});

const port = process.env.PORT || 8000;

server.listen(port, () => console.log(`Server is running on port: ${port}`));
