import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';

export const CAROUSEL_MIN_SLIDES = 3;
export const CAROUSEL_TARGET_SLIDES = 4;

export function isCarouselAssignment(
  kind: string,
  assignment: { slot_role?: string; pipeline?: string },
): boolean {
  return kind === 'instagram_carousel'
    || assignment.slot_role === 'organic_carousel'
    || assignment.pipeline === 'carousel_gallery';
}

/** Trim carousel URLs — never pad with unscored gallery photos (caption mismatch risk). */
export function fillCarouselPhotoPool(
  carouselUrls: string[],
  carouselGalleryUrls: string[],
  _galleryPhotos: string[],
  minSlides = CAROUSEL_MIN_SLIDES,
  maxSlides = CAROUSEL_TARGET_SLIDES,
): { carouselUrls: string[]; carouselGalleryUrls: string[] } {
  void minSlides;
  return {
    carouselUrls: carouselUrls.slice(0, maxSlides),
    carouselGalleryUrls: carouselGalleryUrls.slice(0, maxSlides),
  };
}

export function attachReelPhotoRefs(
  body: Record<string, unknown>,
  referenceImageUrl?: string,
  additionalPhotoUrls?: string[],
): void {
  const allPhotoUrls = [
    referenceImageUrl,
    ...(additionalPhotoUrls ?? []),
  ].filter((u): u is string => typeof u === 'string' && isUsableGalleryPhotoUrl(u));
  if (allPhotoUrls.length >= 2) {
    body.promptImages = allPhotoUrls.slice(0, 4);
  } else if (typeof body.promptImage === 'string' && isUsableGalleryPhotoUrl(body.promptImage)) {
    /* keep single promptImage */
  } else if (referenceImageUrl) {
    body.promptImage = referenceImageUrl;
  }
}
