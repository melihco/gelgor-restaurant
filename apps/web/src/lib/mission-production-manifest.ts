/**
 * Mission Hub — üretim manifesti
 *
 * Bir mission tamamlandığında Feed'e düşen çıktılar rasgele değil,
 * bu slotta tanımlı kanallara göre üretilir. Caption / CTA / hashtag
 * ideation'da kilitlenir; görsel pipeline slot rolüne göre ayrılır.
 *
 * Uygulama sırası: auto-produce → manifest slotları → artifact metadata
 * (`production_role`, `publish_channel`, `copy_bundle_id`).
 */
import type { CreativeIntent } from './creative-production-contracts';
import type { ProductionProfile } from './production-profile';
import { resolveProductionProfile } from './production-profile';
import { getPlanSpec } from './package-plan-config';
import {
  resolveWeeklyPackageGeometry,
  STARTER_WEEKLY_PACKAGE_COUNTS,
} from './package-weekly-geometry';

/** Görsel üretim hattı — birbirine karıştırılmaz. */
export type ProductionPipeline =
  | 'gallery_photo'      // Ham / hafif galeri gönderisi (caption feed'de)
  | 'remotion_poster'    // Tasarımsal post (SpecPoster / announcement SVG)
  | 'remotion_story'     // Legacy — eski artifact/FD; normalize → fal_story
  | 'fal_story'          // fal.ai grounded story poster (9:16) — galeri + ideation
  | 'story_still'        // Story: statik galeri görseli (caption feed'de yok)
  | 'runway_reel'        // @deprecated — fal_reel kullan; legacy FD atamaları normalize edilir
  | 'fal_reel'           // fal.ai reel — Remotion/Runway alternatifi
  | 'fal_design'         // fal.ai/GPT-image tasarımsal feed post (Canva benzeri, galeri + tipografi)
  | 'fal_only_story'     // Tam fal.ai story — galeri/GPT yok, Ideogram + I2V
  | 'fal_only_post'      // Tam fal.ai post — galeri/GPT yok, Ideogram/Flux still
  | 'fal_only_reel'      // Tam fal.ai reel — galeri/GPT yok, Ideogram + I2V
  | 'marky_event'        // Etkinlik kartı (canvas/event)
  | 'meta_ad'            // Meta reklam kreatifi
  | 'google_ad'          // Google Ads RSA / görsel kreatif
  | 'carousel_gallery'   // Çoklu galeri slayt
  | 'product_showcase';  // Ürün vitrin (AI arka plan değişimi)

/**
 * Feed'de caption/hashtag gösterilir mi?
 * Story motion / designed layer metinleri görselde baked.
 */
export type CaptionSurface = 'feed_card' | 'visual_only' | 'ad_creative';

export type ProductionSlotRole =
  /** Haftalık organik feed post — galeri foto, Remotion poster DEĞİL */
  | 'organic_post'
  /** Tasarımsal / şablonlu post — fal.ai designed post (gallery match + agent brief) */
  | 'designed_post'
  /** AI typography designed post — fal.ai (gallery + fal_design_hint) */
  | 'designed_typography'
  /** fal.ai/GPT-image Canva-style designed post — parallel track (NOT Remotion) */
  | 'fal_designed_post'
  /** Product showcase post — AI background replacement for product photos */
  | 'product_showcase_post'
  /** Product showcase story — AI background replacement for product photos (story format) */
  | 'product_showcase_story'
  /** Statik story (galeri) */
  | 'organic_story_still'
  /** Motion story — kampanya / duyuru / etkinlik */
  | 'campaign_story_motion'
  /** Organik reel */
  | 'organic_reel'
  /** Kampanya / duyuru reel (aynı brief, farklı motion) */
  | 'campaign_reel_motion'
  /** fal.ai I2V story — ayrı üretim hattı (Remotion değil) */
  | 'fal_story_motion'
  /** fal.ai I2V reel — ayrı üretim hattı (Runway/Remotion değil) */
  | 'fal_reel_motion'
  /** Tam fal.ai story — galeri/GPT/Remotion yok */
  | 'fal_only_story'
  /** Tam fal.ai feed post — galeri/GPT/Remotion yok */
  | 'fal_only_post'
  /** Tam fal.ai reel — galeri/GPT/Runway yok */
  | 'fal_only_reel'
  /** Carousel */
  | 'organic_carousel'
  /** Meta reklam kreatifi */
  | 'paid_ad_creative'
  /** Google Ads RSA / görsel kreatif */
  | 'paid_ad_google_creative';

