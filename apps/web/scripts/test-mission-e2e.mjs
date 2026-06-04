/**
 * E2E: propose → approve → poll progress → verify Feed artifacts
 *
 *   node scripts/test-mission-e2e.mjs --tenant 5feb36f7-def7-4b4a-834f-353457de57bf
 */
const TENANT = process.argv.includes('--tenant')
  ? process.argv[process.argv.indexOf('--tenant') + 1]
  : '5feb36f7-def7-4b4a-834f-353457de57bf';

const BASE = (process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const NEXUS = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const INTERNAL = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';

const HDRS = {
  'Content-Type': 'application/json',
  'X-Tenant-Id': TENANT,
  'X-Internal-Api-Key': INTERNAL,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jfetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...HDRS, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log(`\n=== Mission E2E — tenant ${TENANT} ===\n`);

  const list = await jfetch(`${BASE}/api/missions/${TENANT}?limit=15`, { timeoutMs: 30_000 });
  if (!list.ok) {
    console.error('List missions failed', list.status, list.data);
    process.exit(1);
  }
  const missions = Array.isArray(list.data) ? list.data : list.data?.missions ?? [];
  console.log(`Missions: ${missions.length}`);
  for (const m of missions.slice(0, 5)) {
    console.log(`  - ${m.id?.slice(0, 8)}… ${m.status} ${m.title?.slice(0, 40) ?? ''}`);
  }

  const blocking = missions.filter((m) =>
    m.status === 'in_flight' || m.status === 'approved',
  );
  for (const m of blocking) {
    console.log(`Cancelling blocking mission ${m.id?.slice(0, 8)}… (${m.status})`);
    await jfetch(`${BASE}/api/missions/${TENANT}/${m.id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason: 'e2e-test-new-mission' }),
      timeoutMs: 15_000,
    });
  }

  console.log('\nProposing new mission (60–120s)…');
  const propose = await jfetch(`${BASE}/api/missions/${TENANT}/propose`, {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 130_000,
  });
  if (!propose.ok) {
    console.error('Propose failed', propose.status, propose.data);
    process.exit(1);
  }
  const proposed = propose.data?.missions ?? (Array.isArray(propose.data) ? propose.data : []);
  if (!proposed.length) {
    console.error('No proposals returned', propose.data);
    process.exit(1);
  }
  const missionId = proposed[0].id;
  console.log(`Proposed: ${missionId} — ${proposed[0].title ?? ''}`);

  const approve = await jfetch(`${BASE}/api/missions/${TENANT}/${missionId}/approve`, {
    method: 'PUT',
    body: JSON.stringify({ approved_by: 'e2e-test-script' }),
    timeoutMs: 15_000,
  });
  if (!approve.ok) {
    console.error('Approve failed', approve.status, approve.data);
    process.exit(1);
  }
  console.log('Approved — pipeline running…\n');

  let lastPct = -1;
  for (let i = 0; i < 80; i++) {
    await sleep(15_000);
    const prog = await jfetch(`${BASE}/api/missions/${TENANT}/${missionId}/progress`, {
      timeoutMs: 30_000,
    });
    if (!prog.ok) {
      console.warn('Progress poll failed', prog.status);
      continue;
    }
    const nodes = prog.data?.nodes ?? [];
    const done = nodes.filter((n) => n.status === 'completed').length;
    const total = nodes.length || 1;
    const pct = Math.round((done / total) * 100);
    const missionStatus = prog.data?.mission_status ?? prog.data?.status ?? '?';
    if (pct !== lastPct) {
      console.log(`[${i + 1}] ${pct}% (${done}/${total}) mission=${missionStatus}`);
      lastPct = pct;
    }
    const ideation = nodes.find((n) => n.task_type === 'content_ideation');
    const autoNode = nodes.find((n) =>
      String(n.task_type || '').includes('auto') || String(n.node_key || '').includes('produce'),
    );
    if (ideation?.status === 'completed') {
      console.log('  ✓ content_ideation completed');
    }
    if (missionStatus === 'completed' || pct >= 100) {
      console.log('\nMission completed.');
      break;
    }
    if (missionStatus === 'failed' || missionStatus === 'cancelled') {
      console.error('\nMission ended:', missionStatus);
      break;
    }
  }

  await sleep(5_000);
  const arts = await jfetch(`${NEXUS}/api/artifacts`, { timeoutMs: 30_000 });
  if (!arts.ok) {
    console.error('Artifacts list failed', arts.status);
    process.exit(1);
  }
  const all = Array.isArray(arts.data) ? arts.data : [];
  const mine = all.filter((a) => {
    try {
      const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata ?? {});
      return String(meta.mission_id || meta.missionId || '') === missionId;
    } catch {
      return false;
    }
  });
  const pending = mine.filter((a) =>
    String(a.reviewStatus || a.status || '').toLowerCase().includes('pending'),
  );

  console.log(`\nArtifacts for mission: ${mine.length} total, ${pending.length} pending_review`);
  for (const a of mine.slice(0, 12)) {
    const url = (a.contentUrl || '').slice(0, 70);
    console.log(`  · ${(a.title || '').slice(0, 36)} | ${url}`);
  }

  if (pending.length === 0 && mine.length === 0) {
    console.log('\n⚠ No artifacts yet — auto-produce may still be running. Check Feed in 2–3 min.');
    process.exit(2);
  }
  if (pending.length > 0) {
    console.log('\n✓ Feed should show', pending.length, 'pending item(s). Open Feed tab and refresh.');
    process.exit(0);
  }
  console.log('\n✓ Mission artifacts exist (may already be reviewed).');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
