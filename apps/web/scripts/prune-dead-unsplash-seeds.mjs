/**
 * Remove Unsplash URLs that return non-200 from data/sector-gallery-seeds.json
 *
 *   node apps/web/scripts/prune-dead-unsplash-seeds.mjs
 *   node apps/web/scripts/prune-dead-unsplash-seeds.mjs --write
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDS_PATH = resolve(__dirname, '../../../data/sector-gallery-seeds.json');
const write = process.argv.includes('--write');

async function probe(url) {
  try {
    let r = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'image/*,*/*;q=0.8' },
    });
    if (!r.ok && [403, 405].includes(r.status)) {
      r = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-1023', Accept: 'image/*,*/*;q=0.8' },
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
      });
    }
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    const imageOk = !ct || ct.startsWith('image/') || ct.includes('octet-stream');
    return r.ok && imageOk;
  } catch {
    return false;
  }
}

const seeds = JSON.parse(readFileSync(SEEDS_PATH, 'utf8'));
const allUrls = new Set();
for (const [key, val] of Object.entries(seeds)) {
  if (!Array.isArray(val)) continue;
  for (const u of val) allUrls.add(u);
}

const list = [...allUrls];
const dead = new Set();
let ok = 0;

for (let i = 0; i < list.length; i += 10) {
  const chunk = list.slice(i, i + 10);
  const results = await Promise.all(chunk.map(async (u) => ({ u, ok: await probe(u) })));
  for (const { u, ok: good } of results) {
    if (good) ok++;
    else dead.add(u);
  }
}

console.log(`Probed ${list.length} unique URLs: ${ok} ok, ${dead.size} dead`);
for (const u of dead) console.log('  dead:', u);

if (!write) {
  console.log('\nDry run. Re-run with --write to update sector-gallery-seeds.json');
  process.exit(dead.size ? 1 : 0);
}

let removed = 0;
for (const [key, val] of Object.entries(seeds)) {
  if (!Array.isArray(val)) continue;
  const before = val.length;
  seeds[key] = val.filter((u) => !dead.has(u));
  removed += before - seeds[key].length;
}

writeFileSync(SEEDS_PATH, `${JSON.stringify(seeds, null, 2)}\n`);
console.log(`Removed ${removed} dead URL entries from ${SEEDS_PATH}`);
