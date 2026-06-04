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

/** Görsel üretim hattı — birbirine karıştırılmaz. */
export type ProductionPipeline =
  | 'gallery_photo'      // Ham / hafif galeri gönderisi (caption feed'de)
  | 'remotion_poster'    // Tasarımsal post (SpecPoster / announcement SVG)
  | 'remotion_story'     // Kampanya / duyuru motion story (MP4)
  | 'story_still'        // Story: statik galeri görseli (caption feed'de yok)
  | 'runway_reel'        // Reel video
  | 'marky_event'        // Etkinlik kartı (canvas/event)
  | 'meta_ad'            // Reklam kreatifi (ayrı ads_agent)
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
  /** Meta / Google reklam kreatifi */
  | 'paid_ad_creative';

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
  publish_channel: 'instagram_organic' | 'instagram_campaign' | 'meta_ads';
  layout_family_hint?: string;
  /**
   * Brand template library slot key — maps to one of the 5 brand story slots.
   * Set by Feed Art Director based on content intent; used by auto-produce to
   * select the exact brand-configured story template (not rotation-based).
   * Values: daily_story | event_story | campaign_post | editorial_story | social_proof
   */
  library_slot_key?: string;
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

export interface MissionProductionManifest {
  missionId: string;
  missionType: 'weekly_content' | 'campaign' | 'event' | 'ads_focus';
  copyBundles: MissionCopyBundle[];
  slots: MissionProductionSlot[];
  version: 1;
}

/** Standard weekly mission deliverable: 3 story + 3 post (incl. carousel) + 1 reel */
export const MISSION_WEEKLY_PACKAGE_COUNTS = {
  story: 3,
  post: 2,
  carousel: 1,
  reel: 1,
  total: 7,
} as const;

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
    role: 'organic_carousel',
    pipeline: 'carousel_gallery',
    format: 'carousel',
    captionSurface: 'feed_card',
    required: true,
    intentHint: 'social_proof',
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
];

function hasCampaignIntent(intents: CreativeIntent[]): boolean {
  return intents.some((i) =>
    i === 'campaign_offer' || i === 'event_announcement' || i === 'seasonal_content',
  );
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
}): MissionProductionManifest {
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

  const slots: MissionProductionSlot[] = [
    ...WEEKLY_ORGANIC,
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
  if (role === 'paid_ad_creative') return 'ad';
  if (role.includes('reel')) return 'reel';
  if (role.includes('story')) return 'story';
  return 'post';
}

/** Mevcut auto-produce: tüm postlar → remotion_poster. Hedef: sadece designed_post. */
export function pipelineForSlotRole(role: ProductionSlotRole): ProductionPipeline {
  const slot = [...WEEKLY_ORGANIC, ...WEEKLY_CAMPAIGN_ADDON, ...ADS_SLOTS].find((s) => s.role === role);
  return slot?.pipeline ?? 'gallery_photo';
}
