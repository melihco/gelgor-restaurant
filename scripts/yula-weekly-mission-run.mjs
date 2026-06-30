#!/usr/bin/env node
/**
 * Yula — haftalık paket (16 slot) üretim tetikle + artifact raporu.
 *
 * Usage:
 *   node scripts/yula-weekly-mission-run.mjs
 *   MISSION_ID=<uuid> node scripts/yula-weekly-mission-run.mjs
 *   SKIP_KICK=1 node scripts/yula-weekly-mission-run.mjs   # rapor only
 */
import http from 'node:http';

const YULA = process.env.YULA_TENANT_ID || 'f00e3308-ebbe-4d75-8592-12d52e7ff1aa';
const CREW = process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000';
const API = process.env.NEXUS_API_URL || 'http://127.0.0.1:5050';
const INTERNAL = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';
const OFFICE = process.env.OFFICE_ID || '00000000-0000-0000-0000-000000000001';

const PROPOSED_MISSION = process.env.PROPOSED_MISSION_ID || '484a52ac-1a16-47b6-ace2-678f75c298ed';
const PRODUCTION_MISSION = process.env.MISSION_ID || 'd773d9cc-3d1f-4d5c-8eae-0d9b1d52f8dc';
const POLL_SEC = Number(process.env.POLL_SEC || 45);
const MAX_POLLS = Number(process.env.MAX_POLLS || 40);

const WEEKLY_ROLES = [
  'organic_post', 'designed_post', 'designed_typography', 'fal_designed_post',
  'organic_carousel', 'organic_story_still', 'campaign_story_motion',
  'organic_reel', 'campaign_reel_motion', 'fal_reel_motion', 'fal_only_reel',
  'fal_only_post',
];

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 400) }; }
  return { ok: res.ok, status: res.status, data };
}

function crewHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Api-Key': INTERNAL,
    'X-Tenant-Id': YULA,
  };
}

function nexusHeaders() {
  return { 'X-Tenant-Id': YULA, 'X-Office-Id': OFFICE };
}

async function approveMission(missionId) {
  const r = await jsonFetch(`${CREW}/api/v1/missions/${YULA}/${missionId}/approve`, {
    method: 'PUT',
    headers: crewHeaders(),
    body: JSON.stringify({ approved_by: 'yula-test-script' }),
  });
  console.log(`  approve ${missionId.slice(0, 8)} → ${r.status}`, r.data?.status || r.data?.message || r.data?.error);
  return r.ok;
}

async function kickWeeklyProduction(missionId) {
  const body = {
    production_package: 'weekly_content',
    production_profile_tier: 'economy',
    force: true,
    operator_override: true,
  };
  const r = await jsonFetch(`${CREW}/api/v1/missions/${YULA}/${missionId}/kick-feed-production`, {
    method: 'PUT',
    headers: crewHeaders(),
    body: JSON.stringify(body),
  });
  console.log(`  kick-feed ${missionId.slice(0, 8)} → ${r.status}`, r.data?.message || r.data?.action || r.data?.detail);
  return r;
}

async function fetchArtifacts(missionId) {
  const r = await jsonFetch(`${API}/api/artifacts?limit=300&missionId=${missionId}`, {
    headers: nexusHeaders(),
  });
  if (!r.ok) return [];
  const list = Array.isArray(r.data) ? r.data : [];
  return list.map((a) => {
    let meta = {};
    try { meta = JSON.parse(a.metadata || '{}'); } catch { /* */ }
    return {
      id: a.id,
      title: (a.title || '').slice(0, 55),
      role: meta.production_role || '',
      pipeline: meta.pipeline || '',
      kind: meta.kind || '',
      bundle: meta.bundle_status || '',
      tplType: meta.brand_design_template_type || '',
      tplName: meta.brand_design_template_name || '',
      falAlign: Boolean(meta.fal_template_alignment),
      idea: meta.idea_index,
      created: a.createdAt,
    };
  });
}

