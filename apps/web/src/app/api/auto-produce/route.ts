import { NextRequest, NextResponse } from 'next/server';
import { canProduce, recordProduction, cleanupOldBuckets, canAffordRunway, incrementReelCount } from './budget';
import {
  type PostTypeBucket,
  fetchUsedGalleryImages,
  getExcludeUrlsForPostType,
  isGalleryUrlUsedForPostType,
  kindToPostType,
  markGalleryUrlUsedForPostType,
  normalizeGalleryUrl,
} from '@/lib/gallery-usage-tracker';
import {
  matchPhotoToContent,
  resolveBestGalleryUrl,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';
import { shouldAutoProduceEnhanceGallery, shouldPreserveVenuePhotos } from '@/lib/venue-photo-policy';
import { harmonizeCaptionAndCta } from '@/lib/cta-localization';
import {
  inferAnnouncementUseCase,
  parseAnnouncementPreferences,
  resolveTemplateForContent,
  smartSelectTemplate,
  type AnnouncementTemplateId,
} from '@/lib/announcement-template-library';

export const runtime = 'nodejs';
export const maxDuration = 300; // Runway gen4_turbo can take up to 3 minutes

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

interface ParsedIdea {
  headline?: string;
  concept_title?: string;
  title?: string;
  caption_draft?: string;
  caption?: string;
  hashtags?: string[] | string;
  content_type?: string;
  content_kind?: string;
  selected_gallery_url?: string;
  visual_production_spec?: { selected_gallery_url?: string; image_edit_prompt?: string; treatment?: string };
  reel_motion_spec?: { camera_movement?: string; pace?: string; transition_style?: string; audio_mood?: string };
  visual_direction?: string;
  strategic_purpose?: string;
  template_use_case?: string;
  cta?: string;
  call_to_action?: string;
  posting_time_suggestion?: string;
  mood?: string;
  /** Structured event details for event/canvas announcement overlay */
  event_details?: {
    artist_name?: string;
    date?: string;
    time?: string;
    venue_name?: string;
    venue_area?: string;
    tagline?: string;
  };
}

interface AutoProduceRequest {
  workspaceId: string;
  missionId?: string;
  nodeKey?: string;
  ideas: ParsedIdea[];
  galleryAnalysis?: Record<string, unknown>;
  brandName?: string;
}

function getField(idea: ParsedIdea, ...keys: (keyof ParsedIdea)[]): string {
  for (const k of keys) {
    const v = idea[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function normalizeHashtags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(h => (String(h).startsWith('#') ? String(h) : `#${String(h)}`)).slice(0, 15);
  if (typeof raw === 'string') return raw.split(/[\s,]+/).filter(h => h.length > 1).map(h => h.startsWith('#') ? h : `#${h}`).slice(0, 15);
  return [];
}

function detectContentKind(idea: ParsedIdea): string {
  const ct = (idea.content_type || idea.content_kind || 'post').toLowerCase();
  if (ct.includes('story')) return 'instagram_story';
  if (ct.includes('reel')) return 'instagram_reel';
  if (ct.includes('carousel')) return 'instagram_carousel';
  if (ct.includes('canvas') || ct.includes('event') || ct.includes('announcement')) return 'instagram_canvas';
  return 'instagram_post';
}

/** Gallery-only: never generate images from scratch in auto-produce (default true). */
const GALLERY_ONLY = process.env.AUTO_PRODUCE_GALLERY_ONLY !== 'false';
/** AI color grade on gallery photos — off by default; venue photos must stay untouched. */
const SUBTLE_ENHANCE = shouldAutoProduceEnhanceGallery();

const GALLERY_EXCLUDE_PATTERNS = [
  'logo', 'icon', 'banner', 'footer', 'menu.', 'harita', 'map', 'franchise',
];

function parseBrandGalleryPhotos(
  brandCtx: Record<string, unknown>,
  galleryAnalysis: Record<string, unknown>,
): { candidateUrls: string[]; meta: Record<string, GalleryPhotoMeta> } {
  const meta = galleryAnalysis as Record<string, GalleryPhotoMeta>;
  let refs: string[] = [];
  const raw = brandCtx.reference_image_urls;
  if (Array.isArray(raw)) {
    refs = raw.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        refs = parsed.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
      }
    } catch { /* ignore */ }
  }

  refs = refs.filter(u => !GALLERY_EXCLUDE_PATTERNS.some(p => u.toLowerCase().includes(p)));

  const analysisKeys = Object.keys(meta).filter(u => u.startsWith('http'));
  const candidateUrls = refs.length > 0 ? refs : analysisKeys;
  return { candidateUrls, meta };
}

/**
 * Pick best gallery photo for caption — staged fallback, never generative.
 * 1) Respect post-type usage exclusions + semantic score
 * 2) Relax to batch-only exclusions + bestEffort
 * 3) Any gallery photo (bestEffort) before giving up
 */
function pickGalleryPhotoForIdea(
  caption: string,
  headline: string,
  mood: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  candidateUrls: string[],
  typeExcludeUrls: string[],
  batchExcludeUrls: string[],
  contentType?: string,
  agentUrl?: string | null,
): string | null {
  if (!candidateUrls.length) return null;

  const input = { caption, headline, mood, contentType };
  const displayUrls = candidateUrls;

  const tryPick = (excludeUrls: string[], bestEffort = false): string | null => {
    const resolved = resolveBestGalleryUrl(
      input,
      candidateUrls,
      galleryAnalysis,
      agentUrl,
      { excludeUrls, displayUrls },
    );
    if (resolved) return resolved.url;

    const match = matchPhotoToContent(input, candidateUrls, galleryAnalysis, {
      excludeUrls,
      displayUrls,
      bestEffort,
    });
    return match?.url ?? null;
  };

  return (
    tryPick(typeExcludeUrls, false)
    ?? tryPick(typeExcludeUrls, true)
    ?? tryPick(batchExcludeUrls, true)
    ?? tryPick([], true)
  );
}

async function generateVibeImage(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  contentType: string;
  brandName: string;
  location?: string;
  businessType?: string;
  referenceImageUrl?: string;
  agentImageEditPrompt?: string;
  /** BrandTheme grading directive injected into the enhance prompt */
  lutDirective?: string;
  /** Anti-patterns to avoid — injected as NEVER directives */
  antiPatterns?: string[];
}): Promise<string | null> {
  if (shouldPreserveVenuePhotos() && opts.referenceImageUrl) {
    return opts.referenceImageUrl;
  }
  try {
    const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
    const lutSuffix = opts.lutDirective
      ? ` Apply grading: ${opts.lutDirective}.`
      : '';
    const antiPatternSuffix = opts.antiPatterns?.length
      ? ` NEVER: ${opts.antiPatterns.slice(0, 3).join('; ')}.`
      : '';
    const enhancePrompt = opts.agentImageEditPrompt
      || `Apply subtle agency-level color grading only. Preserve the venue, architecture, people, and composition exactly — do not replace or repaint the scene. Improve lighting and color consistency only.${lutSuffix}${antiPatternSuffix}`;
    const body: Record<string, unknown> = {
      title:        opts.headline,
      caption:      opts.caption,
      contentType:  opts.contentType,
      brandName:    opts.brandName,
      location:     opts.location,
      businessType: opts.businessType,
      workspaceId:  opts.workspaceId,
      referenceImageUrls: opts.referenceImageUrl ? [opts.referenceImageUrl] : undefined,
      enhanceMode:  Boolean(opts.referenceImageUrl),
      enhanceContext: opts.referenceImageUrl ? enhancePrompt : undefined,
    };
    const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] vibe image gen failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json();
    return (data.imageUrl as string) ?? null;
  } catch (err) {
    console.warn('[auto-produce] vibe image gen error', err);
    return null;
  }
}

