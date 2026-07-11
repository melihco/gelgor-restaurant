/**
 * Brand kit preview — fal/GPT-image overlay (Remotion removed).
 */
import type { BrandTheme } from '@/types/brand-theme';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

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

export type BrandKitPreviewSource = 'fal_design' | 'canvas_compose';

export interface BrandKitPreviewResult {
  imageUrl: string;
  source: BrandKitPreviewSource;
}

export async function fetchAnnouncementBrandKitPreview(
  input: BrandKitPreviewInput,
): Promise<string> {
  if (!input.tenantId) {
    throw new Error('tenantId required for brand preview');
  }

  const fmt = input.contentType === 'reel' ? 'story' : input.contentType;
  const baseUrl = getNextjsInternalOrigin();
  const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.headline,
      caption: input.tagline ?? input.cta ?? input.headline,
      contentType: fmt,
      brandName: input.brandName ?? 'Brand',
      location: input.location,
      industry: input.sector
        ?? String(input.brandContext?.business_type ?? input.brandContext?.industry ?? ''),
      workspaceId: input.tenantId,
      referenceImageUrls: [input.photoUrl],
      brandVibeProfile: input.vibeProfile ?? input.brandTheme ?? undefined,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error('Önizleme başarısız');
  }
  const data = await res.json() as { imageUrl?: string };
  if (!data.imageUrl) {
    throw new Error('Önizleme başarısız');
  }
  return data.imageUrl;
}

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
  _composeBrandPhotoCard?: (params: {
    photoUrl: string;
    headline: string;
    cta: string;
    contentType: 'post' | 'story' | 'reel';
    styleIdx?: number;
  }) => Promise<string>,
): Promise<BrandKitPreviewResult> {
  const imageUrl = await fetchAnnouncementBrandKitPreview(input);
  return { imageUrl, source: 'fal_design' };
}
