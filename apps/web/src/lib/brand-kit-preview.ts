/**
 * Brand kit preview — Remotion SpecPoster stills (no manual SVG template picking).
 */
import { renderRemotionBrandStill } from '@/lib/remotion-brand-kit';
import type { BrandTheme } from '@/types/brand-theme';

export interface BrandKitPreviewInput {
  photoUrl: string;
  headline: string;
  cta?: string;
  tagline?: string;
  contentType: 'post' | 'story' | 'reel';
  tenantId?: string;
  brandName?: string;
  location?: string;
  brandTheme?: BrandTheme | null;
  brandContext?: Record<string, unknown>;
  vibeProfile?: Record<string, unknown>;
  templateId?: string;
  sector?: string;
  ideaIndex?: number;
}

export type BrandKitPreviewSource = 'remotion' | 'canvas_compose';

export interface BrandKitPreviewResult {
  imageUrl: string;
  source: BrandKitPreviewSource;
}

/** Remotion still — auto-picks poster/story template from brand library (no design UI). */
export async function fetchAnnouncementBrandKitPreview(
  input: BrandKitPreviewInput,
): Promise<string> {
  if (!input.tenantId) {
    throw new Error('tenantId required for Remotion brand preview');
  }

  const fmt = input.contentType === 'reel' ? 'story' : input.contentType;
  const imageUrl = await renderRemotionBrandStill({
    workspaceId: input.tenantId,
    photoUrl: input.photoUrl,
    headline: input.headline,
    caption: input.tagline ?? input.cta ?? input.headline,
    brandName: input.brandName ?? 'Brand',
    location: input.location,
    sector: input.sector
      ?? String(input.brandContext?.business_type ?? input.brandContext?.industry ?? ''),
    contentType: fmt,
    ideaIndex: input.ideaIndex ?? 0,
    posterTemplateId: fmt === 'post' ? input.templateId : undefined,
    storyTemplateId: fmt === 'story' ? input.templateId : undefined,
    brandTheme: input.brandTheme as unknown as Record<string, unknown> | null,
    logoUrl: String(input.brandContext?.logo_url ?? input.brandContext?.logoUrl ?? ''),
  });

  if (!imageUrl) {
    throw new Error('Remotion önizleme başarısız');
  }
  return imageUrl;
}

/** @deprecated Canvas fallback — prefer Remotion only. */
export async function fetchCanvasBrandKitPreview(
  input: BrandKitPreviewInput,
  composeBrandPhotoCard: (params: {
    photoUrl: string;
    headline: string;
    cta: string;
    contentType: 'post' | 'story' | 'reel';
    styleIdx?: number;
  }) => Promise<string>,
): Promise<string> {
  return composeBrandPhotoCard({
    photoUrl: input.photoUrl,
    headline: input.headline.trim() || 'İçerik',
    cta: input.cta?.trim() || 'Keşfet',
    contentType: input.contentType === 'reel' ? 'reel' : input.contentType,
    styleIdx: 0,
  });
}

export async function generateBrandKitPreview(
  input: BrandKitPreviewInput,
  composeBrandPhotoCard?: (params: {
    photoUrl: string;
    headline: string;
    cta: string;
    contentType: 'post' | 'story' | 'reel';
    styleIdx?: number;
  }) => Promise<string>,
): Promise<BrandKitPreviewResult> {
  const imageUrl = await fetchAnnouncementBrandKitPreview(input);
  return { imageUrl, source: 'remotion' };
}
