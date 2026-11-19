/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';
import path from 'node:path';

/** Dev-only endpoint: POST /__recordings saves a session recording to ./local/recordings for analysis. */
function recordings(): Plugin {
  return {
    name: 'musify-recordings',
    configureServer(server) {
      server.middlewares.use('/__recordings', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 50e6) req.destroy(); });
        req.on('end', () => {
          try {
            const rec = JSON.parse(body);
            const dir = path.resolve('local', 'recordings');
            fs.mkdirSync(dir, { recursive: true });
            const file = `session-${String(rec.started ?? new Date().toISOString()).replace(/[:.]/g, '-')}.json`;
            fs.writeFileSync(path.join(dir, file), JSON.stringify(rec, null, 1));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ file: `local/recordings/${file}` }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

/** Dev-only library: list and serve pieces from ./local (your recordings and the benchmark corpora). */
function library(): Plugin {
  const root = path.resolve('local');
  return {
    name: 'musify-library',
    configureServer(server) {
      server.middlewares.use('/__library', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        res.setHeader('content-type', 'application/json');
        if (url.pathname === '/' || url.pathname === '') {
          const ls = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d) : []);
          const corpora = Object.fromEntries(ls(path.join(root, 'data')).filter((d) => !d.startsWith('.'))
            .map((d) => [d, ls(path.join(root, 'data', d)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))]));
          res.end(JSON.stringify({ recordings: ls(path.join(root, 'recordings')).filter((f) => f.endsWith('.json')).sort().reverse(), corpora }));
          return;
        }
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep) || !file.endsWith('.json') || !fs.existsSync(file)) { res.statusCode = 404; res.end('{}'); return; }
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), recordings(), library()],
  test: {
    include: process.env.REPLAY ? ['scripts/replay.test.ts'] : process.env.EVAL ? [process.env.EVAL] : ['tests/**/*.test.ts'],
    testTimeout: 600_000,
  },
});