export interface MissionProductionSlot {
  role: ProductionSlotRole;
  pipeline: ProductionPipeline;
  format: 'post' | 'story' | 'reel' | 'carousel';
  captionSurface: CaptionSurface;
  /** Bu slot mission paketinde zorunlu mu? */
  required: boolean;
  /** Remotion intent / template_use_case ipucu */
  intentHint?: CreativeIntent;
}

/** Ideation'da kilitlenen paylaşım metni — tüm slotlar aynı brief'i referanslar. */
export interface ProductionAssignment {
  idea_index: number;
  slot_role: ProductionSlotRole;
  pipeline: ProductionPipeline;
  copy_bundle_id: string;
  publish_channel: 'instagram_organic' | 'instagram_campaign' | 'meta_ads' | 'google_ads';
  layout_family_hint?: string;
  /**
   * Brand template library slot key — maps to reusable story/post design slots.
   * Set by Feed Art Director based on content intent; used by auto-produce to
   * select the exact brand-configured template (not rotation-based).
   * Values include: daily_story | event_story | campaign_post | editorial_story
   * | social_proof | social_proof_post | ad_creative_post
   */
  library_slot_key?: string;
  /**
   * Feed Art Director's visual direction for gallery photo selection.
   * Comma-separated specific subject keywords the gallery photo must show.
   * Example: "tırnak, manikür, nail art" — injected into caption matcher
   * as required keywords, overriding generic sector affinity.
   */
  visual_subject_hint?: string;
  /**
   * Feed Art Director designer note for fal.ai designed slots (designed_post, designed_typography,
   * fal_designed_post, fal_reel_motion, fal_only_*).
   * One sentence: layout + typography + graphic intent for this specific caption.
   */
  fal_design_hint?: string;
  rationale?: string;
}

export interface MissionCopyBundle {
  id: string;
  missionId: string;
  headline: string;
  caption: string;
  cta: string;
  hashtags: string[];
  locale?: string;
}

export type MissionProductionPackageType =
  | 'weekly_content'
  | 'campaign'
  | 'event'
  | 'ads_focus'
  | 'opportunity';

export interface MissionProductionManifest {
  missionId: string;
  missionType: MissionProductionPackageType;
  copyBundles: MissionCopyBundle[];
  slots: MissionProductionSlot[];
  version: 1;
}

/**
 * Standard weekly mission deliverable: 16 generated slots.
 *
 * Post mix (6): 2 organic gallery + 3 fal_designed (designed_post + designed_typography + fal_designed_post)
 * + 1 fal_only_post (tam fal). Feed designed posts are fal.ai/GPT-image (gallery match + agent brief).
 * Story (3): Remotion motion ×2 + organic still.
 * Reel (6): fal_reel ×2 + fal_reel_motion ×2 + fal_only_reel ×2 — Remotion kullanılmaz.
 * (Story için fal.ai kullanılmaz — Remotion karşılar. Reels Runway + fal.ai.)
 */
export const MISSION_WEEKLY_PACKAGE_COUNTS = {
  story: 3,
  post: 6,
  carousel: 1,
  reel: 6,
  total: 16,
} as const;

export type PackageGeometry = {
  story: number;
  post: number;
  carousel: number;
  reel: number;
  total: number;
};

/**
 * Resolve package geometry from brand theme overrides or plan tier.
 * Falls back to the default 16-slot weekly package (6 post · 3 story · 1 carousel · 6 reel).
 */
