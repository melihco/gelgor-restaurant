#!/usr/bin/env node
/**
 * Render poster showcase PNGs via SVG pipeline (render-one API).
 *
 * Usage:
 *   node scripts/render-poster-showcase.mjs              # all 50 posters (story format)
 *   node scripts/render-poster-showcase.mjs --missing    # only files not on disk
 *   node scripts/render-poster-showcase.mjs --limit 5
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'apps/web/public/remotion-showcase');
const BASE_URL = process.env.REMOTION_SHOWCASE_BASE || 'http://localhost:3000';
const TIMEOUT_MS = 120_000;

const args = process.argv.slice(2);
const missingOnly = args.includes('--missing');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;

async function loadPosterIds() {
  const res = await fetch(`${BASE_URL}/api/remotion/catalog?kind=poster`);
  if (!res.ok) throw new Error('Start dev server: cd apps/web && npm run dev');
  const data = await res.json();
  return (data.posterTemplates ?? data.templates ?? []).map((t) => t.id).filter(Boolean);
}

async function renderPoster(templateId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/remotion/showcase/render-one`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ templateId, kind: 'poster', format: 'story' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ids = await loadPosterIds();
  if (missingOnly) {
    ids = ids.filter((id) => !fs.existsSync(path.join(OUT_DIR, `${id}_story.png`)));
  }
  if (limit) ids = ids.slice(0, limit);

  console.log(`Rendering ${ids.length} posters → ${OUT_DIR}`);
  console.log(`API: ${BASE_URL}\n`);

  let ok = 0;
  for (const id of ids) {
    process.stdout.write(`→ ${id} … `);
    const started = Date.now();
    try {
      const data = await renderPoster(id);
      console.log(`OK (${((Date.now() - started) / 1000).toFixed(1)}s) → ${data.url}`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL — ${msg.slice(0, 100)}`);
    }
  }

  console.log(`\nDone. ${ok}/${ids.length} posters rendered. Open ${BASE_URL}/remotion-showcase`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
