
import { supabase } from '../util/supabaseClient.js';

const callPeers = {};

async function validateUser(sessionId, token, name) {
  const { data, error } = await supabase
    .from('sessions')
    .select('mentor_id, session_token, student_name')
    .eq('id', sessionId)
    .single();

  if (error || !data) return false;

  // Check token
  if (data.session_token !== token) return false;

  // If student_name is empty, assign it
  if (!data.student_name) {
    await supabase
      .from('sessions')
      .update({ student_name: name })
      .eq('id', sessionId);
  }

  return true;
}

function signalSocket(io) {
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    /**
     * payload: { sessionId, token, name }
     */
    socket.on('join-call', async ({ sessionId, token, name }) => {
      const authorized = await validateUser(sessionId, token, name);
      if (!authorized) {
        console.log(`Unauthorized student ${name} tried to join session ${sessionId}`);
        socket.emit('error', 'Invalid session link or token');
        return;
      }

      if (!callPeers[sessionId]) callPeers[sessionId] = [];

      // Notify existing peers about new peer
      callPeers[sessionId].forEach(peerId => {
        socket.to(peerId).emit('signal', { from: socket.id });
      });

      callPeers[sessionId].push(socket.id);

      socket.on('return-signal', ({ to, signal }) => {
        socket.to(to).emit('return-signal', { signal });
      });

      socket.on('disconnect', () => {
        callPeers[sessionId] = callPeers[sessionId].filter(id => id !== socket.id);
      });
    });
  });
}

export default signalSocket;
