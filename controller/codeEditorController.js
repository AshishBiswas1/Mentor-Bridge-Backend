const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');

/**
 * Initialize or sync a collaborative editor for a session link.
 * This endpoint does not persist anything to the database — it simply
 * emits an initial code payload (if provided) to the session room so
 * connected clients can synchronize editors.
 *
 * Expected body: { link: string, code?: string }
 */
exports.createCollaborativeEditor = catchAsync(async (req, res, next) => {
  const { link, code } = req.body || {};

  if (!link || typeof link !== 'string') {
    return next(new AppError('Link is required', 400));
  }

  try {
    const io = req.app && (req.app.get ? req.app.get('io') : req.app.locals && req.app.locals.io);
    if (io && typeof io.to === 'function') {
      // Emit an initial editor sync (use the same event name clients listen for)
      io.to(link).emit('code-change', { link, code: code || '' });
    }
  } catch (e) {
    // Non-fatal — log and continue
    // eslint-disable-next-line no-console
    console.warn('createCollaborativeEditor emit failed', e && e.message ? e.message : e);
  }

  res.status(200).json({ status: 'success', data: { link, code: code || '' } });
});

// Execute Python code using an external execution service (no Docker, no local Python spawn)
// This calls a remote runner (configurable via PISTON_URL env) and returns the result.
exports.runCode = catchAsync(async (req, res, next) => {
  const { link, code } = req.body || {};

  if (!code || typeof code !== 'string') {
    return next(new AppError('Code is required', 400));
  }

  // Limit code size
  if (code.length > 20000) {
    return next(new AppError('Code too large', 400));
  }

  const TIMEOUT_MS = parseInt(process.env.CODE_RUN_TIMEOUT_MS || '5000', 10);
  const PISTON_URL = process.env.PISTON_URL || 'https://emkc.org/api/v2/piston/execute';

    const io = req.app && (req.app.get ? req.app.get('io') : req.app.locals && req.app.locals.io);
    const actor = (req.user && (req.user.name || req.user.email || req.user.id)) || 'anonymous';

    // Emit run-start to room
    if (io && link) {
      try {
        io.to(link).emit('run-start', { link, actor });
      } catch (e) {}
    }

    // Use the remoteRunner helper
    const remoteRunner = require('../util/remoteRunner');
    const pistonUrl = process.env.PISTON_URL;
    const pistonVersion = process.env.PISTON_VERSION;
    const timeoutMs = parseInt(process.env.CODE_RUN_TIMEOUT_MS || '5000', 10);

    try {
      const result = await remoteRunner.runRemote(code, { pistonUrl, pistonVersion, timeoutMs });

      if (result.error) {
        const payloadErr = { link, actor, stdout: '', stderr: result.error, exitCode: 1 };
        if (io && link) {
          try { io.to(link).emit('run-result', payloadErr); } catch (e) {}
        }
        return res.status(200).json({ status: 'success', data: payloadErr });
      }

      const payload = {
        link,
        actor,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode,
        usedDocker: false,
      };

      if (io && link) {
        try { io.to(link).emit('run-result', payload); } catch (e) {}
      }
      return res.status(200).json({ status: 'success', data: payload });
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      const payloadErr = { link, actor, stdout: '', stderr: message, exitCode: 1 };
      if (io && link) {
        try { io.to(link).emit('run-result', payloadErr); } catch (e) {}
      }
      return res.status(200).json({ status: 'success', data: payloadErr });
    }
});
