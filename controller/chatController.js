import { supabase } from '../db/supabaseClient.js';

export const saveMessage = async (req, res) => {
  const { sessionId, user, content, type } = req.body;

  const { data, error } = await supabase
    .from('messages')
    .insert([{ session_id: sessionId, user_name: user, content, type }])
    .select()
    .single();

  if (error) return res.status(500).json(error);
  res.status(201).json(data);
};

export const getMessages = async (req, res) => {
  const { sessionId } = req.query;

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at');

  if (error) return res.status(500).json(error);
  res.json(data);
};
