/**
 * Production worker container entrypoint.
 *
 * Runs TWO processes in one container:
 *   1. A private Next.js standalone server bound to 127.0.0.1 — this is the
 *      production pipeline executor (auto-produce, sharp, satori, fal calls).
 *   2. The BullMQ consumer (production-worker.cjs) pointed at that local server.
 *
 * The user-facing web service never executes productions when workers handle
 * the queue — scale out by adding worker instances (they coordinate through
 * Redis: BullMQ queue, global inflight cap, per-workspace production locks).
 *
 * Requires PRODUCTION_EXECUTOR=bullmq on the Python crew service; with the
 * default `http` executor this container sits idle (safe to deploy first).
 */
import { spawn } from 'node:child_process';

const PORT = process.env.PORT || '3000';
const BOOT_DELAY_MS = Number(process.env.WORKER_BOOT_DELAY_MS ?? 10_000);

const children = [];
let shuttingDown = false;

function launch(name, args, extraEnv = {}) {
  const child = spawn('node', args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(
      `[start-worker] ${name} exited (code=${code} signal=${signal}) — stopping container so the platform restarts it`,
    );
    shutdown(1);
  });
  children.push(child);
  console.log(`[start-worker] launched ${name} (pid=${child.pid})`);
  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  // Force-exit if a child ignores SIGTERM.
  setTimeout(() => process.exit(code), 10_000).unref();
  Promise.allSettled(
    children.map((child) => new Promise((res) => child.once('exit', res))),
  ).then(() => process.exit(code));
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

// Private executor server — localhost only, never exposed. Self-referential
// internal fetches must target this local instance, not the public web service.
launch('next-server', ['server.js'], {
  PORT,
  HOSTNAME: '127.0.0.1',
  NEXTJS_INTERNAL_URL: `http://127.0.0.1:${PORT}`,
});

// Give Next a moment to boot before the consumer starts pulling jobs.
setTimeout(() => {
  launch('bullmq-worker', ['production-worker.cjs'], {
    WEB_BASE_URL: `http://127.0.0.1:${PORT}`,
    NEXTJS_INTERNAL_URL: `http://127.0.0.1:${PORT}`,
  });
}, BOOT_DELAY_MS);
