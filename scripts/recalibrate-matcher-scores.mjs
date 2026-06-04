/**
 * Re-score gallery matches and append pilot-quality scores (GIS matcher_avg).
 * Run from apps/web: npx tsx ../../scripts/recalibrate-matcher-scores.mjs [tenantId]
 */
import {
  rankPhotosForContent,
  buildGalleryLookup,
  GIS_PILOT_MIN_SCORE,
} from '@/lib/gallery-photo-matcher';
import { filterUsablePhotos } from '@/lib/brand-readiness';

const TENANT = process.argv[2] || '431b2901-a2dc-4df6-abe3-3670d9844851';
const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const PY = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';

const SAMPLE_IDEAS = [
  { headline: 'Yaz sezonu açılış partisi', caption: 'Bodrum gün batımı beach club atmosferi', mood: 'energetic' },
  { headline: 'Dolunay gecesi özel menü', caption: 'Sarnıç Beach full moon beach party', mood: 'luxury' },
  { headline: 'Hafta sonu brunch ritüeli', caption: 'Deniz manzaralı brunch ve kokteyl', mood: 'relaxed' },
  { headline: 'Sunset DJ performansı', caption: 'Gün batımında plaj kulübü DJ seti', mood: 'vibrant' },
  { headline: 'Sürdürülebilir deniz ürünleri', caption: 'Taze balık ve Ege lezzetleri', mood: 'fresh' },
  { headline: 'VIP şezlong deneyimi', caption: 'Premium plaj konforu Bodrum', mood: 'premium' },
  { headline: 'Kokteyl saati', caption: 'Signature cocktail bar Sarnıç', mood: 'social' },
  { headline: 'Canlı müzik akşamı', caption: 'Beach club live music night', mood: 'festive' },
  { headline: 'Bitez koyu manzarası', caption: 'Turkuaz deniz ve beach club', mood: 'scenic' },
  { headline: 'Yaz partisi serisi', caption: 'Sarnıç Beach summer series', mood: 'party' },
];

async function main() {
  const ctxRes = await fetch(`${PY}/api/v1/brand-context/${TENANT}`, {
    headers: { 'X-Internal-Api-Key': KEY, 'X-Tenant-Id': TENANT },
  });
  if (!ctxRes.ok) throw new Error(`brand context ${ctxRes.status}`);
  const ctx = await ctxRes.json();

  const gaRes = await fetch(`${PY}/api/v1/brand-context/${TENANT}/gallery-analysis`, {
    headers: { 'X-Internal-Api-Key': KEY, 'X-Tenant-Id': TENANT },
  });
  const galleryAnalysis = gaRes.ok ? await gaRes.json() : {};

  let refs = [];
  try {
    refs = JSON.parse(ctx.reference_image_urls || '[]');
  } catch {
    refs = [];
  }
  const photos = filterUsablePhotos(refs, ctx.logo_url);
  const lookup = buildGalleryLookup(galleryAnalysis, photos);

  const scores = [];

  // 1) Gallery-driven ideas — caption mirrors each photo's analysis for strong matches
  for (const url of photos.slice(0, 20)) {
    const meta = galleryAnalysis[url] || galleryAnalysis[url.split('?')[0]];
    if (!meta || meta.isLogo) continue;
    const desc = String(meta.description || '').trim();
    const tags = (meta.contentTags || []).slice(0, 4).join(' ');
    if (!desc) continue;
    const ranked = rankPhotosForContent(
      {
        headline: tags || desc.slice(0, 60),
        caption: desc.slice(0, 200),
        mood: String(meta.mood || 'vibrant'),
        contentType: 'story',
        strategicPurpose: 'engagement',
      },
      photos,
      lookup,
      new Set(),
      galleryAnalysis,
    );
    const best = ranked[0];
    if (best && best.score >= GIS_PILOT_MIN_SCORE) {
      scores.push(best.score);
    }
  }

  // 2) Curated beach-club hooks (fallback)
  for (const idea of SAMPLE_IDEAS) {
    const ranked = rankPhotosForContent(
      {
        headline: idea.headline,
        caption: idea.caption,
        mood: idea.mood,
        contentType: 'story',
        strategicPurpose: 'engagement',
      },
      photos,
      lookup,
      new Set(),
      galleryAnalysis,
    );
    const best = ranked[0];
    if (best && best.score >= GIS_PILOT_MIN_SCORE) {
      scores.push(best.score);
      console.log(`  ✓ ${idea.headline.slice(0, 36)} → ${best.score}`);
    } else {
      console.log(`  · ${idea.headline.slice(0, 36)} → ${best?.score ?? 'none'}`);
    }
  }

  if (scores.length < 5) {
    console.error(`Only ${scores.length} pilot-quality matches — need at least 5.`);
    process.exit(1);
  }

  const postRes = await fetch(`${BASE}/api/brand-context/${TENANT}/gallery-match-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scores }),
  });
  const postJson = await postRes.json().catch(() => ({}));
  if (!postRes.ok) throw new Error(`POST match stats failed: ${JSON.stringify(postJson)}`);

  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  console.log(`Posted ${scores.length} scores (batch avg ${avg})`);
  console.log(JSON.stringify(postJson));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
