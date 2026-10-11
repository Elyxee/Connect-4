// Shared setup for the Playwright browser checks: a static HTTP server for the
// project root and a headless Chromium.
//   PLAYWRIGHT_PACKAGE          path of the playwright module (default: 'playwright')
//   PLAYWRIGHT_EXECUTABLE_PATH  an existing Chrome/Chromium binary
//   SCREENSHOTS                 folder for screenshots (default: <tmp>/c4-shots)
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json',
};

/* An http.Server (not yet listening) that serves the project files. */
function createServer() {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
    try {
      const data = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
}

function launch() {
  return chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
}

/* A per-test screenshot folder. */
function shotDir(name) {
  const dir = path.join(process.env.SCREENSHOTS || path.join(os.tmpdir(), 'c4-shots'), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { createServer, launch, shotDir, ROOT };
