import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, 'dist');

function contentType(p) {
  const ext = path.extname(p).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.txt': 'text/plain; charset=utf-8',
    }[ext] || 'application/octet-stream'
  );
}

function safeJoin(root, urlPath) {
  const clean = urlPath.split('?')[0].split('#')[0];
  const decoded = decodeURIComponent(clean);
  const joined = path.join(root, decoded);
  const normalized = path.normalize(joined);
  if (!normalized.startsWith(root)) return null;
  return normalized;
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const node = process.execPath;
    const buildScript = path.resolve(ROOT, 'scripts', 'build.mjs');
    const p = spawn(node, [buildScript], { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed: ${code}`))));
  });
}

await runBuild();

const server = createServer(async (req, res) => {
  try {
    const urlPath = req.url || '/';
    let fsPath = safeJoin(DIST_DIR, urlPath);
    if (!fsPath) {
      res.writeHead(400);
      res.end('bad request');
      return;
    }

    let st;
    try {
      st = await stat(fsPath);
    } catch {
      // try directory index fallback
      fsPath = safeJoin(DIST_DIR, path.join(urlPath, 'index.html'));
      if (!fsPath) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      st = await stat(fsPath);
    }

    if (st.isDirectory()) {
      fsPath = path.join(fsPath, 'index.html');
    }

    const buf = await readFile(fsPath);
    res.writeHead(200, { 'content-type': contentType(fsPath) });
    res.end(buf);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e?.message || e));
  }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => {
  console.log(`dev server: http://127.0.0.1:${port}`);
});