export function resolvePackageGeometry(
  brandOverride?: Partial<PackageGeometry> | null,
  packageSlug?: string | null,
): PackageGeometry {
  const base = resolveWeeklyPackageGeometry(packageSlug);
  if (!brandOverride) return base;
  const geo: PackageGeometry = {
    story: brandOverride.story ?? base.story,
    post: brandOverride.post ?? base.post,
    carousel: brandOverride.carousel ?? base.carousel,
    reel: brandOverride.reel ?? base.reel,
    total: 0,
  };
  geo.total = geo.story + geo.post + geo.carousel + geo.reel;
  return geo;
}

/** Strategist opportunity missions — 3 acil fikir → 1 post + 1 story + 1 reel (reklam yok). */
export const MISSION_OPPORTUNITY_PACKAGE_COUNTS = {
  post: 1,
  story: 1,
  reel: 1,
  total: 3,
} as const;

/**
 * Only opportunity missions use one-slot-per-raw-idea routing.
 * Weekly / seasonal / campaign missions use fixed package geometry (16 agency · 12 starter).
 */
export function isIdeaDrivenMissionProduction(
  missionType?: MissionProductionPackageType | null,
): boolean {
  return (missionType ?? 'weekly_content') === 'opportunity';
}

/** Organic slot target for FD backfill / gate (excludes paid ad pair). */
export function resolveMissionRequiredSlotCount(input: {
  missionType?: MissionProductionPackageType | null;
  requireCampaignReel?: boolean;
  productionProfile?: ProductionProfile | null;
  packageSlug?: string | null;
}): number {
  const missionType = input.missionType ?? 'weekly_content';
  if (missionType === 'opportunity') return MISSION_OPPORTUNITY_PACKAGE_COUNTS.total;
  const manifest = buildMissionProductionManifest({
    missionId: 'slot-count',
    missionType,
    includeAds: missionType === 'ads_focus',
    requireCampaignReel: input.requireCampaignReel,
    productionProfile: input.productionProfile,
    packageSlug: input.packageSlug,
  });
  return manifest.slots.filter((s) => s.required).length;
}

/** @deprecated use resolveMissionRequiredSlotCount — kept for simple call sites */
export function resolveMissionPackageOrganicTarget(
  missionType?: MissionProductionPackageType | null,
): number {
  return resolveMissionRequiredSlotCount({ missionType });
}

/** Meta + Google ad kreatifi — designed_post'tan türetilir (ek LLM yok). */
export const MISSION_AD_PAIR_COUNTS = {
  meta: 1,
  google: 1,
  total: 2,
} as const;

const OPPORTUNITY_ORGANIC: MissionProductionSlot[] = [
  {
    role: 'designed_post',
    pipeline: 'fal_design',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'brand_awareness',
  },
  {
    role: 'campaign_story_motion',
    pipeline: 'fal_story',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'behind_the_scenes',
  },
  {
    role: 'organic_reel',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'educational_post',
  },
];

const WEEKLY_ORGANIC: MissionProductionSlot[] = [
  {
    role: 'organic_post',
    pipeline: 'gallery_photo',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'daily_story',
  },
  {
    role: 'organic_post',
    pipeline: 'gallery_photo',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'social_proof',
  },
  {
    role: 'designed_post',
    pipeline: 'fal_design',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'brand_awareness',
  },
  {
    role: 'designed_typography',
    pipeline: 'fal_design',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'campaign_offer',
  },
  {
    role: 'fal_designed_post',
    pipeline: 'fal_design',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'product_highlight',
  },
  {
    role: 'organic_carousel',
    pipeline: 'carousel_gallery',
    format: 'carousel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'product_highlight',
  },
  {
    role: 'campaign_story_motion',
    pipeline: 'fal_story',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'brand_awareness',
  },
  {
    role: 'campaign_story_motion',
    pipeline: 'fal_story',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'behind_the_scenes',
  },
  {
    role: 'organic_story_still',
    pipeline: 'story_still',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'daily_story',
  },
  {
    role: 'organic_reel',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'educational_post',
  },
  {
    role: 'campaign_reel_motion',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'social_proof',
  },
  {
    role: 'fal_reel_motion',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'product_highlight',
  },
  {
    role: 'fal_reel_motion',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'behind_the_scenes',
  },
  {
    role: 'fal_only_reel',
    pipeline: 'fal_only_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'brand_awareness',
  },
  {
    role: 'fal_only_post',
    pipeline: 'fal_only_post',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'campaign_offer',
  },
  {
    role: 'fal_only_reel',
    pipeline: 'fal_only_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'product_highlight',
  },
];

