import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const clientRequire = createRequire(new URL('../apps/client/package.json', import.meta.url));
const tsc = require.resolve('typescript/bin/tsc');
const vite = resolve(dirname(clientRequire.resolve('vite/package.json')), 'bin/vite.js');

// Build workspace exports before either app imports them. No extra process-runner dependency.
const build = spawnSync(process.execPath, [tsc, '-p', 'packages/shared'], {
  cwd: root,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(code);
  }, 4000);
  timer.unref();
  Promise.all(
    children.map((child) =>
      child.exitCode !== null ? Promise.resolve() : new Promise((done) => child.once('exit', done)),
    ),
  ).then(() => process.exit(code));
}
function start(args, cwd) {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
start([tsc, '-p', 'packages/shared', '--watch', '--preserveWatchOutput'], root);
start(
  ['--env-file-if-exists=../../.env', '--import', 'tsx', '--watch', 'src/index.ts'],
  resolve(root, 'apps/server'),
);
// Forward port/host flags only to Vite (also used by managed preview runners).
start([vite, '--host', '0.0.0.0', ...process.argv.slice(2)], resolve(root, 'apps/client'));
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
