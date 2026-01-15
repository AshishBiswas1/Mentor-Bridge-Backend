// util/signalSocket.js
const { supabase } = require('./supabaseClient');

const initSignaling = (io) => {
  const callPeers = {}; // { room: { socketId: peerId } }

  io.on('connection', (socket) => {

    // Join a video room
    socket.on('joinRoom', ({ room, sessionId, studentName }) => {
      // Support either explicit `room` or fallback to `sessionId:studentName`
      const targetRoom = room || (sessionId && studentName ? `${sessionId}:${studentName}` : sessionId || room);
      if (!targetRoom) return;
      socket.join(targetRoom);
      const roomSize = io.in(targetRoom).allSockets().then(sockets => {
        // Only notify others when there's more than one member (i.e. someone else is already present)
        if (sockets.size > 1) {
          socket.to(targetRoom).emit('participant-ready', { room: targetRoom, socketId: socket.id, name: studentName });
        }
        return sockets.size;
      }).catch(() => {});
    });

    // Sending an offer
    socket.on('offer', (payload) => {
      try {
        // payload may contain { room, offer, to, link }
        const { room, to } = payload || {};
        
        if (to) {
          socket.to(to).emit('offer', { ...payload, from: socket.id });
        } else if (room) {
          io.in(room).allSockets().then(sockets => {
          }).catch(() => {});
          socket.to(room).emit('offer', { ...payload, from: socket.id });
        }
      } catch (e) {
        console.warn('offer relay failed', e && e.message ? e.message : e);
      }
    });

    // Sending an answer
    socket.on('answer', (payload) => {
      try {
        const { room, to } = payload || {};
        
        if (to) {
          socket.to(to).emit('answer', { ...payload, from: socket.id });
        } else if (room) {
          io.in(room).allSockets().then(sockets => {
          }).catch(() => {});
          socket.to(room).emit('answer', { ...payload, from: socket.id });
        }
      } catch (e) {
        console.warn('answer relay failed', e && e.message ? e.message : e);
      }
    });

    // ICE candidates
    socket.on('ice-candidate', (payload) => {
      try {
        const { room, to } = payload || {};
        
        if (to) {
          socket.to(to).emit('ice-candidate', { ...payload, from: socket.id });
        } else if (room) {
          socket.to(room).emit('ice-candidate', { ...payload, from: socket.id });
        }
      } catch (e) {
        console.warn('ice-candidate relay failed', e && e.message ? e.message : e);
      }
    });

    socket.on('disconnect', () => {
    });
  });
};

module.exports = initSignaling;