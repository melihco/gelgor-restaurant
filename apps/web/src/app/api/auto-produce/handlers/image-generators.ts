import { shouldPreserveVenuePhotos, shouldUpscaleSmallGalleryPhoto } from '@/lib/venue-photo-policy';
import {
  pickScoredCarouselSlides,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
} from '@/lib/gallery-photo-matcher';
import { MIN_ACCEPT_SCORE } from '@/lib/gallery-photo-matcher';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import {
  buildEventCardPayload,
  type RendererBrandContext,
  type RendererGalleryMeta,
} from '@/lib/renderer-payload';
import type { MissionVisualDesignCard } from '@/lib/mission-visual-design-cards';
import type { ProductionIdea } from '@/types/production-idea';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

export async function generateVibeImage(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  contentType: string;
  brandName: string;
  location?: string;
  businessType?: string;
  referenceImageUrl?: string;
  agentImageEditPrompt?: string;
  lutDirective?: string;
  antiPatterns?: string[];
  brandTone?: string;
  brandDescription?: string;
  targetAudience?: string;
  visualStyle?: string;
  visualDna?: string;
  vibeProfile?: Record<string, unknown> | null;
  logoUrl?: string;
  referenceImageUrls?: string[];
  captionDrivenMode?: boolean;
}): Promise<string | null> {
  if (shouldPreserveVenuePhotos() && opts.referenceImageUrl) {
    try {
      const baseUrl = getNextjsInternalOrigin();
      const proxyUrl = `${baseUrl}/api/media-proxy?url=${encodeURIComponent(opts.referenceImageUrl)}`;
      const probeRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(8_000) });
      if (probeRes.ok) {
        const sharpModule = await import('sharp');
        const buf = Buffer.from(await probeRes.arrayBuffer());
        const meta = await sharpModule.default(buf).metadata();
        const w = meta.width ?? 1080;
        if (!shouldUpscaleSmallGalleryPhoto(w)) {
          return opts.referenceImageUrl;
        }
        console.log(`[auto-produce] small gallery photo ${w}px → AI upscale`);
      } else {
        return opts.referenceImageUrl;
      }
    } catch {
      return opts.referenceImageUrl;
    }
  }
  try {
    const baseUrl = getNextjsInternalOrigin();
    const enhancePrompt = opts.agentImageEditPrompt
      || [
          'Apply agency-grade color grading to this brand photo.',
          'PRESERVE: every architectural element, person, object, and composition stays exactly in place.',
          'DO NOT move, add, or remove anything from the scene.',
          'APPLY: brand palette colors in lighting, ambient tone, and color grade.',
          opts.lutDirective ? `Grading look: ${opts.lutDirective}.` : 'Warm editorial grading, premium feel.',
          opts.antiPatterns?.length ? `NEVER: ${opts.antiPatterns.slice(0, 3).join('; ')}.` : '',
        ].filter(Boolean).join(' ');

    const body: Record<string, unknown> = {
      title:        opts.headline,
      caption:      opts.caption,
      contentType:  opts.contentType,
      brandName:    opts.brandName,
      location:     opts.location,
      industry:     opts.businessType,
      description:  opts.brandDescription,
      brandTone:    opts.brandTone,
      targetAudience: opts.targetAudience,
      visualStyle:  opts.visualStyle,
      visualDna:    opts.visualDna,
      workspaceId:  opts.workspaceId,
      logoUrl:      opts.logoUrl,
      referenceImageUrls: opts.referenceImageUrls?.length
        ? opts.referenceImageUrls
        : opts.referenceImageUrl ? [opts.referenceImageUrl] : undefined,
      brandVibeProfile: opts.vibeProfile ?? undefined,
      enhanceMode:    Boolean(opts.referenceImageUrl) && !opts.captionDrivenMode,
      enhanceContext: opts.referenceImageUrl && !opts.captionDrivenMode ? enhancePrompt : undefined,
      captionDrivenMode: opts.captionDrivenMode === true,
      ...(opts.antiPatterns?.length && !opts.vibeProfile ? {
        brandVibeProfile: { anti_patterns: opts.antiPatterns } as Record<string, unknown>,
      } : {}),
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

export async function generateDesignedImageFromMissionCard(opts: {
  workspaceId: string;
  card: MissionVisualDesignCard;
  headline: string;
  caption: string;
  referenceImageUrl: string;
  contentType: 'post' | 'story';
  brandName: string;
  location?: string;
  businessType?: string;
  logoUrl?: string;
  extraReferenceImageUrls?: string[];
}): Promise<string | null> {
  const prompt = String(opts.card.image_generation_prompt ?? '').trim();
  if (!prompt || !isUsableGalleryPhotoUrl(opts.referenceImageUrl)) return null;
  try {
    const baseUrl = getNextjsInternalOrigin();
    const referenceImageUrls = [
      opts.referenceImageUrl,
      ...(opts.extraReferenceImageUrls ?? []).filter((url) => url && url !== opts.referenceImageUrl),
    ].slice(0, 2);
    const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: String(opts.card.headline ?? opts.card.concept_title ?? opts.headline).slice(0, 60),
        caption: opts.caption,
        contentType: opts.contentType,
        brandName: opts.brandName,
        location: opts.location,
        industry: opts.businessType,
        referenceImageUrls,
        designCardPrompt: prompt,
        backgroundIntent: opts.card.background_intent,
        overlayColor: opts.card.overlay_color,
        logoUrl: opts.logoUrl,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] mission visual design card render failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json().catch(() => ({})) as { imageUrl?: string };
    return typeof data.imageUrl === 'string' ? data.imageUrl : null;
  } catch (err) {
    console.warn('[auto-produce] mission visual design card render error', err);
    return null;
  }
}

/**
 * Designed feed post via GPT-image-1, grounded on the caption-matched gallery photo.
 * The agency-style design prompt is built from the resolved typography vibe + brand
 * colors (see buildDesignedPostDesignCardPrompt). Returns null on failure so the
 * caller can fall back to the fal Ideogram typography track.
 */
export async function generateDesignedPostImage(opts: {
  workspaceId: string;
  designCardPrompt: string;
  /** Reel covers use stronger Canva Pro edit directives + 9:16 sizing. */
  designCardMode?: 'post' | 'reel';
  headline: string;
  caption: string;
  referenceImageUrls: string[];
  brandName: string;
  format: 'post' | 'story';
  location?: string;
  businessType?: string;
  logoUrl?: string;
  logoPlacement?: import('@/lib/fal-logo-placement').ResolvedFalLogoPlacement | null;
  /** Skip logo composite in generate-instagram-image — caller composites after. */
  deferLogoComposite?: boolean;
  overlayColor?: string;
  backgroundIntent?: string;
}): Promise<string | null> {
  const refs = opts.referenceImageUrls.filter((u) => u && isUsableGalleryPhotoUrl(u)).slice(0, 2);
  if (!opts.designCardPrompt.trim() || refs.length === 0) {
    console.warn(
      `[auto-produce] designed post skipped: prompt=${Boolean(opts.designCardPrompt.trim())} refs=${refs.length} ` +
      `raw=${opts.referenceImageUrls.length}`,
    );
    return null;
  }
  try {
    const baseUrl = getNextjsInternalOrigin();
    const payload = JSON.stringify({
      title: opts.headline.slice(0, 60),
      caption: opts.caption,
      contentType: opts.format === 'story' ? 'instagram_story' : 'instagram_post',
      brandName: opts.brandName,
      location: opts.location,
      industry: opts.businessType,
      workspaceId: opts.workspaceId,
      referenceImageUrls: refs,
      designCardPrompt: opts.designCardPrompt,
      designCardMode: opts.designCardMode,
      backgroundIntent: opts.backgroundIntent,
      overlayColor: opts.overlayColor,
      logoUrl: opts.logoUrl,
      logoPlacement: opts.logoPlacement,
      deferLogoComposite: opts.deferLogoComposite,
    });
    let res: Response | null = null;
    let lastFetchErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: AbortSignal.timeout(120_000),
        });
        break;
      } catch (fetchErr) {
        lastFetchErr = fetchErr;
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        const retryable = /connect timeout|fetch failed|ECONNREFUSED|socket hang up/i.test(msg);
        if (!retryable || attempt >= 3) throw fetchErr;
        await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
      }
    }
    if (!res) throw lastFetchErr ?? new Error('generate-instagram-image fetch failed');
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn(
        `[auto-produce] designed post (gpt-image) failed ${res.status} refs=${refs.map((u) => u.split('/').pop()).join(',')} ` +
        err.slice(0, 200),
      );
      return null;
    }
    const data = await res.json().catch(() => ({})) as { imageUrl?: string };
    return typeof data.imageUrl === 'string' ? data.imageUrl : null;
  } catch (err) {
    console.warn('[auto-produce] designed post (gpt-image) error', err);
    return null;
  }
}

