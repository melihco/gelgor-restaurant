/**
 * Venue / gallery photos: originals are PRESERVED by default.
 * AI color-grading (images.edit) is disabled — brand's real venue photos
 * must not be modified. The Remotion story templates apply brand design
 * on top of the original photo without touching the pixels.
 *
 * Enable AI grading only for specific upscale cases: VENUE_PHOTO_PRESERVE=false
 */
import { isNonVenueSector } from '@/lib/sector-gallery-seed';
import { isNonVenueSectorProfile } from '@/lib/sector-production-profile';
import { serverConfig } from '@/lib/server-config';
export function shouldPreserveVenuePhotos(): boolean {
  return process.env.VENUE_PHOTO_PRESERVE !== 'false';
}

/**
 * Skip OpenAI images.edit and return the original reference URL.
 * Designed social cards are the exception: they add typography/graphic layers
 * on top of the real photo (high input fidelity) without replacing the scene.
 */
export function shouldPassthroughReferencePhoto(opts?: { isDesignCard?: boolean }): boolean {
  if (opts?.isDesignCard) return false;
  return shouldPreserveVenuePhotos();
}

/**
 * AI color grading on gallery photos in auto-produce.
 * OFF by default — Remotion handles the visual treatment over original photos.
 * Enable only explicitly: AUTO_PRODUCE_SUBTLE_ENHANCE=true
 * SaaS / non-venue sectors always skip — Remotion + digital UI only.
 */
export function shouldAutoProduceEnhanceGallery(businessType?: string | null): boolean {
  if (businessType && isNonVenueSectorProfile(businessType)) return false;
  if (!shouldPreserveVenuePhotos()) return true;
  return process.env.AUTO_PRODUCE_SUBTLE_ENHANCE === 'true';
}

/**
 * For production use: if the gallery photo is below this width threshold,
 * AI upscale is allowed even with VENUE_PHOTO_PRESERVE=true.
 * Rationale: a 640px photo displayed at 1080px is always pixelated — upscaling
 * is the lesser evil vs blurry output.
 *
 * Set GALLERY_MIN_WIDTH_PX to override (default: 800).
 */
export const GALLERY_MIN_DISPLAY_WIDTH = parseInt(
  process.env.GALLERY_MIN_WIDTH_PX ?? '800', 10,
);

/**
 * Returns true when a gallery photo should be AI-upscaled before production.
 * Only activates when AI image generation is configured (OPENAI_API_KEY present).
 */
export function shouldUpscaleSmallGalleryPhoto(widthPx: number): boolean {
  if (!serverConfig.openai.configured) return false;
  if (!shouldPreserveVenuePhotos()) return true;
  return widthPx < GALLERY_MIN_DISPLAY_WIDTH;
}