/**
 * Generate an agency-level Reel video via Runway Gen4 Turbo.
 * - Builds a cinematic English prompt from vibe DNA + content brief
 * - Passes the best-matching gallery photo as the input frame
 * - Returns the R2-persisted video URL (or null on failure)
 */
/**
 * Build a GPT-image-1 "designed card" prompt for an event/campaign announcement.
 * The card is a full-bleed Instagram composition with:
 *  - Brand vibe palette as background gradient or color wash
 *  - Event title as hero typography
 *  - Supporting detail line (date, CTA, etc.)
 *  - Brand name anchor at bottom
 * All visual directives come directly from the extracted brand_vibe_profile.
 */
function buildEventCanvasPrompt(opts: {
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  vibeProfile?: Record<string, unknown>;
  mood?: string;
}): string {
  const vibe = opts.vibeProfile ?? {};
  const palette = (vibe.palette as Record<string, string> | undefined) ?? {};
  const typography = (vibe.typography as Record<string, string> | undefined) ?? {};
  const composition = (vibe.composition as Record<string, string> | undefined) ?? {};
  const grading = (vibe.grading as Record<string, string> | undefined) ?? {};
  const sourceAccounts: string[] = Array.isArray(vibe.source_accounts) ? vibe.source_accounts : [];
  const antiPatterns: string[] = Array.isArray(vibe.anti_patterns) ? vibe.anti_patterns : [];

  const primary = palette.primary ?? '#1A2B4A';
  const accent = palette.accent ?? '#E8C87A';
  const neutral = palette.neutral ?? '#F5F0E8';
  const paletteDesc = palette.palette_description ?? '';

  const headlineFont = typography.headline_font ?? typography.heading_personality ?? typography.headline_style ?? 'elegant serif';
  const bodyFont = typography.body_font ?? typography.body_personality ?? typography.body_style ?? 'clean sans-serif';
  const letterSpacing = typography.letter_spacing ?? typography.text_overlay_density ?? 'wide tracking';
  const typographyNotes = typography.notes ?? typography.typography_role ?? '';

  const framingRules = composition.framing_rules ?? 'minimalist, generous whitespace';
  const gradingLook = grading.look ?? 'golden_hour';

  const lines = [
    `Instagram event announcement card for ${opts.brandName}${opts.location ? ` · ${opts.location}` : ''}.`,
    `This is a DESIGNED TYPOGRAPHY CARD — no real photographs, only graphic design elements.`,
    ``,
    `═══ VISUAL CANVAS ═══`,
    `Background: full-bleed color wash using brand palette.`,
    `Primary background color: ${primary}.`,
    `Accent color for graphic elements and borders: ${accent}.`,
    `Text color: ${neutral} or high-contrast variant.`,
    paletteDesc ? `Palette mood: ${paletteDesc}.` : '',
    `Color grading inspiration: ${gradingLook} — apply as subtle gradient overlay if needed.`,
    ``,
    `═══ TYPOGRAPHY LAYOUT ═══`,
    `Headline (hero text, largest element): "${opts.headline}"`,
    `  Font style: ${headlineFont}, ${letterSpacing}.`,
    `Body/supporting text: pull the key detail or CTA from this caption — "${opts.caption.slice(0, 120)}"`,
    `  Font style: ${bodyFont}.`,
    typographyNotes ? `Typography notes: ${typographyNotes}.` : '',
    `Brand anchor (bottom of card): "${opts.brandName}"${opts.location ? ` · ${opts.location}` : ''} — small, refined.`,
    ``,
    `═══ COMPOSITION ═══`,
    `Format: 4:5 portrait (1080×1350px equivalent), social-media native.`,
    `Layout rule: ${framingRules}.`,
    `Generous whitespace — let the typography breathe.`,
    `Subtle graphic accent: thin line, geometric shape, or botanical element in ${accent}.`,
    sourceAccounts.length ? `Aesthetic reference quality: ${sourceAccounts.map(a => '@' + a).join(', ')} — refined, editorial.` : '',
    opts.mood ? `Mood: ${opts.mood}.` : '',
    ``,
    `═══ STRICT RULES ═══`,
    `DO NOT: add photographs of people, food, or real locations.`,
    `DO NOT: use generic stock-style gradients (blue-to-purple, etc.).`,
    antiPatterns.length ? `AVOID: ${antiPatterns.join(', ')}.` : '',
    `DO: use only the brand palette colors listed above.`,
    `DO: keep it editorial, minimal, premium — agency-grade graphic design.`,
    `Result: a scroll-stopping event announcement that feels like it came from a luxury brand studio.`,
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Generate an agency-grade event announcement via GPT-image-1 eventOverlayMode.
 * - Picks the best atmospheric gallery photo as the background
 * - Applies a minimal bottom-gradient + event text overlay (DJ name, date, time, brand)
 * - Photo remains dominant visual (top 60%+ stays untouched)
 * Falls back to pure designCardPrompt if no gallery photo is available.
 */
async function generateCanvasEventCard(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  businessType?: string;
  mood?: string;
  vibeProfile?: Record<string, unknown>;
  referenceImageUrl?: string | null;
  contentTypeFmt?: string;
  templateId?: string;
  announcementPrefs?: Record<string, unknown> | null;
  useCase?: 'event' | 'campaign' | 'announcement';
  eventDetails?: {
    artistName?: string;
    date?: string;
    time?: string;
    venueName?: string;
    venueArea?: string;
    tagline?: string;
  };
}): Promise<string | null> {
  try {
    const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';

    // ── Mode A: Sharp + SVG event overlay on real venue photo (preferred) ──
    if (opts.referenceImageUrl) {
      // Resolve /api/media?key= to absolute presigned URL (needed for fetch inside generate-event-card)
      let photoUrl = opts.referenceImageUrl;
      if (photoUrl.includes('/api/media') && photoUrl.includes('key=')) {
        try {
          const { getPresignedUrl } = await import('@/lib/r2-storage');
          const keyMatch = photoUrl.match(/[?&]key=([^&]+)/);
          if (keyMatch?.[1]) {
            const key = decodeURIComponent(keyMatch[1]);
            photoUrl = await getPresignedUrl(key, 3600);
          }
        } catch { /* keep original */ }
      }

      const ev = opts.eventDetails ?? {};
      const useCase = opts.useCase ?? 'event';
      const templateId: AnnouncementTemplateId = (opts.templateId as AnnouncementTemplateId | undefined)
        ?? smartSelectTemplate(
          useCase,
          {
            headline: opts.headline,
            caption: opts.caption,
            mood: opts.mood,
            hasEventDetails: Boolean(ev.artistName || ev.date),
          },
          {
            sectorId: opts.businessType,
            vibeKeywords: opts.vibeProfile
              ? [
                (opts.vibeProfile as Record<string, string>).visual_style,
                (opts.vibeProfile as Record<string, string>).brand_tone,
              ].filter(Boolean) as string[]
              : undefined,
            brandTone: (opts.vibeProfile as Record<string, string> | undefined)?.brand_tone,
          },
        ).templateId;
      const resolvedPrefs = parseAnnouncementPreferences(opts.announcementPrefs);
      const body: Record<string, unknown> = {
        photoUrl,
        contentType:  opts.contentTypeFmt ?? resolvedPrefs.defaultFormat ?? 'post',
        templateId,
        brandName:    opts.brandName,
        location:     opts.location,
        workspaceId:  opts.workspaceId,
        enhancePhoto: false, // Sharp+SVG default — no GPT cost in auto-produce
        artistName:   ev.artistName,
        eventName:    opts.headline,
        date:         ev.date,
        time:         ev.time,
        venueArea:    ev.venueArea,
        tagline:      ev.tagline ?? ev.venueName,
        vibeProfile:  opts.vibeProfile ? {
          grading: (opts.vibeProfile as Record<string, unknown>).grading,
          palette: (opts.vibeProfile as Record<string, unknown>).palette,
        } : undefined,
      };

      const res = await fetch(`${baseUrl}/api/generate-event-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });

      if (res.ok) {
        const data = await res.json();
        const url = (data.imageUrl as string) ?? null;
        if (url) return url;
      } else {
        const err = await res.text().catch(() => '');
        console.warn('[auto-produce] event card failed', res.status, err.slice(0, 200));
      }
    }

    // ── Mode B: Pure typography card fallback (no photo available) ──
    const designCardPrompt = buildEventCanvasPrompt(opts);
    const bodyB: Record<string, unknown> = {
      title:           opts.headline,
      caption:         opts.caption,
      contentType:     'post',
      brandName:       opts.brandName,
      location:        opts.location,
      businessType:    opts.businessType,
      workspaceId:     opts.workspaceId,
      designCardPrompt,
    };
    const resB = await fetch(`${baseUrl}/api/generate-instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyB),
      signal: AbortSignal.timeout(90_000),
    });
    if (!resB.ok) {
      console.warn('[auto-produce] canvas fallback failed', resB.status);
      return null;
    }
    const dataB = await resB.json();
    return (dataB.imageUrl as string) ?? null;
  } catch (err) {
    console.warn('[auto-produce] canvas card error', err);
    return null;
  }
}

