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

/** Görsel üretim hattı — birbirine karıştırılmaz. */
export type ProductionPipeline =
  | 'gallery_photo'      // Ham / hafif galeri gönderisi (caption feed'de)
  | 'remotion_poster'    // Tasarımsal post (SpecPoster / announcement SVG)
  | 'remotion_story'     // Kampanya / duyuru motion story (MP4)
  | 'story_still'        // Story: statik galeri görseli (caption feed'de yok)
  | 'runway_reel'        // Reel video
  | 'marky_event'        // Etkinlik kartı (canvas/event)
  | 'meta_ad'            // Meta reklam kreatifi
  | 'google_ad'          // Google Ads RSA / görsel kreatif
  | 'carousel_gallery';  // Çoklu galeri slayt

/**
 * Feed'de caption/hashtag gösterilir mi?
 * Story motion / designed layer metinleri görselde baked.
 */
export type CaptionSurface = 'feed_card' | 'visual_only' | 'ad_creative';

export type ProductionSlotRole =
  /** Haftalık organik feed post — galeri foto, Remotion poster DEĞİL */
  | 'organic_post'
  /** Tasarımsal / şablonlu post — Remotion poster, caption feed'de aynı brief'ten */
  | 'designed_post'
  /** Statik story (galeri) */
  | 'organic_story_still'
  /** Motion story — kampanya / duyuru / etkinlik */
  | 'campaign_story_motion'
  /** Organik reel */
  | 'organic_reel'
  /** Kampanya / duyuru reel (aynı brief, farklı motion) */
  | 'campaign_reel_motion'
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
   * Brand template library slot key — maps to one of the 5 brand story slots.
   * Set by Feed Art Director based on content intent; used by auto-produce to
   * select the exact brand-configured story template (not rotation-based).
   * Values: daily_story | event_story | campaign_post | editorial_story | social_proof
   */
  library_slot_key?: string;
  /**
   * Feed Art Director's visual direction for gallery photo selection.
   * Comma-separated specific subject keywords the gallery photo must show.
   * Example: "tırnak, manikür, nail art" — injected into caption matcher
   * as required keywords, overriding generic sector affinity.
   */
  visual_subject_hint?: string;
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

/** Standard weekly mission deliverable: 2 story + 2 post + 1 reel (5 organic — stable v1) */
export const MISSION_WEEKLY_PACKAGE_COUNTS = {
  story: 2,
  post: 2,
  carousel: 0,
  reel: 1,
  total: 5,
} as const;

/** Strategist opportunity missions — 3 acil fikir → 1 post + 1 story + 1 reel (reklam yok). */
export const MISSION_OPPORTUNITY_PACKAGE_COUNTS = {
  post: 1,
  story: 1,
  reel: 1,
  total: 3,
} as const;

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
    pipeline: 'remotion_poster',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'brand_awareness',
  },
  {
    role: 'campaign_story_motion',
    pipeline: 'remotion_story',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'behind_the_scenes',
  },
  {
    role: 'organic_reel',
    pipeline: 'runway_reel',
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
    role: 'designed_post',
    pipeline: 'remotion_poster',
    format: 'post',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'brand_awareness',
  },
  {
    role: 'campaign_story_motion',
    pipeline: 'remotion_story',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'brand_awareness',
  },
  {
    role: 'campaign_story_motion',
    pipeline: 'remotion_story',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'daily_story',
  },
  {
    role: 'organic_reel',
    pipeline: 'runway_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'educational_post',
  },
];

const WEEKLY_CAMPAIGN_ADDON: MissionProductionSlot[] = [
  {
    role: 'campaign_story_motion',
    pipeline: 'remotion_story',
    format: 'story',
    captionSurface: 'visual_only',
    required: true,
    intentHint: 'campaign_offer',
  },
  {
    role: 'campaign_reel_motion',
    pipeline: 'runway_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: false,
    intentHint: 'campaign_offer',
  },
];

/** APO-6 — agency tier may require second Runway slot when theme allows. */
const CAMPAIGN_AGENCY_ADDON: MissionProductionSlot[] = [
  {
    role: 'campaign_reel_motion',
    pipeline: 'runway_reel',
    format: 'reel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'campaign_offer',
  },
];

const ADS_SLOTS: MissionProductionSlot[] = [
  {
    role: 'paid_ad_creative',
    pipeline: 'meta_ad',
    format: 'post',
    captionSurface: 'ad_creative',
    required: true,
    intentHint: 'ad_creative',
  },
  {
    role: 'paid_ad_google_creative',
    pipeline: 'google_ad',
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

/** P2-3 — Adjust weekly organic slots for package / production profile. */
export function applyProductionProfileToWeeklySlots(
  slots: MissionProductionSlot[],
  profile: ProductionProfile,
): MissionProductionSlot[] {
  let motionKept = 0;
  const trimmed: MissionProductionSlot[] = [];
  for (const slot of slots) {
    if (slot.role === 'campaign_story_motion') {
      if (motionKept < profile.remotionStoryMotionSlots) {
        trimmed.push(slot);
        motionKept += 1;
      }
      continue;
    }
    if (slot.role === 'organic_reel' && !profile.allowRunwayReels) {
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

  for (let i = 0; i < profile.remotionStoryStillSlots; i += 1) {
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

  const weeklySlots = applyProductionProfileToWeeklySlots([...WEEKLY_ORGANIC], profile);

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

/** Mevcut auto-produce: tüm postlar → remotion_poster. Hedef: sadece designed_post. */
export function pipelineForSlotRole(role: ProductionSlotRole): ProductionPipeline {
  const slot = [
    ...WEEKLY_ORGANIC,
    ...OPPORTUNITY_ORGANIC,
    ...WEEKLY_CAMPAIGN_ADDON,
    ...ADS_SLOTS,
  ].find((s) => s.role === role);
  return slot?.pipeline ?? 'gallery_photo';
}
