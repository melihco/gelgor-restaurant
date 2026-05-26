/**
 * next build with output: 'standalone' does not copy `.next/static` into the standalone folder.
 * Serving `node .next/standalone/server.js` without that copy causes 404 on /_next/static/* (main-app.js, layout.css, etc.).
 * Docker already copies these; this script does the same for local runs.
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const standaloneRoot = join(root, '.next/standalone');
const serverJs = join(standaloneRoot, 'server.js');
const staticSrc = join(root, '.next/static');
const staticDest = join(standaloneRoot, '.next/static');
const publicSrc = join(root, 'public');
const publicDest = join(standaloneRoot, 'public');

if (!existsSync(serverJs)) {
  console.error('Missing .next/standalone/server.js — run `npm run build` first.');
  process.exit(1);
}
if (!existsSync(staticSrc)) {
  console.error('Missing .next/static — run `npm run build` first.');
  process.exit(1);
}

mkdirSync(join(standaloneRoot, '.next'), { recursive: true });
cpSync(staticSrc, staticDest, { recursive: true });
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
}

const child = spawn('node', ['server.js'], {
  cwd: standaloneRoot,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});
child.on('exit', (code) => process.exit(code ?? 0));