/** Starter weekly organic — 4 post · 3 story · 1 carousel · 4 reel (12 slots). */
const WEEKLY_ORGANIC_STARTER: MissionProductionSlot[] = [
  {
    role: 'organic_post',
    pipeline: 'gallery_photo',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'daily_story',
  },
  {
    role: 'designed_post',
    pipeline: 'fal_design',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'brand_awareness',
  },
  {
    role: 'designed_typography',
    pipeline: 'fal_design',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'campaign_offer',
  },
  {
    role: 'fal_designed_post',
    pipeline: 'fal_design',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'product_highlight',
  },
  {
    role: 'organic_carousel',
    pipeline: 'carousel_gallery',
    format: 'carousel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'product_highlight',
  },
  {
    role: 'campaign_story_motion',
    pipeline: 'fal_story',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'brand_awareness',
  },
  {
    role: 'campaign_story_motion',
    pipeline: 'fal_story',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'behind_the_scenes',
  },
  {
    role: 'organic_story_still',
    pipeline: 'story_still',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'daily_story',
  },
  {
    role: 'organic_reel',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'educational_post',
  },
  {
    role: 'campaign_reel_motion',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'social_proof',
  },
  {
    role: 'fal_reel_motion',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'product_highlight',
  },
  {
    role: 'fal_reel_motion',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'behind_the_scenes',
  },
];

export { STARTER_WEEKLY_PACKAGE_COUNTS };

function weeklyOrganicSlotsForPlan(packageSlug?: string | null): MissionProductionSlot[] {
  const geo = resolveWeeklyPackageGeometry(packageSlug);
  return geo.total <= STARTER_WEEKLY_PACKAGE_COUNTS.total
    ? [...WEEKLY_ORGANIC_STARTER]
    : [...WEEKLY_ORGANIC];
}

const WEEKLY_CAMPAIGN_ADDON: MissionProductionSlot[] = [
  {
    role: 'campaign_story_motion',
    pipeline: 'fal_story',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'campaign_offer',
  },
  {
    role: 'campaign_reel_motion',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: false,
    intentHint: 'campaign_offer',
  },
];

/** APO-6 — agency tier campaign reel addon (fal designer video). */
const CAMPAIGN_AGENCY_ADDON: MissionProductionSlot[] = [
  {
    role: 'campaign_reel_motion',
    pipeline: 'fal_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'campaign_offer',
  },
];

const ADS_SLOTS: MissionProductionSlot[] = [
  {
    role: 'paid_ad_creative',
    pipeline: 'fal_design',
    format: 'post',
    captionSurface: 'ad_creative',
    required: true,
    intentHint: 'ad_creative',
  },
  {
    role: 'paid_ad_google_creative',
    pipeline: 'fal_design',
    format: 'post',
    captionSurface: 'ad_creative',
    required: true,
    intentHint: 'ad_creative',
  },
];

function hasCampaignIntent(intents: CreativeIntent[]): boolean {
  return intents.some((i) =>
    i === 'campaign_offer' || i === 'event_announcement' || i === 'seasonal_content',
  );
}

