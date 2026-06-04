/**
 * Fix pending/approved artifacts whose contentUrl or poster no longer loads (404 Unsplash, ephemeral Remotion).
 *
 *   node scripts/repair-broken-artifact-previews.mjs --tenant 5feb36f7-def7-4b4a-834f-353457de57bf
 *   node scripts/repair-broken-artifact-previews.mjs --tenant ... --dry-run
 */
const tenant = process.argv.includes('--tenant')
  ? process.argv[process.argv.indexOf('--tenant') + 1]
  : null;
const dryRun = process.argv.includes('--dry-run');

if (!tenant) {
  console.error('Usage: node scripts/repair-broken-artifact-previews.mjs --tenant <uuid> [--dry-run]');
  process.exit(1);
}

const NEXUS = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const INTERNAL = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';
const CREW = (process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000').replace(/\/$/, '');

async function probe(url) {
  if (!url?.trim()) return false;
  const u = url.trim();
  if (u.startsWith('/api/')) {
    try {
      const r = await fetch(`${CREW}${u}`, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12_000) });
      return r.ok;
    } catch {
      return false;
    }
  }
  if (!u.startsWith('http')) return false;
  try {
    let r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    if (!r.ok && [403, 405].includes(r.status)) {
      r = await fetch(u, { method: 'GET', headers: { Range: 'bytes=0-512' }, redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    }
    return r.ok;
  } catch {
    return false;
  }
}

function parseJson(s, fallback = {}) {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return fallback;
  }
}

function isVideoUrl(u) {
  return /\.(mp4|mov|webm)(\?|$)/i.test(u || '');
}

function toFeedPreviewUrl(url) {
  if (!url?.trim()) return null;
  const t = url.trim();
  if (t.startsWith('/api/')) return t;
  if (t.startsWith('http') && t.length <= 1000) {
    return `/api/media-proxy?url=${encodeURIComponent(t)}`;
  }
  return t.length <= 1000 ? t : t.slice(0, 1000);
}

function pickUrlsFromArtifact(art) {
  const content = parseJson(art.content);
  const meta = parseJson(art.metadata);
  return [
    art.contentUrl,
    meta.feed_preview_url,
    content.feed_preview_url,
    content.imageUrl,
    content.posterUrl,
    content.poster_url,
    content.reference_photo_url,
    meta.imageUrl,
    meta.posterUrl,
    meta.poster_url,
    meta.reference_photo_url,
    content.videoUrl,
    meta.videoUrl,
  ].filter((x) => typeof x === 'string' && x.trim());
}

async function loadGallery() {
  const res = await fetch(`${CREW}/api/brand-context-data/${tenant}`);
  if (!res.ok) throw new Error(`brand context ${res.status}`);
  const ctx = await res.json();
  let refs = [];
  try {
    refs = JSON.parse(ctx.reference_image_urls || '[]');
  } catch {
    refs = [];
  }
  const good = [];
  for (const u of refs) {
    if (typeof u !== 'string') continue;
    const proxied = toFeedPreviewUrl(u) ?? u;
    if (await probe(proxied)) good.push(proxied);
    else if (await probe(u)) good.push(toFeedPreviewUrl(u) ?? u);
  }
  return good;
}

async function nexus(path, opts = {}) {
  const res = await fetch(`${NEXUS}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenant,
      'X-Internal-Api-Key': INTERNAL,
      ...(opts.headers || {}),
    },
  });
  return res;
}

async function attachImage(artifactId, imageUrl, contentType) {
  if (dryRun) {
    console.log(`  [dry-run] attach-image ${artifactId} ← ${imageUrl.slice(0, 72)}`);
    return true;
  }
  const res = await nexus(`/api/artifacts/${artifactId}/attach-image`, {
    method: 'PATCH',
    body: JSON.stringify({ imageUrl, contentType }),
  });
  if (!res.ok) {
    console.warn('  attach-image failed', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}

async function patchBundleFailed(artifactId, error) {
  if (dryRun) {
    console.log(`  [dry-run] bundle-status failed ${artifactId}`);
    return;
  }
  await nexus(`/api/artifacts/${artifactId}/bundle-status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'failed', error }),
  });
}

async function main() {
  const gallery = await loadGallery();
  console.log(`Gallery reachable: ${gallery.length} photos`);

  const listRes = await nexus('/api/artifacts');
  if (!listRes.ok) {
    console.error('artifacts list failed', listRes.status, await listRes.text());
    process.exit(1);
  }
  const artifacts = await listRes.json();
  const items = Array.isArray(artifacts) ? artifacts : artifacts.items ?? [];
  let fixed = 0;

  for (const art of items) {
    const urls = pickUrlsFromArtifact(art);
    const primary = (art.contentUrl || '').trim();
    const video = urls.find(isVideoUrl);
    const images = urls.filter((u) => !isVideoUrl(u));

    const primaryOk = primary ? await probe(primary) : false;
    const videoOk = video ? await probe(video) : false;
    let bestImage = null;
    for (const u of images) {
      const candidates = [toFeedPreviewUrl(u), u].filter(Boolean);
      for (const c of candidates) {
        if (await probe(c)) {
          bestImage = c;
          break;
        }
      }
      if (bestImage) break;
    }

    const needsFix =
      (primary && !primaryOk && !videoOk)
      || (video && !videoOk && !bestImage)
      || (primary && isVideoUrl(primary) && !videoOk);

    if (!needsFix) continue;

    const replacement = bestImage
      || gallery[fixed % Math.max(gallery.length, 1)]
      || null;
    const replacementProxied = replacement ? (toFeedPreviewUrl(replacement) ?? replacement) : null;
    if (!replacementProxied) {
      console.warn(`Skip ${art.id} — no replacement image`);
      continue;
    }

    const ct = String(art.contentType || parseJson(art.content).kind || 'instagram_post').toLowerCase();
    const contentType = ct.includes('story') ? 'instagram_story' : ct.includes('reel') ? 'instagram_reel' : 'instagram_post';

    console.log(`Fix ${art.id?.slice(0, 8)}… "${(art.title || '').slice(0, 36)}" → ${replacementProxied.slice(0, 64)}`);
    if (video && !videoOk) await patchBundleFailed(art.id, 'Ephemeral or missing video — reverted to gallery still');
    if (await attachImage(art.id, replacementProxied, contentType)) fixed += 1;
  }

  console.log(`Done. Repaired ${fixed} artifact(s).${dryRun ? ' (dry-run)' : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
