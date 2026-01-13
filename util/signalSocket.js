// util/signalSocket.js
const { supabase } = require('./supabaseClient');

const initSignaling = (io) => {
  const callPeers = {}; // { room: { socketId: peerId } }

  io.on('connection', (socket) => {
    console.log('📡 Signal socket connected:', socket.id);

    // Join a video room
    socket.on('joinRoom', ({ sessionId, studentName }) => {
      const room = `${sessionId}:${studentName}`;
      socket.join(room);
      console.log(`${studentName} joined video room: ${room}`);
    });

    // Sending an offer
    socket.on('offer', ({ room, offer, to }) => {
      socket.to(to).emit('offer', { offer, from: socket.id });
    });

    // Sending an answer
    socket.on('answer', ({ room, answer, to }) => {
      socket.to(to).emit('answer', { answer, from: socket.id });
    });

    // ICE candidates
    socket.on('ice-candidate', ({ room, candidate, to }) => {
      socket.to(to).emit('ice-candidate', { candidate, from: socket.id });
    });

    socket.on('disconnect', () => {
      console.log('📡 Signal socket disconnected:', socket.id);
    });
  });
};

module.exports = initSignaling;
