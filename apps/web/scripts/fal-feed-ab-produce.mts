/**
 * A/B produce two fal grounded designs for one brief:
 *   A) CURRENT prompt (today's pipeline)
 *   B) PROPOSED prompt (simulation improvements)
 *
 * Usage:
 *   npx tsx scripts/fal-feed-ab-produce.mts
 *   npx tsx scripts/fal-feed-ab-produce.mts --skip-current   # only proposed
 *
 * Requires: Next.js on :3000, OPENAI_API_KEY in .env.local
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { generateDesignedPostImage } from '../src/app/api/auto-produce/handlers/image-generators';
import {
  simulateFalFeedProduction,
  YULA_CURRENT_BRAND_THEME,
  YULA_GALLERY_MATCH,
  YULA_NEW_CITRUS_CALENDAR_PLAN,
  YULA_PROPOSED_BRAND_THEME,
  YULA_TOKENS,
  YULA_VISUAL_DNA_SAMPLE,
} from '../src/lib/fal-production-simulation';

const YULA_WORKSPACE = '4278d8e0-10b1-409d-a658-4101dcc22632';

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

const skipCurrent = process.argv.includes('--skip-current');

const BASE = {
  calendarPlan: YULA_NEW_CITRUS_CALENDAR_PLAN,
  brandName: 'Yula Bodrum',
  sector: 'beach_club',
  visualDna: YULA_VISUAL_DNA_SAMPLE,
  tokens: YULA_TOKENS,
  galleryMatchScore: YULA_GALLERY_MATCH.score,
  galleryUrl: YULA_GALLERY_MATCH.url,
  brandReadinessScore: 85,
};

async function produceVariant(label: 'current' | 'proposed') {
  const plan = simulateFalFeedProduction(label, {
    ...BASE,
    brandTheme: label === 'current' ? YULA_CURRENT_BRAND_THEME : YULA_PROPOSED_BRAND_THEME,
  });

  console.log(`\n=== ${label.toUpperCase()} ===`);
  console.log(`vibe: ${plan.resolvedVibe} (${plan.vibeSource})`);
  console.log(`intensity: ${plan.intensity}`);
  console.log(`conflicts: ${plan.promptConflicts.length}`);
  console.log(`prompt chars: ${plan.promptLength}`);
  console.log('generating (GPT-image edit, ~30–90s)…');

  const imageUrl = await generateDesignedPostImage({
    workspaceId: YULA_WORKSPACE,
    designCardPrompt: plan.designCardPrompt,
    designCardMode: 'reel',
    headline: plan.headline,
    caption: String(YULA_NEW_CITRUS_CALENDAR_PLAN.content_brief ?? ''),
    referenceImageUrls: [YULA_GALLERY_MATCH.url],
    brandName: BASE.brandName,
    format: 'story',
    businessType: BASE.sector,
    location: 'Bodrum',
  });

  return { label, plan, imageUrl };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing — check apps/web/.env.local');
    process.exit(1);
  }

  console.log('Brief: New Citrus Cocktail Launch');
  console.log(`Gallery: ${YULA_GALLERY_MATCH.url}`);

  const results: Awaited<ReturnType<typeof produceVariant>>[] = [];

  if (!skipCurrent) {
    results.push(await produceVariant('current'));
  }
  results.push(await produceVariant('proposed'));

  const report = {
    brief: 'New Citrus Cocktail Launch',
    galleryUrl: YULA_GALLERY_MATCH.url,
    generatedAt: new Date().toISOString(),
    variants: results.map((r) => ({
      mode: r.label,
      imageUrl: r.imageUrl,
      resolvedVibe: r.plan.resolvedVibe,
      vibeSource: r.plan.vibeSource,
      intensity: r.plan.intensity,
      promptConflicts: r.plan.promptConflicts,
      promptLength: r.plan.promptLength,
    })),
  };

  const outPath = resolve(process.cwd(), '.preview-renders/fal-ab-new-citrus.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n# Sonuçlar\n');
  for (const r of results) {
    console.log(`## ${r.label}`);
    console.log(`- vibe: ${r.plan.resolvedVibe} (${r.plan.vibeSource})`);
    console.log(`- link: ${r.imageUrl ?? 'FAILED'}`);
    console.log('');
  }
  console.log(`Report: ${outPath}`);

  if (results.some((r) => !r.imageUrl)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
