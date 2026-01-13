
const { supabase } = require('../util/supabaseClient');

// Get all messages for a session (optionally for a student)
exports.getMessages = async (req, res) => {
  const { sessionId, studentName } = req.query;

  try {
    let query = supabase.from('messages').select('*').eq('session_id', sessionId);

    if (studentName) query = query.eq('student_name', studentName);

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Save message via REST API (optional if using sockets)
exports.saveMessage = async (req, res) => {
  const { sessionId, studentName, userName, content, type } = req.body;

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        session_id: sessionId,
        student_name: studentName,
        user_name: userName,
        content,
        type: type || 'text'
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

