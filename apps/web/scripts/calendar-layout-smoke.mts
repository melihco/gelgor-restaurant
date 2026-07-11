#!/usr/bin/env npx tsx
/**
 * S3 calendar layout smoke — generates story images for announcement types
 * with S3 archetype routing vs legacy split_feature_panel.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/calendar-layout-smoke.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { generateDesignedPostImage } from '../src/app/api/auto-produce/handlers/image-generators';
import {
  normalizeCalendarPlanToProductionIdea,
  resolveCalendarSlotDesignIntensity,
} from '../src/lib/calendar-production-pack';
import {
  readExplicitCalendarDesignLayoutFamily,
  resolveCalendarDesignLayout,
  type CalendarDesignLayoutFamily,
} from '../src/lib/calendar-design-layout';
import { resolveFalDesignPromptContext } from '../src/lib/fal-design-brief';
import { distillBrandSoul, resolveFalBrandInput } from '../src/lib/fal-brand-input';
import { buildDesignedVideoReelDesignCardPrompt } from '../src/lib/fal-designer-production';
import {
  YULA_GALLERY_MATCH,
  YULA_NEW_CITRUS_CALENDAR_PLAN,
  YULA_PROPOSED_BRAND_THEME,
  YULA_TOKENS,
  YULA_VISUAL_DNA_SAMPLE,
} from '../src/lib/fal-production-simulation';

const WORKSPACE_ID = '4278d8e0-10b1-409d-a658-4101dcc22632';
const SECTOR = 'beach_club';
const BRAND_NAME = 'Yula Bodrum';
const OUT_DIR = resolve(process.cwd(), '.preview-renders/calendar-layout-smoke');

function loadEnvLocal(): void {
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
if (!process.env.NEXTJS_INTERNAL_URL) process.env.NEXTJS_INTERNAL_URL = 'http://localhost:3000';
if (!process.env.NEXT_PUBLIC_SITE_URL) process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

const SMOKE_CASES = [
  {
    id: 'event_s3',
    label: 'Event teaser (S3 → neon_night_promo)',
    plan: {
      event_name: 'Summer DJ Night at Yula',
      tagline: 'Saturday 9PM — beach deck',
      content_brief: 'Live DJ set on the beach deck. Reserve your table for an unforgettable night.',
      photo_mood: 'nightlife beach club crowd energy',
      format: 'story',
      announcement_type: 'event_teaser',
      date: 'July 18, 2026',
      time: '9 PM',
    },
    useS3: true,
  },
  {
    id: 'event_legacy',
    label: 'Event teaser (legacy → split_feature_panel)',
    plan: {
      event_name: 'Summer DJ Night at Yula',
      tagline: 'Saturday 9PM — beach deck',
      content_brief: 'Live DJ set on the beach deck. Reserve your table for an unforgettable night.',
      photo_mood: 'nightlife beach club crowd energy',
      format: 'story',
      announcement_type: 'event_teaser',
      date: 'July 18, 2026',
      time: '9 PM',
    },
    useS3: false,
    legacyArchetype: 'split_feature_panel' as CalendarDesignLayoutFamily,
  },
  {
    id: 'offer_s3',
    label: 'Offer campaign (S3 → diagonal_brand_split story)',
    plan: {
      event_name: 'Happy Hour — 2 for 1 Cocktails',
      tagline: 'Every Friday 6–8 PM',
      content_brief: 'Buy one cocktail, get the second free. Limited time offer at the bar.',
      photo_mood: 'vibrant bar scene with cocktails',
      format: 'story',
      announcement_type: 'offer_campaign',
    },
    useS3: true,
  },
  {
    id: 'product_s3',
    label: 'Product reveal (S3 → cinematic_full_bleed)',
    plan: YULA_NEW_CITRUS_CALENDAR_PLAN,
    useS3: true,
  },
] as const;

function buildPrompt(plan: Record<string, unknown>, options: {
  useS3: boolean;
  legacyArchetype?: CalendarDesignLayoutFamily;
}): { prompt: string; archetype: string; intensity: string; headline: string } {
  const idea = normalizeCalendarPlanToProductionIdea(plan, 0);
  const headline = String(idea.headline ?? '');
  const caption = String(idea.caption_draft ?? idea.caption ?? '');
  const announcement = String(idea.calendar_announcement_type ?? '');

  const layout = options.useS3
    ? resolveCalendarDesignLayout({
      announcementType: announcement,
      channel: 'story',
      sector: SECTOR,
      explicitLayoutFamily: readExplicitCalendarDesignLayoutFamily(idea),
    })
    : {
      canvaArchetypeId: options.legacyArchetype ?? 'split_feature_panel',
      layoutFamilyHint: 'split_panel' as const,
      source: 'legacy_smoke',
    };

  const intensityBundle = resolveCalendarSlotDesignIntensity(idea, YULA_PROPOSED_BRAND_THEME, 'story');
  const falCtx = resolveFalDesignPromptContext({
    caption,
    headline,
    format: 'story',
    slotRole: 'fal_designed_post',
    layoutFamilyHint: layout.layoutFamilyHint,
    explicitCanvaArchetypeId: layout.canvaArchetypeId,
    falDesignHint: `layout:${layout.canvaArchetypeId}`,
    sector: SECTOR,
    templateUseCase: announcement,
  });

  const visualDnaTone = distillBrandSoul({
    visualDna: YULA_VISUAL_DNA_SAMPLE,
    brandTone: 'warm, inviting, coastal',
    brandDescription: 'Beach club in Bodrum',
  });
  const falBrand = resolveFalBrandInput({
    brandTheme: YULA_PROPOSED_BRAND_THEME,
    tokens: YULA_TOKENS,
    sector: SECTOR,
    caption,
    headline,
    visualDna: YULA_VISUAL_DNA_SAMPLE,
    brandTone: 'warm, inviting, coastal',
    brandDescription: 'Beach club in Bodrum',
    postMood: String(idea.photo_mood ?? ''),
    format: 'story',
    designBriefDirectives: falCtx.promptDirectives,
    referencePhotoUrl: YULA_GALLERY_MATCH.url,
  });

  const prompt = buildDesignedVideoReelDesignCardPrompt({
    vibe: falBrand.vibe,
    headline,
    subtitle: String(plan.tagline ?? ''),
    caption,
    sceneHint: String(idea.photo_mood ?? ''),
    brandColors: { primary: YULA_TOKENS.primaryColor, accent: YULA_TOKENS.accentColor },
    brandName: BRAND_NAME,
    sector: SECTOR,
    aspectRatio: '9:16',
    visualDnaTone: visualDnaTone ?? falBrand.visualDnaTone,
    designIntensityLevel: intensityBundle.level,
    brandDirectives: falCtx.promptDirectives,
    logoUrl: YULA_TOKENS.announcementKit.logoUrl ?? undefined,
  });

  return {
    prompt,
    archetype: layout.canvaArchetypeId,
    intensity: intensityBundle.level,
    headline,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing — set in apps/web/.env.local');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Gallery ref: ${YULA_GALLERY_MATCH.url}`);
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',') ?? null;
  const cases = only
    ? SMOKE_CASES.filter((c) => only.includes(c.id))
    : SMOKE_CASES;
  console.log(`Generating ${cases.length} story variants…\n`);

  const results: Array<{
    id: string;
    label: string;
    archetype: string;
    intensity: string;
    imageUrl: string | null;
  }> = [];

  for (const testCase of cases) {
    const built = buildPrompt(testCase.plan, {
      useS3: testCase.useS3,
      legacyArchetype: 'legacyArchetype' in testCase ? testCase.legacyArchetype : undefined,
    });
    console.log(`▶ ${testCase.label}`);
    console.log(`  archetype=${built.archetype} intensity=${built.intensity}`);

    const imageUrl = await generateDesignedPostImage({
      workspaceId: WORKSPACE_ID,
      designCardPrompt: built.prompt,
      designCardMode: 'reel',
      headline: built.headline,
      caption: String(testCase.plan.content_brief ?? ''),
      referenceImageUrls: [YULA_GALLERY_MATCH.url],
      brandName: BRAND_NAME,
      format: 'story',
      businessType: SECTOR,
      location: 'Bodrum',
    });

    results.push({
      id: testCase.id,
      label: testCase.label,
      archetype: built.archetype,
      intensity: built.intensity,
      imageUrl,
    });
    console.log(`  ${imageUrl ? `✓ ${imageUrl}` : '✗ FAILED'}\n`);
  }

  const reportPath = resolve(OUT_DIR, 'report.json');
  writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    galleryUrl: YULA_GALLERY_MATCH.url,
    results,
  }, null, 2));

  console.log('--- SUMMARY ---');
  for (const r of results) {
    console.log(`${r.id}: ${r.imageUrl ?? 'FAILED'}`);
  }
  console.log(`\nReport: ${reportPath}`);

  if (results.some((r) => !r.imageUrl)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
