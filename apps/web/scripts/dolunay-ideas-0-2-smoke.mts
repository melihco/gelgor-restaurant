/**
 * Dolunay Temalı Gece Etkinliği — ideas 0–2 auto-produce smoke via production loop.
 *
 * Uses persisted factory catalog pins + gallery picks; re-runs fal_designed_post slots.
 *
 *   cd apps/web && npx tsx --env-file=.env.local scripts/dolunay-ideas-0-2-smoke.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { runProduction } from '../src/app/api/auto-produce/production-loop';

const WS = '4278d8e0-10b1-409d-a658-4101dcc22632';
const MISSION = '9966b17f-e628-45ee-8d53-6c90456c6282';
const LOCAL = (process.env.NEXTJS_INTERNAL_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const OUT = join(process.cwd(), '.preview-renders/dolunay-0-2-smoke');
mkdirSync(OUT, { recursive: true });

type JobRow = {
  idea_index: number;
  slot_role: string;
  format: string;
  pipeline: string;
  slot_key: string | null;
  library_slot_key: string | null;
  payload: {
    galleryPhotoUrl?: string;
    catalogSlotLabel?: string;
    galleryMatchScore?: number;
  } | null;
};

function psqlJson(sql: string): unknown {
  const out = execSync(
    `docker exec smart-agency-postgres-1 psql -U nexus -d nexus_db -t -A -c ${JSON.stringify(sql)}`,
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  ).trim();
  if (!out) return null;
  return JSON.parse(out);
}

async function ensureLocalNext(): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const root = await fetch(LOCAL, { signal: AbortSignal.timeout(4_000) });
      if (root.status > 0) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Local Next not reachable at ${LOCAL}. Start with: cd apps/web && npm run dev`);
}

function normalizeIdea(raw: Record<string, unknown>, index: number, job: JobRow): Record<string, unknown> {
  const caption = String(raw.caption_draft || raw.caption || '');
  const catalog = job.slot_key || null;
  const gallery = job.payload?.galleryPhotoUrl || null;
  return {
    ...raw,
    idea_index: index,
    content_type: raw.content_type || 'post',
    format: 'post',
    caption: caption || String(raw.headline || ''),
    caption_draft: caption || String(raw.caption_draft || ''),
    catalog_slot_key: catalog,
    selected_gallery_url: gallery,
    visual_production_spec: {
      ...((raw.visual_production_spec as Record<string, unknown>) || {}),
      selected_gallery_url: gallery,
      treatment: 'feed_text_overlay',
    },
  };
}

async function main(): Promise<void> {
  process.env.NEXTJS_INTERNAL_URL = LOCAL;
  process.env.CREW_BACKEND_URL = process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000';

  console.log(`\n=== Dolunay ideas 0–2 smoke ===`);
  console.log(`workspace=${WS}`);
  console.log(`mission=${MISSION}`);
  console.log(`local=${LOCAL}`);
  console.log(`image_provider=${process.env.SMART_AGENCY_IMAGE_PROVIDER ?? '(unset)'}`);
  console.log(`prefer_fal=${process.env.PREFER_FAL_DESIGNED_POSTS ?? '(unset)'}`);

  await ensureLocalNext();

  const ideasRaw = psqlJson(
    `SELECT output_payload::text FROM mission_task_nodes `
    + `WHERE mission_id='${MISSION}' AND node_key='ideas' LIMIT 1`,
  ) as Record<string, unknown>[] | string;
  const ideasList = typeof ideasRaw === 'string' ? JSON.parse(ideasRaw) : ideasRaw;
  if (!Array.isArray(ideasList) || ideasList.length < 3) {
    throw new Error(`Expected ≥3 ideation ideas, got ${Array.isArray(ideasList) ? ideasList.length : typeof ideasList}`);
  }

  const jobs = psqlJson(
    `SELECT coalesce(json_agg(row_to_json(j) ORDER BY idea_index), '[]'::json)::text FROM (`
    + `SELECT idea_index, slot_role, format, pipeline, slot_key, library_slot_key, payload `
    + `FROM production_jobs WHERE mission_id='${MISSION}' AND idea_index < 3`
    + `) j`,
  ) as JobRow[] | string;
  const jobList = (typeof jobs === 'string' ? JSON.parse(jobs) : jobs) as JobRow[];
  if (jobList.length < 3) throw new Error(`Expected 3 jobs, got ${jobList.length}`);

  // FD catalog pins are preferred when factory slot_key points at off-season holiday shells.
  const fdRaw = psqlJson(
    `SELECT output_payload::text FROM mission_task_nodes `
    + `WHERE mission_id='${MISSION}' AND node_key='feed_cohesion_review' LIMIT 1`,
  ) as Record<string, unknown> | string;
  const fd = (typeof fdRaw === 'string' ? JSON.parse(fdRaw) : fdRaw) as {
    production_assignments?: Array<{ idea_index?: number; catalog_slot_key?: string }>;
  };
  const fdCatalogByIdea = new Map<number, string>();
  for (const a of fd.production_assignments ?? []) {
    const idx = Number(a.idea_index);
    const key = String(a.catalog_slot_key || '').trim();
    if (Number.isFinite(idx) && key) fdCatalogByIdea.set(idx, key);
  }

  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlyIndexes = onlyArg
    ? onlyArg.slice('--only='.length).split(',').map((s) => Number(s.trim())).filter((n) => n >= 0 && n <= 2)
    : [0, 1, 2];

  // Always pass ideas 0–2 so backfill keys `${ideaIndex}:role` reconcile against the queue.
  const ideas = [0, 1, 2].map((i) => {
    const job = { ...jobList[i]! };
    const fdKey = fdCatalogByIdea.get(i);
    // Prefer non-holiday FD pin when factory key is a special-day shell.
    if (fdKey && (job.slot_key?.includes('live_music') || job.slot_key?.includes('private_event'))) {
      if (fdKey.includes('cocktail') || fdKey.includes('dj_night') || fdKey.includes('guest_social')) {
        job.slot_key = fdKey;
      }
    }
    if (i === 2 && fdKey?.includes('cocktail')) job.slot_key = fdKey;
    return normalizeIdea(ideasList[i] as Record<string, unknown>, i, job);
  });

  const backfillSlotKeys = onlyIndexes.map((i) => `${i}:${jobList[i]!.slot_role}`);
  const gallerySlotAssignments: Record<string, { url: string; score?: number | null }> = {};
  const catalogSlotBindings: Record<string, string> = {};

  for (let i = 0; i < 3; i++) {
    const job = jobList[i]!;
    const role = job.slot_role;
    const catalog = String(ideas[i]!.catalog_slot_key || job.slot_key || '');
    if (catalog) catalogSlotBindings[`${i}:${role}`] = catalog;
    const url = job.payload?.galleryPhotoUrl;
    if (url) {
      gallerySlotAssignments[`${i}::${role}`] = {
        url,
        score: job.payload?.galleryMatchScore ?? null,
      };
    }
    const mark = onlyIndexes.includes(i) ? '▶' : '·';
    console.log(
      `  ${mark}[${i}] ${String(ideas[i]!.headline).slice(0, 56)} `
      + `| slot=${catalog || '—'} `
      + `| gallery=${url ? url.split('/').slice(-2).join('/') : 'none'}`,
    );
  }

  const missionMeta = psqlJson(
    `SELECT row_to_json(m)::text FROM (`
    + `SELECT title, type, creative_brief FROM missions WHERE id='${MISSION}'`
    + `) m`,
  ) as { title?: string; type?: string; creative_brief?: string } | string;
  const mission = typeof missionMeta === 'string' ? JSON.parse(missionMeta) : missionMeta;

  const t0 = Date.now();
  console.log(`\n--- runProduction backfill ${backfillSlotKeys.join(', ')} ---\n`);

  const res = await runProduction({
    workspaceId: WS,
    missionId: MISSION,
    nodeKey: 'dolunay_ideas_0_2_smoke',
    ideas: ideas as never,
    visualDesignCards: [],
    galleryAnalysis: null,
    brandNameOverride: 'Yula Bodrum',
    productionSnapshot: null,
    brandThemeOverride: null,
    bundleCards: false,
    feedDirectorReport: null,
    strategistMissionType: String(mission?.type || 'opportunity'),
    productionPackage: 'opportunity',
    missionTitle: String(mission?.title || 'Dolunay Temalı Gece Etkinliği'),
    creativeBrief: String(mission?.creative_brief || 'Dolunay ideas 0–2 smoke'),
    skipArtifactDedupe: true,
    slotBackfillPass: true,
    backfillSlotKeys,
    gallerySlotAssignments,
    catalogSlotBindings,
  });

  const data = await res.json().catch(() => ({})) as {
    produced?: number;
    reason?: string;
    error?: string;
    results?: Array<Record<string, unknown>>;
  };
  const elapsed = Number(((Date.now() - t0) / 1000).toFixed(1));

  const results = (data.results ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      slotKey: r.slotKey,
      id: r.id,
      title: r.title ?? r.headline,
      imageUrl: r.imageUrl ?? r.contentUrl ?? meta.imageUrl,
      error: r.error,
      pipeline: meta.pipeline ?? meta.executed_pipeline,
      template: meta.brand_design_template_name,
      match: meta.brand_design_template_match_quality,
      catalogSlotKey: meta.catalog_slot_key,
      reference_photo_url: meta.reference_photo_url,
      fal_designer_produced: meta.fal_designer_produced,
    };
  });

  const report = {
    httpStatus: res.status,
    elapsedSec: elapsed,
    produced: data.produced,
    reason: data.reason,
    error: data.error,
    backfillSlotKeys,
    catalogSlotBindings,
    gallerySlotAssignments,
    results,
  };

  const outPath = join(OUT, `report-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${outPath}`);
  console.log(JSON.stringify(report, null, 2));

  // Nexus may be down locally — count designer-rendered /api/media URLs as success.
  const rendered = results.filter((r) => {
    const url = String(r.imageUrl || '');
    return Boolean(r.fal_designer_produced) && /\/api\/media\?/.test(url);
  });
  const ok = res.status < 400 && rendered.length === backfillSlotKeys.length;
  console.log(
    `\n── verdict: ${ok ? 'PASS' : 'FAIL'} `
    + `(rendered=${rendered.length}/${backfillSlotKeys.length}, `
    + `nexus_produced=${data.produced ?? 0}) ──`,
  );
  if (!ok) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
