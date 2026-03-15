/**
 * Python Research Engine Bridge
 *
 * Spawns and manages the FastAPI Python server that wraps the
 * AMM research engine. Provides a proxy helper for the Node backend.
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PYTHON_PORT = 8000;
const ENGINE_DIR = path.resolve(__dirname, '../../amm-research-engine');

let pythonProcess = null;
let isReady = false;

function startPythonServer() {
  if (pythonProcess) return;

  console.log('[PythonBridge] Starting research engine on port', PYTHON_PORT);

  pythonProcess = spawn('python3', ['-m', 'uvicorn', 'api.server:app', '--host', '0.0.0.0', '--port', String(PYTHON_PORT), '--log-level', 'warning'], {
    cwd: ENGINE_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });

  pythonProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log('[Research Engine]', msg);
    if (msg.includes('Uvicorn running') || msg.includes('Started server')) {
      isReady = true;
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log('[Research Engine]', msg);
    if (msg.includes('Uvicorn running') || msg.includes('Application startup complete')) {
      isReady = true;
    }
  });

  pythonProcess.on('close', (code) => {
    console.log(`[PythonBridge] Process exited with code ${code}`);
    pythonProcess = null;
    isReady = false;
  });

  // Health check loop — mark ready when the server responds
  const check = setInterval(() => {
    if (isReady) { clearInterval(check); return; }
    const req = http.get(`http://127.0.0.1:${PYTHON_PORT}/api/health`, (res) => {
      if (res.statusCode === 200) {
        isReady = true;
        console.log('[PythonBridge] Research engine is ready');
        clearInterval(check);
      }
    });
    req.on('error', () => {}); // not ready yet
    req.end();
  }, 1000);
}

function stopPythonServer() {
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
    isReady = false;
  }
}

/**
 * Express middleware that proxies /api/research/* to the Python FastAPI server.
 * Strips the /research prefix: /api/research/simulation/run -> /api/simulation/run
 */
function proxyToResearchEngine(req, res) {
  if (!isReady) {
    return res.status(503).json({ success: false, error: 'Research engine is starting up. Try again in a few seconds.' });
  }

  // Strip /api/research prefix → forward as /api/*
  const targetPath = '/api' + req.url;

  const options = {
    hostname: '127.0.0.1',
    port: PYTHON_PORT,
    path: targetPath,
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[PythonBridge] Proxy error:', err.message);
    res.status(502).json({ success: false, error: 'Research engine unavailable' });
  });

  if (req.body && Object.keys(req.body).length > 0) {
    proxyReq.write(JSON.stringify(req.body));
  }

  proxyReq.end();
}

module.exports = { startPythonServer, stopPythonServer, proxyToResearchEngine };
