#!/usr/bin/env node
/**
 * Yula — fal.ai marka şablon seti smoke test (2 aşamalı).
 *
 * 1. Health check
 * 2. POST generate-design-templates limit=1 (archiveExisting=false) — smoke
 * 3. Başarılıysa tam set (archiveExisting=true)
 *
 * Usage:
 *   YULA_TENANT_ID=f00e3308-ebbe-4d75-8592-12d52e7ff1aa node scripts/yula-design-templates-smoke.mjs
 *
 * Requires: Web :3000, Crew :8000, FAL_API_KEY (+ OPENAI for vision fallback).
 */
const WEB = process.env.WEB_URL || 'http://127.0.0.1:3000';
const TENANT =
  process.env.YULA_TENANT_ID || 'f00e3308-ebbe-4d75-8592-12d52e7ff1aa';
const DEMO_HEADERS = {
  'Content-Type': 'application/json',
  'X-Tenant-Id': TENANT,
  'X-Office-Id': process.env.YULA_OFFICE_ID || TENANT,
};
const SKIP_FULL = process.env.SMOKE_ONLY === '1';
const SKIP_SMOKE = process.env.SKIP_SMOKE === '1';

/** Long POST via curl — avoids undici headers timeout on 6–10 min generates. */
async function curlGenerate(payload, timeoutSec = 900) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  const body = JSON.stringify(payload);
  const { stdout } = await exec(
    'curl',
    [
      '-s', '-m', String(timeoutSec),
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-H', `X-Tenant-Id: ${TENANT}`,
      '-H', `X-Office-Id: ${process.env.YULA_OFFICE_ID || TENANT}`,
      `${WEB}/api/brand-context/${TENANT}/generate-design-templates`,
      '-d', body,
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  const data = JSON.parse(stdout);
  const ok = !data.error && (data.generated != null || Array.isArray(data.templates));
  return { ok, status: ok ? 200 : 502, data };
}

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...DEMO_HEADERS, ...opts.headers } });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, data };
}

function section(t) {
  console.log(`\n── ${t} ──`);
}

async function generate(payload, label, timeoutSec = 900) {
  console.log(`  ${label}…`, JSON.stringify(payload));
  const gen = await curlGenerate(payload, timeoutSec);
  console.log(`  status=${gen.status}`, gen.ok ? gen.data : gen.data);
  return gen;
}

async function main() {
  console.log('Yula fal.ai design templates smoke (2-phase)');
  console.log({ WEB, TENANT, SKIP_FULL });

  section('Health');
  for (const [name, url] of [
    ['web', WEB],
    ['crew', process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000/health'],
  ]) {
    const h = await jsonFetch(url);
    console.log(`  ${name}: ${h.status} ${h.ok ? 'OK' : 'FAIL'}`);
    if (!h.ok && name === 'web') process.exit(1);
  }

  if (!SKIP_SMOKE) {
    section('Phase 1 — smoke (1 template)');
    const smoke = await generate(
      { limit: 1, concurrency: 1, locale: 'tr', archiveExisting: false },
      'limit=1',
      180,
    );
    if (!smoke.ok) {
      console.error('\nSmoke FAILED — check Crew :8000, FAL_API_KEY, gallery photos.');
      process.exit(1);
    }
    const smokeGenerated = smoke.data?.generated ?? 0;
    if (smokeGenerated < 1) {
      console.error('\nSmoke FAILED — no preview thumbnail (generated=0).');
      process.exit(1);
    }
    const first = (smoke.data?.templates ?? [])[0];
    console.log(
      `  ✓ smoke OK: ${first?.template_type} generator=${first?.design_spec?.generator} thumb=${Boolean(first?.thumbnail_url)}`,
    );
  } else {
    console.log('\n── Phase 1 skipped (SKIP_SMOKE=1) ──');
  }

  if (SKIP_FULL) {
    console.log('\nSmoke OK (SMOKE_ONLY=1 — full set skipped).');
    return;
  }

  section('Phase 2 — full set');
  const full = await generate(
    { concurrency: 2, locale: 'tr' },
    'full set',
    900,
  );
  if (!full.ok) {
    console.error('\nFull set FAILED after smoke passed — retry full generate.');
    process.exit(1);
  }
  console.log(
    `  ✓ full set: generated=${full.data?.generated} failed=${full.data?.failed} persisted=${full.data?.persisted}`,
  );

  section('List design-templates');
  const list = await jsonFetch(`${WEB}/api/brand-context/${TENANT}/design-templates`);
  const rows = Array.isArray(list.data) ? list.data : [];
  const active = rows.filter((r) => r.status !== 'archived');
  console.log(`  active=${active.length} with_preview=${active.filter((r) => r.thumbnail_url).length}`);
  for (const row of active.slice(0, 12)) {
    console.log(
      `  · ${row.template_type} | ${row.template_name} | thumb=${Boolean(row.thumbnail_url)}`,
    );
  }

  if (active.filter((r) => r.thumbnail_url).length < 3) {
    console.error('\nFull set incomplete — too few previews');
    process.exit(1);
  }
  console.log('\nSmoke OK — Seti oluştur akışı çalışıyor.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
