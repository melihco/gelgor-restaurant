#!/usr/bin/env node
/**
 * E2E: propose → approve → poll → verify Feed publishability for new mission artifacts.
 * Usage: node scripts/e2e-mission-feed-test.mjs [workspaceId]
 */
import { dedupeProductionBundles } from '../apps/web/src/lib/production-bundle.ts';
import {
  filterFeedPublishableArtifacts,
  isArtifactFeedPublishable,
} from '../apps/web/src/lib/weekly-publish-package.ts';
import { parseArtifactMissionId } from '../apps/web/src/lib/mission-feed-package.ts';

const WS = process.argv[2] || '5feb36f7-def7-4b4a-834f-353457de57bf';
const CREW = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const NEXUS = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const NEXT = (process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';

const headers = {
  'Content-Type': 'application/json',
  'X-Tenant-Id': WS,
  'X-Internal-Api-Key': KEY,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    data = { raw: text.slice(0, 500) };
  }
  return { res, data };
}

async function nexusArtifacts() {
  const res = await fetch(`${NEXUS}/api/artifacts`, { headers });
  if (!res.ok) throw new Error(`artifacts ${res.status}`);
  return res.json();
}

function mapArtifact(a) {
  const reviewStatusToken = String(a.reviewStatus ?? '0');
  const status =
    reviewStatusToken === '1' || String(reviewStatusToken).toLowerCase() === 'approved'
      ? 'approved'
      : 'pending_review';
  let metadata = {};
  try {
    metadata = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata ?? {});
  } catch {
    metadata = {};
  }
  return { ...a, status, metadata, content: a.content, createdAt: a.createdAt };
}

function feedReport(artifacts, missionId) {
  const mapped = artifacts.map(mapArtifact);
  const mission = mapped.filter((a) => parseArtifactMissionId(a) === missionId);
  const deduped = dedupeProductionBundles(mission);
  const publishable = deduped.filter((a) => isArtifactFeedPublishable(a));
  const pendingPub = publishable.filter((a) => a.status === 'pending_review');
  return {
    raw: mission.length,
    deduped: deduped.length,
    publishable: publishable.length,
    pending_publishable: pendingPub.length,
    items: publishable.map((a) => ({
      title: a.title?.slice(0, 42),
      role: a.metadata?.production_role,
      bundle: a.metadata?.bundle_status,
      ai: a.metadata?.ai_gallery_enhanced,
      source: a.metadata?.source,
    })),
  };
}

async function main() {
  console.log('=== Mission → Feed E2E ===');
  console.log('workspace', WS);
  console.log('crew', CREW, 'nexus', NEXUS);

  const before = await nexusArtifacts();
  const beforeCount = before.length;

  console.log('\n1) Propose mission (Strategist, ~30–90s)...');
  const { res: propRes, data: propData } = await crew(`/api/v1/missions/${WS}/propose`, {
    method: 'POST',
    body: JSON.stringify({ context_signals: 'E2E feed test — weekly content package' }),
    timeoutMs: 130_000,
  });
  if (!propRes.ok) {
    console.error('PROPOSE FAILED', propRes.status, propData);
    process.exit(1);
  }

  const missions = propData.missions ?? propData.created ?? propData;
  const list = Array.isArray(missions) ? missions : propData.mission ? [propData.mission] : [];
  const mission = list[0];
  if (!mission?.id) {
    console.error('No mission in propose response', propData);
    process.exit(1);
  }
  const missionId = mission.id;
  console.log('   proposed:', mission.title, missionId);

  console.log('\n2) Approve mission...');
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
  console.log('   approved:', apprData.message ?? apprData.status);

  console.log('\n3) Poll progress (max 12 min)...');
  const deadline = Date.now() + 12 * 60_000;
  let lastPct = -1;
  let lastStatus = '';

  while (Date.now() < deadline) {
    const { res: progRes, data: prog } = await crew(
      `/api/v1/missions/${WS}/${missionId}/progress`,
      { timeoutMs: 20_000 },
    );
    if (!progRes.ok) {
      console.warn('progress error', progRes.status);
      await sleep(15_000);
      continue;
    }

    const status = prog.status ?? '';
    const pct = prog.completion_pct ?? 0;
    const nodes = prog.nodes ?? [];
    const done = nodes.filter((n) => n.status === 'completed').length;
    const running = nodes.filter((n) => n.status === 'running').length;

    if (pct !== lastPct || status !== lastStatus) {
      console.log(
        `   [${new Date().toISOString().slice(11, 19)}] ${status} ${pct}% ` +
        `(${done}/${nodes.length} done, ${running} running)`,
      );
      lastPct = pct;
      lastStatus = status;
    }

    const arts = await nexusArtifacts();
    const fr = feedReport(arts.map(mapArtifact), missionId);
    if (fr.publishable > 0) {
      console.log('   feed-ready artifacts:', fr.publishable, fr.items);
    }

    if (status === 'completed' || pct >= 100) {
      console.log('\n4) Mission completed.');
      break;
    }
    if (status === 'failed' || status === 'cancelled') {
      console.error('Mission terminal:', status);
      break;
    }

    await sleep(20_000);
  }

  const after = await nexusArtifacts();
  console.log('\n=== Results ===');
  console.log('nexus artifacts total:', after.length, '(was', beforeCount + ')');
  const finalFeed = feedReport(after.map(mapArtifact), missionId);
  console.log('mission artifacts:', JSON.stringify(finalFeed, null, 2));

  const ok =
    finalFeed.publishable >= 3
    && finalFeed.pending_publishable >= 1;

  if (ok) {
    console.log('\n✓ PASS — Mission outputs are Feed-publishable');
    console.log('Open Feed with mission filter:', missionId);
    process.exit(0);
  }

  console.log('\n✗ FAIL — Expected ≥3 publishable mission artifacts');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
