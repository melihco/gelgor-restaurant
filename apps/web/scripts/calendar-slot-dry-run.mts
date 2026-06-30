/**
 * Dry-run a single content_calendar row: gallery match + grounded fal production.
 *
 * Usage:
 *   npx tsx scripts/calendar-slot-dry-run.mts \
 *     --workspace 4278d8e0-10b1-409d-a658-4101dcc22632 \
 *     --mission f59f0649-c1cd-4bcc-861a-65e1c094e95c
 */
import {
  buildCalendarProductionQueue,
  calendarGalleryMatchCaption,
  normalizeCalendarPlanToProductionIdea,
  CALENDAR_PRODUCTION_IDEA_INDEX_BASE,
} from '../src/lib/calendar-production-pack';
import { fetchProductionContext } from '../src/app/api/auto-produce/production-context';
import { fetchGalleryContext } from '../src/app/api/auto-produce/gallery-context';
import { pickGalleryPhotoForSlot, buildSlotGalleryMatchInput, slotFormatFromAssignment } from '../src/lib/gallery-first-production';
import { rankPhotosForContent, buildGalleryLookup } from '../src/lib/gallery-photo-matcher';
import { getNextjsInternalOrigin } from '../src/lib/runtime-config';
import type { ProductionBrandContextSnapshot } from '@smartagency/contracts';
import { runProduction } from '../src/app/api/auto-produce/production-loop';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

const YULA_WORKSPACE = '4278d8e0-10b1-409d-a658-4101dcc22632';

function loadBrandGalleryFromPostgres(workspaceId: string): { brandName: string; urls: string[] } | null {
  try {
    const out = execSync(
      `docker exec smart-agency-postgres-1 psql -U nexus -d nexus_db -t -A -c `
      + `"SELECT business_name, reference_image_urls FROM brand_contexts WHERE workspace_id = '${workspaceId}' LIMIT 1"`,
      { encoding: 'utf8' },
    ).trim();
    if (!out) return null;
    const pipe = out.indexOf('|');
    if (pipe < 0) return null;
    const brandName = out.slice(0, pipe).trim();
    const urls = (JSON.parse(out.slice(pipe + 1)) as string[])
      .filter((u) => /\/galeri\//i.test(u) && !/\/ikonlar\//i.test(u));
    return { brandName, urls: urls.filter(Boolean) };
  } catch {
    return null;
  }
}

async function pickBestPhotoWithGpt(
  urls: string[],
  brief: string,
): Promise<{ url: string; index: number } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || urls.length === 0) return null;
  const sample = urls.slice(0, 24);
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content:
        `You are a photo editor for a Bodrum restaurant/bar brand.\n`
        + `Brief: ${brief}\n\n`
        + `Pick the single best gallery photo INDEX (0-${sample.length - 1}) whose filename/path `
        + `most likely shows cocktails, bar scene, drinks, or vibrant bar atmosphere.\n`
        + `Avoid logo/icon paths.\n\n`
        + sample.map((u, i) => `${i}: ${u}`).join('\n')
        + `\n\nReply with ONLY the index number.`,
    }],
    max_tokens: 8,
    temperature: 0,
  });
  const idx = Number.parseInt(String(res.choices[0]?.message?.content ?? '').trim(), 10);
  if (!Number.isFinite(idx) || idx < 0 || idx >= sample.length) return null;
  return { url: sample[idx]!, index: idx };
}

