#!/usr/bin/env node
/**
 * Mission → Feed E2E (no TS imports). Usage:
 *   node scripts/e2e-mission-feed-test-pure.mjs [workspaceId]
 */
const WS = process.argv[2] || '5feb36f7-def7-4b4a-834f-353457de57bf';
const CREW = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const NEXUS = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';

const headers = {
  'Content-Type': 'application/json',
  'X-Tenant-Id': WS,
  'X-Internal-Api-Key': KEY,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function crew(path, opts = {}) {
  const res = await fetch(`${CREW}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 800) };
  }
  return { res, data };
}

function meta(a) {
  try {
    return typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata ?? {});
  } catch {
    return {};
  }
}

function missionId(a) {
  const m = meta(a);
  return String(m.mission_id || m.missionId || '').trim();
}

function isPubUrl(url) {
  const u = String(url ?? '').trim();
  if (!u) return false;
  if (u.startsWith('http') || u.startsWith('/api/media') || u.startsWith('/api/remotion')) return true;
  if (u.startsWith('data:image')) return true;
  return false;
}

function isFeedPublishable(a) {
  const m = meta(a);
  let c = {};
  try {
    c = typeof a.content === 'string' ? JSON.parse(a.content) : (a.content ?? {});
  } catch {
    return false;
  }
  const urls = [
    a.contentUrl,
    m.poster_url,
    m.posterUrl,
    m.imageUrl,
    c.imageUrl,
    m.video_url,
    m.videoUrl,
  ].filter((u) => isPubUrl(u));
  return urls.length > 0;
}

function feedReport(artifacts, mid) {
  const mission = artifacts.filter((a) => missionId(a) === mid);
  const pub = mission.filter(isFeedPublishable);
  const pending = pub.filter((a) => String(a.reviewStatus ?? '0') !== '1');
  return {
    raw: mission.length,
    publishable: pub.length,
    pending_publishable: pending.length,
    sample: pub.slice(0, 5).map((a) => ({
      title: (a.title || '').slice(0, 45),
      role: meta(a).production_role,
      bundle: meta(a).bundle_status,
    })),
  };
}

async function nexusArtifacts() {
  const res = await fetch(`${NEXUS}/api/artifacts?limit=200`, { headers });
  if (!res.ok) throw new Error(`artifacts ${res.status}`);
  return res.json();
}

async function main() {
  console.log('=== Mission → Feed E2E (pure) ===');
  console.log('workspace', WS);

  const before = (await nexusArtifacts()).length;

  console.log('\n1) Propose (~30–90s)...');
  const { res: propRes, data: propData } = await crew(`/api/v1/missions/${WS}/propose`, {
    method: 'POST',
    body: JSON.stringify({ context_signals: 'E2E feed test — Kaçta haftalık içerik paketi' }),
    timeoutMs: 130_000,
  });
  if (!propRes.ok) {
    console.error('PROPOSE FAILED', propRes.status, JSON.stringify(propData, null, 2));
    process.exit(1);
  }

  const list = propData.missions ?? [];
  const mission = list[0];
  if (!mission?.id) {
    console.error('No mission', propData);
    process.exit(1);
  }
  const missionId = mission.id;
  console.log('   mission:', mission.title, missionId);

  console.log('\n2) Approve...');
  const { res: apprRes, data: apprData } = await crew(
    `/api/v1/missions/${WS}/${missionId}/approve`,
    {
      method: 'PUT',
      body: JSON.stringify({ approved_by: 'e2e-script' }),
      timeoutMs: 30_000,
    },
  );
  if (!apprRes.ok) {
    console.error('APPROVE FAILED', apprRes.status, apprData);
    process.exit(1);
  }
  console.log('   ', apprData.message ?? apprData.status);

  console.log('\n3) Poll (max 12 min)...');
  const deadline = Date.now() + 12 * 60_000;
  let lastLine = '';

  while (Date.now() < deadline) {
    const { res: progRes, data: prog } = await crew(
      `/api/v1/missions/${WS}/${missionId}/progress`,
      { timeoutMs: 20_000 },
    );
    if (progRes.ok) {
      const nodes = prog.nodes ?? [];
      const failed = nodes.filter((n) => n.status === 'failed');
      const line =
        `${prog.status} ${prog.completion_pct}% ` +
        `(${nodes.filter((n) => n.status === 'completed').length}/${nodes.length}, ` +
        `${nodes.filter((n) => n.status === 'running').length} run)`;
      if (line !== lastLine) {
        console.log('   ', new Date().toISOString().slice(11, 19), line);
        if (failed.length) {
          for (const n of failed) {
            console.log('      FAIL', n.task_type, (n.error_message || '').slice(0, 200));
          }
        }
        lastLine = line;
      }

      const fr = feedReport(await nexusArtifacts(), missionId);
      if (fr.publishable > 0) {
        console.log('   FEED-READY:', fr.publishable, fr.sample);
      }

      if (prog.status === 'completed' || (prog.completion_pct ?? 0) >= 100) break;
    }
    await sleep(20_000);
  }

  const final = feedReport(await nexusArtifacts(), missionId);
  const after = (await nexusArtifacts()).length;
  console.log('\n=== Results ===');
  console.log('artifacts total:', after, '(+', after - before, ')');
  console.log(JSON.stringify(final, null, 2));

  const ok = final.publishable >= 1 && final.pending_publishable >= 1;
  if (ok) {
    console.log('\n✓ PASS — Feed\'e düşecek içerik var (pending_review)');
    console.log('Feed URL: http://localhost:3000/mobile → Feed, mission filter:', missionId);
    process.exit(0);
  }
  console.log('\n✗ FAIL — publishable mission artifact yok');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
