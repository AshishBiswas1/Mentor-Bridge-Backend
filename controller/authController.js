const supabase = require('../util/supabaseClient');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');
const crypto = require('crypto');

/**
 * Generate a short unique link token
 */
function generateToken(len = 6) {
  return crypto.randomBytes(len).toString('hex');
}

/**
 * Create a collaborative session:
 * - validate input
 * - generate `id` and unique `link`
 * - insert into `sessions` table in Supabase
 * - emit `session:created` via socket.io if `io` is attached to the Express app
 */
exports.createSession = catchAsync(async (req, res, next) => {
  // Mentor must be authenticated; mentor id comes from req.user
  const mentor_id = req.user && req.user.id;

  const {data, error} = await supabase.from('users').select('name').eq('id', mentor_id);
  const userdata = data;

  if (!mentor_id) {
    return next(new AppError('Authentication required: mentor not found in request', 401));
  }

  const id = crypto.randomUUID();

  // Try to insert a session with a unique link. If link collision happens, retry a few times.
  const maxAttempts = 5;
  let attempt = 0;
  let inserted = null;
  let lastError = null;

  while (attempt < maxAttempts && !inserted) {
    attempt += 1;
    const link = generateToken(6);// 12 hex chars

    const payload = {
      id,
      mentor_id,
      mentor_name: userdata[0].name,
      // student fields will be filled later by the student
      student_name: null,
      student_email: null,
      link,
      status: 'pending'
    };

    const { data, error } = await supabase.from('sessions').insert(payload).select();

    if (error) {
      lastError = error;
      // If unique violation on link, retry. Otherwise break and throw.
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique') || (error.code && Number(error.code) === 23505)) {
        // collision - try again
        continue;
      }

      return next(new AppError(error.message || 'Database error when creating session', 500));
    }

    if (data && data.length > 0) {
      inserted = data[0];
      break;
    }
  }

  if (!inserted) {
    const message = lastError ? lastError.message : 'Failed to create unique session link';
    return next(new AppError(message, 500));
  }

  // Emit socket event if socket.io server is attached to the app
  try {
    const io = req.app && (req.app.get ? req.app.get('io') : req.app.locals && req.app.locals.io);
    if (io && typeof io.emit === 'function') {
      io.to(inserted.link).emit('session-created', inserted);
    }
  } catch (e) {
    // Non-fatal: log but don't fail request
    // eslint-disable-next-line no-console
    console.warn('socket emit failed', e.message || e);
  }

  res.status(201).json({ status: 'success', data: inserted });
});

/**
 * (Optional) helper to join session from an incoming socket or HTTP request
 * This file focuses on createSession per request. Additional session actions
 * (start, end, join) can be added similarly.
 */

/**
 * Get session by link
 */
exports.getSession = catchAsync(async (req, res, next) => {
  const { link } = req.query;

  if (!link) {
    return next(new AppError('Link is required', 400));
  }

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('link', link)
    .limit(1);
    
  if (error) {
    return next(new AppError('Database error', 500));
  }

  if (!sessions || sessions.length === 0) {
    return next(new AppError('Session not found', 404));
  }

  const session = sessions[0];

  // If session is active and has both mentor and student, notify via socket
  if (session.status === 'active' && session.student_name) {
    try {
      const io = req.app && (req.app.get ? req.app.get('io') : req.app.locals && req.app.locals.io);
      if (io && typeof io.emit === 'function') {
        io.to(session.link).emit('session-update', session);
      }
    } catch (e) {
      // Non-fatal
    }
  }

  res.status(200).json({ status: 'success', data: session });
});

/**
 * Join a collaborative session:
 * - validate input: link, student_name, student_email
 * - find session by link where status = 'pending'
 * - update session with student details and set status to 'active'
 * - emit 'session:joined' via socket.io
 */
exports.joinSession = catchAsync(async (req, res, next) => {
  const { link, student_name, student_email } = req.body;

  if (!link || !student_name || !student_email) {
    return next(new AppError('Link, student name, and student email are required', 400));
  }

  // Find the session by link and status pending
  const { data: sessions, error: findError } = await supabase
    .from('sessions')
    .select('*')
    .eq('link', link)
    .eq('status', 'pending')
    .limit(1);

  if (findError) {
    return next(new AppError('Database error', 500));
  }

  if (!sessions || sessions.length === 0) {
    return next(new AppError('Session not found or already joined', 404));
  }

  const session = sessions[0];

  // Update the session
  const { data: updated, error: updateError } = await supabase
    .from('sessions')
    .update({
      student_name,
      student_email,
      status: 'active'
    })
    .eq('id', session.id)
    .select();

  if (updateError) {
    return next(new AppError('Failed to join session', 500));
  }

  const updatedSession = updated[0];

  // Emit socket event
  try {
    const io = req.app && (req.app.get ? req.app.get('io') : req.app.locals && req.app.locals.io);
    if (io && typeof io.emit === 'function') {
      io.to(session.link).emit('session-joined', updatedSession);
    }
  } catch (e) {
    console.warn('socket emit failed', e.message || e);
  }

  res.status(200).json({ status: 'success', data: updatedSession });
});