export async function generateEventOverlayImage(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  referenceImageUrl: string;
  brandName: string;
  location?: string;
  businessType?: string;
  vibeProfile?: Record<string, unknown> | null;
  contentTypeFmt: 'post' | 'story';
  eventDetails?: {
    artistName?: string;
    date?: string;
    time?: string;
    venueArea?: string;
    tagline?: string;
    ctaText?: string;
  };
}): Promise<string | null> {
  if (!isUsableGalleryPhotoUrl(opts.referenceImageUrl)) return null;
  try {
    const baseUrl = getNextjsInternalOrigin();
    const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: opts.headline,
        caption: opts.caption,
        contentType: opts.contentTypeFmt,
        brandName: opts.brandName,
        location: opts.location,
        industry: opts.businessType,
        workspaceId: opts.workspaceId,
        referenceImageUrls: [opts.referenceImageUrl],
        eventOverlayMode: true,
        brandVibeProfile: opts.vibeProfile ?? undefined,
        eventDetails: opts.eventDetails
          ? {
              artistName: opts.eventDetails.artistName,
              date: opts.eventDetails.date,
              time: opts.eventDetails.time,
              venueArea: opts.eventDetails.venueArea,
              tagline: opts.eventDetails.tagline,
            }
          : undefined,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] event overlay failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json() as { imageUrl?: string };
    return data.imageUrl ?? null;
  } catch (err) {
    console.warn('[auto-produce] event overlay error', err);
    return null;
  }
}