/**
 * Pick up to `count` gallery photos semantically matching the content.
 * Returns raw gallery URLs (no AI edit when venue preservation is on).
 */
async function generateVibeCarousel(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  businessType?: string;
  mood?: string;
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  candidateUrls: string[];
  excludeUrls: string[];
  count: number;
}): Promise<{ enhancedUrls: string[]; galleryUrls: string[] }> {
  const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';

  const picked: string[] = [];
  const localUsed = [...opts.excludeUrls];

  const first = pickGalleryPhotoForIdea(
    opts.caption,
    opts.headline,
    opts.mood ?? '',
    opts.galleryAnalysis,
    opts.candidateUrls,
    localUsed,
    localUsed,
    'carousel',
    null,
  );
  if (first) { picked.push(first); localUsed.push(first); }

  for (const url of opts.candidateUrls) {
    if (picked.length >= opts.count) break;
    const base = normalizeGalleryUrl(url);
    if (localUsed.some(ex => normalizeGalleryUrl(ex) === base)) continue;
    if (url.toLowerCase().includes('logo') || url.toLowerCase().includes('icon')) continue;
    picked.push(url);
    localUsed.push(url);
  }

  if (!picked.length) return { enhancedUrls: [], galleryUrls: [] };

  if (shouldPreserveVenuePhotos()) {
    return { enhancedUrls: picked.slice(0, opts.count), galleryUrls: picked.slice(0, opts.count) };
  }

  const enhanced = (await Promise.all(
    picked.slice(0, opts.count).map(async (refUrl, idx) => {
      // Slide 1: vibe-enhanced hero. Slides 2+: raw gallery (same quality, $0 extra)
      if (idx > 0) return refUrl;
      try {
        const body: Record<string, unknown> = {
          title:           opts.headline,
          caption:         opts.caption,
          contentType:     'post',
          brandName:       opts.brandName,
          location:        opts.location,
          businessType:    opts.businessType,
          workspaceId:     opts.workspaceId,
          referenceImageUrls: [refUrl],
          enhanceMode:     true,
          enhanceContext:  'Apply subtle color grading only. Preserve the venue photo exactly — do not replace the scene.',
        };
        const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90_000),
        });
        if (!res.ok) return refUrl; // fallback to raw on failure
        const data = await res.json();
        return (data.imageUrl as string) ?? refUrl;
      } catch {
        return refUrl;
      }
    }))
  ).filter(Boolean) as string[];

  return { enhancedUrls: enhanced, galleryUrls: picked.slice(0, opts.count) };
}

