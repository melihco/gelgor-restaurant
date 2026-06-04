/**
 * Gallery URL health check — run before debugging "kırık fotoğraf" in Feed.
 *
 *   node scripts/verify-gallery-urls.mjs
 *   node scripts/verify-gallery-urls.mjs --tenant 5feb36f7-def7-4b4a-834f-353457de57bf
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamic import compiled path — use ts via npx if needed; inline minimal checks for script
const NON_IMAGE_PATH_EXT = /\.(woff2?|ttf|otf|eot|css|js|json|html|xml|map|svg|ico|mp4|mov|webm)$/i;

function isUsable(url) {
  if (!url?.startsWith('http')) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (NON_IMAGE_PATH_EXT.test(path)) return false;
    if (path.includes('/_next/static/') && !/\.(jpe?g|png|webp|gif|avif)$/.test(path)) return false;
    if (path.includes('/_next/image') && !new URL(url).searchParams.get('url')) return false;
    if (/\.(jpe?g|png|webp|gif|avif)$/i.test(path)) return true;
    if (url.includes('images.unsplash.com')) return true;
    if (/\/(uploads?|media|images?|galeri|gallery|photos?|assets)\//i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

async function probe(url) {
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    if (!r.ok && [403, 405].includes(r.status)) {
      r = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-512' },
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
      });
    }
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    return { ok: r.ok && (!ct || ct.startsWith('image/')), status: r.status, ct };
  } catch (e) {
    return { ok: false, status: 0, ct: String(e.message || e) };
  }
}

const FIXTURES = [
  ['woff2 (must reject)', 'https://www.kacta.info/_next/static/media/x.woff2', false],
  ['unsplash ok', 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200', true],
  ['next/image stub', 'https://example.com/_next/image', false],
];

async function main() {
  const tenantArg = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1]
    ?? (process.argv.includes('--tenant') ? process.argv[process.argv.indexOf('--tenant') + 1] : null);

  console.log('=== Structural URL tests ===');
  for (const [label, url, expect] of FIXTURES) {
    const got = isUsable(url);
    console.log(`${got === expect ? '✓' : '✗'} ${label}: usable=${got} (expected ${expect})`);
  }

  if (tenantArg) {
    console.log(`\n=== Tenant gallery probe: ${tenantArg} ===`);
    const base = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
    const res = await fetch(`${base}/api/brand-context-data/${tenantArg}`);
    if (!res.ok) {
      console.log('Could not load brand context (is dev server up?):', res.status);
      process.exit(1);
    }
    const ctx = await res.json();
    let refs = [];
    try {
      refs = JSON.parse(ctx.reference_image_urls || '[]');
    } catch {
      refs = [];
    }
    const sample = refs.slice(0, 12);
    let bad = 0;
    for (const url of sample) {
      const struct = isUsable(url);
      const p = struct ? await probe(url) : { ok: false, status: 0, ct: 'structural reject' };
      if (!struct || !p.ok) bad += 1;
      console.log(
        `${struct && p.ok ? '✓' : '✗'} ${url.slice(0, 72)}… struct=${struct} probe=${p.ok} ${p.status} ${p.ct}`,
      );
    }
    console.log(`\nSample: ${bad}/${sample.length} broken in first 12 refs (total refs: ${refs.length})`);
  } else {
    console.log('\nTip: node scripts/verify-gallery-urls.mjs --tenant <workspace-uuid> (dev server on :3000)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