/** Product Showcase slots — AI background-replaced product photos (post + story). */
function buildProductShowcaseSlots(config: {
  posts_per_mission: number;
  stories_per_mission: number;
}): MissionProductionSlot[] {
  const slots: MissionProductionSlot[] = [];
  for (let i = 0; i < config.posts_per_mission; i += 1) {
    slots.push({
      role: 'product_showcase_post',
      pipeline: 'product_showcase',
      format: 'post',
      captionSurface: 'feed_card',
      required: true,
      intentHint: 'product_highlight',
    });
  }
  for (let i = 0; i < config.stories_per_mission; i += 1) {
    slots.push({
      role: 'product_showcase_story',
      pipeline: 'product_showcase',
      format: 'story',
      captionSurface: 'visual_only',
      required: true,
      intentHint: 'product_highlight',
    });
  }
  return slots;
}

/** Read product showcase config from brand theme. Returns null if disabled. */
function resolveProductShowcaseConfig(
  brandTheme?: Record<string, unknown> | null,
): { posts_per_mission: number; stories_per_mission: number } | null {
  if (!brandTheme) return null;
  const config = (brandTheme.product_showcase ?? brandTheme.productShowcase) as
    | { enabled?: boolean; posts_per_mission?: number; stories_per_mission?: number }
    | undefined;
  if (!config?.enabled) return null;
  return {
    posts_per_mission: config.posts_per_mission ?? 2,
    stories_per_mission: config.stories_per_mission ?? 2,
  };
}

/** P2-3 — Adjust weekly organic slots for package / production profile. */
export function applyProductionProfileToWeeklySlots(
  slots: MissionProductionSlot[],
  profile: ProductionProfile,
): MissionProductionSlot[] {
  let motionKept = 0;
  const trimmed: MissionProductionSlot[] = [];
  let stillStoryCount = 0;
  for (const slot of slots) {
    if (slot.role === 'campaign_story_motion') {
      if (motionKept < profile.remotionStoryMotionSlots) {
        trimmed.push(slot);
        motionKept += 1;
      }
      continue;
    }
    if (slot.role === 'organic_story_still') {
      stillStoryCount += 1;
    }
    if (
      (slot.role === 'organic_reel' || slot.role === 'campaign_reel_motion')
      && slot.pipeline === 'runway_reel'
      && !profile.allowRunwayReels
    ) {
      trimmed.push({
        role: 'organic_story_still',
        pipeline: 'story_still',
        format: 'story',
        captionSurface: 'visual_only',
        required: true,
        intentHint: 'social_proof',
      });
      continue;
    }
    trimmed.push(slot);
  }

  const additionalStillSlots = Math.max(0, profile.remotionStoryStillSlots - stillStoryCount);
  for (let i = 0; i < additionalStillSlots; i += 1) {
    trimmed.push({
      role: 'organic_story_still',
      pipeline: 'story_still',
      format: 'story',
      captionSurface: 'visual_only',
      required: true,
      intentHint: i === 0 ? 'daily_story' : 'behind_the_scenes',
    });
  }

  return trimmed;
}

/** Package-aware manifest — Starter swaps reel → still story. */
export function buildManifestForPackage(
  packageSlug: string | null | undefined,
  opts?: { gisScore?: number | null; brandTheme?: Record<string, unknown> | null },
): ProductionProfile {
  const plan = getPlanSpec(packageSlug);
  return resolveProductionProfile({
    packageSlug,
    gisScore: opts?.gisScore,
    brandTheme: opts?.brandTheme,
    monthlyReels: plan?.outputs.reels,
  });
}

/**
 * Mission tipine göre üretilecek slot listesi.
 * auto-produce her idea'yı bir role map'lemeli; eşleşmeyen idea backup kalır.
 */
