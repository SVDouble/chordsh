/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';
import path from 'node:path';

/** Dev-only endpoint: POST /__recordings saves a session recording to ./recordings for analysis. */
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
            const dir = path.resolve('recordings');
            fs.mkdirSync(dir, { recursive: true });
            const file = `session-${String(rec.started ?? new Date().toISOString()).replace(/[:.]/g, '-')}.json`;
            fs.writeFileSync(path.join(dir, file), JSON.stringify(rec, null, 1));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ file: `recordings/${file}` }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), recordings()],
  test: {
    include: process.env.REPLAY ? ['scripts/replay.test.ts'] : process.env.EVAL ? [process.env.EVAL === '1' ? 'scripts/eval.test.ts' : process.env.EVAL] : ['tests/**/*.test.ts'],
    testTimeout: 600_000,
  },
});
