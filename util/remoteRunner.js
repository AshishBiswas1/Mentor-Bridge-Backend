const fetch = global.fetch || require('node-fetch');

async function discoverPythonVersion(pistonUrl, preferredVersion) {
  try {
    if (!pistonUrl) return preferredVersion;
    const base = String(pistonUrl).replace(/\/execute.*$/i, '').replace(/\/$/, '');
    const runtimesUrl = base + '/runtimes';
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch(runtimesUrl, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(id);
    if (!resp || !resp.ok) return preferredVersion;
    const data = await resp.json().catch(() => null);
    if (!Array.isArray(data) || data.length === 0) return preferredVersion;
    const py = data.filter((r) => (String(r.language || '').toLowerCase() === 'python') || (String(r.runtime || '').toLowerCase().includes('python')));
    if (!py.length) return preferredVersion;
    // try exact
    const exact = py.find((r) => String(r.version) === String(preferredVersion) || (r.runtime && String(r.runtime).toLowerCase() === (`python-${preferredVersion}`).toLowerCase()));
    if (exact) return exact.version || preferredVersion;
    // try major.minor
    const parts = String(preferredVersion).split('.');
    if (parts.length >= 2) {
      const mm = `${parts[0]}.${parts[1]}`;
      const match = py.find((r) => String(r.version || '').startsWith(mm));
      if (match) return match.version || preferredVersion;
    }
    return py[0].version || preferredVersion;
  } catch (e) {
    return preferredVersion;
  }
}

function normalizePistonResponse(data) {
  let stdout = '';
  let stderr = '';
  let exitCode = undefined;
  let timedOut = false;

  if (!data) {
    stderr = 'Empty response from remote runner';
  } else if (typeof data === 'string') {
    stdout = data;
  } else if (data.output && typeof data.output === 'string') {
    stdout = data.output;
  } else if (data.run && typeof data.run === 'object') {
    stdout = data.run.stdout || data.run.output || '';
    stderr = data.run.stderr || '';
    exitCode = typeof data.run.code === 'number' ? data.run.code : data.run.exitCode || undefined;
  } else if (data.stdout || data.stderr) {
    stdout = String(data.stdout || '');
    stderr = String(data.stderr || '');
    exitCode = data.exitCode || data.code || undefined;
  } else {
    stdout = JSON.stringify(data);
  }

  return { stdout, stderr, exitCode, timedOut };
}

async function runRemote(code, opts = {}) {
  const PISTON_URL = opts.pistonUrl || process.env.PISTON_URL || 'https://emkc.org/api/v2/piston/execute';
  const PISTON_VERSION = opts.pistonVersion || process.env.PISTON_VERSION || '3.11.4';
  const TIMEOUT_MS = parseInt(opts.timeoutMs || process.env.CODE_RUN_TIMEOUT_MS || '5000', 10);

  // pick a compatible version from the runner if possible
  const chosen = await discoverPythonVersion(PISTON_URL, PISTON_VERSION);

  const body = {
    language: 'python',
    version: String(chosen),
    source: code,
    files: [{ name: 'main.py', content: code }],
    stdin: '',
  };

  // call execute with timeout
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const resp = await fetch(PISTON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch((err) => {
      if (err && err.name === 'AbortError') throw new Error('Execution timed out');
      throw err;
    });
    clearTimeout(id);

    if (!resp || !resp.ok) {
      const text = resp ? await resp.text().catch(() => '') : '';
      return { error: `Remote runner error: ${resp ? resp.status : 'no response'} ${text}` };
    }

    const data = await resp.json().catch(() => null);
    const normalized = normalizePistonResponse(data);
    return { ...normalized, raw: data };
  } catch (err) {
    return { error: err && err.message ? err.message : String(err) };
  }
}

module.exports = { runRemote };
