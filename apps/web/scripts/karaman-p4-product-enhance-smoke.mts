/**
 * P4 — Karaman product_shop photographer staging smoke.
 *
 * Validates local P1–P3 code against live Karaman theme + gallery:
 *   gallery_enhanced + product_hero + full → designed/fal BG enhance
 *
 * Prereqs:
 *   - Local Next on :3000 (enhance-product-photo + fal routes)
 *   - OPENAI_API_KEY + FAL_API_KEY in .env.local
 *   - INTERNAL_API_KEY (fetch theme/gallery from prod web)
 *
 * Run:
 *   cd apps/web && npx tsx --env-file=.env.local scripts/karaman-p4-product-enhance-smoke.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runProduction } from '../src/app/api/auto-produce/production-loop';

const WS = process.env.KARAMAN_WORKSPACE_ID ?? '327db521-ede2-48e0-8f06-4146ee458c50';
const PROD_WEB = (process.env.PROD_WEB_URL ?? 'https://smartagency-web.onrender.com').replace(/\/$/, '');
const LOCAL = (process.env.NEXTJS_INTERNAL_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY ?? '';
const OUT = join(process.cwd(), '.preview-renders/karaman-p4-smoke');
mkdirSync(OUT, { recursive: true });

const FIG_JAM =
  'https://karamandatca.com.tr/wp-content/uploads/2026/03/WhatsApp-Image-2025-10-26-at-13.39.07-7.jpeg';

function headers(): Record<string, string> {
  return {
    'X-Internal-Api-Key': KEY,
    'X-Tenant-Id': WS,
    'X-Office-Id': '00000000-0000-0000-0000-000000000001',
    Accept: 'application/json',
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} → ${res.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function ensureLocalNext(): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const root = await fetch(LOCAL, { signal: AbortSignal.timeout(4_000) });
      // Any HTTP response (incl. 404/500) means the server accepted the connection.
      if (root.status > 0) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(
    `Local Next not reachable at ${LOCAL}. Start with: cd apps/web && npm run dev`,
  );
}

async function main(): Promise<void> {
  if (!KEY) throw new Error('INTERNAL_API_KEY required');
  process.env.NEXTJS_INTERNAL_URL = LOCAL;
  process.env.CREW_BACKEND_URL = process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000';

  await ensureLocalNext();
  console.log(`local=${LOCAL} prod=${PROD_WEB} workspace=${WS}`);

  const [themePayload, gallery, snapshot] = await Promise.all([
    fetchJson<{ theme?: Record<string, unknown> | null }>(`${PROD_WEB}/api/brand-context/${WS}/theme`),
    fetchJson<Record<string, Record<string, unknown>>>(`${PROD_WEB}/api/brand-context/${WS}/gallery-analysis`),
    fetchJson<Record<string, unknown>>(`${PROD_WEB}/api/production-context/${WS}/snapshot`),
  ]);

  const theme = themePayload.theme ?? {};
  const photos = Object.keys(gallery);
  console.log(
    `theme: mode=${theme.visual_source_mode ?? theme.visualSourceMode} `
    + `enhance=${theme.ai_photo_enhance ?? theme.aiPhotoEnhance} `
    + `level=${theme.ai_photo_enhance_level ?? theme.aiPhotoEnhanceLevel} `
    + `subject=${theme.ai_visual_subject ?? theme.aiVisualSubject} `
    + `adaptive=${theme.ai_adaptive_scene_mode ?? theme.aiAdaptiveSceneMode}`,
  );
  console.log(`gallery: ${photos.length} analyzed photos`);

  const sourceUrl = photos.includes(FIG_JAM) ? FIG_JAM : photos[0];
  if (!sourceUrl) throw new Error('No gallery photos for Karaman');
  const sourceMeta = gallery[sourceUrl] ?? {};
  console.log(`source photo: ${sourceUrl.slice(0, 90)}`);
  console.log(`  subject=${sourceMeta.primarySubject ?? '?'} tags=${(sourceMeta.contentTags as string[] | undefined)?.slice(0, 6)}`);

  const idea: Record<string, unknown> = {
    idea_index: 0,
    headline: 'İncir Reçeli',
    caption:
      'Datça’nın güneşinde olgunlaşmış incirlerden hazırlanan reçelimiz. '
      + 'Kahvaltı sofrasına doğal tat — Karaman Datça imzası.',
    cta: 'Sipariş ver',
    strategic_purpose: 'Ürün hero — incir reçeli kavanozunu lifestyle sahnede öne çıkar',
    visual_direction:
      'Hero product still-life: fig jam jar sharp and true to packaging, warm Aegean table, soft window light',
    mood: 'warm artisan',
    content_type: 'post',
    format: 'post',
    subject_key: 'fig_jam',
    product_type: 'fig jam',
    catalog_slot_key: 'local_products_product_reveal_post',
    selected_gallery_url: sourceUrl,
    visual_production_spec: {
      selected_gallery_url: sourceUrl,
      treatment: 'feed_text_overlay',
      image_edit_prompt: 'Stage fig jam jar on warm lifestyle surface; preserve packaging label',
    },
    hashtags: ['#KaramanDatça', '#İncirReçeli', '#YerelLezzet'],
  };

  const slotKey = '0:fal_designed_post';
  const missionId = `p4-karaman-smoke-${Date.now()}`;
  console.log(`\n=== Force produce ${slotKey} mission=${missionId} ===`);
  const t0 = Date.now();

  const enrichedSnapshot = {
    ...snapshot,
    galleryAnalysis: gallery,
  };

  const res = await runProduction({
    workspaceId: WS,
    missionId,
    nodeKey: 'p4_karaman_product_enhance_smoke',
    ideas: [idea as never],
    visualDesignCards: [],
    galleryAnalysis: gallery,
    brandNameOverride: 'Karaman Datça',
    productionSnapshot: enrichedSnapshot as never,
    brandThemeOverride: theme,
    bundleCards: false,
    feedDirectorReport: null,
    strategistMissionType: 'opportunity',
    productionPackage: 'opportunity',
    missionTitle: 'P4 Karaman product enhance smoke',
    creativeBrief: 'Fig jam product hero — gallery_enhanced full staging',
    skipArtifactDedupe: true,
    slotBackfillPass: true,
    backfillSlotKeys: [slotKey, '0:designed_post', '0:designed_typography'],
    gallerySlotAssignments: {
      '0::fal_designed_post': { url: sourceUrl, score: 88 },
      '0::designed_post': { url: sourceUrl, score: 88 },
    },
    catalogSlotBindings: {
      '0:fal_designed_post': 'local_products_product_reveal_post',
      '0:designed_post': 'local_products_product_reveal_post',
    },
  });

  const data = await res.json().catch(() => ({})) as {
    produced?: number;
    reason?: string;
    error?: string;
    results?: Array<Record<string, unknown>>;
  };
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const results = (data.results ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      slotKey: r.slotKey,
      id: r.id,
      title: r.title ?? r.headline,
      imageUrl: r.imageUrl ?? r.contentUrl ?? meta.imageUrl,
      reference_photo_url: meta.reference_photo_url,
      enhanced_photo_url: meta.enhanced_photo_url,
      selected_gallery_url: meta.selected_gallery_url,
      ai_gallery_enhanced: meta.ai_gallery_enhanced,
      ai_enhance_attempted: meta.ai_enhance_attempted,
      ai_enhance_failed: meta.ai_enhance_failed,
      ai_enhance_skip_reason: meta.ai_enhance_skip_reason,
      ai_visual_subject_resolved: meta.ai_visual_subject_resolved,
      visual_source_mode: meta.visual_source_mode,
      ai_enhance_level: meta.ai_enhance_level,
      pipeline: meta.pipeline ?? meta.executed_pipeline,
      fal_designer_produced: meta.fal_designer_produced,
      visual_pipeline_steps: meta.visual_pipeline_steps,
    };
  });

  const report = {
    httpStatus: res.status,
    elapsedSec: Number(elapsed),
    produced: data.produced,
    reason: data.reason,
    error: data.error,
    sourceUrl,
    sourceSubject: sourceMeta.primarySubject ?? null,
    theme: {
      visual_source_mode: theme.visual_source_mode ?? theme.visualSourceMode,
      ai_photo_enhance: theme.ai_photo_enhance ?? theme.aiPhotoEnhance,
      ai_photo_enhance_level: theme.ai_photo_enhance_level ?? theme.aiPhotoEnhanceLevel,
      ai_visual_subject: theme.ai_visual_subject ?? theme.aiVisualSubject,
    },
    results,
  };

  const outPath = join(OUT, `report-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${outPath}`);
  console.log(JSON.stringify(report, null, 2));

  const row = results[0];
  const enhanced = Boolean(row?.ai_gallery_enhanced);
  const subjectOk = row?.ai_visual_subject_resolved === 'product_hero'
    || report.theme.ai_visual_subject === 'product_hero';
  const modeOk = report.theme.visual_source_mode === 'gallery_enhanced'
    || report.theme.ai_photo_enhance === true;
  const hasOutput = Boolean(row?.imageUrl);

  console.log('\n── P4 verdict ──');
  console.log(`  theme gallery_enhanced: ${modeOk ? '✓' : '✗'}`);
  console.log(`  subject product_hero:   ${subjectOk ? '✓' : '✗'} (${row?.ai_visual_subject_resolved})`);
  console.log(`  ai_gallery_enhanced:    ${enhanced ? '✓' : '✗'} skip=${row?.ai_enhance_skip_reason ?? '—'}`);
  console.log(`  output image:           ${hasOutput ? '✓' : '✗'}`);

  if (!modeOk || !hasOutput) {
    process.exit(2);
  }
  if (!enhanced) {
    console.warn(
      '⚠ Enhance did not apply — check skip reason / OpenAI. '
      + 'Theme is correct; P1 path may have skipped (designed_grade) or API failed.',
    );
    process.exit(3);
  }
  console.log('\n✓ PASS — Karaman product BG enhance applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