async function generateRunwayReel(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  businessType?: string;
  mood?: string;
  referenceImageUrl?: string;
  /** 2-3 additional gallery photos for multi-reference mode — Runway blends all into one video */
  additionalPhotoUrls?: string[];
  vibeProfile?: Record<string, unknown>;
  /** Gallery photo description from gallery_analysis — feeds AI director prompt */
  photoDescription?: string;
  /** Gallery photo content tags — feed content-kind inference */
  photoTags?: string[];
  /** BrandTheme grading for director prompt color injection */
  brandThemeGrading?: { look?: string; lut_directive?: string };
}): Promise<string | null> {
  try {
    const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';

    // Build a vibe-aware cinematic concept from the vibe DNA
    const vibe = opts.vibeProfile ?? {};
    const grading = (vibe.grading as Record<string, string> | undefined) ?? {};
    const composition = (vibe.composition as Record<string, string> | undefined) ?? {};
    const sourceAccounts: string[] = Array.isArray(vibe.source_accounts) ? vibe.source_accounts : [];

    const vibeCinema = [
      grading.look ? `${grading.look} color grade` : 'golden hour color grade',
      grading.lut_directive ? grading.lut_directive : '',
      composition.framing_rules ? composition.framing_rules : 'subject in lower-third, expansive sky or sea',
    ].filter(Boolean).join(', ');

    const antiPatterns: string[] = Array.isArray(vibe.anti_patterns) ? vibe.anti_patterns : [];

    const concept = [
      `${opts.brandName || 'Brand'} — ${opts.headline}`,
      opts.location ? `Location: ${opts.location}` : '',
      opts.mood ? `Mood: ${opts.mood}` : '',
      `Cinematic style: ${vibeCinema}`,
      sourceAccounts.length ? `Aesthetic reference: ${sourceAccounts.map(a => '@' + a).join(', ')} quality` : '',
      antiPatterns.length ? `Avoid: ${antiPatterns.join(', ')}` : '',
    ].filter(Boolean).join('. ');

    // Camera motion: prefer vibe.motion > mood heuristics
    const vibeMotion = (vibe.motion as Record<string, string> | undefined) ?? {};
    const vibeCameraMove = vibeMotion.camera_movement || '';
    const moodLower = (opts.mood || '').toLowerCase();
    const cameraMotion =
      vibeCameraMove.includes('dolly') ? 'dolly_in' :
      vibeCameraMove.includes('pan') ? 'slow_pan' :
      vibeCameraMove.includes('track') ? 'tracking' :
      vibeCameraMove.includes('orbit') ? 'orbit' :
      moodLower.includes('sunset') || moodLower.includes('golden') ? 'dolly_in' :
      moodLower.includes('sea') || moodLower.includes('blue') ? 'slow_pan' :
      moodLower.includes('energy') || moodLower.includes('dynamic') ? 'tracking' :
      'dolly_in';

    const palette = (vibe.palette as Record<string, string> | undefined) ?? {};
    const paletteDesc = palette.palette_description ?? '';
    const derivedVisualStyle = grading.look || paletteDesc || 'warm';
    const derivedBrandTone = paletteDesc || (opts.businessType || 'lifestyle');

    const body: Record<string, unknown> = {
      title:       opts.headline || `${opts.brandName} Reel`,
      // `caption` carries the actual Instagram caption text written by CrewAI.
      // The director prompt generator uses this to visualize what the caption SAYS.
      // `concept` carries vibe/style direction as secondary context.
      caption:     opts.caption,
      concept,
      platform:    'instagram',
      contentType: 'reel',
      visualStyle: derivedVisualStyle,
      cameraMotion,
      brandTone:   derivedBrandTone,
      duration:    5,
      ratio:       '720:1280',
      sceneMetadata: {
        brandName:    opts.brandName,
        location:     opts.location,
        businessType: opts.businessType,
        workspaceId:  opts.workspaceId,
      },
      // AI Director Prompt context — enables senior-level cinematic generation
      photoDescription: opts.photoDescription,
      photoTags:        opts.photoTags,
      vibeProfile:      opts.vibeProfile ? {
        grading:     (opts.vibeProfile.grading as Record<string, unknown>) ?? {},
        palette:     (opts.vibeProfile.palette as Record<string, unknown>) ?? {},
        motion:      (opts.vibeProfile.motion  as Record<string, unknown>) ?? {},
        composition: (opts.vibeProfile.composition as Record<string, unknown>) ?? {},
      } : undefined,
      brandThemeGrading: opts.brandThemeGrading,
    };

    // Multi-reference mode: pass primary photo + up to 2 additional brand photos
    // Runway blends all into one richer video that captures brand's full visual story
    const allPhotoUrls = [
      opts.referenceImageUrl,
      ...(opts.additionalPhotoUrls ?? []),
    ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'));

    if (allPhotoUrls.length >= 2) {
      // Multi-reference: pass all as promptImages array (Runway SDK handles Array<{position, uri}>)
      body.promptImages = allPhotoUrls.slice(0, 4);
      console.log(`[auto-produce] Multi-reference reel: ${allPhotoUrls.length} photos`);
    } else if (opts.referenceImageUrl) {
      body.promptImage = opts.referenceImageUrl;
    }

    const res = await fetch(`${baseUrl}/api/generate-reel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000), // Runway gen4_turbo ~60-90s
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] Runway reel failed', res.status, err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const videoUrl = (data.videoUrl ?? data.outputUrls?.[0]) as string | undefined;
    if (videoUrl) {
      console.log('[auto-produce] Runway reel produced:', videoUrl.slice(0, 80));
    }
    return videoUrl ?? null;
  } catch (err) {
    console.warn('[auto-produce] Runway reel error', err);
    return null;
  }
}

async function saveArtifactToNexus(
  workspaceId: string,
  params: { title: string; contentUrl: string; content: string; platform: string; contentType: string; metadata: Record<string, unknown> },
): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch(`${NEXUS_API}/api/artifacts/creative`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': workspaceId,
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: `Nexus ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    return { id: data.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  cleanupOldBuckets();

  let body: AutoProduceRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { workspaceId, missionId, nodeKey, ideas, galleryAnalysis, brandName } = body;
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  if (!ideas?.length) {
    return NextResponse.json({ error: 'No ideas provided' }, { status: 400 });
  }

  // Fetch lightweight brand context for vibe-generation metadata
  let brandCtx: Record<string, unknown> = {};
  try {
    const CREW = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
    const r = await fetch(`${CREW}/api/v1/brand-context/${workspaceId}`, {
      headers: { 'X-Internal-Api-Key': INTERNAL_KEY, 'X-Tenant-Id': workspaceId },
      signal: AbortSignal.timeout(5_000),
    });
    if (r.ok) brandCtx = await r.json();
  } catch { /* non-fatal, continue without */ }

  const hasVibe = Boolean(brandCtx.brand_vibe_profile);
  const brandLocation = (brandCtx.location as string) ?? '';
  const brandBusinessType = (brandCtx.business_type as string) ?? (brandCtx.industry as string) ?? '';
  const resolvedBrandName = brandName ?? (brandCtx.business_name as string) ?? 'Brand';

  // Fetch BrandTheme for LUT directive injection into image generation
  let brandTheme: Record<string, unknown> | null = null;
  try {
    const CREW = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
    const r = await fetch(`${CREW}/api/v1/brand-context/${workspaceId}/theme`, {
      headers: { 'X-Internal-Api-Key': INTERNAL_KEY, 'X-Tenant-Id': workspaceId },
      signal: AbortSignal.timeout(5_000),
    });
    if (r.ok) {
      const t = await r.json();
      brandTheme = (t.theme as Record<string, unknown>) ?? null;
    }
  } catch { /* non-fatal */ }

  const brandLutDirective: string = (brandTheme?.grading as Record<string, unknown>)?.lut_directive as string ?? '';
  const brandGradingLook: string = (brandTheme?.grading as Record<string, unknown>)?.look as string ?? '';
  const brandAntiPatterns: string[] = (brandTheme?.anti_patterns as string[]) ?? [];
  const announcementPrefs = parseAnnouncementPreferences(
    brandTheme?.announcement_library
    ?? (brandCtx.brand_theme as Record<string, unknown> | undefined)?.announcement_library,
  );

  const budget = await canProduce(workspaceId, ideas.length);
  if (!budget.allowed) {
    return NextResponse.json({
      error: budget.reason,
      produced: 0,
      budget: {
        spentTodayUsd: budget.spentTodayUsd,
        dailyBudgetUsd: budget.dailyBudgetUsd,
        remainingUsd: budget.remainingUsd,
      },
    }, { status: 429 });
  }

  const maxIdeas = budget.remaining;
  const toProcess = ideas.slice(0, maxIdeas);
  const galleryAnalysisRaw = galleryAnalysis ?? {};
  const { candidateUrls: galleryPhotos, meta: galleryMeta } = parseBrandGalleryPhotos(
    brandCtx,
    galleryAnalysisRaw,
  );
  const hasGallery = galleryPhotos.length > 0;
  const galleryUsage = await fetchUsedGalleryImages(workspaceId);
  const batchUsedByType: Record<PostTypeBucket, string[]> = {
    feed: [], story: [], reel: [], carousel: [],
  };
  const results: { id?: string; title: string; imageUrl: string; videoUrl?: string; error?: string }[] = [];
  let costEstimate = 0;

  for (const idea of toProcess) {
    const headline = getField(idea, 'headline', 'concept_title', 'title');
    let caption = getField(idea, 'caption_draft', 'caption');
    const hashtags = normalizeHashtags(idea.hashtags);
    let cta = getField(idea, 'cta', 'call_to_action');
    if (caption && cta) {
      const harmonized = harmonizeCaptionAndCta(
        caption,
        cta,
        (brandCtx.languages as string | undefined) ?? (brandCtx.inferred_language as string | undefined),
      );
      caption = harmonized.caption;
      cta = harmonized.cta;
    }
    const kind = detectContentKind(idea);
    const postType = kindToPostType(kind);
    const fmt = kind.replace('instagram_', '');
    const mood = idea.mood || '';
    const strategicPurpose = idea.strategic_purpose || '';
    const typeExclude = getExcludeUrlsForPostType(galleryUsage, postType, batchUsedByType[postType]);

    if (!caption && !headline) {
      results.push({ title: '(empty idea)', imageUrl: '', error: 'No caption or headline' });
      continue;
    }

    // ── Step 1: find best gallery reference photo (per post type) ─────
    let referenceUrl: string | null = null;
    let carouselGalleryUrls: string[] = [];

    const agentUrl = idea.visual_production_spec?.selected_gallery_url || idea.selected_gallery_url || null;
    const batchExclude = batchUsedByType[postType];

    if (hasGallery) {
      referenceUrl = pickGalleryPhotoForIdea(
        caption,
        headline,
        mood,
        galleryMeta,
        galleryPhotos,
        typeExclude,
        batchExclude,
        postType,
        typeof agentUrl === 'string' && agentUrl.startsWith('http') ? agentUrl : null,
      );
    }

    if (!referenceUrl) {
      const msg = hasGallery
        ? 'Galeride caption ile eşleşen fotoğraf bulunamadı'
        : 'Marka galerisi boş — Brand Hub\'dan mekan fotoğrafları yükleyin';
      console.warn(`[auto-produce] gallery-only skip (${postType}): ${headline.slice(0, 50)}`);
      results.push({ title: headline, imageUrl: '', error: msg });
      continue;
    }

    // Never mark generative URLs — gallery-only pipeline guarantees real venue photos
    markGalleryUrlUsedForPostType(galleryUsage, referenceUrl, postType);
    batchUsedByType[postType].push(referenceUrl);

    const isReel     = kind === 'instagram_reel';
    const isCarousel = kind === 'instagram_carousel';
    const isCanvas   = kind === 'instagram_canvas';
    const hasEventDetails = Boolean(idea.event_details?.artist_name || idea.event_details?.date);
    const vibeProfile = hasVibe ? (brandCtx.brand_vibe_profile as Record<string, unknown>) : undefined;

    // ── Step 2: Agency production ─────────────────────────────────────
    // Event overlay (story/post/canvas with event_details)
    //              → GPT-image-1 eventOverlayMode: photo bg + minimal gradient + text
    // Carousel     → 3-4 gallery photos enhanced with vibe DNA → media_urls
    // Reel         → Runway Gen4 Turbo image-to-video (~$0.10/5s)
    // Post/Story   → raw gallery photo (optional enhance only if VENUE_PHOTO_PRESERVE=false)
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    let carouselUrls: string[] = [];

    // Event announcement overlay — applies to canvas, story AND post when event_details present
    if (isCanvas || (hasEventDetails && !isReel && !isCarousel)) {
      const evDet = idea.event_details;
      const contentTypeFmt = kind === 'instagram_story' ? 'story' : 'post';
      const useCase = inferAnnouncementUseCase({
        templateUseCase: idea.template_use_case as string | undefined,
        strategicPurpose: strategicPurpose,
        hasEventDetails,
      });
      const card = await generateCanvasEventCard({
        workspaceId,
        headline,
        caption,
        brandName:    resolvedBrandName,
        location:     brandLocation,
        businessType: brandBusinessType,
        mood,
        vibeProfile,
        referenceImageUrl: referenceUrl,
        announcementPrefs: announcementPrefs as unknown as Record<string, unknown>,
        useCase,
        eventDetails: evDet ? {
          artistName: evDet.artist_name,
          date:       evDet.date,
          time:       evDet.time,
          venueName:  evDet.venue_name ?? resolvedBrandName,
          venueArea:  evDet.venue_area,
          tagline:    evDet.tagline,
        } : { venueName: resolvedBrandName },
        contentTypeFmt,
      });
      imageUrl = card ?? referenceUrl;
      costEstimate += card ? 0.001 : 0; // Sharp+SVG event card — no GPT by default

    } else if (isCarousel) {
      if (hasGallery) {
        const carouselExclude = getExcludeUrlsForPostType(
          galleryUsage, 'carousel', batchUsedByType.carousel,
        );
        const carouselResult = await generateVibeCarousel({
          workspaceId,
          headline,
          caption,
          brandName:    resolvedBrandName,
          location:     brandLocation,
          businessType: brandBusinessType,
          mood,
          galleryAnalysis: galleryMeta,
          candidateUrls: galleryPhotos,
          excludeUrls: carouselExclude,
          count:        4,
        });
        carouselUrls = carouselResult.enhancedUrls;
        carouselGalleryUrls = carouselResult.galleryUrls;
        for (const gUrl of carouselGalleryUrls) {
          markGalleryUrlUsedForPostType(galleryUsage, gUrl, 'carousel');
          batchUsedByType.carousel.push(gUrl);
        }
        costEstimate += carouselUrls.length > 0 ? 0.04 : 0; // only hero slide enhanced
      }
      imageUrl = carouselUrls[0] ?? referenceUrl;

    } else if (isReel) {
      // Runway: animate the reference venue photo with vibe-driven cinematic prompt
      const reelSpec = idea.reel_motion_spec;
      // Fetch gallery photo description for AI director prompt
      const galleryEntry = referenceUrl
        ? (galleryMeta[referenceUrl] ?? Object.entries(galleryMeta).find(([k]) =>
            normalizeGalleryUrl(k) === normalizeGalleryUrl(referenceUrl!),
          )?.[1])
        : undefined;
      const photoDescription = galleryEntry?.description as string | undefined;
      const photoTags = Array.isArray(galleryEntry?.contentTags)
        ? (galleryEntry!.contentTags as string[])
        : undefined;

      // Pick 1-2 additional thematically RELATED photos for multi-reference enrichment.
      // Score by tag overlap with the primary photo's contentTags + headline/caption keywords.
      const primaryTags = new Set([
        ...(photoTags ?? []).map(t => t.toLowerCase()),
        ...caption.toLowerCase().split(/\s+/).filter(w => w.length > 4),
        ...headline.toLowerCase().split(/\s+/).filter(w => w.length > 4),
      ]);
      const additionalPhotoUrls = hasGallery
        ? galleryPhotos
            .filter(u =>
              u !== referenceUrl &&
              u.startsWith('http') &&
              !isGalleryUrlUsedForPostType(galleryUsage, u, 'reel'),
            )
            .map(u => {
              const entry = galleryMeta[u] ?? Object.entries(galleryMeta).find(([k]) =>
                normalizeGalleryUrl(k) === normalizeGalleryUrl(u),
              )?.[1];
              const e = (entry ?? {}) as Record<string, unknown>;
              const entryTags: string[] = (
                Array.isArray(e.contentTags) ? e.contentTags :
                Array.isArray(e.tags) ? e.tags : []
              ).map((t: unknown) => String(t).toLowerCase());
              const overlap = entryTags.filter(t => primaryTags.has(t)).length;
              // Penalise logos, maps, banners
              const urlLower = u.toLowerCase();
              const penalty = ['logo', 'map', 'banner', 'menu', 'icon'].some(p => urlLower.includes(p)) ? -5 : 0;
              return { url: u, score: overlap + penalty };
            })
            .sort((a, b) => b.score - a.score) // highest tag overlap first
            .slice(0, 2)
            .map(x => x.url)
        : [];

      const runwayBudget = await canAffordRunway(workspaceId);
      if (runwayBudget.allowed) {
        const runway = await generateRunwayReel({
          workspaceId,
          headline,
          caption,
          brandName:    resolvedBrandName,
          location:     brandLocation,
          businessType: brandBusinessType,
          mood: reelSpec?.pace || mood,
          referenceImageUrl: referenceUrl,
          additionalPhotoUrls,
          vibeProfile,
          photoDescription,
          photoTags,
          brandThemeGrading: brandLutDirective || brandGradingLook
            ? { look: brandGradingLook || undefined, lut_directive: brandLutDirective || undefined }
            : undefined,
        });
        if (runway) {
          videoUrl = runway;
          imageUrl = referenceUrl;
          incrementReelCount(workspaceId);
          costEstimate += 0.10;
        } else {
          console.warn('[auto-produce] Runway failed for reel, falling back to still image');
        }
      } else {
        console.log('[auto-produce] Runway skipped:', runwayBudget.reason);
      }
    }

    // Post/Story + Reel fallback: optional subtle enhance — always keep raw gallery on failure
    if (!videoUrl && !isCanvas && !isCarousel) {
      imageUrl = referenceUrl;
      if (
        SUBTLE_ENHANCE
        && referenceUrl
        && (hasVibe || idea.visual_production_spec?.image_edit_prompt)
      ) {
        const generated = await generateVibeImage({
          workspaceId,
          headline,
          caption,
          contentType: fmt,
          brandName:   resolvedBrandName,
          location:    brandLocation,
          businessType: brandBusinessType,
          referenceImageUrl: referenceUrl,
          agentImageEditPrompt: idea.visual_production_spec?.image_edit_prompt,
          lutDirective:  brandLutDirective || undefined,
          antiPatterns:  brandAntiPatterns.length ? brandAntiPatterns : undefined,
        });
        if (generated) {
          imageUrl = generated;
          costEstimate += 0.04;
        }
      }
    }

    const finalContentUrl = videoUrl ?? imageUrl!;

    // Stories: event info is baked into the image — keep caption minimal/empty
    const isEventStory = (kind === 'instagram_story' || isCanvas) && hasEventDetails;
    const publishCaption = isEventStory
      ? '' // event details are on the image; no caption for stories
      : caption;
    const publishHashtags = isEventStory ? [] : hashtags;

    const contentJson = JSON.stringify({
      kind,
      contentType: fmt,
      caption: publishCaption,
      hashtags: publishHashtags,
      cta,
      imageUrl: videoUrl ?? imageUrl,
      videoUrl,
      carousel_urls: carouselUrls.length ? carouselUrls : undefined,
      gallery_photo_urls: carouselGalleryUrls.length ? carouselGalleryUrls : undefined,
      reference_photo_url: referenceUrl,
      headline,
    });

    const metadata: Record<string, unknown> = {
      contentType: fmt,
      kind,
      platform: 'instagram',
      headline,
      caption: publishCaption.slice(0, 300),
      cta,
      hashtags: publishHashtags,
      strategic_purpose: strategicPurpose,
      auto_produced: true,
      gallery_sourced: true,
      gallery_only: GALLERY_ONLY,
      agency_produced: Boolean(videoUrl) || isCanvas || (isCarousel && carouselUrls.length > 0) || (SUBTLE_ENHANCE && hasVibe && imageUrl !== referenceUrl),
      runway_produced: Boolean(videoUrl),
      canvas_produced: isCanvas,
      carousel_urls:   carouselUrls.length ? carouselUrls : undefined,
      gallery_photo_urls: carouselGalleryUrls.length ? carouselGalleryUrls : undefined,
      source: 'auto-produce',
      mission_id: missionId || null,
      node_key: nodeKey || null,
      mood,
      posting_time_suggestion: idea.posting_time_suggestion || null,
      imageUrl: videoUrl ?? imageUrl,
      videoUrl,
      reference_photo_url: referenceUrl,
    };

    const title = headline || `${resolvedBrandName} — ${fmt}`;

    const saved = await saveArtifactToNexus(workspaceId, {
      title,
      contentUrl: finalContentUrl,
      content: contentJson,
      platform: 'instagram',
      contentType: fmt,
      metadata,
    });

    results.push({ id: saved.id, title, imageUrl: finalContentUrl, videoUrl: videoUrl ?? undefined, error: saved.error });
  }

  const produced = results.filter(r => r.id && !r.error).length;
  await recordProduction(workspaceId, produced, costEstimate);

  return NextResponse.json({
    produced,
    total: toProcess.length,
    costEstimate: Math.round(costEstimate * 1000) / 1000,
    artifacts: results,
  });
}
