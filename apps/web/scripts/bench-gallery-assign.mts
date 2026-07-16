/**
 * Ad-hoc benchmark: mission-scale gallery batch assignment.
 * Reproduces the production plan-phase load (24 slots × 120 photos)
 * that blocked the event loop before memoization.
 *
 *   npx tsx scripts/bench-gallery-assign.mts
 */
import {
  assignPhotosToContents,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
} from '../src/lib/gallery-photo-matcher';

const SUBJECTS = ['honey', 'olive_oil', 'fig_jam', 'cocktail', 'sunset', 'dj_party', 'breakfast', 'pizza'];

function buildGallery(count: number): { photos: string[]; meta: Record<string, GalleryPhotoMeta> } {
  const photos: string[] = [];
  const meta: Record<string, GalleryPhotoMeta> = {};
  for (let i = 0; i < count; i += 1) {
    const subject = SUBJECTS[i % SUBJECTS.length]!;
    const url = `https://cdn.example.com/api/media?key=tenants/x/gallery/photo-${i}.jpg`;
    photos.push(url);
    meta[url] = {
      primarySubject: subject,
      subjectFamily: subject.split('_')[0],
      description: `A beautiful photo of ${subject.replace('_', ' ')} at the venue, warm light, detail shot number ${i}`,
      contentTags: [subject, 'venue', 'warm', `tag${i % 13}`],
      mood: i % 2 ? 'warm' : 'energetic',
      bestFor: ['instagram_post', 'story'],
    };
  }
  return { photos, meta };
}

function buildItems(count: number): Array<{ key: string; input: MatchPhotoInput }> {
  return Array.from({ length: count }, (_, i) => {
    const subject = SUBJECTS[i % SUBJECTS.length]!;
    return {
      key: `${i}::slot_${i}`,
      input: {
        caption: `Bugün ${subject.replace('_', ' ')} zamanı! Tadına bakmadan geçme, sahilde gün batımı eşliğinde.`,
        headline: `${subject.replace('_', ' ')} keyfi`,
        subjectKey: subject,
        businessType: i % 2 ? 'beach_club' : 'local_products_shop',
        contentType: 'instagram_post',
        mood: 'warm',
      },
    };
  });
}

const { photos, meta } = buildGallery(120);
const items = buildItems(24);

const t0 = performance.now();
const result = assignPhotosToContents(items, photos, meta, { excludeUrls: [] });
const t1 = performance.now();

const assigned = [...result.values()].filter((v) => v?.url).length;
console.log(`assignPhotosToContents: ${(t1 - t0).toFixed(1)} ms — ${assigned}/${items.length} slots assigned`);

// Determinism fingerprint — compare across code versions to prove equivalence.
const picksFingerprint = [...result.entries()]
  .map(([k, v]) => `${k}=${v?.url ?? 'null'}:${v?.score ?? ''}`)
  .join('|');
console.log(`picks: ${picksFingerprint}`);
