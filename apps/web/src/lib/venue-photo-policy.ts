/**
 * Venue / gallery photos: originals are PRESERVED by default.
 * AI color-grading (images.edit) is disabled — brand's real venue photos
 * must not be modified. The Remotion story templates apply brand design
 * on top of the original photo without touching the pixels.
 *
 * Enable AI grading only for specific upscale cases: VENUE_PHOTO_PRESERVE=false
 */
export function shouldPreserveVenuePhotos(): boolean {
  return process.env.VENUE_PHOTO_PRESERVE !== 'false';
}

/**
 * AI color grading on gallery photos in auto-produce.
 * OFF by default — Remotion handles the visual treatment over original photos.
 * Enable only explicitly: AUTO_PRODUCE_SUBTLE_ENHANCE=true
 */
export function shouldAutoProduceEnhanceGallery(): boolean {
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
  if (!process.env.OPENAI_API_KEY) return false;
  if (!shouldPreserveVenuePhotos()) return true;
  return widthPx < GALLERY_MIN_DISPLAY_WIDTH;
}