export async function generateMarkyLayerCard(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  businessType?: string;
  mood?: string;
  vibeProfile?: Record<string, unknown>;
  referenceImageUrl: string;
  contentTypeFmt: 'post' | 'story';
  templateUseCase?: string;
  strategicPurpose?: string;
  ideaIndex?: number;
  brandTheme?: Record<string, unknown> | null;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  usedTemplateIds?: string[];
  baseUrl?: string;
  eventDetails?: {
    artistName?: string;
    date?: string;
    time?: string;
    venueArea?: string;
    tagline?: string;
    ctaText?: string;
  };
}): Promise<string | null> {
  if (!isUsableGalleryPhotoUrl(opts.referenceImageUrl)) return null;
  const ev = opts.eventDetails ?? {};
  const displayHeadline = ev.artistName
    ? [ev.artistName, ev.date].filter(Boolean).join(' · ')
    : opts.headline;
  const subtitle = ev.tagline ?? opts.caption;

  if (ev.artistName || ev.date || ev.time) {
    return generateEventOverlayImage({
      workspaceId: opts.workspaceId,
      headline: displayHeadline.trim() || opts.headline,
      caption: subtitle,
      referenceImageUrl: opts.referenceImageUrl,
      brandName: opts.brandName,
      location: opts.location,
      businessType: opts.businessType,
      vibeProfile: opts.vibeProfile ?? null,
      contentTypeFmt: opts.contentTypeFmt,
      eventDetails: ev,
    });
  }

  try {
    const baseUrl = opts.baseUrl ?? getNextjsInternalOrigin();
    const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: displayHeadline.trim() || opts.headline,
        caption: subtitle,
        contentType: opts.contentTypeFmt,
        brandName: opts.brandName,
        location: opts.location,
        industry: opts.businessType,
        workspaceId: opts.workspaceId,
        referenceImageUrls: [opts.referenceImageUrl],
        brandVibeProfile: opts.vibeProfile ?? undefined,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { imageUrl?: string };
    return data.imageUrl ?? null;
  } catch {
    return null;
  }
}

export async function generateVibeCarousel(opts: {
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
  const baseUrl = getNextjsInternalOrigin();

  const localUsed = [...opts.excludeUrls];
  const candidates = opts.candidateUrls.filter(
    (u) => !localUsed.some((ex) => normalizeGalleryUrl(ex) === normalizeGalleryUrl(u))
      && !u.toLowerCase().includes('logo') && !u.toLowerCase().includes('icon'),
  );

  const matchInput: MatchPhotoInput = {
    caption: opts.caption,
    headline: opts.headline,
    mood: opts.mood ?? '',
    contentType: 'carousel',
    businessType: opts.businessType,
  };

  const scored = pickScoredCarouselSlides(
    matchInput,
    candidates,
    opts.galleryAnalysis,
    localUsed,
    opts.count,
    MIN_ACCEPT_SCORE,
  );
  const picked = scored.map((r) => r.url);

  if (!picked.length) return { enhancedUrls: [], galleryUrls: [] };

  if (shouldPreserveVenuePhotos()) {
    return { enhancedUrls: picked.slice(0, opts.count), galleryUrls: picked.slice(0, opts.count) };
  }

  const enhanced = (await Promise.all(
    picked.slice(0, opts.count).map(async (refUrl, idx) => {
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
        if (!res.ok) return refUrl;
        const data = await res.json();
        return (data.imageUrl as string) ?? refUrl;
      } catch {
        return refUrl;
      }
    }))
  ).filter(Boolean) as string[];

  return { enhancedUrls: enhanced, galleryUrls: picked.slice(0, opts.count) };
}

