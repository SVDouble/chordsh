// Runs the rules study (scripts/rules.test.ts) in parallel: 48 shards of the corpus files, as many at once as
// there are cores, then one merge run that combines their counts and writes local/assist/*.json.
// The shard count is fixed, so the output does not depend on the machine. Pass-through: LIMIT=n (files per source).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const SHARDS = 48;
const parallel = Number(process.env.STUDY_JOBS) || Math.max(1, Math.min(SHARDS, os.availableParallelism() - 1));
const vitest = 'node_modules/.bin/vitest';

function run(env, inherit) {
  return new Promise((resolve, reject) => {
    const child = spawn(vitest, ['run', '--silent=false'], {
      env: { ...process.env, EVAL: 'scripts/rules.test.ts', ...env },
      stdio: inherit ? 'inherit' : ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    child.stderr?.on('data', (d) => (err += d));
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${JSON.stringify(env)} failed:\n${err}`))));
  });
}

const t0 = Date.now();
fs.rmSync('local/assist/shards', { recursive: true, force: true });
const queue = Array.from({ length: SHARDS }, (_, i) => i);
let done = 0;
await Promise.all(
  Array.from({ length: parallel }, async () => {
    while (queue.length) {
      const i = queue.shift();
      await run({ SHARD: `${i}/${SHARDS}` }, false);
      process.stderr.write(`\rshards ${++done}/${SHARDS} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }),
);
process.stderr.write('\n');
await run({ MERGE: String(SHARDS) }, true);
fs.rmSync('local/assist/shards', { recursive: true, force: true });
process.stderr.write(`study done in ${Math.round((Date.now() - t0) / 1000)} s\n`);
