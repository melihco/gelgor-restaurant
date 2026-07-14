/**
 * Live smoke: Karaman gallery pick + theme gate + AI judge for mission headlines.
 * Usage:
 *   INTERNAL_API_KEY=... npx tsx apps/web/scripts/karaman-gallery-match-smoke.mts
 *   NEXTJS_INTERNAL_URL=http://localhost:3000 ...  (optional, defaults to Render)
 */
import {
  pickGalleryPhotoForIdea,
  pickGalleryPhotoForIdeaAsync,
  rematchGalleryAfterHardThemeConflict,
} from '../src/app/api/auto-produce/caption-publish-resolver';
import {
  isHardGalleryThemeMismatch,
  matchPhotoToContent,
  preferSubjectAlignedCandidates,
  resolveGalleryMatchSubjectKey,
  resolveGalleryPhotoMeta,
} from '../src/lib/gallery-photo-matcher';
import { gatePhotoMatchResult } from '../src/lib/gallery-ai-match-judge';

const WS = process.env.KARAMAN_WORKSPACE_ID ?? '327db521-ede2-48e0-8f06-4146ee458c50';
const WEB = (process.env.NEXTJS_INTERNAL_URL ?? 'https://smartagency-web.onrender.com').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY ?? '';

if (!KEY) {
  console.error('INTERNAL_API_KEY required');
  process.exit(1);
}

const cases = [
  { headline: 'Zeytinyağı Tadı: Çeşitler ve Lezzetler!', subjectKey: 'olive_oil', caption: 'Zeytinyağı tadım etkinliği' },
  { headline: 'Sevgiyle Hazırlanan Geleneksel Reçeller!', subjectKey: 'jam', caption: 'Geleneksel reçeller' },
  { headline: 'Erken hasat zeytinyağının sağlık faydala', subjectKey: 'olive_oil', caption: 'Erken hasat zeytinyağı' },
  { headline: 'Gelenekten Geleceğe: Reçel Yapımı', subjectKey: 'fig_jam', caption: 'Reçel yapımı' },
  { headline: 'Müşterilerimiz bal çeşitlerimizi çok sev', subjectKey: 'honey', caption: 'Bal çeşitleri' },
  { headline: 'Geleneksel bitki çayları hakkında bilgi', subjectKey: 'herbal_tea', caption: 'Bitki çayları' },
  { headline: 'Badem ezmesi ile kahvaltı keyfi', subjectKey: 'almond_butter', caption: 'Badem ezmesi' },
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
console.log(`workspace=${WS} photos=${photos.length} endpoint=${WEB}`);

let pass = 0;
let failClosed = 0;

for (const c of cases) {
  const input = {
    caption: c.caption,
    headline: c.headline,
    businessType: 'local_products_shop',
    subjectKey: c.subjectKey,
  };
  const alignedKey = resolveGalleryMatchSubjectKey(input);
  const aligned = preferSubjectAlignedCandidates(photos, gallery, alignedKey);

  const pickedSync = pickGalleryPhotoForIdea(
    c.caption, c.headline, 'natural', gallery, photos, [], [], 'story', null,
    'local_products_shop', true, undefined, undefined, c.subjectKey,
  );
  const pickedAsync = await pickGalleryPhotoForIdeaAsync(
    c.caption, c.headline, 'natural', gallery, photos, [], [], 'story', null,
    'local_products_shop', true, undefined, undefined, c.subjectKey,
    { workspaceId: WS, slotKey: `smoke::${c.subjectKey}` },
  );

  const meta = pickedSync ? resolveGalleryPhotoMeta(pickedSync, gallery, photos) : undefined;
  let hard = pickedSync ? isHardGalleryThemeMismatch(input, meta, pickedSync) : true;
  let rematchPs: string | undefined;

  if (hard && pickedSync) {
    const rematched = rematchGalleryAfterHardThemeConflict({
      caption: c.caption,
      headline: c.headline,
      mood: 'natural',
      galleryAnalysis: gallery,
      candidateUrls: photos,
      excludeUrls: [],
      rejectedUrl: pickedSync,
      contentType: 'story',
      businessType: 'local_products_shop',
      subjectKey: c.subjectKey,
      maxAttempts: 8,
    });
    const rmeta = rematched ? resolveGalleryPhotoMeta(rematched, gallery, photos) : undefined;
    rematchPs = rmeta?.primarySubject;
    hard = rematched ? isHardGalleryThemeMismatch(input, rmeta, rematched) : true;
  }

  const matchScore = pickedSync
    ? matchPhotoToContent(input, photos, gallery, { minScore: 0 })?.score
    : null;
  const gated = pickedSync && matchScore != null
    ? await gatePhotoMatchResult(
      { url: pickedSync, score: matchScore, reason: 'smoke', confidence: 0.5 },
      input,
      gallery,
      photos,
      { workspaceId: WS, slotKey: `smoke-gate::${c.subjectKey}` },
    )
    : null;

  const expectFail = c.subjectKey === 'herbal_tea' || c.subjectKey === 'almond_butter';
  const ok = expectFail
    ? (!pickedAsync && !gated)
    : (pickedAsync && !hard && gated);
  if (ok) pass += 1;
  else failClosed += 1;

  console.log(`\n${c.headline.slice(0, 48)} [${c.subjectKey}]`);
  console.log(`  alignedKey=${alignedKey ?? 'null'} pool=${aligned.length} score=${matchScore ?? 'null'}`);
  console.log(`  sync=${meta?.primarySubject ?? 'null'} async=${pickedAsync ? resolveGalleryPhotoMeta(pickedAsync, gallery, photos)?.primarySubject : 'null'}`);
  console.log(`  hard=${hard} rematch=${rematchPs ?? 'null'} gate=${gated ? resolveGalleryPhotoMeta(gated.url, gallery, photos)?.primarySubject : 'REJECTED'}`);
  console.log(`  expect=${expectFail ? 'fail-closed' : 'match'} result=${ok ? 'OK' : 'CHECK'}`);
}

console.log(`\n--- summary: ${pass}/${cases.length} expected outcomes`);
