/**
 * Shared multi-photo enhance request/response shapes for API routes.
 */
import type { AiEnhanceLevel } from '@/lib/ai-gallery-enhance';
import type { AiVisualSubject } from '@/lib/ai-visual-production-standard';

export const MAX_GALLERY_ENHANCE_PHOTOS = 4;

export type GalleryEnhanceRequest = {
  photoUrl?: string;
  photoUrls?: string[];
  caption?: string;
  headline?: string;
  missionBrief?: string;
  brandName?: string;
  productType?: string;
  level?: AiEnhanceLevel;
  businessType?: string;
  workspaceId?: string;
  logoUrl?: string;
  embedLogo?: boolean;
  referenceImageUrls?: string[];
  /** Stable brand identity block (logo, story, vibe) */
  brandIdentityBlock?: string;
  /** Per-post scene block (caption, headline, brief) */
  postSceneBlock?: string;
  visualSubject?: AiVisualSubject | 'venue_ambiance' | 'product_hero';
  useBrandIdentity?: boolean;
  briefDrivesScene?: boolean;
  adaptiveScene?: boolean;
  adaptiveSceneMode?: 'venue_context' | 'product_showcase' | 'lifestyle_composite';
  /** Reuse mission Crew brief — skips duplicate scene-brief LLM in enhance route */
  prebuiltSceneBrief?: Record<string, unknown>;
  missionId?: string;
};

export const GPT_IMAGE_ENHANCE_COST_USD = 0.21;

export type GalleryEnhanceResultItem = {
  original: string;
  imageUrl: string | null;
  error?: string;
};

export function normalizeGalleryPhotoUrls(body: GalleryEnhanceRequest): string[] {
  const fromArray = Array.isArray(body.photoUrls)
    ? body.photoUrls.filter((u) => typeof u === 'string' && u.trim().length > 0)
    : [];
  const single = typeof body.photoUrl === 'string' && body.photoUrl.trim() ? [body.photoUrl.trim()] : [];
  const merged = [...fromArray, ...single];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of merged) {
    const key = u.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_GALLERY_ENHANCE_PHOTOS) break;
  }
  return out;
}

export function isPersistableEnhanceUrl(url: string): boolean {
  return url.startsWith('http') || url.startsWith('/api/');
}
