// util/chatSocket.js
// Import the supabase client (module exports a default client)
const supabase = require('./supabaseClient');

exports.initChatSocket = (io) => {
  io.on('connection', (socket) => {
    // chat connection established

    // Student or Mentor joins session
    // Accepts payload: { sessionId, studentName, user, link, room }
    socket.on('joinSession', ({ sessionId, studentName, user, link, room }) => {
      // Determine canonical room key: prefer explicit room, then sessionId, then link
      const roomKey = room || sessionId || link || String(sessionId || link || 'default');
      socket.join(roomKey);

      // Note: system join messages are intentionally not emitted or persisted.
      // We only join the socket to the room. UI/clients that need presence
      // indicators should rely on participant events rather than chat messages.
    });

    // Sending a chat message
    socket.on('sendMessage', async ({ sessionId, studentName, user, content, type, link, room }) => {
      const roomKey = room || sessionId || link || String(sessionId || link || 'default');
      try {
        if (supabase && typeof supabase.from === 'function') {
          const { data, error } = await supabase
            .from('messages')
            .insert({
              session_id: sessionId || link || null,
              student_name: studentName || null,
              user_name: user,
              content,
              type: type || 'text'
            })
            .select()
            .single();

          if (error) throw error;
          // Broadcast only to other sockets in the room to avoid echoing back to sender
          socket.to(roomKey).emit('receiveMessage', data);
          return;
        }

        // If no supabase available, emit a lightweight message object to others only
        socket.to(roomKey).emit('receiveMessage', { id: `msg-${Date.now()}`, user_name: user, content, type: type || 'text', created_at: new Date().toISOString() });
      } catch (err) {
        console.warn('Chat error:', err && err.message ? err.message : err);
        socket.emit('errorMessage', { error: 'Message failed' });
      }
    });

    // Leaving session
    socket.on('leaveSession', async ({ sessionId, studentName, user, link, room }) => {
      const roomKey = room || sessionId || link || String(sessionId || link || 'default');
      socket.leave(roomKey);

      // Intentionally do not persist or emit system "left" messages.
      // Clients should use participant events or session updates for presence.
    });

    socket.on('disconnect', () => {
      // chat disconnect
    });
  });
};