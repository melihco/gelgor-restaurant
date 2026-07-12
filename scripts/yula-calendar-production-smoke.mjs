#!/usr/bin/env node
/**
 * Live smoke: Yula Bodrum mission calendar production completion.
 *
 * Usage:
 *   node scripts/yula-calendar-production-smoke.mjs [missionId]
 *
 * Env:
 *   CREW_BACKEND_URL — default https://smartagency-crew.onrender.com (via web BFF)
 */
const WS = process.env.YULA_WORKSPACE_ID || 'd365f0e0-436e-402d-8f84-0c8fd7ab2022';
const MID = process.argv[2] || process.env.YULA_MISSION_ID || 'f2aaa40c-8ccb-4bb3-b0fc-de09e291f2d9';
const WEB = (process.env.NEXTJS_INTERNAL_URL || 'https://smartagency-web.onrender.com').replace(/\/$/, '');

const headers = {
  'Content-Type': 'application/json',
  'X-Tenant-Id': WS,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(path, opts = {}) {
  const res = await fetch(`${WEB}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  return { res, data };
}

async function main() {
  console.log('=== Yula calendar production smoke ===');
  console.log('workspace', WS);
  console.log('mission', MID);

  console.log('\n1) production-jobs (before)');
  let { res, data: jobs } = await api(`/api/missions/${WS}/${MID}/production-jobs`);
  if (!res.ok) {
    console.error('production-jobs failed', res.status, jobs);
    process.exit(1);
  }
  console.log(`   ready=${jobs.ready}/${jobs.total} failed=${jobs.failed} queued=${jobs.queued}`);

  console.log('\n2) kick-feed-production');
  ({ res, data: jobs } = await api(`/api/missions/${WS}/${MID}/kick-feed-production`, {
    method: 'PUT',
    body: JSON.stringify({ operator_override: true }),
  }));
  if (!res.ok) {
    console.error('kick failed', res.status, jobs);
    process.exit(1);
  }
  console.log('  ', jobs.message ?? jobs);

  console.log('\n3) requeue-factory-jobs');
  const rq = await api(`/api/missions/${WS}/${MID}/requeue-factory-jobs`, { method: 'POST', body: '{}' });
  console.log('  ', rq.res.status, rq.data);

  console.log('\n4) poll production-jobs (max 8 min)');
  const deadline = Date.now() + 8 * 60_000;
  let lastSig = '';
  while (Date.now() < deadline) {
    ({ data: jobs } = await api(`/api/missions/${WS}/${MID}/production-jobs`, { timeoutMs: 30_000 }));
    const sig = `${jobs.ready}/${jobs.total}|f${jobs.failed}|q${jobs.queued}|${jobs.complete}`;
    if (sig !== lastSig) {
      console.log(`   [${new Date().toISOString().slice(11, 19)}] ready=${jobs.ready}/${jobs.total} failed=${jobs.failed} queued=${jobs.queued} complete=${jobs.complete}`);
      lastSig = sig;
    }
    if (jobs.complete || (jobs.ready >= jobs.total && jobs.failed === 0)) {
      console.log('\n✓ Factory complete');
      process.exit(0);
    }
    if (jobs.ready >= 13 && jobs.failed <= 2) {
      console.log('\n✓ Calendar-scale production reached (≥13 ready)');
      process.exit(0);
    }
    await sleep(20_000);
  }

  console.log('\n✗ Timed out — check Mission Hub / Feed');
  console.log(JSON.stringify(jobs, null, 2));
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
