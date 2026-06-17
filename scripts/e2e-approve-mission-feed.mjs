#!/usr/bin/env node
/** Approve existing mission + poll Feed. Usage: node scripts/e2e-approve-mission-feed.mjs <missionId> [workspaceId] */
const missionId = process.argv[2];
const WS = process.argv[3] || '5feb36f7-def7-4b4a-834f-353457de57bf';
if (!missionId) {
  console.error('Usage: node scripts/e2e-approve-mission-feed.mjs <missionId> [workspaceId]');
  process.exit(1);
}

const CREW = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const NEXUS = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';
const headers = { 'Content-Type': 'application/json', 'X-Tenant-Id': WS, 'X-Internal-Api-Key': KEY };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function meta(a) {
  try {
    return typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata ?? {});
  } catch {
    return {};
  }
}
function mid(a) {
  return String(meta(a).mission_id || meta(a).missionId || '').trim();
}
function isPubUrl(u) {
  u = String(u ?? '').trim();
  return u && (u.startsWith('http') || u.startsWith('/api/media') || u.startsWith('/api/remotion') || u.startsWith('data:image'));
}
function isPub(a) {
  const m = meta(a);
  let c = {};
  try {
    c = typeof a.content === 'string' ? JSON.parse(a.content) : (a.content ?? {});
  } catch {}
  return [a.contentUrl, m.poster_url, m.posterUrl, m.imageUrl, c.imageUrl, m.video_url].some(isPubUrl);
}
function report(arts) {
  const m = arts.filter((a) => mid(a) === missionId);
  const p = m.filter(isPub);
  return {
    raw: m.length,
    publishable: p.length,
    pending: p.filter((a) => String(a.reviewStatus ?? '0') !== '1').length,
    sample: p.slice(0, 8).map((a) => ({ title: (a.title || '').slice(0, 42), role: meta(a).production_role, bundle: meta(a).bundle_status })),
  };
}

async function crew(path, opts = {}) {
  const res = await fetch(`${CREW}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function main() {
  console.log('Approve + poll', missionId);

  const { res: apprRes, data: apprData } = await crew(`/api/v1/missions/${WS}/${missionId}/approve`, {
    method: 'PUT',
    body: JSON.stringify({ approved_by: 'e2e-script' }),
    timeoutMs: 30_000,
  });
  if (!apprRes.ok) {
    console.error('APPROVE', apprRes.status, apprData);
    process.exit(1);
  }
  console.log('Approved:', apprData.message ?? apprData.status);

  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    const { res, data: prog } = await crew(`/api/v1/missions/${WS}/${missionId}/progress`, { timeoutMs: 20_000 });
    if (res.ok) {
      const nodes = prog.nodes ?? [];
      const failed = nodes.filter((n) => n.status === 'failed');
      console.log(
        new Date().toISOString().slice(11, 19),
        prog.status,
        prog.completion_pct + '%',
        nodes.filter((n) => n.status === 'completed').length + '/' + nodes.length,
      );
      if (failed.length) {
        for (const n of failed) console.log('  FAIL', n.task_type, (n.error_message || '').slice(0, 250));
      }
      const arts = await fetch(`${NEXUS}/api/artifacts?limit=200`, { headers }).then((r) => r.json());
      const fr = report(arts);
      if (fr.publishable > 0) console.log('  FEED:', fr);
      if (prog.status === 'completed' || (prog.completion_pct ?? 0) >= 100) break;
    }
    await sleep(20_000);
  }

  const arts = await fetch(`${NEXUS}/api/artifacts?limit=200`, { headers }).then((r) => r.json());
  const final = report(arts);
  console.log('\nFINAL', JSON.stringify(final, null, 2));
  process.exit(final.publishable >= 1 && final.pending >= 1 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
