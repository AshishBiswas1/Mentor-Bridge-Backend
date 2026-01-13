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

// Execute Python code in a sandboxed Docker container using dockerode.
// Falls back to local `python` spawn if Docker isn't available or fails.
exports.runCode = catchAsync(async (req, res, next) => {
  const { link, code } = req.body || {};

  if (!code || typeof code !== 'string') {
    return next(new AppError('Code is required', 400));
  }

  // Limit code size
  if (code.length > 20000) {
    return next(new AppError('Code too large', 400));
  }

  const TIMEOUT_MS = 5000;
  let usedDocker = false;

  const io = req.app && (req.app.get ? req.app.get('io') : req.app.locals && req.app.locals.io);
  const actor = (req.user && (req.user.name || req.user.email || req.user.id)) || 'anonymous';

  // Try dockerode first
  try {
    const Docker = require('dockerode');
    const stream = require('stream');
    const docker = new Docker();

    const MEMORY_BYTES = 128 * 1024 * 1024; // 128 MB
    const NANO_CPUS = 500000000; // 0.5 CPU
    const image = 'python:3.11-slim';

    // Ensure image present
    const imgs = await docker.listImages({ filters: { reference: [image] } });
    if (!imgs || !imgs.length) {
      await new Promise((resolve, reject) => {
        docker.pull(image, (err, streamPull) => {
          if (err) return reject(err);
          docker.modem.followProgress(streamPull, (err2) => (err2 ? reject(err2) : resolve()));
        });
      });
    }

    const container = await docker.createContainer({
      Image: image,
      Cmd: ['python', '-u', '-'],
      OpenStdin: true,
      StdinOnce: true,
      Tty: false,
      HostConfig: {
        NetworkMode: 'none',
        Memory: MEMORY_BYTES,
        NanoCPUs: NANO_CPUS,
        AutoRemove: true
      }
    });

    usedDocker = true;

    const attachStream = await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true
    });
    const stdoutCollector = new stream.PassThrough();
    const stderrCollector = new stream.PassThrough();
    docker.modem.demuxStream(attachStream, stdoutCollector, stderrCollector);

    let stdout = '';
    let stderr = '';
    stdoutCollector.on('data', (c) => {
      stdout += c.toString();
    });
    stderrCollector.on('data', (c) => {
      stderr += c.toString();
    });

    // Emit run-start to room
    if (io && link) {
      try {
        io.to(link).emit('run-start', { link, actor });
      } catch (e) {}
    }

    await container.start();
    attachStream.write(code);
    attachStream.end();

    const waitPromise = container.wait();
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(async () => {
        try {
          await container.kill().catch(() => {});
        } catch (e) {}
        resolve({ timedOut: true });
      }, TIMEOUT_MS)
    );

    const result = await Promise.race([waitPromise.then((d) => ({ data: d })), timeoutPromise]);

    if (result && result.timedOut) {
      const payload = {
        link,
        actor,
        stdout,
        stderr: stderr + '\n[TIMED OUT]',
        timedOut: true,
        usedDocker
      };
      if (io && link) {
        try {
          io.to(link).emit('run-result', payload);
        } catch (e) {}
      }
      return res.status(200).json({ status: 'success', data: payload });
    }

    const exitCode = result && result.data && result.data.StatusCode;
    const payload = {
      link,
      actor,
      stdout,
      stderr,
      exitCode: typeof exitCode === 'number' ? exitCode : undefined,
      usedDocker
    };
    if (io && link) {
      try {
        io.to(link).emit('run-result', payload);
      } catch (e) {}
    }
    return res.status(200).json({ status: 'success', data: payload });
  } catch (dockerErr) {
    // Fallback to local python
    // eslint-disable-next-line no-console
    console.warn(
      'dockerode failed, falling back to local python:',
      dockerErr && dockerErr.message ? dockerErr.message : dockerErr
    );
    usedDocker = false;
  }

  // Local fallback (unsafe in production)
  try {
    const { spawn } = require('child_process');
    const proc = spawn('python', ['-u', '-c', code]);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill('SIGKILL');
      } catch (e) {}
    }, TIMEOUT_MS);

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    if (io && link) {
      try {
        io.to(link).emit('run-start', { link, actor });
      } catch (e) {}
    }

    proc.on('error', (err) => {
      clearTimeout(timer);
      return next(new AppError('Failed to start local python: ' + (err.message || err), 500));
    });

    proc.on('close', (codeExit) => {
      clearTimeout(timer);
      if (timedOut) {
        const payload = {
          link,
          actor,
          stdout,
          stderr: stderr + '\n[TIMED OUT]',
          timedOut: true,
          usedDocker
        };
        if (io && link) {
          try {
            io.to(link).emit('run-result', payload);
          } catch (e) {}
        }
        return res.status(200).json({ status: 'success', data: payload });
      }
      const payload = { link, actor, stdout, stderr, exitCode: codeExit, usedDocker };
      if (io && link) {
        try {
          io.to(link).emit('run-result', payload);
        } catch (e) {}
      }
      return res.status(200).json({ status: 'success', data: payload });
    });
  } catch (e) {
    return next(new AppError('Execution failed: ' + (e.message || e), 500));
  }
});