export function buildMissionProductionManifest(input: {
  missionId: string;
  missionType?: MissionProductionManifest['missionType'];
  selectedIntents?: CreativeIntent[];
  includeAds?: boolean;
  /** When true, campaign_reel_motion is required (agency tier / 2 Runway). */
  requireCampaignReel?: boolean;
  productionProfile?: ProductionProfile | null;
  packageSlug?: string | null;
  gisScore?: number | null;
  brandTheme?: Record<string, unknown> | null;
}): MissionProductionManifest {
  const profile = input.productionProfile
    ?? buildManifestForPackage(input.packageSlug, {
      gisScore: input.gisScore,
      brandTheme: input.brandTheme,
    });

  if (input.missionType === 'opportunity') {
    const slots = applyProductionProfileToWeeklySlots([...OPPORTUNITY_ORGANIC], profile);
    return {
      missionId: input.missionId,
      missionType: 'opportunity',
      copyBundles: [],
      slots,
      version: 1,
    };
  }

  const intents = input.selectedIntents ?? [];
  const isCampaign = input.missionType === 'campaign'
    || input.missionType === 'event'
    || hasCampaignIntent(intents);

  const campaignAddon = isCampaign
    ? [
        ...WEEKLY_CAMPAIGN_ADDON,
        ...(input.requireCampaignReel ? CAMPAIGN_AGENCY_ADDON : []),
      ]
    : [];
  // De-dupe by role (agency addon may repeat campaign_reel — keep single entry, mark required)
  const campaignSlots = campaignAddon.reduce<MissionProductionSlot[]>((acc, slot) => {
    const existing = acc.find((s) => s.role === slot.role);
    if (existing) {
      if (slot.required) existing.required = true;
      return acc;
    }
    acc.push({ ...slot });
    return acc;
  }, []);

  const weeklySlots = applyProductionProfileToWeeklySlots(
    weeklyOrganicSlotsForPlan(input.packageSlug),
    profile,
  );

  const slots: MissionProductionSlot[] = [
    ...weeklySlots,
    ...campaignSlots,
    ...(input.includeAds ? ADS_SLOTS : []),
  ];

  return {
    missionId: input.missionId,
    missionType: input.missionType ?? (isCampaign ? 'campaign' : 'weekly_content'),
    copyBundles: [],
    slots,
    version: 1,
  };
}

/** Artifact metadata — Feed filtreleri ve Mission Hub özeti bunu okur. */
export function artifactProductionRole(meta: Record<string, unknown>): ProductionSlotRole | null {
  const role = meta.production_role as ProductionSlotRole | undefined;
  return role ?? null;
}

export function slotRoleToFeedTab(role: ProductionSlotRole): 'post' | 'story' | 'reel' | 'ad' {
  if (role === 'paid_ad_creative' || role === 'paid_ad_google_creative') return 'ad';
  if (role.includes('reel')) return 'reel';
  if (role.includes('story')) return 'story';
  return 'post';
}

/** Legacy FD / cached assignments: runway_reel → fal_reel (Runway kapalı). */
export function normalizeProductionPipeline(
  pipeline: string | null | undefined,
): ProductionPipeline {
  const key = String(pipeline ?? '').trim();
  if (key === 'runway_reel') return 'fal_reel';
  if (key === 'remotion_poster') return 'fal_design';
  if (key === 'remotion_story') return 'fal_story';
  if (key === 'meta_ad' || key === 'google_ad') return 'fal_design';
  return (key as ProductionPipeline) || 'gallery_photo';
}

/** Resolve pipeline for a slot role (legacy FD assignments normalized at ingest). */
export function pipelineForSlotRole(role: ProductionSlotRole): ProductionPipeline {
  if (role === 'designed_typography' || role === 'designed_post' || role === 'fal_designed_post') {
    return 'fal_design';
  }
  if (role === 'paid_ad_creative' || role === 'paid_ad_google_creative') {
    return 'fal_design';
  }
  // Legacy FD slot roles → canonical fal story / fal reel pipelines
  if (role === 'fal_story_motion') return 'fal_story';
  if (role === 'fal_only_story') return 'fal_only_story';
  if (role === 'fal_only_post') return 'fal_only_post';
  if (role === 'fal_only_reel') return 'fal_only_reel';
  if (role === 'product_showcase_post' || role === 'product_showcase_story') return 'product_showcase';
  const slot = [
    ...WEEKLY_ORGANIC,
    ...OPPORTUNITY_ORGANIC,
    ...WEEKLY_CAMPAIGN_ADDON,
    ...ADS_SLOTS,
  ].find((s) => s.role === role);
  return slot?.pipeline ?? 'gallery_photo';
}
