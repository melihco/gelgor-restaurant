#!/usr/bin/env node
/**
 * Render brand template libraries — 50 brands × 5 slots (story + post previews).
 *
 * Usage:
 *   node scripts/render-brand-libraries.mjs
 *   node scripts/render-brand-libraries.mjs --kit kit_01_beach_club
 *   node scripts/render-brand-libraries.mjs --all   # all 50 brands × 5 slots
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'apps/web/public/remotion-showcase');
const BASE_URL = process.env.REMOTION_SHOWCASE_BASE || 'http://localhost:3000';
const TIMEOUT_MS = 300_000;

const args = process.argv.slice(2);
const kitIdx = args.indexOf('--kit');
const singleKit = kitIdx >= 0 ? args[kitIdx + 1] : undefined;
const renderAll = args.includes('--all');

async function loadKits() {
  const res = await fetch(`${BASE_URL}/api/remotion/catalog?brand=1`);
  if (!res.ok) throw new Error('Start dev server first');
  const data = await res.json();
  return data.brandKits ?? [];
}

async function loadLibrary(kitId) {
  const res = await fetch(`${BASE_URL}/api/remotion/catalog?brand=1&kitId=${encodeURIComponent(kitId)}`);
  if (!res.ok) throw new Error(`Catalog failed for ${kitId}`);
  const data = await res.json();
  return data.brandLibraryTemplates ?? data.templates ?? [];
}

async function renderSlot(kitId, template) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const isPoster = template.kind === 'poster';
    const res = await fetch(`${BASE_URL}/api/remotion/showcase/render-one`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        kitId,
        templateId: template.id,
        slotKey: template.slotKey,
        kind: isPoster ? 'poster' : 'story',
        format: isPoster ? 'post' : undefined,
      }),
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
  const kits = await loadKits();
  const targetKits = singleKit ? kits.filter((k) => k.id === singleKit) : renderAll ? kits : kits.slice(0, 5);

  console.log(`Rendering ${targetKits.length} brand libraries (5 slots each)\n`);

  let ok = 0;
  for (const kit of targetKits) {
    console.log(`\n▸ ${kit.name} (${kit.id})`);
    const templates = await loadLibrary(kit.id);
    for (const tpl of templates) {
      process.stdout.write(`  ${tpl.slotKey ?? tpl.id} … `);
      try {
        const data = await renderSlot(kit.id, tpl);
        console.log(`OK → ${data.url?.split('?')[0]}`);
        ok++;
      } catch (err) {
        console.log(`FAIL — ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`);
      }
    }
  }

  console.log(`\nDone. ${ok} renders. Open ${BASE_URL}/remotion-showcase?kit=${targetKits[0]?.id ?? ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
