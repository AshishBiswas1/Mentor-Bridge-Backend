import { supabase } from '../util/supabaseClient.js';

/** ------------------ SIGN UP ------------------ **/
export const signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error || !data.user) {
      return res.status(400).json({ error: error.message || 'Signup failed.' });
    }

    const { error: dbError } = await supabase
      .from('users')
      .insert([{ id: data.user.id, name, email, role }]);

    if (dbError) {
      return res.status(500).json({ error: 'User created but profile insert failed.' });
    }

    return res.status(201).json({
      message: 'Signup successful',
      user: { id: data.user.id, email: data.user.email, role },
    });
  } catch (err) {
    console.error('Signup Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


/** ------------------ LOGIN ------------------ **/
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.session)
      return res.status(401).json({ error: error?.message || 'Invalid credentials.' });

    return res.json({
      user: data.user,
      session: data.session,
      access_token: data.session.access_token,
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


/** ------------------ FORGOT PASSWORD ------------------ **/
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({ error: 'Email is required.' });

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
    });

    if (error)
      return res.status(400).json({ error: error.message });

    return res.json({ message: 'Password reset email sent.' });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


/** ------------------ RESET PASSWORD ------------------ **/
export const resetPassword = async (req, res) => {
  try {
    const { access_token, newPassword } = req.body;

    if (!access_token || !newPassword)
      return res.status(400).json({ error: 'Token and new password are required.' });

    const { error } = await supabase.auth.updateUser(
      { password: newPassword },
      { accessToken: access_token }
    );

    if (error)
      return res.status(400).json({ error: error.message });

    return res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


/** ------------------ LOGOUT ------------------ **/
export const logout = async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error)
      return res.status(400).json({ error: error.message });

    return res.json({ message: 'Logout successful.' });
  } catch (err) {
    console.error('Logout Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
