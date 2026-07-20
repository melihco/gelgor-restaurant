/**
 * Yula reel_cover recipe reseed + Sip into Summer force-reproduce smoke.
 *
 * 1) Seeds design_spec.reel_recipe on all active Yula reel_cover templates
 *    (recipe-only PATCH — no OpenAI thumbnail regen unless --full-regenerate).
 * 2) Force-reproduces Sip into Summer cocktail reel via runProduction.
 *
 * Prereqs:
 *   - Local Next :3000 (optional for media; produce runs in-process)
 *   - Local Crew :8000 pointed at prod/mirror DB with Yula templates
 *   - FAL_API_KEY + OPENAI_API_KEY in .env.local
 *
 * Run:
 *   cd apps/web && npx tsx --env-file=.env.local scripts/yula-reel-recipe-reseed-smoke.mts
 *   cd apps/web && npx tsx --env-file=.env.local scripts/yula-reel-recipe-reseed-smoke.mts --full-regenerate
 *   cd apps/web && npx tsx --env-file=.env.local scripts/yula-reel-recipe-reseed-smoke.mts --seed-only
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runProduction } from '../src/app/api/auto-produce/production-loop';
import {
  reelRecipeToJson,
  resolveEffectiveReelMotionMode,
  seedReelRecipeForTemplate,
} from '../src/lib/reel-production-recipe';
import { preferCoverCanvaForReelArchetype } from '../src/lib/reel-canva-archetypes';

const WS = 'd365f0e0-436e-402d-8f84-0c8fd7ab2022';
const MISSION = 'd17ce95c-8115-4f96-9ccd-d7fc177a747e';
const LOCAL = 'http://127.0.0.1:3000';
const CREW = (process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const OUT = join(process.cwd(), '.preview-renders/yula-reel-recipe-smoke');
mkdirSync(OUT, { recursive: true });

const FULL_REGEN = process.argv.includes('--full-regenerate');
const SEED_ONLY = process.argv.includes('--seed-only');

interface TemplateRow {
  id: string;
  template_name: string;
  template_type?: string;
  format: string;
  catalog_slot_key: string | null;
  thumbnail_url?: string | null;
  design_spec?: Record<string, unknown>;
}

function headers(key: string): Record<string, string> {
  return {
    'X-Internal-Api-Key': key,
    'X-Tenant-Id': WS,
    'X-Office-Id': '00000000-0000-0000-0000-000000000001',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function crewJson<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CREW}${path}`, {
    ...init,
    headers: { ...headers(key), ...(init?.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text.slice(0, 240)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function seedReelCovers(key: string): Promise<Array<Record<string, unknown>>> {
  const rows = await crewJson<TemplateRow[]>(`/api/v1/design-templates/${WS}`, key);
  const reels = rows.filter((r) => r.format === 'reel_cover');
  if (!reels.length) throw new Error('No reel_cover templates for Yula');

  const report: Array<Record<string, unknown>> = [];

  for (const row of reels) {
    const sd = { ...(row.design_spec ?? {}) };
    const canva = typeof sd.canvaArchetypeId === 'string' ? sd.canvaArchetypeId : null;
    const recipe = seedReelRecipeForTemplate({
      catalogSlotKey: row.catalog_slot_key,
      templateType: row.template_type ?? 'reel_cover',
      canvaArchetypeId: canva,
      sector: 'restaurant_cafe',
      headline: typeof sd.sampleHeadline === 'string' ? sd.sampleHeadline : row.template_name,
      caption: typeof sd.sampleSubtitle === 'string' ? sd.sampleSubtitle : null,
    });
    const recipeJson = reelRecipeToJson(recipe);
    const preferredCover = recipe.reelArchetypeId
      ? preferCoverCanvaForReelArchetype(
          recipe.reelArchetypeId as Parameters<typeof preferCoverCanvaForReelArchetype>[0],
          canva,
        )
      : canva ?? undefined;

    if (FULL_REGEN && row.catalog_slot_key) {
      console.log(`\n▶ full regenerate ${row.catalog_slot_key}`);
      const regen = await fetch(
        `${LOCAL}/api/brand-context/${WS}/design-templates/preview-slot`,
        {
          method: 'POST',
          headers: headers(key),
          body: JSON.stringify({
            catalog_slot_key: row.catalog_slot_key,
            mode: 'regenerate',
            persist: true,
            template_id: row.id,
          }),
        },
      );
      const body = await regen.json().catch(() => ({}));
      if (!regen.ok) {
        console.warn(`  regenerate failed ${regen.status}:`, JSON.stringify(body).slice(0, 200));
        // fall through to recipe-only patch
      } else {
        const seeded = Boolean(
          (body?.design_spec?.reel_recipe ?? body?.variants?.[0]?.design_spec?.reel_recipe),
        );
        report.push({
          id: row.id,
          slot: row.catalog_slot_key,
          mode: 'full_regenerate',
          recipe: recipeJson,
          motion: resolveEffectiveReelMotionMode(recipe),
          seededFromRegen: seeded,
        });
        console.log(`  ✓ regen persisted recipe=${seeded} arch=${recipe.reelArchetypeId}`);
        continue;
      }
    }

    const nextSpec = {
      ...sd,
      reel_recipe: recipeJson,
      ...(preferredCover && preferredCover !== canva
        ? {
            canvaArchetypeId: preferredCover,
            coverCanvaPreferred: preferredCover,
          }
        : {}),
      reelRecipeSeededAt: new Date().toISOString(),
    };

    await crewJson(`/api/v1/design-templates/${WS}/${row.id}`, key, {
      method: 'PATCH',
      body: JSON.stringify({ design_spec: nextSpec }),
    });

    report.push({
      id: row.id,
      slot: row.catalog_slot_key,
      name: row.template_name,
      mode: 'recipe_patch',
      arch: recipe.reelArchetypeId,
      cover: preferredCover ?? canva,
      motion: resolveEffectiveReelMotionMode(recipe),
      edit: recipe.editStyle,
      beats: recipe.beatCount,
      recipe: recipeJson,
    });
    console.log(
      `✓ seed ${row.catalog_slot_key} arch=${recipe.reelArchetypeId} `
      + `mode=${resolveEffectiveReelMotionMode(recipe)} edit=${recipe.editStyle}`,
    );
  }

  writeFileSync(join(OUT, 'reseed-report.json'), JSON.stringify({
    at: new Date().toISOString(),
    items: report,
  }, null, 2));
  return report;
}

async function verifyCocktailRecipe(key: string): Promise<Record<string, unknown>> {
  const rows = await crewJson<TemplateRow[]>(`/api/v1/design-templates/${WS}`, key);
  const cocktail = rows.find((r) => r.catalog_slot_key === 'restaurant_cafe_cocktail_bar_reel');
  if (!cocktail) throw new Error('cocktail reel template missing after seed');
  const recipe = cocktail.design_spec?.reel_recipe;
  if (!recipe || typeof recipe !== 'object') {
    throw new Error('cocktail reel_recipe still missing after seed');
  }
  console.log('\nverify cocktail recipe:', JSON.stringify(recipe, null, 2));
  return recipe as Record<string, unknown>;
}

async function forceReproduceSip(key: string): Promise<void> {
  // Warm local Next so /api/media works for any relative URLs.
  await fetch(LOCAL).catch(() => null);

  const idea: Record<string, unknown> = {
    idea_index: 6,
    headline: 'Sip into Summer',
    caption: 'Catch the essence of summer with our cocktail specials! Experience your favorites made fresh with Bodrum\'s best local ingredients.',
    cta: 'Experience refreshing cocktails',
    strategic_purpose: 'Experience refreshing cocktails',
    content_type: 'reel',
    format: 'reel',
    catalog_slot_key: 'restaurant_cafe_cocktail_bar_reel',
    selected_gallery_url: 'https://yulabodrum.com/galeri/4.webp',
    visual_production_spec: {
      selected_gallery_url: 'https://yulabodrum.com/galeri/4.webp',
      pipeline: 'fal_reel',
    },
    hashtags: ['#SummerCocktails', '#DrinkAndChill', '#YulaBodrum'],
  };

  const slotKey = '6:fal_reel_motion';
  console.log(`\n=== Force reproduce Sip into Summer (${slotKey}) ===`);
  const t0 = Date.now();

  const res = await runProduction({
    workspaceId: WS,
    missionId: MISSION,
    nodeKey: 'yula_reel_recipe_smoke',
    ideas: [idea],
    visualDesignCards: [],
    galleryAnalysis: null,
    brandNameOverride: 'Yula Bodrum',
    productionSnapshot: null,
    brandThemeOverride: null,
    bundleCards: false,
    feedDirectorReport: null,
    strategistMissionType: 'opportunity',
    productionPackage: 'opportunity',
    missionTitle: 'Güneş Batışı Sohbetleri: Yaz Akşamı Davetiyesi',
    creativeBrief: 'Sip into Summer cocktail reel smoke — recipe + photo_plate path',
    skipArtifactDedupe: true,
    slotBackfillPass: true,
    backfillSlotKeys: [slotKey, '6:organic_reel', '0:fal_reel_motion'],
    gallerySlotAssignments: {
      '6::fal_reel_motion': { url: 'https://yulabodrum.com/galeri/4.webp', score: 95 },
      '0::fal_reel_motion': { url: 'https://yulabodrum.com/galeri/4.webp', score: 95 },
    },
    catalogSlotBindings: {
      '6:fal_reel_motion': 'restaurant_cafe_cocktail_bar_reel',
      '0:fal_reel_motion': 'restaurant_cafe_cocktail_bar_reel',
    },
  });

  const data = await res.json().catch(() => ({})) as {
    produced?: number;
    reason?: string;
    error?: string;
    results?: Array<Record<string, unknown>>;
  };
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const summary = {
    httpStatus: res.status,
    elapsedSec: Number(elapsed),
    produced: data.produced,
    reason: data.reason,
    error: data.error,
    results: (data.results ?? []).map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        slotKey: r.slotKey,
        id: r.id,
        title: r.title ?? r.headline,
        imageUrl: r.imageUrl ?? r.contentUrl,
        videoUrl: r.videoUrl,
        error: r.error,
        pipeline: meta.pipeline,
        template: meta.brand_design_template_name,
        match: meta.brand_design_template_match_quality,
        stillFallback: meta.fal_reel_still_fallback,
        fallbackReason: meta.fal_reel_fallback_reason,
        reelRecipe: meta.reel_recipe,
        motionMode: meta.reel_motion_mode,
        i2vMotionType: meta.i2v_motion_type,
        falVideo: meta.fal_video_produced,
      };
    }),
  };

  writeFileSync(join(OUT, 'produce-report.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  if (!res.ok) throw new Error(`produce failed status=${res.status}`);
  const hit = summary.results.find((r) => Boolean(r.videoUrl) && r.falVideo)
    ?? summary.results.find((r) => !r.error)
    ?? summary.results[0];
  if (!hit) throw new Error('no produce results');
  const videoOk = Boolean(hit.videoUrl) && hit.falVideo === true && hit.stillFallback !== true;
  // Nexus artifact persist can fail locally ("fetch failed") even when fal video succeeded.
  if (hit.error && !videoOk) throw new Error(`slot error: ${hit.error}`);
  if (hit.error && videoOk) {
    console.warn(`WARN: artifact persist failed (${hit.error}) but playable video exists`);
  }
  if (!hit.reelRecipe) {
    console.warn('WARN: reel_recipe missing on artifact meta — template match may have missed');
  }
  console.log(`\n== SMOKE DONE ${elapsed}s ==`);
  console.log(`still=${hit.imageUrl}`);
  console.log(`video=${hit.videoUrl ?? '(none)'}`);
  console.log(`motion=${hit.motionMode} i2v=${hit.i2vMotionType} fallback=${hit.stillFallback}`);
}

async function main() {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error('INTERNAL_API_KEY missing');
  if (!process.env.FAL_API_KEY && !SEED_ONLY) {
    throw new Error('FAL_API_KEY missing');
  }

  const health = await fetch(`${CREW}/health`).catch(() => null);
  if (!health?.ok) throw new Error(`Crew not healthy at ${CREW}`);

  console.log('== 1) Seed Yula reel_cover recipes ==');
  await seedReelCovers(key);
  await verifyCocktailRecipe(key);

  if (SEED_ONLY) {
    console.log('\n--seed-only: skip produce');
    return;
  }

  console.log('\n== 2) Force reproduce Sip into Summer ==');
  await forceReproduceSip(key);
  console.log(`\nReports: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
