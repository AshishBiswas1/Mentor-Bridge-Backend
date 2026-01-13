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
  const session_name = req.body.name;

  if (!mentor_id) {
    return next(new AppError('Authentication required: mentor not found in request', 401));
  }

  if (!session_name || typeof session_name !== 'string') {
    return next(new AppError('Session name is required', 400));
  }

  // Fetch mentor user to get display name
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('name')
    .eq('id', mentor_id)
    .limit(1);

  if (userError) {
    return next(new AppError('Database error looking up mentor', 500));
  }

  if (!userData || userData.length === 0) {
    return next(new AppError('Mentor not found', 404));
  }

  const userdata = userData;

  const id = crypto.randomUUID();

  // Try to insert a session with a unique link. If link collision happens, retry a few times.
  const maxAttempts = 5;
  let attempt = 0;
  let inserted = null;
  let lastError = null;

  while (attempt < maxAttempts && !inserted) {
    attempt += 1;
    const link = generateToken(6); // 12 hex chars

    const payload = {
      id,
      mentor_id,
      mentor_name: userdata[0].name,
      session_name,
      // student fields will be filled later by the student
      student_name: null,
      student_email: null,
      link,
      status: 'pending'
    };

    const { data: insertData, error: insertError } = await supabase
      .from('sessions')
      .insert(payload)
      .select();

    if (insertError) {
      lastError = insertError;
      // If unique violation on link, retry. Otherwise break and throw.
      const msg = (insertError.message || '').toLowerCase();
      const isUniqueViolation =
        msg.includes('duplicate') || msg.includes('unique') || String(insertError.code) === '23505';

      if (isUniqueViolation) {
        // collision - try again
        continue;
      }

      return next(new AppError(insertError.message || 'Database error when creating session', 500));
    }

    if (insertData && insertData.length > 0) {
      inserted = insertData[0];
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

  // Check participants count by link before attempting to join
  try {
    const { data: sessionRow, error: sessErr } = await supabase
      .from('sessions')
      .select('id, participants, status')
      .eq('link', link)
      .limit(1)
      .maybeSingle();

    if (sessErr) {
      return next(new AppError('Database error when checking participants', 500));
    }

    const currentParticipants = Number((sessionRow && sessionRow.participants) || 0);
    if (currentParticipants >= 2) {
      return next(new AppError('Session is full — cannot join', 400));
    }
  } catch (e) {
    // If this check fails for any reason, continue and let other checks handle it
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
  // If this student has not been recorded in the session_students table for this session,
  // insert a row. This is best-effort and should not block the join flow.
  try {
    const { data: existingRows, error: existErr } = await supabase
      .from('session_students')
      .select('id')
      .eq('session_id', session.id)
      .eq('student_email', student_email)
      .limit(1);

    if (existErr) {
      // log and continue
      // eslint-disable-next-line no-console
      console.warn('session_students lookup failed', existErr.message || existErr);
    } else {
      const already = existingRows && existingRows.length > 0;
      if (!already) {
        try {
          const { data: insData, error: insErr } = await supabase
            .from('session_students')
            .insert({ session_id: session.id, student_name, student_email })
            .select();
          if (insErr) {
            // eslint-disable-next-line no-console
            console.warn('session_students insert failed', insErr.message || insErr);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('session_students insert error', e && e.message ? e.message : e);
        }
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('session_students check/insert failed', e && e.message ? e.message : e);
  }

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

exports.leaveSession = catchAsync(async (req, res, next) => {
  const { link } = req.body;

  if (!link) {
    return next(new AppError('Link is required', 400));
  }

  // If an Authorization header with a Bearer token is provided, try to populate req.user
  // This lets mentors call the public leave endpoint while still being recognized.
  if (!req.user) {
    try {
      let token;
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
      }
      if (token) {
        const {
          data: { user },
          error: userErr
        } = await supabase.auth.getUser(token);
        if (user && !userErr) {
          req.user = user;
        }
      }
    } catch (e) {
      // Non-fatal — we'll proceed without an authenticated user
    }
  }

  // Find the session by link
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

  // Determine role: mentor if authenticated and matches mentor_id, otherwise treat as student
  const isMentor = req.user && req.user.id && req.user.id === session.mentor_id;
  const role = isMentor ? 'mentor' : 'student';

  // If a student is leaving an active session, clear the student info and set status back to 'pending'
  let updatedSession = session;
  if (!isMentor && session.status === 'active') {
    const { data: updated, error: updateError } = await supabase
      .from('sessions')
      .update({ student_name: null, student_email: null, status: 'pending' })
      .eq('id', session.id)
      .select();

    if (updateError) {
      // log and continue — don't fail the leave request just because DB update failed
      // eslint-disable-next-line no-console
      console.warn(
        'leaveSession: failed to update session on student leave',
        updateError.message || updateError
      );
    } else if (updated && updated.length > 0) {
      updatedSession = updated[0];
    }
  }

  // Best-effort socket handling: emit an event and try to disconnect matching sockets in the room
  try {
    const io = req.app && (req.app.get ? req.app.get('io') : req.app.locals && req.app.locals.io);

    if (io && typeof io.in === 'function') {
      // Notify all participants that someone left
      io.to(link).emit('participant-left', { role, link });

      // Only emit session-update if the session data actually changed (e.g., student left and fields were cleared)
      // Don't emit it for mentor leaving since we don't update the DB for that case
      if (!isMentor && updatedSession !== session) {
        try {
          io.to(link).emit('session-update', updatedSession);
        } catch (e) {
          // ignore
        }
      }

      // Attempt to fetch sockets in the room and disconnect matching sockets
      if (typeof io.in(link).fetchSockets === 'function') {
        const sockets = await io.in(link).fetchSockets();

        for (const socket of sockets) {
          try {
            const hs = (socket.handshake && socket.handshake.auth) || {};
            const sdata = socket.data || {};

            const matchesMentor =
              isMentor &&
              ((hs.role && hs.role === 'mentor') ||
                (hs.userId && hs.userId === session.mentor_id) ||
                (sdata.userId && sdata.userId === session.mentor_id));

            const matchesStudent =
              !isMentor &&
              ((hs.role && hs.role === 'student') ||
                (hs.email && session.student_email && hs.email === session.student_email) ||
                (sdata.email && session.student_email && sdata.email === session.student_email) ||
                (sdata.student_name &&
                  session.student_name &&
                  sdata.student_name === session.student_name));

            if ((isMentor && matchesMentor) || (!isMentor && matchesStudent)) {
              // force disconnect this socket
              try {
                socket.disconnect(true);
              } catch (e) {
                // ignore per-socket disconnect errors
              }
            }
          } catch (e) {
            // ignore per-socket inspection errors
          }
        }
      }
    }
  } catch (e) {
    // Non-fatal: log and continue
    // eslint-disable-next-line no-console
    console.warn('leaveSession socket handling failed', e && e.message ? e.message : e);
  }

  res.status(200).json({ status: 'success', data: { message: `${role} disconnected` } });
});

exports.endSession = catchAsync(async (req, res, next) => {
  // Only mentors (authenticated) may end a session
  const mentor_id = req.user && req.user.id;
  if (!mentor_id) {
    return next(new AppError('Authentication required: mentor not found in request', 401));
  }

  const { link } = req.body;
  if (!link) {
    return next(new AppError('Link is required', 400));
  }

  // Find the session by link
  const { data: sessions, error: findError } = await supabase
    .from('sessions')
    .select('*')
    .eq('link', link)
    .limit(1);

  if (findError) {
    return next(new AppError('Database error', 500));
  }

  if (!sessions || sessions.length === 0) {
    return next(new AppError('Session not found', 404));
  }

  const session = sessions[0];

  // Verify mentor owns this session
  if (!session.mentor_id || session.mentor_id !== mentor_id) {
    return next(new AppError('Forbidden: you are not the owner of this session', 403));
  }

  // Update session: set status to 'ended' and ended_at timestamp
  const endedAt = new Date().toISOString();
  // When ending a session, reset participant count to 0 as well
  const { data: updatedRows, error: updateError } = await supabase
    .from('sessions')
    .update({ status: 'ended', ended_at: endedAt, participants: 0 })
    .eq('id', session.id)
    .select();

  if (updateError) {
    return next(new AppError('Failed to end session', 500));
  }

  const updatedSession = updatedRows && updatedRows[0] ? updatedRows[0] : null;

  // Socket handling: notify room and disconnect all sockets in the room
  try {
    const io = req.app && (req.app.get ? req.app.get('io') : req.app.locals && req.app.locals.io);
    if (io && typeof io.to === 'function') {
      io.to(session.link).emit(
        'session-ended',
        updatedSession || { id: session.id, link: session.link }
      );

      if (typeof io.in(session.link).fetchSockets === 'function') {
        const sockets = await io.in(session.link).fetchSockets();
        for (const socket of sockets) {
          try {
            socket.disconnect(true);
          } catch (e) {
            // ignore individual socket disconnect errors
          }
        }
      }
    }
  } catch (e) {
    // Non-fatal: log and continue
    // eslint-disable-next-line no-console
    console.warn('endSession socket handling failed', e && e.message ? e.message : e);
  }

  res.status(200).json({ status: 'success', data: updatedSession });
});

exports.getMentorSessions = catchAsync(async (req, res, next) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, link, status, started_at, ended_at, session_name')
    .eq('mentor_id', req.user.id);

  if (error) {
    return next(new AppError(error.message || 'No session found', 400));
  }

  res.status(200).json({
    status: 'success',
    data
  });
});

exports.mentorJoinSession = catchAsync(async (req, res, next) => {
  // Mentor must be authenticated
  const mentor_id = req.user && req.user.id;
  if (!mentor_id) {
    return next(new AppError('Authentication required: mentor not found in request', 401));
  }

  const { link } = req.body;
  if (!link) {
    return next(new AppError('Link is required', 400));
  }

  // Find the session by link
  const { data: sessions, error: findError } = await supabase
    .from('sessions')
    .select('*')
    .eq('link', link)
    .limit(1);

  if (findError) {
    return next(new AppError('Database error', 500));
  }

  if (!sessions || sessions.length === 0) {
    return next(new AppError('Session not found', 404));
  }

  const session = sessions[0];

  // Verify mentor owns this session
  if (!session.mentor_id || session.mentor_id !== mentor_id) {
    return next(new AppError('Forbidden: you are not the owner of this session', 403));
  }

  // Prevent rejoining an ended session
  if (session.status === 'ended') {
    return next(new AppError('Cannot join: session has already ended', 400));
  }
  // If the DB doesn't include a student but there is a connected student socket,
  // restore the student info and set session status to 'active' so mentor sees them.
  try {
    const io = req.app && (req.app.get ? req.app.get('io') : req.app.locals && req.app.locals.io);
    if (io && typeof io.in === 'function') {
      if (
        (!session.student_name || !session.student_email || session.status !== 'active') &&
        typeof io.in(session.link).fetchSockets === 'function'
      ) {
        const sockets = await io.in(session.link).fetchSockets();
        // try to find a student socket with identifying info
        let foundStudent = null;
        for (const s of sockets) {
          try {
            const hs = (s.handshake && s.handshake.auth) || {};
            const sdata = s.data || {};
            const looksLikeStudent =
              (hs.role && hs.role === 'student') ||
              (hs.email && hs.email) ||
              (sdata.student_name && sdata.student_name);
            if (looksLikeStudent) {
              foundStudent = {
                student_name: sdata.student_name || hs.name || hs.student_name || null,
                student_email: sdata.email || hs.email || null
              };
              break;
            }
          } catch (e) {
            // ignore per-socket inspection errors
          }
        }

        if (foundStudent) {
          try {
            const { data: updatedRows, error: updErr } = await supabase
              .from('sessions')
              .update({
                student_name: foundStudent.student_name,
                student_email: foundStudent.student_email,
                status: 'active'
              })
              .eq('id', session.id)
              .select();

            if (!updErr && updatedRows && updatedRows[0]) {
              // update local session reference
              const updatedSession = updatedRows[0];
              session.student_name = updatedSession.student_name;
              session.student_email = updatedSession.student_email;
              session.status = updatedSession.status;
            }
          } catch (e) {
            // ignore DB update errors here — it's best-effort
          }
        }
      }

      // Notify room that mentor has (re)joined and send current session state
      try {
        io.to(session.link).emit('mentor-joined', { mentor_id, link: session.link });
        io.to(session.link).emit('session-update', session);
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // Non-fatal
    // eslint-disable-next-line no-console
    console.warn('mentorJoinSession socket handling failed', e && e.message ? e.message : e);
  }

  res.status(200).json({ status: 'success', data: session });
});

exports.incrementParticipant = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return next(new AppError('sessionId is required', 400));
  }

  const { error } = await supabase.rpc('increment_participant', {
    row_id: sessionId
  });

  if (error) {
    return next(new AppError(error.message, 400));
  }
  res.status(200).json({
    message: 'Participant count incremented successfully'
  });
});

exports.decrementParticipant = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return next(new AppError('sessionId is required', 400));
  }

  const { error } = await supabase.rpc('decrement_participant', {
    row_id: sessionId
  });

  if (error) {
    return next(new AppError(error.message, 400));
  }

  res.status(200).json({
    message: 'Participant count decremented successfully'
  });
});