export async function renderEventCardFromPayload(
  prodIdea: ProductionIdea,
  brand: RendererBrandContext,
  gallery: RendererGalleryMeta,
  opts: { workspaceId: string; vibeProfile?: Record<string, unknown> },
): Promise<string | null> {
  const baseUrl = getNextjsInternalOrigin();
  const payload = buildEventCardPayload(prodIdea, brand, gallery, { workspaceId: opts.workspaceId });
  if (!isUsableGalleryPhotoUrl(payload.photoUrl)) return null;
  try {
    const res = await fetch(`${baseUrl}/api/generate-event-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoUrl: payload.photoUrl,
        contentType: payload.contentType,
        templateId: payload.templateId,
        brandName: payload.brandName,
        location: payload.location,
        workspaceId: payload.workspaceId,
        eventName: payload.eventName,
        tagline: payload.tagline,
        date: payload.date,
        enhancePhoto: payload.enhancePhoto,
        vibeProfile: opts.vibeProfile,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] event-card failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json() as { imageUrl?: string };
    const url = data.imageUrl;
    if (url) console.log('[auto-produce] event-card (buildEventCardPayload):', prodIdea.headline.slice(0, 40));
    return url ?? null;
  } catch (err) {
    console.warn('[auto-produce] event-card error', err);
    return null;
  }
}

/**
 * Product Showcase — AI background replacement for product photos.
 * Places the product on a scenic, brand-relevant background while strictly
 * preserving all product labels, logos, and text.
 */
export async function generateProductShowcaseImage(opts: {
  workspaceId: string;
  productPhotoUrl: string;
  headline: string;
  caption: string;
  format: 'post' | 'story';
  brandName: string;
  location?: string;
  businessType?: string;
  backgroundStyle?: 'venue_location' | 'lifestyle_scene' | 'studio_clean' | 'auto';
  logoUrl?: string;
  brandTone?: string;
}): Promise<string | null> {
  const bgStylePrompt = (() => {
    switch (opts.backgroundStyle) {
      case 'venue_location':
        return `Background: scenic outdoor location of ${opts.location || 'a Mediterranean coastal town'}. Natural lighting, soft depth of field.`;
      case 'lifestyle_scene':
        return 'Background: lifestyle setting where this product would naturally be used. Warm ambient lighting, shallow depth of field.';
      case 'studio_clean':
        return 'Background: clean studio with soft gradient lighting. Minimalist, premium product photography style.';
      default:
        return `Background: premium ${opts.location ? `${opts.location} scenery` : 'Mediterranean coastal backdrop'}. Natural golden-hour lighting, soft bokeh background.`;
    }
  })();

  const editPrompt = [
    'CRITICAL RULES — READ CAREFULLY:',
    '1. PRESERVE the product EXACTLY as it appears: every letter, logo, label, barcode, and packaging design must remain PIXEL-PERFECT and UNCHANGED.',
    '2. DO NOT modify, blur, distort, or rewrite ANY text or branding on the product packaging.',
    '3. DO NOT alter the product shape, color, or proportions.',
    '4. ONLY replace the background behind/around the product.',
    '',
    bgStylePrompt,
    '',
    `Product placement: Center the product naturally in the scene.`,
    `Lighting: Match product lighting to the new background.`,
    `Style: Premium ${opts.businessType || 'food & beverage'} product photography for Instagram.`,
    opts.format === 'story' ? 'Aspect ratio: 9:16 portrait, product in lower-center third.' : 'Aspect ratio: 1:1 square, product centered.',
  ].join('\n');

  try {
    const baseUrl = getNextjsInternalOrigin();
    const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: opts.headline,
        caption: opts.caption,
        contentType: opts.format === 'story' ? 'instagram_story' : 'instagram_post',
        brandName: opts.brandName,
        location: opts.location,
        industry: opts.businessType,
        workspaceId: opts.workspaceId,
        logoUrl: opts.logoUrl,
        referenceImageUrls: [opts.productPhotoUrl],
        enhanceMode: true,
        enhanceContext: editPrompt,
        productShowcaseMode: true,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] product showcase failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json();
    return (data.imageUrl as string) ?? null;
  } catch (err) {
    console.warn('[auto-produce] product showcase error', err);
    return null;
  }
}
