/**
 * POST /api/remotion/showcase/render-one
 * On-demand single template preview (story MP4 or poster PNG).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getRemotionTemplate } from '@/lib/remotion-template-catalog';
import { getPosterTemplate } from '@/lib/poster-template-catalog';
import { buildPosterDemoProps } from '@/lib/poster-template-registry';
import { deriveBrandTemplateLibrary } from '@/lib/brand-template-library';
import { resolveShowcaseBrandKit, resolveShowcasePhotosForRender } from '@/lib/brand-showcase-presets';
import { resolveShowcaseDemoProps } from '@/lib/showcase-demo-props';
import { resolveShowcaseLogoUrl } from '@/lib/demo-brand-logo';

export const runtime = 'nodejs';
export const maxDuration = 300;

const OUT_DIR = path.join(process.cwd(), 'public/remotion-showcase');
const BASE_URL = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';

const STORY_PHOTOS = [
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080&q=85',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1080&q=85',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1080&q=85',
];

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    templateId?: string;
    kitId?: string;
    slotKey?: string;
    kind?: 'story' | 'poster';
    format?: 'story' | 'post' | 'portrait';
    presetKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const isPoster = body.kind === 'poster' || (body.templateId ?? '').startsWith('poster_');
  const kit = resolveShowcaseBrandKit({ kitId: body.kitId, presetKey: body.presetKey });
  const rawStoryPhotos = kit.storyPhotoUrls?.length ? kit.storyPhotoUrls : STORY_PHOTOS;
  const storyPhotos = resolveShowcasePhotosForRender(rawStoryPhotos, BASE_URL);
  const brandName = kit.brandName ?? kit.name;
  const brandLocation = kit.location ?? 'İstanbul';
  const logoUrl = resolveShowcaseLogoUrl({
    brandName,
    accentColor: kit.accentColor,
  logoUrl: (kit as { logoUrl?: string }).logoUrl,
  });

  if (isPoster) {
    const template = getPosterTemplate(body.templateId ?? '');
    if (!template) return NextResponse.json({ error: 'Unknown poster templateId' }, { status: 404 });

    const format = body.format && template.formats.includes(body.format)
      ? body.format
      : (template.formats[0] ?? 'story');
    const demo = buildPosterDemoProps(template, kit, format);
    const t0 = Date.now();
    const { renderAgencyPoster } = await import('@/lib/poster-render-service');
    const { buffer: pngBuffer, announcementTemplateId } = await renderAgencyPoster({
      posterTemplateId: demo.posterTemplateId,
      photoUrl: demo.photoUrl,
      format: demo.format,
      headline: demo.headline,
      subtitle: demo.subtitle,
      brandName: demo.brandName,
      location: demo.location,
      eventDate: demo.eventDate,
      eventTime: demo.eventTime,
      cta: demo.cta,
      primaryColor: demo.primaryColor,
      accentColor: demo.accentColor,
      fontFamily: demo.fontFamily,
      lineupArtists: demo.lineupArtists,
    });
    const durationMs = Date.now() - t0;

    const filename = `${template.id}_${format}.png`;
    const dest = path.join(OUT_DIR, filename);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(dest, pngBuffer);

    const publicUrl = `/remotion-showcase/${filename}?v=${Date.now()}`;
    upsertManifest({
      id: `${template.id}_${format}`,
      kind: 'still',
      url: `/remotion-showcase/${filename}`,
      templateId: template.id,
      kitId: kit.id,
      mediaKind: 'poster',
      format,
      headline: demo.headline,
      announcementTemplateId,
      renderEngine: 'agency-svg',
    }, { durationMs, bytes: pngBuffer.length });

    return NextResponse.json({ ok: true, url: publicUrl, templateId: template.id, kind: 'poster', format });
  }

  const library = deriveBrandTemplateLibrary({ kitId: kit.id, sector: kit.sector });
  const librarySlot = body.slotKey
    ? library.slots.find((s) => s.key === body.slotKey)
    : undefined;
  const storyTemplateId = body.templateId ?? librarySlot?.storyTemplateId ?? '';
  const template = getRemotionTemplate(storyTemplateId);
  if (!template) return NextResponse.json({ error: 'Unknown templateId' }, { status: 404 });

  const compositionId = librarySlot?.legacyComposition ?? 'SpecStory';
  const manifestId = librarySlot?.key ? `${kit.id}_${librarySlot.key}` : template.id;
  const photoIdx = template.variantIndex % storyPhotos.length;
  const multiPhotoFamilies = new Set([
    'gallery_series', 'diptych_collage', 'mosaic_pinterest', 'polaroid_stack', 'bento_story',
  ]);
  const galleryPhotoUrls = multiPhotoFamilies.has(template.family)
    ? [storyPhotos[(photoIdx + 1) % storyPhotos.length]!, storyPhotos[(photoIdx + 2) % storyPhotos.length]!]
    : undefined;
  const isEvent = template.family === 'event_ticket';
  const isLocation = template.family === 'location_pin';
  const demo = resolveShowcaseDemoProps({
    family: template.family,
    kit,
    slotKey: librarySlot?.key,
    variantIndex: template.variantIndex,
  });

  const res = await fetch(`${BASE_URL}/api/remotion/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compositionId,
      useCreativeDirector: false,
      uploadToR2: false,
      props: {
        templateId: template.id,
        kitId: kit.id,
        librarySlotKey: librarySlot?.key,
        photoUrl: storyPhotos[photoIdx],
        galleryPhotoUrls,
        galleryLayout: template.family === 'gallery_series' ? 'dual' : undefined,
        headline: demo.headline,
        subtitle: demo.subtitle,
        categoryLabel: demo.categoryLabel,
        brandName,
        logoUrl,
        location: brandLocation,
        primaryColor: kit.primaryColor,
        accentColor: kit.accentColor,
        fontFamily: kit.headingFont,
        bodyFont: kit.bodyFont,
        eventDate: demo.eventDate ?? (isEvent ? '15 Haziran' : undefined),
        eventTime: demo.eventTime ?? (isEvent ? '21:00' : undefined),
        cta: demo.cta
          ?? (isEvent ? 'Rezervasyon' : undefined)
          ?? (isLocation && template.spec.showCtaPill ? (demo.cta || 'Yol tarifi') : undefined)
          ?? (template.spec.showCtaPill ? 'Rezervasyon' : undefined),
      },
    }),
    signal: AbortSignal.timeout(280_000),
  });

  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.error || 'Render failed' }, { status: 500 });

  const filename = librarySlot?.key ? `${manifestId}.mp4` : `${template.id}.mp4`;
  const dest = path.join(OUT_DIR, filename);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (data.videoUrl?.startsWith('/api/remotion/video/')) {
    const vid = await fetch(`${BASE_URL}${data.videoUrl}`);
    if (!vid.ok) return NextResponse.json({ error: 'Download failed' }, { status: 500 });
    fs.writeFileSync(dest, Buffer.from(await vid.arrayBuffer()));
  } else if (data.videoBase64) {
    fs.writeFileSync(dest, Buffer.from(data.videoBase64, 'base64'));
  } else {
    return NextResponse.json({ error: 'No video output' }, { status: 500 });
  }

  const publicUrl = `/remotion-showcase/${filename}?v=${Date.now()}`;
  upsertManifest({
    id: manifestId,
    kind: 'video',
    url: `/remotion-showcase/${filename}`,
    templateId: template.id,
    kitId: kit.id,
    slotKey: librarySlot?.key,
    mediaKind: 'story',
    headline: demo.headline,
    collection: template.collection,
  }, data);

  return NextResponse.json({ ok: true, url: publicUrl, templateId: template.id, kind: 'story', slotKey: librarySlot?.key });
}

function upsertManifest(entry: Record<string, unknown>, data: { durationMs?: number; bytes?: number }) {
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  let manifest: { generatedAt: string; count: number; items: Array<Record<string, unknown>> } = {
    generatedAt: new Date().toISOString(),
    count: 0,
    items: [],
  };
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* fresh */ }
  }
  const full = {
    ...entry,
    durationMs: data.durationMs ?? null,
    bytes: data.bytes ?? null,
  };
  const idx = manifest.items.findIndex((i) => i.id === entry.id);
  if (idx >= 0) manifest.items[idx] = full;
  else manifest.items.push(full);
  manifest.generatedAt = new Date().toISOString();
  manifest.count = manifest.items.length;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
