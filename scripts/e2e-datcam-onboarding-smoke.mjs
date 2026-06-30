#!/usr/bin/env node
/**
 * Smoke test: register Datçam tenant → deep-brand-setup → readiness + gallery + propose.
 *
 * Usage:
 *   node scripts/e2e-datcam-onboarding-smoke.mjs
 *
 * Requires: API :5050, Crew :8000, Web :3000, OPENAI_API_KEY in apps/web env.
 */

import https from 'node:https';
import http from 'node:http';

const API = process.env.NEXUS_API_URL || 'http://127.0.0.1:5050';
const WEB = process.env.WEB_URL || 'http://127.0.0.1:3000';
const CREW = process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';

const STAMP = Date.now();
const EMAIL = `datcam-smoke-${STAMP}@smartagency.test`;
const PASSWORD = 'DatcamSmoke2026!';
const COMPANY = 'Datçam';
const WEBSITE = 'https://www.datcam.com.tr';
const IG = 'datcamtr';
const ALLOW_REVIEW_READY = process.env.ONBOARDING_SMOKE_ALLOW_REVIEW_READY === '1';

function decodeJwt(token) {
  const part = token.split('.')[1];
  if (!part) return null;
  const padded = part.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '=');
  return JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
}

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, data };
}

/** Long-running POST via node http — bypasses undici headersTimeout (default 300s). */
function longPost(url, body, headers = {}, timeoutMs = 720_000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    };
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw: raw.slice(0, 500) }; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`longPost timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

async function main() {
  console.log('Datçam onboarding smoke test');
  console.log({ API, WEB, CREW, EMAIL });

  section('Health');
  for (const [name, url] of [
    ['api', `${API}/health`],
    ['crew', `${CREW}/health`],
    ['web', WEB],
  ]) {
    const h = await jsonFetch(url);
    console.log(`  ${name}: ${h.status} ${h.ok ? 'OK' : 'FAIL'}`);
    if (!h.ok && name !== 'web') {
      console.error('Abort: stack not healthy');
      process.exit(1);
    }
  }

  section('Register tenant');
  const reg = await jsonFetch(`${API}/api/security/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Datçam Smoke',
      tenantName: COMPANY,
    }),
  });
  if (!reg.ok) {
    console.error('Register failed', reg.status, reg.data);
    process.exit(1);
  }
  const token = reg.data?.token;
  const tenantId = reg.data?.tenantId;
  const officeId = reg.data?.officeId;
  if (!token || !tenantId) {
    console.error('Missing token/tenantId', reg.data);
    process.exit(1);
  }
  console.log('  tenantId:', tenantId);
  console.log('  officeId:', officeId);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
    'X-Office-Id': officeId,
  };

  section('Deep brand setup (2–8 min)');
  const t0 = Date.now();
  const setup = await longPost(
    `${WEB}/api/onboarding/deep-brand-setup`,
    { tenantId, companyName: COMPANY, websiteUrl: WEBSITE, instagramHandle: IG },
    authHeaders,
    720_000,
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  elapsed: ${elapsed}s status: ${setup.status} ok: ${setup.data?.ok}`);

  if (setup.data?.steps) {
    for (const s of setup.data.steps) {
      console.log(`  [${s.ok ? '✓' : '✗'}] ${s.id}${s.detail ? ` — ${s.detail}` : ''}`);
    }
  }
  if (setup.data?.errors?.length) {
    console.log('  errors:', setup.data.errors);
  }
  if (!setup.ok || !setup.data?.ok) {
    console.error('Deep setup failed');
    process.exit(1);
  }

  const analysis = setup.data.brandAnalysis;
  console.log('  industry:', analysis?.inferred_industry);
  console.log('  confidence:', analysis?.confidence);
  console.log('  business_name:', analysis?.brand_context?.business_name);
  console.log('  refs:', analysis?.reference_image_urls?.length ?? 0);
  console.log('  gallery:', setup.data.gallery);

  section('Brand readiness (BRS)');
  const brs = await jsonFetch(`${WEB}/api/brand-readiness/${tenantId}`, {
    headers: authHeaders,
  });
  console.log('  score:', brs.data?.score);
  console.log('  canProposeMissions:', brs.data?.canProposeMissions);
  console.log('  canAutoProduce:', brs.data?.canAutoProduce);
  console.log('  inputs:', brs.data?.inputs);
  if (brs.data?.missing?.length) {
    for (const m of brs.data.missing.slice(0, 5)) {
      console.log(`    - ${m.label}: ${m.detail}`);
    }
  }

  section('Python brand context');
  const ctx = await jsonFetch(`${CREW}/api/v1/brand-context/${tenantId}`, {
    headers: {
      'X-Internal-Api-Key': INTERNAL_KEY,
      'X-Tenant-Id': tenantId,
    },
  });
  if (ctx.ok && ctx.data) {
    console.log('  business_name:', ctx.data.business_name);
    console.log('  business_type:', ctx.data.business_type);
    console.log('  discovery_confidence:', ctx.data.discovery_confidence);
    console.log('  constitution:', ctx.data.brand_constitution_confirmed_at ? 'yes' : 'no');
    console.log('  brand_dna:', ctx.data.brand_dna ? `${String(ctx.data.brand_dna).length} chars` : 'none');
    console.log('  visual_dna:', ctx.data.visual_dna ? `${String(ctx.data.visual_dna).length} chars` : 'none');
    let refCount = 0;
    try {
      const refs = typeof ctx.data.reference_image_urls === 'string'
        ? JSON.parse(ctx.data.reference_image_urls)
        : ctx.data.reference_image_urls;
      refCount = Array.isArray(refs) ? refs.length : 0;
    } catch { /* */ }
    console.log('  reference_images:', refCount);
  } else {
    console.log('  context fetch failed', ctx.status);
  }

  section('Gallery analysis sample');
  const gal = await jsonFetch(`${WEB}/api/brand-context/${tenantId}/gallery-analysis`, {
    headers: authHeaders,
  });
  if (gal.ok && gal.data && typeof gal.data === 'object') {
    const entries = Object.entries(gal.data);
    console.log('  analyzed_photos:', entries.length);
    const sample = entries.slice(0, 3);
    for (const [url, meta] of sample) {
      const m = meta;
      console.log(`  · ${url.slice(0, 60)}…`);
      console.log(`    tags: ${(m.contentTags || []).slice(0, 5).join(', ')}`);
      console.log(`    hooks: ${(m.captionHooks || []).slice(0, 2).join(' | ')}`);
      console.log(`    usage: ${String(m.usageContext || '').slice(0, 80)}`);
    }
  }

  section('Mission propose');
  const propose = await jsonFetch(`${WEB}/api/missions/${tenantId}/propose`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ context_signals: 'datcam_smoke_test' }),
    signal: AbortSignal.timeout(120_000),
  });
  console.log('  status:', propose.status);
  if (propose.data?.error) {
    console.log('  error:', propose.data.detail || propose.data.error);
    console.log('  brs:', propose.data.brs, 'gis:', propose.data.gis);
  } else {
    const missions = propose.data?.missions ?? [];
    console.log('  proposals_created:', propose.data?.proposals_created ?? missions.length);
    for (const m of missions.slice(0, 3)) {
      console.log(`  · ${m.title || m.id}`);
    }
  }

  section('Summary');
  const galleryAnalyzed = Number(setup.data.gallery?.analyzed ?? 0);
  const brsScore = Number(brs.data?.score ?? 0);
  const canAutoProduce = brs.data?.canAutoProduce === true;
  const proposeOk = propose.ok && Number(propose.data?.proposals_created ?? 0) > 0;
  const strictPass = setup.data.ok && brsScore >= 70 && canAutoProduce && galleryAnalyzed > 0 && proposeOk;
  const reviewReadyPass = setup.data.ok && brsScore >= 50;
  const pass = strictPass || (ALLOW_REVIEW_READY && reviewReadyPass);
  if (strictPass) {
    console.log('PASS — Datçam onboarding is production-ready');
  } else if (ALLOW_REVIEW_READY && reviewReadyPass) {
    console.log('PARTIAL — Datçam tenant ready for review (strict release gate not met)');
  } else {
    console.log('FAIL — Datçam onboarding is not production-ready');
  }
  console.log({
    strictPass,
    brsScore,
    canAutoProduce,
    galleryAnalyzed,
    proposeOk,
  });
  console.log({ tenantId, email: EMAIL, password: PASSWORD });
  process.exit(pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
