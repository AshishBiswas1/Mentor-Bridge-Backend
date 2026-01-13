const { supabase } = require('../util/supabaseClient');
const { v4: uuidv4 } = require('uuid');

/**
 * Create session (mentor only)
 */
exports.createSession = async (req, res) => {
  try {
    const mentor_id = req.user.user.id;
    const session_token = uuidv4();

    const { data, error } = await supabase
      .from('sessions')
      .insert([{ mentor_id, session_token, status: 'pending', participants: 0 }])
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Student joins using link/token
 */
exports.joinSession = async (req, res) => {
  try {
    const { link, name } = req.body;

    if (!link || !name)
      return res.status(400).json({ error: 'link and name are required' });

    const { data: session, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('link', link)
      .single();

    if (error || !session)
      return res.status(404).json({ error: 'Session not found' });

    if (session.status === 'ended')
      return res.status(400).json({ error: 'Session already ended' });

    await supabase
      .from('sessions')
      .update({ student_name: name, status: 'active' })
      .eq('id', session.id);

    res.json({ success: true, session });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Mentor joins own session
 */
exports.mentorJoinSession = async (req, res) => {
  try {
    const mentor_id = req.user.user.id;
    const { sessionId } = req.body;

    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('mentor_id', mentor_id)
      .single();

    if (!session) return res.status(403).json({ error: 'Not your session' });

    res.json({ success: true, session });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Leave session (student)
 */
exports.leaveSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    await supabase
      .from('sessions')
      .update({ student_name: null, status: 'pending' })
      .eq('id', sessionId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * End session (mentor)
 */
exports.endSession = async (req, res) => {
  try {
    const mentor_id = req.user.user.id;
    const { sessionId } = req.body;

    await supabase
      .from('sessions')
      .update({ status: 'ended' })
      .eq('id', sessionId)
      .eq('mentor_id', mentor_id);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Disconnect student (mentor only)
 */
exports.disconnectStudent = async (req, res) => {
  try {
    const mentor_id = req.user.user.id;
    const { sessionId } = req.body;

    await supabase
      .from('sessions')
      .update({ student_name: null })
      .eq('id', sessionId)
      .eq('mentor_id', mentor_id);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Get sessions for logged in mentor
 */
exports.getMentorSessions = async (req, res) => {
  try {
    const mentor_id = req.user.user.id;

    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('mentor_id', mentor_id)
      .order('created_at', { ascending: false });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Get session by link or id
 */
exports.getSession = async (req, res) => {
  try {
    const { link, id } = req.query;

    const query = supabase.from('sessions').select('*');

    if (link) query.eq('link', link);
    if (id) query.eq('id', id);

    const { data } = await query.single();

    if (!data) return res.status(404).json({ error: 'Session not found' });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Increment participants
 */
exports.incrementParticipant = async (req, res) => {
  const sessionId = req.params.sessionId || req.body.sessionId;
  await supabase.rpc('increment_participants', { sid: sessionId });
  res.json({ success: true });
};

/**
 * Decrement participants
 */
exports.decrementParticipant = async (req, res) => {
  const sessionId = req.params.sessionId || req.body.sessionId;
  await supabase.rpc('decrement_participants', { sid: sessionId });
  res.json({ success: true });
};

/**
 * Get participant count
 */
exports.numberOfParticipants = async (req, res) => {
  const sessionId = req.params.sessionId || req.query.link;

  const { data } = await supabase
    .from('sessions')
    .select('participants')
    .eq('id', sessionId)
    .single();

  res.json({ participants: data?.participants || 0 });
};