exports.numberOfParticipants = catchAsync(async (req, res, next) => {
  // Accept either a route param sessionId or a query param `link` to locate the session
  const { sessionId } = req.params || {};
  const { link } = req.query || {};

  if (!sessionId && !link) {
    return next(new AppError('sessionId or link is required', 400));
  }

  let q = supabase.from('sessions').select('id, participants').limit(1);
  if (sessionId) q = q.eq('id', sessionId);
  else q = q.eq('link', link);

  const { data, error } = await q.maybeSingle();

  if (error) {
    return next(new AppError(error.message, 400));
  }

  // Return participants number (may be null/undefined if column missing)
  return res.status(200).json({ status: 'success', data });
});

exports.newSessionLink = catchAsync(async (req, res, next) => {
  // Only mentors (authenticated) may rotate the session link
  const mentor_id = req.user && req.user.id;
  if (!mentor_id) {
    return next(new AppError('Authentication required: mentor not found in request', 401));
  }

  const { link } = req.body;
  if (!link) {
    return next(new AppError('Link is required', 400));
  }

  // Find the session by existing link
  const { data: sessions, error: findError } = await supabase
    .from('sessions')
    .select('*')
    .eq('link', link)
    .limit(1);

  if (findError) {
    return next(new AppError('Database error', 500));
  }

  if (!sessions || sessions.length === 0) {
    return next(new AppError('Session not found', 404));
  }

  const session = sessions[0];

  // Verify mentor owns this session
  if (!session.mentor_id || session.mentor_id !== mentor_id) {
    return next(new AppError('Forbidden: you are not the owner of this session', 403));
  }

  // Save identifying info about the previous student so we can disconnect them
  const prevStudentEmail = session.student_email;
  const prevStudentName = session.student_name;

  // Generate a new unique link and update the session record
  const maxAttempts = 5;
  let attempt = 0;
  let updatedSession = null;
  let lastError = null;

  while (attempt < maxAttempts && !updatedSession) {
    attempt += 1;
    const newLink = generateToken(6);

    try {
      const { data: updatedRows, error: updateError } = await supabase
        .from('sessions')
        .update({
          link: newLink,
          student_name: null,
          student_email: null,
          status: 'pending',
          participants: 1
        })
        .eq('id', session.id)
        .select();

      if (updateError) {
        lastError = updateError;
        const msg = (updateError.message || '').toLowerCase();
        const isUniqueViolation =
          msg.includes('duplicate') ||
          msg.includes('unique') ||
          String(updateError.code) === '23505';

        if (isUniqueViolation) {
          // collision - try again
          continue;
        }

        return next(
          new AppError(updateError.message || 'Database error when creating new session link', 500)
        );
      }

      if (updatedRows && updatedRows.length > 0) {
        updatedSession = updatedRows[0];
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!updatedSession) {
    const message = lastError ? lastError.message : 'Failed to create unique session link';
    return next(new AppError(message, 500));
  }

  // Socket handling: notify and disconnect previous student sockets connected to the old link
  try {
    const io = req.app && (req.app.get ? req.app.get('io') : req.app.locals && req.app.locals.io);
    if (io && typeof io.in === 'function') {
      // Emit to old room that student was rotated (so any UI can react)
      try {
        io.to(link).emit('student-disconnected', { link: updatedSession.link });
      } catch (e) {
        // ignore
      }

      if (typeof io.in(link).fetchSockets === 'function') {
        const sockets = await io.in(link).fetchSockets();
        for (const socket of sockets) {
          try {
            const hs = (socket.handshake && socket.handshake.auth) || {};
            const sdata = socket.data || {};

            const matchesStudent =
              (hs.role && hs.role === 'student') ||
              (hs.email && prevStudentEmail && hs.email === prevStudentEmail) ||
              (sdata.email && prevStudentEmail && sdata.email === prevStudentEmail) ||
              (sdata.student_name && prevStudentName && sdata.student_name === prevStudentName);

            if (matchesStudent) {
              try {
                socket.disconnect(true);
              } catch (e) {
                // ignore per-socket disconnect errors
              }
            }
          } catch (e) {
            // ignore per-socket inspection errors
          }
        }
      }

      // Emit the updated session on the new link so clients listening to it will receive state
      try {
        io.to(updatedSession.link).emit('session-update', updatedSession);
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // Non-fatal: log and continue
    // eslint-disable-next-line no-console
    console.warn('newSessionLink socket handling failed', e && e.message ? e.message : e);
  }

  res.status(200).json({ status: 'success', data: updatedSession });
});
