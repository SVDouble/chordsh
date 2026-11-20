/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';
import path from 'node:path';

/** Dev-only endpoint: POST /__recordings saves a session recording to ./local/recordings for analysis. */
function recordings(): Plugin {
  return {
    name: 'chordsh-recordings',
    configureServer(server) {
      server.middlewares.use('/__recordings', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c) => {
          body += c;
          if (body.length > 50e6) req.destroy();
        });
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

const ls = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d) : []);

/** A piece's title from the first bytes of its JSON (cached per file and modification time). */
const titleCache = new Map<string, { mtime: number; title: string }>();
function titleOf(file: string): string {
  try {
    const mtime = fs.statSync(file).mtimeMs;
    const hit = titleCache.get(file);
    if (hit?.mtime === mtime) return hit.title;
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(600);
    fs.readSync(fd, head, 0, 600, 0);
    fs.closeSync(fd);
    const title = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(head.toString('utf8'))?.[1] ?? '';
    titleCache.set(file, { mtime, title: title ? JSON.parse(`"${title}"`) : '' });
    return titleCache.get(file)!.title;
  } catch {
    return '';
  }
}

/** Dev-only library: list and serve pieces from ./local (your recordings and the benchmark corpora). */
function library(): Plugin {
  const root = path.resolve('local');
  return {
    name: 'chordsh-library',
    configureServer(server) {
      server.middlewares.use('/__library', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        res.setHeader('content-type', 'application/json');
        if (url.pathname === '/' || url.pathname === '') {
          const corpora = Object.fromEntries(
            ls(path.join(root, 'data'))
              .filter((d) => !d.startsWith('.'))
              .map((d) => [
                d,
                ls(path.join(root, 'data', d))
                  .filter((f) => f.endsWith('.json'))
                  .map((f) => f.slice(0, -5)),
              ]),
          );
          const titles = Object.fromEntries(
            Object.entries(corpora).map(([d, ids]) => [
              d,
              Object.fromEntries(ids.map((id) => [id, titleOf(path.join(root, 'data', d, `${id}.json`))])),
            ]),
          );
          res.end(
            JSON.stringify({
              recordings: ls(path.join(root, 'recordings'))
                .filter((f) => f.endsWith('.json'))
                .sort()
                .reverse(),
              corpora,
              titles,
            }),
          );
          return;
        }
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep) || !file.endsWith('.json') || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.end('{}');
          return;
        }
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), recordings(), library()],
  server: {
    // Datasets, recordings and QA artifacts are read by the endpoints above, not bundled.
    // Watching this growing directory can exhaust the OS's file-watcher quota.
    watch: {
      ignored: ['**/local/**'],
      // Linux inotify quotas are shared with other apps; poll the small source tree instead.
      // CHOKIDAR_USEPOLLING=false opts back into native watching.
      usePolling: process.platform === 'linux',
      interval: 250,
    },
  },
  test: {
    include: process.env.REPLAY
      ? ['scripts/replay.test.ts']
      : process.env.EVAL
        ? [process.env.EVAL]
        : ['tests/**/*.test.ts'],
    testTimeout: 600_000,
  },
});
