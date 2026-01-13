// util/chatSocket.js
const { supabase } = require('./supabaseClient');

exports.initChatSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('💬 Chat connected:', socket.id);

    // Student or Mentor joins session
    socket.on('joinSession', ({ sessionId, studentName, user }) => {
      // Room is unique per student
      const room = `${sessionId}:${studentName}`;
      socket.join(room);
      console.log(`${user} joined room: ${room}`);

      // Optional: send system message
      (async () => {
        const { data, error } = await supabase
          .from('messages')
          .insert({
            session_id: sessionId,
            student_name: studentName,
            user_name: 'system',
            content: `${user} joined the chat`,
            type: 'system'
          })
          .select()
          .single();

        if (!error) io.to(room).emit('receiveMessage', data);
      })();
    });

    // Sending a chat message
    socket.on('sendMessage', async ({ sessionId, studentName, user, content, type }) => {
      const room = `${sessionId}:${studentName}`;
      try {
        const { data, error } = await supabase
          .from('messages')
          .insert({
            session_id: sessionId,
            student_name: studentName,
            user_name: user,
            content,
            type: type || 'text'
          })
          .select()
          .single();

        if (error) throw error;

        io.to(room).emit('receiveMessage', data);
      } catch (err) {
        console.error('Chat error:', err);
        socket.emit('errorMessage', { error: 'Message failed' });
      }
    });

    // Leaving session
    socket.on('leaveSession', async ({ sessionId, studentName, user }) => {
      const room = `${sessionId}:${studentName}`;
      socket.leave(room);

      const { data, error } = await supabase
        .from('messages')
        .insert({
          session_id: sessionId,
          student_name: studentName,
          user_name: 'system',
          content: `${user} left the chat`,
          type: 'system'
        })
        .select()
        .single();

      if (!error) io.to(room).emit('receiveMessage', data);
    });

    socket.on('disconnect', () => {
      console.log('💬 Chat disconnected:', socket.id);
    });
  });
};
