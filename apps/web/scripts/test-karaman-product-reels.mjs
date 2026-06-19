#!/usr/bin/env node
/**
 * Karaman Datça — product spotlight Runway reel smoke test.
 *
 * Usage:
 *   node scripts/test-karaman-product-reels.mjs
 *   node scripts/test-karaman-product-reels.mjs --skip-theme-patch
 *   node scripts/test-karaman-product-reels.mjs --skip-gallery
 */
import fs from 'node:fs';

const TENANT = '327db521-ede2-48e0-8f06-4146ee458c50';
const BASE = process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000';
const CREW_BASE = process.env.CREW_API_URL || 'http://127.0.0.1:8000';
const KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';
const HDRS = {
  'Content-Type': 'application/json',
  'X-Tenant-Id': TENANT,
  'X-Internal-Api-Key': KEY,
};
const skipTheme = process.argv.includes('--skip-theme-patch');
const skipGallery = process.argv.includes('--skip-gallery');

function normalizeUrlKey(url) {
  return String(url).split('?')[0] ?? url;
}

function parseReferenceUrls(raw) {
  if (Array.isArray(raw)) return raw.filter((u) => typeof u === 'string');
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string') : [];
    } catch {
      return trimmed.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseGalleryAnalysis(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function deriveMicroMotions(description = '', tags = []) {
  const text = `${description} ${tags.join(' ')}`.toLowerCase();
  const motions = [];
  if (/steam|hot|soup|coffee|tea/.test(text)) motions.push('gentle steam rise');
  if (/glass|drink|liquid|pour|wine|cocktail/.test(text)) motions.push('liquid shimmer');
  if (/jar|bottle|label|packaging|product/.test(text)) motions.push('label glint');
  if (/olive|food|jam|spread|honey|cheese/.test(text)) motions.push('texture highlight');
  if (!motions.length) motions.push('subtle light shimmer');
  return motions.slice(0, 3);
}

function enrichPhotoFromGallery(url, gallery) {
  const meta = gallery[url] ?? Object.entries(gallery).find(([k]) => k.includes(url.split('/').pop() ?? ''))?.[1];
  const description = String(meta?.description ?? '').trim();
  const tags = [
    ...(Array.isArray(meta?.contentTags) ? meta.contentTags : []),
    ...(Array.isArray(meta?.tags) ? meta.tags : []),
  ].filter(Boolean);
  const sceneMoment = description
    ? description.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 220)
    : undefined;
  return {
    url,
    description: description || undefined,
    tags: tags.length ? tags.slice(0, 12) : ['product', 'artisan', 'food'],
    microMotions: deriveMicroMotions(description, tags),
    sceneMoment,
  };
}

function pickProductPhotos(urls = [], gallery = {}) {
  const scored = urls
    .filter((url) => /^https?:\/\//.test(url))
    .map((url) => {
      const lower = url.toLowerCase();
      let score = 0;
      if (/wp-content\/uploads/.test(lower)) score += 3;
      if (/\.(jpe?g|png|webp)(\?|$)/.test(lower)) score += 2;
      if (/product|urun|reçel|recel|zeytin|badam|jam|olive|ezme/.test(lower)) score += 2;
      if (/chatgpt-image|logo|icon|banner/.test(lower)) score -= 4;
      const meta = gallery[url];
      if (meta?.description?.length > 40) score += 4;
      return { url, score };
    })
    .sort((a, b) => b.score - a.score);

  const picked = [];
  const seen = new Set();
  for (const item of scored) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    picked.push(enrichPhotoFromGallery(item.url, gallery));
    if (picked.length >= 3) break;
  }
  return picked;
}

async function fetchBrandContext() {
  const res = await fetch(`${CREW_BASE}/api/v1/brand-context/${TENANT}`, { headers: HDRS });
  if (!res.ok) {
    throw new Error(`Brand context ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

async function ensureGalleryAnalysis(urls) {
  const gaRes = await fetch(`${BASE}/api/brand-context/${TENANT}/gallery-analysis`, { headers: HDRS });
  let existing = gaRes.ok ? await gaRes.json() : {};
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) existing = {};

  const missing = urls.filter((u) => {
    const hit = existing[u]
      ?? Object.entries(existing).find(([k]) => normalizeUrlKey(k) === normalizeUrlKey(u))?.[1];
    return !String(hit?.description ?? '').trim();
  });

  if (missing.length === 0) {
    console.log(`✓ gallery_analysis: ${Object.keys(existing).length} entries`);
    return existing;
  }

  console.log(`Vision analyze: ${missing.length} photos…`);
  const analyzeRes = await fetch(`${BASE}/api/analyze-gallery`, {
    method: 'POST',
    headers: HDRS,
    body: JSON.stringify({
      assetUrls: missing,
      maxImages: missing.length,
      existingAnalysis: existing,
      tier: 'standard',
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!analyzeRes.ok) {
    console.warn('analyze-gallery failed:', (await analyzeRes.text()).slice(0, 200));
    return existing;
  }

  const data = await analyzeRes.json();
  const fresh = (data.results ?? []).filter((r) => r?.url && r?.description);
  if (!fresh.length) {
    console.warn('No new gallery analysis results');
    return existing;
  }

  const saveRes = await fetch(`${BASE}/api/brand-context/${TENANT}/gallery-analysis`, {
    method: 'POST',
    headers: HDRS,
    body: JSON.stringify({ results: fresh }),
  });
  if (saveRes.ok) {
    const saved = await saveRes.json();
    console.log(`✓ gallery_analysis saved: +${saved.saved ?? fresh.length} (total ${saved.total ?? '?'})`);
  } else {
    console.warn('gallery-analysis save failed:', (await saveRes.text()).slice(0, 200));
  }

  const merged = { ...existing };
  for (const r of fresh) merged[r.url] = r;
  return merged;
}

async function main() {
  console.log(`=== Karaman product reel test @ ${BASE} ===`);

  const health = await fetch(`${BASE}/`, { redirect: 'manual' }).catch(() => null);
  if (!health || (health.status !== 200 && health.status !== 307 && health.status !== 308)) {
    console.error('Next.js dev server not reachable at', BASE);
    process.exit(1);
  }

  const ctx = await fetchBrandContext();
  const brandName = String(ctx.business_name ?? 'Karaman Datça').replace(/\.com\.tr$/i, '');
  const location = String(ctx.location ?? 'Datça, Muğla');
  const businessType = String(ctx.business_type ?? 'local_products_shop');
  const refUrls = parseReferenceUrls(ctx.reference_image_urls);
  let gallery = parseGalleryAnalysis(ctx.gallery_analysis);

  if (!skipGallery && refUrls.length > 0) {
    gallery = await ensureGalleryAnalysis(refUrls.slice(0, 8));
  }

  const photos = pickProductPhotos(refUrls, gallery);

  if (photos.length < 2) {
    console.error('Need at least 2 HTTPS gallery photos, found', photos.length);
    process.exit(1);
  }
  console.log(`✓ Gallery photos: ${photos.length}`);
  photos.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.url.slice(0, 96)}…`);
    if (p.description) console.log(`     desc: ${p.description.slice(0, 100)}…`);
  });

  if (!skipTheme) {
    const themeRes = await fetch(`${BASE}/api/brand-context/${TENANT}/theme`, { headers: HDRS });
    const themePayload = themeRes.ok ? await themeRes.json() : {};
    const theme = themePayload.theme ?? themePayload ?? {};
    const motion = theme.motion_profile ?? theme.motionProfile ?? {};
    const motion_profile = {
      ...motion,
      motion_style: motion.motion_style ?? motion.motionStyle ?? 'luxury',
      reel_pace: motion.reel_pace ?? motion.reelPace ?? 'slow_burn',
      reel_camera_motion: motion.reel_camera_motion ?? motion.reelCameraMotion ?? 'dolly_in',
      reel_strategy: motion.reel_strategy ?? motion.reelStrategy ?? 'sequential',
      product_spotlight_reel: true,
      operator_override: true,
    };
    const patch = await fetch(`${BASE}/api/brand-context/${TENANT}/theme`, {
      method: 'PUT',
      headers: HDRS,
      body: JSON.stringify({ theme: { ...theme, motion_profile } }),
    });
    if (!patch.ok) {
      console.warn('Theme PATCH failed (continuing with seed):', (await patch.text()).slice(0, 200));
    } else {
      console.log('✓ product_spotlight_reel=true saved on theme');
    }
  }

  const body = {
    workspaceId: TENANT,
    photos,
    headline: `${brandName} — Ürün Reel Test`,
    caption: 'Natural Datca product flavors. TVC-style Runway motion from real gallery photos.',
    brandName,
    brandLocation: location,
    strategy: 'sequential',
    ratio: '720:1280',
    duration: 5,
    cameraMotion: 'dolly_in',
    businessType,
    productSpotlightReel: true,
  };

  console.log('POST /api/generate-multi-reel (sequential, ~3–8 min)…');
  const started = Date.now();
  const reelRes = await fetch(`${BASE}/api/generate-multi-reel`, {
    method: 'POST',
    headers: HDRS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(900_000),
  });
  const reel = await reelRes.json();
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  fs.writeFileSync('/tmp/karaman-product-reel-test.json', JSON.stringify(reel, null, 2));

  if (!reelRes.ok || !reel.videoUrl) {
    console.error(`✗ Reel failed HTTP ${reelRes.status} in ${elapsed}s`);
    console.error(JSON.stringify(reel, null, 2));
    process.exit(1);
  }

  console.log(`✓ Reel OK in ${elapsed}s`);
  console.log(`  strategy: ${reel.strategy}`);
  console.log(`  clips:    ${reel.clipUrls?.length ?? '?'} / ${reel.photoCount}`);
  if (reel.error) console.log(`  warn:     ${reel.error}`);
  if (reel.clipPrompts?.[0]) {
    console.log(`  prompt:   ${reel.clipPrompts[0].slice(0, 120)}…`);
  }
  console.log(`  video:    ${reel.videoUrl}`);
  console.log('  saved:    /tmp/karaman-product-reel-test.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
