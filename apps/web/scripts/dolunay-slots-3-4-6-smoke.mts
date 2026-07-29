/**
 * Dolunay mission — produce 3 different remaining slots via production loop.
 * Default: ideas 3 (story), 4 (story), 6 (reel) — distinct from prior 0–2 posts.
 *
 *   cd apps/web && npx tsx --env-file=.env.local scripts/dolunay-slots-3-4-6-smoke.mts
 *   cd apps/web && npx tsx --env-file=.env.local scripts/dolunay-slots-3-4-6-smoke.mts --only=3,4
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { runProduction } from '../src/app/api/auto-produce/production-loop';

const WS = '4278d8e0-10b1-409d-a658-4101dcc22632';
const MISSION = '9966b17f-e628-45ee-8d53-6c90456c6282';
const LOCAL = (process.env.NEXTJS_INTERNAL_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const OUT = join(process.cwd(), '.preview-renders/dolunay-3-4-6-smoke');
const TMP = '/Users/melihtasoglan/Desktop/smart-agency/tmp';
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

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
  throw new Error(`Local Next not reachable at ${LOCAL}`);
}

function resolveHeadline(raw: Record<string, unknown>): string {
  return String(
    raw.headline
    || raw.concept_title
    || raw.idea_title
    || raw.event_name
    || '',
  ).trim();
}

function normalizeIdea(
  raw: Record<string, unknown>,
  index: number,
  job: JobRow,
  catalogOverride?: string | null,
): Record<string, unknown> {
  const caption = String(raw.caption_draft || raw.caption || '');
  const headline = resolveHeadline(raw);
  const catalog = catalogOverride || job.slot_key || null;
  const gallery = job.payload?.galleryPhotoUrl || null;
  const fmt = String(job.format || raw.format || raw.content_type || 'post').toLowerCase();
  const contentType = fmt === 'reel'
    ? 'reel'
    : fmt === 'story'
      ? 'story'
      : fmt === 'carousel'
        ? 'carousel'
        : 'post';
  return {
    ...raw,
    idea_index: index,
    headline: headline || String(job.payload?.catalogSlotLabel || `Idea ${index}`),
    content_type: contentType,
    format: contentType,
    caption: caption || headline,
    caption_draft: caption || headline,
    catalog_slot_key: catalog,
    selected_gallery_url: gallery,
    visual_production_spec: {
      ...((raw.visual_production_spec as Record<string, unknown>) || {}),
      selected_gallery_url: gallery,
      treatment: contentType === 'reel' ? 'reel_cover' : 'feed_text_overlay',
    },
  };
}

async function downloadMedia(imageUrl: string, dest: string): Promise<boolean> {
  try {
    const absolute = imageUrl.startsWith('/')
      ? `${LOCAL}${imageUrl}`
      : imageUrl.startsWith('http')
        ? imageUrl
        : null;
    if (!absolute) return false;
    const res = await fetch(absolute, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    return buf.length > 1000;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  process.env.NEXTJS_INTERNAL_URL = LOCAL;
  process.env.CREW_BACKEND_URL = process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000';

  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlyIndexes = onlyArg
    ? onlyArg.slice('--only='.length).split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
    : [3, 4, 6];

  console.log(`\n=== Dolunay slots ${onlyIndexes.join(',')} production ===`);
  console.log(`workspace=${WS}`);
  console.log(`mission=${MISSION}`);
  console.log(`local=${LOCAL}`);
  console.log(`image_provider=${process.env.SMART_AGENCY_IMAGE_PROVIDER ?? '(unset)'}`);

  await ensureLocalNext();

  const ideasRaw = psqlJson(
    `SELECT output_payload::text FROM mission_task_nodes `
    + `WHERE mission_id='${MISSION}' AND node_key='ideas' LIMIT 1`,
  ) as Record<string, unknown>[] | string;
  const ideasList = typeof ideasRaw === 'string' ? JSON.parse(ideasRaw) : ideasRaw;
  if (!Array.isArray(ideasList) || ideasList.length < 7) {
    throw new Error(`Expected ≥7 ideation ideas, got ${Array.isArray(ideasList) ? ideasList.length : typeof ideasList}`);
  }

  const jobs = psqlJson(
    `SELECT coalesce(json_agg(row_to_json(j) ORDER BY idea_index), '[]'::json)::text FROM (`
    + `SELECT idea_index, slot_role, format, pipeline, slot_key, library_slot_key, payload `
    + `FROM production_jobs WHERE mission_id='${MISSION}'`
    + `) j`,
  ) as JobRow[] | string;
  const jobList = (typeof jobs === 'string' ? JSON.parse(jobs) : jobs) as JobRow[];
  const jobByIndex = new Map(jobList.map((j) => [j.idea_index, j]));

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

  // Pass full idea set so backfill keys `${ideaIndex}:role` reconcile.
  const ideas = ideasList.map((raw, i) => {
    const job = jobByIndex.get(i);
    if (!job) {
      return normalizeIdea(raw as Record<string, unknown>, i, {
        idea_index: i,
        slot_role: 'fal_designed_post',
        format: 'post',
        pipeline: 'fal_design',
        slot_key: null,
        library_slot_key: null,
        payload: null,
      });
    }
    let catalog = job.slot_key;
    const fdKey = fdCatalogByIdea.get(i);
    // Cocktail craft reel matches Passion Fruit recipe better than aftermovie.
    if (i === 6 && fdKey?.includes('cocktail')) catalog = fdKey;
    return normalizeIdea(raw as Record<string, unknown>, i, job, catalog);
  });

  const backfillSlotKeys = onlyIndexes.map((i) => {
    const job = jobByIndex.get(i);
    if (!job) throw new Error(`No production_job for idea ${i}`);
    return `${i}:${job.slot_role}`;
  });

  const gallerySlotAssignments: Record<string, { url: string; score?: number | null }> = {};
  const catalogSlotBindings: Record<string, string> = {};

  for (const idea of ideas) {
    const i = Number(idea.idea_index);
    const job = jobByIndex.get(i);
    if (!job) continue;
    const role = job.slot_role;
    const catalog = String(idea.catalog_slot_key || job.slot_key || '');
    if (catalog) catalogSlotBindings[`${i}:${role}`] = catalog;
    const url = job.payload?.galleryPhotoUrl;
    if (url) {
      gallerySlotAssignments[`${i}::${role}`] = {
        url,
        score: job.payload?.galleryMatchScore ?? null,
      };
    }
  }

  for (let i = 0; i < ideas.length; i++) {
    const job = jobByIndex.get(i);
    if (!job) continue;
    const mark = onlyIndexes.includes(i) ? '▶' : '·';
    console.log(
      `  ${mark}[${i}] ${String(ideas[i]!.headline).slice(0, 48).padEnd(48)} `
      + `| ${job.format.padEnd(8)} ${job.slot_role.padEnd(22)} `
      + `| ${String(ideas[i]!.catalog_slot_key || '—')}`,
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
    nodeKey: 'dolunay_slots_3_4_6_produce',
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
    creativeBrief: String(mission?.creative_brief || 'Dolunay remaining slots produce'),
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
      videoUrl: r.videoUrl ?? meta.videoUrl,
      error: r.error,
      pipeline: meta.pipeline ?? meta.executed_pipeline,
      template: meta.brand_design_template_name,
      match: meta.brand_design_template_match_quality,
      catalogSlotKey: meta.catalog_slot_key,
      reference_photo_url: meta.reference_photo_url,
      fal_designer_produced: meta.fal_designer_produced,
      fal_video_produced: meta.fal_video_produced,
    };
  });

  const saved: Array<{ slotKey: unknown; local: string; url: string }> = [];
  for (const r of results) {
    const url = String(r.imageUrl || r.videoUrl || '');
    if (!url || !/\/api\/media\?|yulabodrum|\.jpg|\.webp|\.mp4|\.webm/i.test(url)) continue;
    const safe = String(r.slotKey || 'slot').replace(/[^a-z0-9:_-]/gi, '_');
    const ext = /\.mp4|\.webm/i.test(url) ? 'mp4' : 'jpg';
    const dest = join(TMP, `dolunay-${safe}.${ext}`);
    const ok = await downloadMedia(url.startsWith('http') || url.startsWith('/') ? url : '', dest);
    if (ok) {
      saved.push({ slotKey: r.slotKey, local: dest, url: url.startsWith('/') ? `${LOCAL}${url}` : url });
    }
  }

  const report = {
    httpStatus: res.status,
    elapsedSec: elapsed,
    produced: data.produced,
    reason: data.reason,
    error: data.error,
    backfillSlotKeys,
    catalogSlotBindings: Object.fromEntries(
      Object.entries(catalogSlotBindings).filter(([k]) => backfillSlotKeys.some((b) => k.startsWith(b.split(':')[0]!))),
    ),
    results,
    saved,
  };

  const outPath = join(OUT, `report-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${outPath}`);
  console.log(JSON.stringify(report, null, 2));

  const rendered = results.filter((r) => {
    const url = String(r.imageUrl || r.videoUrl || '');
    return /\/api\/media\?/.test(url) && !r.error;
  });
  // Persist errors like "fetch failed" still count if media URL exists (Nexus down).
  const mediaOk = results.filter((r) => /\/api\/media\?/.test(String(r.imageUrl || r.videoUrl || '')));
  const ok = res.status < 400 && mediaOk.length >= onlyIndexes.length;
  console.log(
    `\n── verdict: ${ok ? 'PASS' : 'FAIL'} `
    + `(media=${mediaOk.length}/${onlyIndexes.length}, clean=${rendered.length}, `
    + `nexus_produced=${data.produced ?? 0}) ──`,
  );
  for (const s of saved) {
    console.log(`  ${s.slotKey} → ${s.url}`);
    console.log(`           file://${s.local}`);
  }
  if (!ok) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