function buildProductionSnapshot(
  workspaceId: string,
  brandName: string,
  urls: string[],
): ProductionBrandContextSnapshot {
  const now = new Date().toISOString();
  return {
    workspaceId,
    tenantId: workspaceId,
    brand: {
      workspaceId,
      tenantId: workspaceId,
      brandName,
      businessType: 'restaurant_bar',
      description: 'Yula Bodrum — Bodrum sahilinde restoran & bar.',
      location: 'Bodrum',
      languages: ['tr', 'en'],
      gallery: urls.map((url, i) => ({
        id: `gallery-${i}`,
        url,
        kind: 'gallery' as const,
        createdAt: now,
        updatedAt: now,
      })),
      themeAi: {
        aiPhotoEnhance: true,
        aiPhotoEnhanceLevel: 'moderate',
        aiEnhanceGallerySelected: true,
        aiUseBrandIdentity: true,
        aiBriefDrivesScene: true,
        aiEmbedLogo: false,
        aiEnhanceFormats: ['post', 'story'],
        aiVisualSubject: 'venue_ambiance',
        aiAdaptiveScene: true,
        aiAdaptiveSceneMode: 'auto',
      },
      source: 'merged',
      snapshotVersion: 1,
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

const CITRUS_PLAN = {
  announcement_type: 'product_reveal',
  event_name: 'New Citrus Cocktail Launch',
  tagline: 'Taste the essence of Bodrum',
  date: 'June 25, 2026',
  time: '5 PM',
  venue_area: '',
  template_use_case: 'announcement',
  format: 'story',
  content_brief:
    'Showcase our refreshing new citrus cocktail featuring local Bodrum mandarins. The visual should highlight the vibrant colors of the drink against a bar backdrop.',
  photo_mood: 'bright and inviting bar scene with a focus on the cocktail',
  priority: 'must_post',
};

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

function buildMinimalGalleryAnalysis(
  heroUrl: string,
  extraUrls: string[],
): Record<string, unknown> {
  const picks = [heroUrl, ...extraUrls.filter((u) => u !== heroUrl).slice(0, 2)];
  const meta = {
    description: 'Yula Bodrum bar scene with cocktails and vibrant drinks',
    tags: ['cocktail', 'bar', 'drinks', 'bodrum', 'citrus', 'restaurant'],
    mood: 'bright and inviting',
  };
  return Object.fromEntries(picks.map((url) => [url, { ...meta }]));
}

async function main() {
  const workspaceId = arg('workspace', YULA_WORKSPACE);
  const missionId = arg('mission', 'f59f0649-c1cd-4bcc-861a-65e1c094e95c');
  const planIndex = Number(arg('plan-index', '0'));
  const skipProduce = process.argv.includes('--match-only');

  const pgBrand = loadBrandGalleryFromPostgres(workspaceId);
  const productionSnapshot = pgBrand
    ? buildProductionSnapshot(workspaceId, pgBrand.brandName, pgBrand.urls)
    : null;

  const idea = normalizeCalendarPlanToProductionIdea(CITRUS_PLAN, planIndex);
  const queue = buildCalendarProductionQueue([idea]);
  const item = queue[0]!;
  const slotKey = `${item.ideaIndex}:${item.assignment.slot_role}`;

  console.log('\n=== Calendar idea ===');
  console.log(JSON.stringify({
    idea_index: idea.idea_index,
    headline: idea.headline,
    match_caption: calendarGalleryMatchCaption(idea),
    slot: slotKey,
    pipeline: item.assignment.pipeline,
  }, null, 2));

  const baseUrl = getNextjsInternalOrigin();
  const pctx = await fetchProductionContext(workspaceId, {
    baseUrl,
    brandName: pgBrand?.brandName,
    productionSnapshot: productionSnapshot ?? undefined,
  });
  if (!pctx) throw new Error('Production context unavailable');
  const refCount = Array.isArray(pctx.raw.reference_image_urls)
    ? pctx.raw.reference_image_urls.length
    : 0;
  console.log('\n=== Brand context ===');
  console.log(JSON.stringify({
    brandName: pctx.brandName,
    businessType: pctx.brandBusinessType,
    referencePhotoCount: refCount,
    website: pctx.raw.website_url,
  }, null, 2));

  const gctx = await fetchGalleryContext(
    workspaceId,
    {
      ...pctx.raw,
      business_name: pgBrand?.brandName ?? pctx.brandName,
      website_url: 'https://www.yulabodrum.com',
      reference_image_urls: pgBrand?.urls ?? pctx.raw.reference_image_urls,
    },
    null,
    pctx.brandBusinessType,
    { gisScore: null },
  );
  if (!gctx) throw new Error('Gallery context unavailable');

  console.log('\n=== Gallery pool ===');
  console.log(JSON.stringify({
    photoCount: gctx.photos.length,
    hasRealPhotos: gctx.hasRealPhotos,
    sampleUrls: gctx.photos.slice(0, 3),
  }, null, 2));

  const matchInput = buildSlotGalleryMatchInput({
    assignment: item.assignment,
    storyIndex: 0,
    brandName: pctx.brandName,
    brandDescription: String(pctx.raw.description ?? ''),
    businessType: pctx.brandBusinessType,
    ideationCaption: calendarGalleryMatchCaption(idea),
    ideationHeadline: String(idea.headline ?? ''),
  });
  const lookup = buildGalleryLookup(gctx.meta, gctx.photos);
  const ranked = rankPhotosForContent(matchInput, gctx.photos, lookup, new Set(), gctx.meta);
  console.log('\n=== Top gallery candidates ===');
  console.log(JSON.stringify(ranked.slice(0, 5).map((r) => ({
    score: r.score,
    url: r.url,
    reasons: r.reasons?.slice(0, 4),
  })), null, 2));

  let match = pickGalleryPhotoForSlot({
    assignment: item.assignment,
    storyIndex: 0,
    galleryPhotos: gctx.photos,
    galleryMeta: gctx.meta,
    excludeUrls: [],
    brandName: pctx.brandName,
    brandDescription: String(pctx.raw.description ?? ''),
    businessType: pctx.brandBusinessType,
    ideationCaption: calendarGalleryMatchCaption(idea),
    ideationHeadline: String(idea.headline ?? ''),
    slotBackfillPass: true,
  });

  if (!match && ranked[0]) {
    console.log('\n=== Semantic match weak — GPT index pick ===');
    const gptPick = await pickBestPhotoWithGpt(
      gctx.photos.filter((u) => !u.includes('/assets/')),
      calendarGalleryMatchCaption(idea),
    );
    if (gptPick) {
      match = {
        url: gptPick.url,
        score: ranked.find((r) => r.url === gptPick.url)?.score ?? 0,
        reason: 'gpt_filename_pick',
        confidence: 0.5,
      };
      console.log(JSON.stringify(gptPick, null, 2));
    }
  }

  console.log('\n=== Gallery match ===');
  if (!match) {
    console.log(JSON.stringify({ matched: false, reason: 'no photo above threshold' }, null, 2));
    if (skipProduce) return;
    throw new Error('No gallery photo matched — aborting production');
  }
  console.log(JSON.stringify({
    matched: true,
    score: match.score,
    url: match.url,
    reasons: match.reason,
    meta_description: gctx.meta[match.url]?.description?.slice(0, 120),
    meta_tags: gctx.meta[match.url]?.tags?.slice(0, 8),
  }, null, 2));

  if (skipProduce) return;

  const galleryAnalysisStub = buildMinimalGalleryAnalysis(
    match.url,
    gctx.photos.filter((u) => !u.includes('/assets/')),
  );

  if (match?.url) {
    idea.selected_gallery_url = match.url;
    const vps = (idea.visual_production_spec as Record<string, unknown>) ?? {};
    idea.visual_production_spec = { ...vps, selected_gallery_url: match.url };
  }

  console.log('\n=== Producing slot (may take 1–5 min) ===');

  const res = await runProduction({
    workspaceId,
    missionId,
    nodeKey: 'content_calendar_dry_run',
    ideas: [idea as Record<string, unknown>],
    visualDesignCards: [],
    galleryAnalysis: galleryAnalysisStub,
    brandNameOverride: pctx.brandName,
    productionSnapshot: productionSnapshot
      ? { ...productionSnapshot, galleryAnalysis: galleryAnalysisStub }
      : null,
    brandThemeOverride: pctx.brandTheme,
    bundleCards: false,
    feedDirectorReport: null,
    skipArtifactDedupe: true,
    slotBackfillPass: true,
    backfillSlotKeys: [slotKey],
  });

  const data = await res.json().catch(() => ({}));
  console.log(JSON.stringify({
    httpStatus: res.status,
    produced: data.produced,
    reason: data.reason,
    error: data.error,
    results: (data.results ?? []).map((r: Record<string, unknown>) => ({
      slotKey: r.slotKey,
      id: r.id,
      imageUrl: r.imageUrl,
      contentUrl: r.contentUrl,
      videoUrl: r.videoUrl,
      error: r.error,
      headline: r.headline,
    })),
  }, null, 2));

  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
