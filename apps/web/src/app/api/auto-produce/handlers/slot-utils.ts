import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';

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

export function fillCarouselPhotoPool(
  carouselUrls: string[],
  carouselGalleryUrls: string[],
  galleryPhotos: string[],
  minSlides = CAROUSEL_MIN_SLIDES,
  maxSlides = CAROUSEL_TARGET_SLIDES,
): { carouselUrls: string[]; carouselGalleryUrls: string[] } {
  const galleryOut = [...carouselGalleryUrls];
  const seen = new Set(galleryOut.map(normalizeGalleryUrl));
  for (const p of galleryPhotos) {
    if (galleryOut.length >= maxSlides) break;
    if (p.toLowerCase().includes('logo') || p.toLowerCase().includes('icon')) continue;
    const base = normalizeGalleryUrl(p);
    if (seen.has(base)) continue;
    galleryOut.push(p);
    seen.add(base);
  }
  const displayOut = carouselUrls.length >= minSlides
    ? [...carouselUrls]
    : [...galleryOut];
  const displaySeen = new Set(displayOut.map(normalizeGalleryUrl));
  for (const p of galleryOut) {
    if (displayOut.length >= maxSlides) break;
    const base = normalizeGalleryUrl(p);
    if (displaySeen.has(base)) continue;
    displayOut.push(p);
    displaySeen.add(base);
  }
  return {
    carouselUrls: displayOut.slice(0, maxSlides),
    carouselGalleryUrls: galleryOut.slice(0, maxSlides),
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
  ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
  if (allPhotoUrls.length >= 2) {
    body.promptImages = allPhotoUrls.slice(0, 4);
  } else if (typeof body.promptImage === 'string' && body.promptImage.startsWith('http')) {
    /* keep single promptImage */
  } else if (referenceImageUrl) {
    body.promptImage = referenceImageUrl;
  }
}
