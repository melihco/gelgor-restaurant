/**
 * Live smoke: Karaman gallery pick + theme gate for failing mission headlines.
 * Usage: INTERNAL_API_KEY=... npx tsx apps/web/scripts/karaman-gallery-match-smoke.mts
 */
import { pickGalleryPhotoForIdea, rematchGalleryAfterHardThemeConflict } from '../src/app/api/auto-produce/caption-publish-resolver';
import { isHardGalleryThemeMismatch, resolveGalleryPhotoMeta } from '../src/lib/gallery-photo-matcher';

const WS = process.env.KARAMAN_WORKSPACE_ID ?? '327db521-ede2-48e0-8f06-4146ee458c50';
const WEB = (process.env.NEXTJS_INTERNAL_URL ?? 'https://smartagency-web.onrender.com').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY ?? '';

const cases = [
  { headline: 'Zeytinyağı Tadı: Çeşitler ve Lezzetler!', subjectKey: 'olive_oil', caption: 'Zeytinyağı tadım etkinliği' },
  { headline: 'Sevgiyle Hazırlanan Geleneksel Reçeller!', subjectKey: 'jam', caption: 'Geleneksel reçeller' },
  { headline: 'Erken hasat zeytinyağının sağlık faydala', subjectKey: 'olive_oil', caption: 'Erken hasat zeytinyağı' },
  { headline: 'Gelenekten Geleceğe: Reçel Yapımı', subjectKey: 'fig_jam', caption: 'Reçel yapımı' },
  { headline: 'Müşterilerimiz bal çeşitlerimizi çok sev', subjectKey: 'honey', caption: 'Bal çeşitleri' },
  { headline: 'Geleneksel bitki çayları hakkında bilgi', subjectKey: 'herbal_tea', caption: 'Bitki çayları' },
];

const res = await fetch(`${WEB}/api/brand-context/${WS}/gallery-analysis`, {
  headers: { 'X-Internal-Api-Key': KEY, 'X-Tenant-Id': WS },
});
if (!res.ok) {
  console.error('gallery-analysis failed', res.status, await res.text());
  process.exit(1);
}
const gallery = await res.json() as Record<string, import('../src/lib/gallery-photo-matcher').GalleryPhotoMeta>;
const photos = Object.keys(gallery);
console.log('photos', photos.length);

for (const c of cases) {
  const input = {
    caption: c.caption,
    headline: c.headline,
    businessType: 'local_products_shop',
    subjectKey: c.subjectKey,
  };
  const picked = pickGalleryPhotoForIdea(
    c.caption, c.headline, 'natural', gallery, photos, [], [], 'story', null,
    'local_products_shop', true, undefined, undefined, c.subjectKey,
  );
  const meta = picked ? resolveGalleryPhotoMeta(picked, gallery, photos) : undefined;
  let hard = picked ? isHardGalleryThemeMismatch(input, meta, picked) : true;
  let rematchPs: string | undefined;
  if (hard && picked) {
    const rematched = rematchGalleryAfterHardThemeConflict({
      caption: c.caption,
      headline: c.headline,
      mood: 'natural',
      galleryAnalysis: gallery,
      candidateUrls: photos,
      excludeUrls: [],
      rejectedUrl: picked,
      contentType: 'story',
      businessType: 'local_products_shop',
      subjectKey: c.subjectKey,
      maxAttempts: 8,
    });
    const rmeta = rematched ? resolveGalleryPhotoMeta(rematched, gallery, photos) : undefined;
    rematchPs = rmeta?.primarySubject;
    hard = rematched ? isHardGalleryThemeMismatch(input, rmeta, rematched) : true;
  }
  console.log(`\n${c.headline.slice(0, 48)}`);
  console.log(`  pick=${meta?.primarySubject ?? 'null'} hard=${hard} rematch=${rematchPs ?? 'null'}`);
}
