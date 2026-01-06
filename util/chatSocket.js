import { supabase } from './supabaseClient.js';

export const initChatSocket = (io) => {
  io.on('connection', (socket) => {

    socket.on('joinSession', async ({ sessionId, user }) => {
      socket.join(sessionId);

      const sysMsg = {
        session_id: sessionId,
        user_name: 'system',
        content: `${user} joined the chat`,
        type: 'system'
      };

      const { data } = await supabase.from('messages').insert(sysMsg).select().single();
      io.to(sessionId).emit('receiveMessage', data);
    });

    socket.on('sendMessage', async (msg) => {
      const { data } = await supabase.from('messages').insert({
        session_id: msg.sessionId,
        user_name: msg.user,
        content: msg.content,
        type: msg.type || 'text'
      }).select().single();

      io.to(msg.sessionId).emit('receiveMessage', data);
    });

    socket.on('leaveSession', async ({ sessionId, user }) => {
      socket.leave(sessionId);

      const sysMsg = {
        session_id: sessionId,
        user_name: 'system',
        content: `${user} left the chat`,
        type: 'system'
      };

      const { data } = await supabase.from('messages').insert(sysMsg).select().single();
      io.to(sessionId).emit('receiveMessage', data);
    });
  });
};