function printReport(missionId, artifacts, label) {
  const forMission = artifacts.filter((a) => true);
  const byRole = {};
  for (const a of forMission) {
    const k = a.role || 'unknown';
    if (!byRole[k]) byRole[k] = [];
    byRole[k].push(a);
  }

  console.log(`\n═══ ${label} mission ${missionId.slice(0, 8)} — ${forMission.length} artifacts ═══`);
  const roles = Object.keys(byRole).sort();
  for (const role of roles) {
    const items = byRole[role];
    const latest = items.sort((x, y) => String(y.created).localeCompare(String(x.created)))[0];
    console.log(
      `  ${role.padEnd(24)} ×${items.length}  bundle=${latest.bundle || '-'}  ` +
      `tpl=${latest.tplType || '-'}  falAlign=${latest.falAlign ? 'yes' : 'no'}`,
    );
  }

  const falRoles = roles.filter((r) => r.startsWith('fal_'));
  const remotionRoles = roles.filter((r) => r === 'designed_post' || r === 'designed_typography');
  const withTpl = forMission.filter((a) => a.tplType).length;
  const withAlign = forMission.filter((a) => a.falAlign).length;
  const ready = forMission.filter((a) => a.bundle === 'ready').length;
  const rendering = forMission.filter((a) => a.bundle === 'rendering').length;
  const failed = forMission.filter((a) => a.bundle === 'failed').length;

  const missingWeekly = WEEKLY_ROLES.filter((r) => !byRole[r]?.length);

  console.log('\n── Özet ──');
  console.log(`  ready=${ready} rendering=${rendering} failed=${failed}`);
  console.log(`  fal slotları: ${falRoles.length}/6 tür  brand_design_template_type: ${withTpl}`);
  console.log(`  remotion poster falAlign: ${withAlign}`);
  if (missingWeekly.length) {
    console.log(`  eksik roller (${missingWeekly.length}): ${missingWeekly.join(', ')}`);
  } else {
    console.log('  tüm haftalık roller en az 1 artifact ile temsil ediliyor');
  }
}

async function pollUntilStable(missionId) {
  let lastCount = -1;
  let stableRounds = 0;
  for (let i = 0; i < MAX_POLLS; i += 1) {
    const arts = await fetchArtifacts(missionId);
    const ready = arts.filter((a) => a.bundle === 'ready').length;
    const rendering = arts.filter((a) => a.bundle === 'rendering').length;
    console.log(
      `[poll ${i + 1}/${MAX_POLLS}] artifacts=${arts.length} ready=${ready} rendering=${rendering}`,
    );
    printReport(missionId, arts, 'Canlı');

    if (arts.length === lastCount && rendering === 0) {
      stableRounds += 1;
      if (stableRounds >= 2) break;
    } else {
      stableRounds = 0;
    }
    lastCount = arts.length;

    await new Promise((r) => setTimeout(r, POLL_SEC * 1000));
  }
  return fetchArtifacts(missionId);
}

async function main() {
  console.log('Yula weekly mission test');
  console.log({ YULA, PRODUCTION_MISSION: PRODUCTION_MISSION.slice(0, 8), PROPOSED_MISSION: PROPOSED_MISSION.slice(0, 8) });

  console.log('\n── 1) Yeni mission onayı (Mission Hub) ──');
  await approveMission(PROPOSED_MISSION);

  if (process.env.SKIP_KICK !== '1') {
    console.log('\n── 2) Haftalık paket üretimi (16 slot, economy tier) ──');
    const kick = await kickWeeklyProduction(PRODUCTION_MISSION);
    if (!kick.ok) {
      console.error('kick failed — reproduce deneniyor…');
      const rep = await jsonFetch(`${CREW}/api/v1/missions/${YULA}/${PRODUCTION_MISSION}/reproduce-feed`, {
        method: 'PUT',
        headers: crewHeaders(),
        body: JSON.stringify({
          production_package: 'weekly_content',
          production_profile_tier: 'economy',
          force: true,
          operator_override: true,
        }),
        signal: AbortSignal.timeout(3_600_000),
      });
      console.log('  reproduce →', rep.status, rep.data?.message || rep.data?.produced);
    }
  }

  console.log('\n── 3) Artifact izleme (Feed\'e düştükçe) ──');
  console.log(`  Yula ekranı: tenant ${YULA.slice(0, 8)}… → Feed / Mission Hub`);
  const finalArts = await pollUntilStable(PRODUCTION_MISSION);

  console.log('\n── 4) Final rapor ──');
  printReport(PRODUCTION_MISSION, finalArts, 'Final');

  // Also show new proposed mission artifacts if any
  const proposedArts = await fetchArtifacts(PROPOSED_MISSION);
  if (proposedArts.length) {
    printReport(PROPOSED_MISSION, proposedArts, 'Yeni mission');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
