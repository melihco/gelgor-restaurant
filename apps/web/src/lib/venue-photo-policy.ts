/**
 * Venue / gallery photos must never be re-painted by generative AI (images.edit).
 * Sharp resize + SVG text overlay on the original pixels is OK.
 *
 * Set VENUE_PHOTO_PRESERVE=false only for explicit experiments.
 */
export function shouldPreserveVenuePhotos(): boolean {
  return process.env.VENUE_PHOTO_PRESERVE !== 'false';
}

/** Auto-produce must not run subtle color-grade edits on gallery picks. */
export function shouldAutoProduceEnhanceGallery(): boolean {
  if (!shouldPreserveVenuePhotos()) return true;
  return process.env.AUTO_PRODUCE_SUBTLE_ENHANCE === 'true';
}
