#!/usr/bin/env node
/**
 * Render Remotion showcase library → apps/web/public/remotion-showcase/
 *
 * Usage:
 *   node scripts/render-remotion-showcase.mjs              # all 100 catalog templates
 *   node scripts/render-remotion-showcase.mjs --limit 10   # first N only
 *   node scripts/render-remotion-showcase.mjs --from 20 --to 29
 *   node scripts/render-remotion-showcase.mjs --legacy       # original 9 legacy compositions
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'apps/web/public/remotion-showcase');
const BASE_URL = process.env.REMOTION_SHOWCASE_BASE || 'http://localhost:3000';
const TIMEOUT_MS = 280_000;

const args = process.argv.slice(2);
const legacyMode = args.includes('--legacy');
const limitIdx = args.indexOf('--limit');
const fromIdx = args.indexOf('--from');
const toIdx = args.indexOf('--to');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;
const from = fromIdx >= 0 ? Number(args[fromIdx + 1]) : 0;
const to = toIdx >= 0 ? Number(args[toIdx + 1]) : undefined;

const PHOTO =
  process.env.REMOTION_SHOWCASE_PHOTO ||
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080&q=85';

const BRAND = {
  photoUrl: PHOTO,
  brandName: 'Smart Agency',
  location: 'İstanbul',
  primaryColor: '#1a2b4a',
  accentColor: '#c9a96e',
  fontFamily: 'Cormorant Garamond',
  bodyFont: 'Sora',
};

const LEGACY_JOBS = [
  { id: 'EditorialStory', kind: 'video', props: { ...BRAND, headline: 'Günün Lezzeti', subtitle: 'Taze malzemeler', categoryLabel: 'MENÜ' } },
  { id: 'LuxurySplitStory', kind: 'video', props: { ...BRAND, headline: 'Premium Deneyim', subtitle: 'Özel davet', categoryLabel: 'LUXURY' } },
  { id: 'CinematicStory', kind: 'video', props: { ...BRAND, headline: 'Gün Batımı', subtitle: '', categoryLabel: 'VIBE' } },
  { id: 'EventAnnouncementStory', kind: 'video', props: { ...BRAND, headline: 'DJ Night Live', subtitle: 'Yaz sezonu açılışı', categoryLabel: 'EVENT', eventDate: '15 Haziran', eventTime: '21:00', cta: 'Rezervasyon' } },
  { id: 'CampaignHeroStory', kind: 'video', props: { ...BRAND, headline: '%30 İndirim', subtitle: 'Bu hafta sonu geçerli', categoryLabel: 'CAMPAIGN', cta: 'Hemen Al' } },
  { id: 'MagazineCoverStory', kind: 'video', props: { ...BRAND, headline: 'ŞEF', subtitle: 'Özel menü', categoryLabel: 'FEATURE' } },
  { id: 'GallerySeriesStory', kind: 'video', props: { ...BRAND, headline: 'Misafirlerimiz Bizi Seviyor', subtitle: 'Gerçek deneyimler', categoryLabel: 'SOCIAL PROOF', galleryPhotoUrls: ['https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1080', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1080'], galleryLayout: 'dual' } },
  { id: 'BrandedFeedPost', kind: 'still', props: { ...BRAND, headline: 'Marka Hikayesi', subtitle: '1:1 feed post', format: '1:1' } },
  { id: 'BrandedFeedPortrait', kind: 'still', props: { ...BRAND, headline: 'Marka Hikayesi', subtitle: '4:5 portrait', format: '4:5' } },
];

async function loadCatalogJobs() {
  const res = await fetch(`${BASE_URL}/api/remotion/catalog`);
  if (!res.ok) throw new Error('Start dev server first: npm run dev in apps/web');
  const data = await res.json();
  const templates = data.templates ?? [];
  const kits = data.brandKits ?? [];
  const photos = [
    PHOTO,
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1080&q=85',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1080&q=85',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1080&q=85',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1080&q=85',
  ];

  return templates.slice(0, 100).map((t, i) => {
    const kit = kits[i % kits.length] ?? kits[0];
    return {
      templateId: t.id,
      kitId: kit?.id ?? 'kit_01_beach_club',
      headline: kit?.name ? `${kit.name} Story` : 'Marka Hikayesi',
      subtitle: 'Ajans kalitesinde içerik',
      categoryLabel: (t.collection ?? 'BRAND').toUpperCase().slice(0, 12),
      photoUrl: photos[i % photos.length],
      galleryPhotoUrls: t.family === 'gallery_series'
        ? [photos[(i + 1) % photos.length], photos[(i + 2) % photos.length]]
        : undefined,
    };
  });
}

function catalogJobToRenderJob(job) {
  return {
    id: job.templateId,
    kind: 'video',
    compositionId: 'SpecStory',
    kitId: job.kitId,
    props: {
      templateId: job.templateId,
      kitId: job.kitId,
      photoUrl: job.photoUrl,
      galleryPhotoUrls: job.galleryPhotoUrls,
      galleryLayout: job.galleryPhotoUrls?.length ? 'dual' : undefined,
      headline: job.headline,
      subtitle: job.subtitle,
      categoryLabel: job.categoryLabel,
      brandName: 'Smart Agency',
      location: 'İstanbul',
    },
  };
}

async function renderOne(job, attempt = 1) {
  const compositionId = job.compositionId ?? job.id;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/remotion/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        compositionId,
        useCreativeDirector: false,
        uploadToR2: false,
        props: job.props,
      }),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (attempt < 2) {
        console.log('\n   retry… ');
        await new Promise((r) => setTimeout(r, 5000));
        return renderOne(job, attempt + 1);
      }
      throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 120)}`);
    }
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function saveOutput(job, data) {
  const ext = job.kind === 'still' ? 'png' : 'mp4';
  const filename = `${job.id}.${ext}`;
  const dest = path.join(OUT_DIR, filename);

  if (data.imageUrl?.startsWith('data:image/png;base64,')) {
    const b64 = data.imageUrl.slice('data:image/png;base64,'.length);
    fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
    return `/remotion-showcase/${filename}`;
  }

  if (data.videoUrl?.startsWith('/api/remotion/video/')) {
    const vidRes = await fetch(`${BASE_URL}${data.videoUrl}`);
    if (!vidRes.ok) throw new Error(`Failed to download ${data.videoUrl}`);
    fs.writeFileSync(dest, Buffer.from(await vidRes.arrayBuffer()));
    return `/remotion-showcase/${filename}`;
  }

  if (data.videoBase64) {
    fs.writeFileSync(dest, Buffer.from(data.videoBase64, 'base64'));
    return `/remotion-showcase/${filename}`;
  }

  throw new Error(`No output URL for ${job.id}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let jobs;
  if (legacyMode) {
    jobs = LEGACY_JOBS;
  } else {
    const catalogJobs = await loadCatalogJobs();
    jobs = catalogJobs.map(catalogJobToRenderJob);
  }

  if (limit) jobs = jobs.slice(0, limit);
  else if (to !== undefined) jobs = jobs.slice(from, to + 1);
  else if (from > 0) jobs = jobs.slice(from);

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  let existing = { items: [] };
  if (fs.existsSync(manifestPath)) {
    try { existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* ignore */ }
  }
  const manifestById = new Map((existing.items ?? []).map((i) => [i.id, i]));

  console.log(`Rendering ${jobs.length} compositions → ${OUT_DIR}`);
  console.log(`API: ${BASE_URL}\n`);

  for (const job of jobs) {
    process.stdout.write(`→ ${job.id} … `);
    const started = Date.now();
    try {
      const data = await renderOne(job);
      const publicUrl = await saveOutput(job, data);
      const entry = {
        id: job.id,
        kind: job.kind,
        url: publicUrl,
        durationMs: data.durationMs ?? null,
        bytes: data.bytes ?? null,
        headline: job.props.headline,
        templateId: job.props.templateId ?? job.id,
        kitId: job.props.kitId ?? job.kitId,
        collection: job.props.templateId?.split('_')[1],
      };
      manifestById.set(job.id, entry);
      console.log(`OK (${((Date.now() - started) / 1000).toFixed(0)}s) → ${publicUrl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL — ${msg.slice(0, 80)}`);
      const prev = manifestById.get(job.id);
      if (!prev?.url) {
        manifestById.set(job.id, {
          id: job.id,
          kind: job.kind,
          error: msg.slice(0, 200),
          headline: job.props?.headline,
          templateId: job.props?.templateId ?? job.id,
        });
      }
    }
  }

  const items = [...manifestById.values()].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: items.length, items }, null, 2),
  );
  console.log(`\nDone. ${items.filter((i) => i.url).length}/${items.length} rendered. Open ${BASE_URL}/remotion-showcase`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
