/**
 * Kaçta — carousel passthrough + branded text overlay smoke test.
 *
 *   node scripts/test-kacta-carousel-overlay.mjs
 */
const TENANT = '5feb36f7-def7-4b4a-834f-353457de57bf';
const BASE = (process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const CREW = (process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const INTERNAL = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';

const NON_IMAGE = /\.(woff2?|ttf|otf|eot|css|js|json|html|xml|map|svg|ico|mp4|mov|webm)$/i;

function usable(url) {
  if (!url?.startsWith('http')) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (NON_IMAGE.test(path)) return false;
    if (path.includes('/_next/static/') && !/\.(jpe?g|png|webp|gif|avif)$/.test(path)) return false;
    if (/\.(jpe?g|png|webp|gif|avif)$/i.test(path)) return true;
    if (url.includes('images.unsplash.com')) return true;
    if (/\/(uploads?|media|images?|galeri|gallery|photos?|assets)\//i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function fullUrl(u) {
  if (!u) return u;
  if (u.startsWith('http') || u.startsWith('data:')) return u;
  return `${BASE}${u.startsWith('/') ? '' : '/'}${u}`;
}

async function main() {
  console.log(`\n=== Kaçta carousel overlay test — ${TENANT} ===\n`);

  const ctxRes = await fetch(`${CREW}/api/v1/brand-context/${TENANT}`, {
    headers: { 'X-Internal-Api-Key': INTERNAL, 'X-Tenant-Id': TENANT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!ctxRes.ok) {
    console.error('Brand context failed:', ctxRes.status, await ctxRes.text());
    process.exit(1);
  }
  const ctx = await ctxRes.json();
  const brandName = ctx.business_name || 'Kaçta';
  let refs = [];
  try {
    refs = JSON.parse(ctx.reference_image_urls || '[]');
  } catch {
    refs = Array.isArray(ctx.reference_image_urls) ? ctx.reference_image_urls : [];
  }
  const gallery = refs.filter(usable).slice(0, 4);
  console.log('Brand:', brandName);
  console.log('Gallery usable:', gallery.length, '/', refs.length);
  if (gallery.length < 2) {
    console.error('Need at least 2 gallery image URLs');
    process.exit(1);
  }

  const body = {
    enhanceMode: true,
    contentType: 'carousel',
    multiPhotoEnhance: true,
    workspaceId: TENANT,
    title: 'Kaçta — Stil carousel',
    caption: '3 farklı kesim — kaydır ve keşfet. Premium barber craft Bodrum.',
    cta: 'Randevu için DM',
    brandName,
    enhanceContext: 'carousel passthrough overlay test',
    referenceImageUrls: gallery.slice(0, 3),
  };

  console.log('\n1) POST /api/generate-instagram-image (passthrough+carousel)…');
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/generate-instagram-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': TENANT,
      'X-Internal-Api-Key': INTERNAL,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const data = await res.json().catch(() => ({}));
  console.log('HTTP', res.status, `(${(Date.now() - t0) / 1000}s)`);
  if (!res.ok) {
    console.error(JSON.stringify(data, null, 2).slice(0, 2500));
    process.exit(1);
  }

  console.log('model:', data.model);
  console.log('carousel_overlays:', data.carousel_overlays);
  console.log('venue_preserved:', data.venue_preserved);
  console.log('photoCount:', data.photoCount);

  const urls = data.imageUrls?.length ? data.imageUrls : [data.imageUrl].filter(Boolean);
  console.log('\n--- Carousel slide URLs ---');
  for (let i = 0; i < urls.length; i++) {
    console.log(`  [${i + 1}] ${fullUrl(urls[i])}`);
  }

  if (!data.carousel_overlays) {
    console.warn('\n⚠ carousel_overlays=false — overlay step may have failed (check server logs)');
    process.exit(2);
  }

  console.log('\n✓ Passthrough carousel with overlays OK\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
