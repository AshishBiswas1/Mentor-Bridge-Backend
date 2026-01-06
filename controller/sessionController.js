import { supabase } from '../util/supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';

export const createSession = async (req, res) => {
  const { mentor_id, student_id } = req.body;
  const sessionLink = uuidv4();

  const { data, error } = await supabase
    .from('sessions')
    .insert([{ mentor_id, student_id, link: sessionLink, status: 'pending' }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
};
