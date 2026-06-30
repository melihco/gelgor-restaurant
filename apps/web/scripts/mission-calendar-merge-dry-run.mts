/**
 * Dry-run calendar → production merge for a live mission (no rendering).
 *
 * Usage:
 *   npx tsx scripts/mission-calendar-merge-dry-run.mts \
 *     --workspace 431b2901-a2dc-4df6-abe3-3670d9844851 \
 *     --mission 2b01f99a-38fd-4e69-8445-b82e88434929
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  applyCalendarProductionEnrichment,
  mergeCalendarPlansForProduction,
} from '../src/lib/mission-production-plan';
import { calendarItemHeadline } from '../src/lib/content-calendar-artifact-link';
import { resolveIdeationHeadline } from '../src/lib/production-idea-parse';

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]!]) {
        process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* optional */ }
}
loadEnvLocal();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const workspaceId = arg('workspace') ?? process.env.WORKSPACE_ID ?? '';
const missionId = arg('mission') ?? process.env.MISSION_ID ?? '';
const progressPath = arg('progress-json') ?? '/tmp/mission-progress.json';
const planOnly = process.argv.includes('--plan-only');

async function fetchProgress(): Promise<Record<string, unknown>> {
  const internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
  const url = `http://127.0.0.1:8000/api/v1/missions/${workspaceId}/${missionId}/progress?include_payload=true`;
  const res = await fetch(url, {
    headers: {
      'X-Tenant-Id': workspaceId,
      'X-Internal-Api-Key': internalKey,
    },
  });
  if (!res.ok) throw new Error(`progress fetch ${res.status}: ${await res.text()}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function main() {
  if (!workspaceId || !missionId) {
    console.error('Usage: --workspace <uuid> --mission <uuid>');
    process.exit(1);
  }

  let progress: Record<string, unknown>;
  try {
    progress = JSON.parse(readFileSync(progressPath, 'utf8')) as Record<string, unknown>;
    console.log(`Loaded progress from ${progressPath}`);
  } catch {
    console.log('Fetching live mission progress from Python API…');
    progress = await fetchProgress();
  }

  const nodes = (progress.nodes ?? []) as Record<string, unknown>[];
  const ideationNode = nodes.find((n) => n.task_type === 'content_ideation');
  const calendarNode = nodes.find((n) => n.task_type === 'content_calendar');
  const ideas = (ideationNode?.output_payload ?? []) as Record<string, unknown>[];
  const calendarPlans = (calendarNode?.output_payload ?? []) as Record<string, unknown>[];

  console.log('\n=== Mission ===');
  console.log('title:', progress.title ?? progress.mission_id);
  console.log('status:', progress.status);
  console.log('ideation rows:', ideas.length);
  console.log('calendar plans:', calendarPlans.length);

  console.log('\n=== Calendar plans (all 5) ===');
  for (let i = 0; i < calendarPlans.length; i += 1) {
    const p = calendarPlans[i]!;
    console.log(
      `  [${i}] event=${JSON.stringify(calendarItemHeadline(p))} priority=${p.priority} format=${p.format} `
      + `announcement=${p.announcement_type}`,
    );
  }

  const { ideas: enriched, linkedPlanIndices, orphanCalendarIdeas } =
    applyCalendarProductionEnrichment(ideas, calendarPlans);

  console.log('\n=== Strict match results ===');
  console.log('linked plan indices:', [...linkedPlanIndices].sort((a, b) => a - b));
  console.log('orphan count:', orphanCalendarIdeas.length);
  for (const o of orphanCalendarIdeas) {
    console.log(
      `  orphan idx=${o.idea_index} headline=${String(o.headline ?? o.event_name ?? '').slice(0, 60)} `
      + `format=${o.format ?? o.content_type} priority=${o.calendar_priority ?? o.priority}`,
    );
  }

  console.log('\n=== Enriched ideation (linked rows) ===');
  for (let i = 0; i < enriched.length; i += 1) {
    const row = enriched[i]!;
    if (!row.calendar_enriched) continue;
    const brief = String(row.content_brief ?? '').slice(0, 72);
    console.log(
      `  ideation[${i}] ${resolveIdeationHeadline(row).slice(0, 42)} `
      + `← plan[${row.calendar_plan_index}] event=${String(row.event_name ?? '').slice(0, 36)} `
      + `brief=${brief}… mood=${String(row.photo_mood ?? '').slice(0, 40)}`,
    );
  }

  const merged = mergeCalendarPlansForProduction(ideas, calendarPlans, 'weekly_content');
  const donors = merged.filter(
    (r) => r.source_node === 'content_calendar' || r.calendar_enriched === true,
  );
  console.log('\n=== Merged pool (after format coverage) ===');
  console.log('total ideas in pool:', merged.length);
  console.log('calendar-touched rows:', donors.length);

  if (planOnly) return;

  const body = {
    workspaceId,
    missionId,
    ideas,
    calendarPlans,
    productionPackage: 'weekly_content',
    missionType: 'seasonal_campaign',
    missionTitle: String(progress.title ?? ''),
    brandName: 'Sarnıç Beach',
  };

  const origin = process.env.NEXTJS_INTERNAL_ORIGIN ?? 'http://127.0.0.1:3000';
  const tenantHeader = process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? workspaceId;
  console.log(`\n=== POST ${origin}/api/auto-produce/plan ===`);
  const planRes = await fetch(`${origin}/api/auto-produce/plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantHeader,
    },
    body: JSON.stringify(body),
  });
  const planJson = await planRes.json() as Record<string, unknown>;
  if (!planRes.ok) {
    console.error('plan failed', planRes.status, planJson);
    process.exit(1);
  }

  const slots = (planJson.slots ?? []) as Record<string, unknown>[];
  console.log('manifestMissionType:', planJson.manifestMissionType);
  console.log('packageSlug:', planJson.packageSlug);
  console.log('slotCount:', planJson.slotCount);

  const byFormat: Record<string, number> = {};
  for (const s of slots) {
    const f = String(s.format ?? '?');
    byFormat[f] = (byFormat[f] ?? 0) + 1;
  }
  console.log('slots by format:', byFormat);

  console.log('\n=== Sample slots (first 12) ===');
  for (const s of slots.slice(0, 12)) {
    console.log(
      `  idea=${s.ideaIndex} role=${s.slotRole} pipeline=${s.pipeline} format=${s.format}`,
    );
  }

  const calendarSlotIdeas = new Set(
    [...orphanCalendarIdeas, ...enriched.filter((r) => r.calendar_enriched)]
      .map((r) => r.idea_index)
      .filter((x): x is number => typeof x === 'number'),
  );
  const slotsFromCalendar = slots.filter((s) => calendarSlotIdeas.has(s.ideaIndex as number));
  console.log('\n=== Slots assigned to calendar-linked/orphan idea indices ===');
  console.log('count:', slotsFromCalendar.length);
  for (const s of slotsFromCalendar.slice(0, 10)) {
    console.log(`  idea=${s.ideaIndex} role=${s.slotRole} pipeline=${s.pipeline}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
