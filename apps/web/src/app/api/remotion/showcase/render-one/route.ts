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
import { loadWorkspaceBrandTemplateLibrary } from '@/lib/brand-template-library-workspace';
import { resolveShowcasePresetLibrary } from '@/lib/showcase-preset-libraries';
import { resolveShowcaseBrandKit, resolveShowcasePhotosForRender } from '@/lib/brand-showcase-presets';
import { buildBrandFingerprint } from '@/lib/tenant-template-seed';
import { resolveShowcaseDemoProps } from '@/lib/showcase-demo-props';
import { isBeachClubSector } from '@/lib/showcase-beach-club';
import { isBeautySalonSector } from '@/lib/showcase-beauty-salon';
import { pickBeachClubPhotoPool, pickBeautySalonPhotoPool } from '@/lib/remotion-template-registry';
import { resolveShowcaseLogoUrl } from '@/lib/demo-brand-logo';
import { resolveSlotRenderTypography } from '@/lib/brand-template-slot-typography';
import {
  fetchBrandProductionTokensForWorkspace,
  applyBrandTokensToRenderProps,
} from '@/lib/brand-production-tokens';
import { resolveProductionLogoUrl, resolveSlotLogoForRender } from '@/lib/brand-logo-production';
import type { BrandTemplateLibrary, BrandTemplateLibrarySlot } from '@/lib/brand-template-library';

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
    preset?: string;
    workspaceId?: string;
    workspace?: string;
    photoUrl?: string;
    previewLibrary?: BrandTemplateLibrary;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const isPoster = body.kind === 'poster' || (body.templateId ?? '').startsWith('poster_');
  const workspaceId = (body.workspaceId ?? body.workspace)?.trim();
  const presetKey = (body.presetKey ?? body.preset)?.trim();
  const workspaceLoad = workspaceId
    ? await loadWorkspaceBrandTemplateLibrary(workspaceId)
    : null;
  const presetLibrary = presetKey ? resolveShowcasePresetLibrary(presetKey) : null;
  const effectiveKitId = workspaceLoad?.kitId ?? body.kitId;
  const kit = resolveShowcaseBrandKit({ kitId: effectiveKitId, presetKey: presetKey ?? body.presetKey });
  const rawStoryPhotos = kit.storyPhotoUrls?.length
    ? kit.storyPhotoUrls
    : isBeachClubSector(kit.sector)
      ? pickBeachClubPhotoPool(0, 7)
      : isBeautySalonSector(kit.sector)
        ? pickBeautySalonPhotoPool(0, 7)
        : STORY_PHOTOS;
  const storyPhotos = resolveShowcasePhotosForRender(rawStoryPhotos, BASE_URL);
  const brandName = kit.brandName ?? kit.name;
  const brandLocation = kit.location ?? 'İstanbul';
  const workspaceLogoUrl = workspaceId ? await fetchWorkspaceLogoUrl(workspaceId) : '';
  const logoUrl = resolveShowcaseLogoUrl({
    brandName,
    accentColor: kit.accentColor,
    logoUrl: workspaceLogoUrl || (kit as { logoUrl?: string }).logoUrl,
  });
  const diversifyId = presetKey ? `showcase_${presetKey}` : workspaceId;
  const brandFingerprint = buildBrandFingerprint({
    tenantId: diversifyId,
    brandName: kit.brandName ?? kit.name,
    primaryColor: kit.primaryColor,
    accentColor: kit.accentColor,
    headingFont: kit.headingFont,
    bodyFont: kit.bodyFont,
    motionStyle: kit.motionStyle,
  });
  const library = body.previewLibrary
    ?? workspaceLoad?.library
    ?? presetLibrary
    ?? deriveBrandTemplateLibrary({
      kitId: kit.id,
      sector: kit.sector,
      tenantId: diversifyId,
      brandFingerprint,
    });
  const manifestScope = workspaceId?.slice(0, 8)
    ?? (presetKey ? `preset_${presetKey}` : kit.id);

  const brandTokens = workspaceId
    ? await fetchBrandProductionTokensForWorkspace(workspaceId, {
        sector: workspaceLoad?.sector ?? kit.sector,
        brandName,
      })
    : null;
  const brandColors = {
    primaryColor: brandTokens?.primaryColor ?? kit.primaryColor,
    accentColor: brandTokens?.accentColor ?? kit.accentColor,
  };

  if (isPoster) {
    const template = getPosterTemplate(body.templateId ?? '');
    if (!template) return NextResponse.json({ error: 'Unknown poster templateId' }, { status: 404 });

    const format = body.format && template.formats.includes(body.format)
      ? body.format
      : (template.formats[0] ?? 'story');
    const posterSlot = resolveLibrarySlot(library, body.slotKey, template.id, 'post');
    const posterTypo = await resolveShowcaseSlotTypography({
      library,
      slot: posterSlot,
      templateId: template.id,
      format: 'post',
      workspaceId,
      sector: workspaceLoad?.sector ?? kit.sector,
      brandName,
      kitHeadingFont: brandTokens?.headingFont ?? kit.headingFont,
      kitBodyFont: brandTokens?.bodyFont ?? kit.bodyFont,
    });
    const demo = buildPosterDemoProps(template, kit, format);
    const slotCopy = resolveShowcaseDemoProps({
      family: 'campaign_hero',
      kit,
      slotKey: posterSlot?.key ?? 'campaign_post',
      sector: workspaceLoad?.sector ?? kit.sector,
      presetKey: presetKey ?? undefined,
    });
    const posterPhotoUrl = body.photoUrl?.trim()
      ? resolveShowcasePhotosForRender([body.photoUrl.trim()], BASE_URL)[0] ?? demo.photoUrl
      : storyPhotos[4 % storyPhotos.length] ?? demo.photoUrl;
    const t0 = Date.now();
    const { renderAgencyPoster } = await import('@/lib/poster-render-service');
    const { buffer: pngBuffer, announcementTemplateId } = await renderAgencyPoster({
      posterTemplateId: demo.posterTemplateId,
      photoUrl: posterPhotoUrl,
      format: demo.format,
      headline: slotCopy.headline,
      subtitle: slotCopy.subtitle,
      brandName,
      location: brandLocation,
      eventDate: slotCopy.eventDate ?? demo.eventDate,
      eventTime: slotCopy.eventTime ?? demo.eventTime,
      cta: slotCopy.cta ?? demo.cta,
      primaryColor: brandColors.primaryColor,
      accentColor: brandColors.accentColor,
      fontFamily: posterTypo.headingFont,
      bodyFont: posterTypo.bodyFont,
      textColor: brandTokens?.headlineColor,
      brandKit: brandTokens?.announcementKit,
      logoUrl: resolveSlotLogoForRender(logoUrl, posterSlot),
      lineupArtists: demo.lineupArtists,
      sector: workspaceLoad?.sector ?? kit.sector,
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
      headline: slotCopy.headline,
      announcementTemplateId,
      renderEngine: 'agency-svg',
    }, { durationMs, bytes: pngBuffer.length });

    return NextResponse.json({ ok: true, url: publicUrl, templateId: template.id, kind: 'poster', format });
  }

  const storyTemplateId = body.templateId
    ?? (body.slotKey ? library.slots.find((s) => s.key === body.slotKey)?.storyTemplateId : undefined)
    ?? '';
  const librarySlot = resolveLibrarySlot(library, body.slotKey, storyTemplateId, 'story');
  const template = getRemotionTemplate(storyTemplateId);
  if (!template) return NextResponse.json({ error: 'Unknown templateId' }, { status: 404 });

  const compositionId = librarySlot?.legacyComposition ?? 'SpecStory';
  const manifestId = librarySlot?.key ? `${manifestScope}_${librarySlot.key}` : `${manifestScope}_${template.id}`;
  const slotPhotoIndex: Record<string, number> = {
    daily_story: 0,
    event_story: 1,
    editorial_story: 2,
    social_proof: 3,
    campaign_post: 4,
  };
  const photoIdx = body.slotKey && slotPhotoIndex[body.slotKey] !== undefined
    ? slotPhotoIndex[body.slotKey]! % storyPhotos.length
    : template.variantIndex % storyPhotos.length;
  const primaryPhoto = body.photoUrl?.trim()
    ? resolveShowcasePhotosForRender([body.photoUrl.trim()], BASE_URL)[0]
    : storyPhotos[photoIdx];
  const multiPhotoFamilies = new Set([
    'gallery_series', 'diptych_collage', 'mosaic_pinterest', 'polaroid_stack', 'bento_story',
  ]);
  const galleryPhotoUrls = multiPhotoFamilies.has(template.family)
    ? body.photoUrl?.trim()
      ? [primaryPhoto, storyPhotos[(photoIdx + 1) % storyPhotos.length]!].filter(Boolean)
      : [storyPhotos[(photoIdx + 1) % storyPhotos.length]!, storyPhotos[(photoIdx + 2) % storyPhotos.length]!]
    : undefined;
  const isEvent = template.family === 'event_ticket';
  const isLocation = template.family === 'location_pin';
  const demo = resolveShowcaseDemoProps({
    family: template.family,
    kit,
    slotKey: librarySlot?.key,
    variantIndex: template.variantIndex,
    sector: kit.sector,
    presetKey: presetKey ?? undefined,
  });
  const storyTypo = await resolveShowcaseSlotTypography({
    library,
    slot: librarySlot,
    templateId: template.id,
    format: 'story',
    workspaceId,
    sector: workspaceLoad?.sector ?? kit.sector,
    brandName,
    kitHeadingFont: brandTokens?.headingFont ?? kit.headingFont,
    kitBodyFont: brandTokens?.bodyFont ?? kit.bodyFont,
  });

  const baseStoryProps: Record<string, unknown> = {
    templateId: template.id,
    kitId: kit.id,
    librarySlotKey: librarySlot?.key,
    photoUrl: primaryPhoto,
    galleryPhotoUrls,
    galleryLayout: template.family === 'gallery_series' ? 'dual' : undefined,
    headline: demo.headline,
    subtitle: demo.subtitle,
    categoryLabel: demo.categoryLabel,
    brandName,
    logoUrl: resolveSlotLogoForRender(logoUrl, librarySlot),
    location: brandLocation,
    eventDate: demo.eventDate ?? (isEvent ? '15 Haziran' : undefined),
    eventTime: demo.eventTime ?? (isEvent ? '21:00' : undefined),
    cta: demo.cta
      ?? (isEvent ? 'Rezervasyon' : undefined)
      ?? (isLocation && template.spec.showCtaPill ? (demo.cta || 'Yol tarifi') : undefined)
      ?? (template.spec.showCtaPill ? 'Rezervasyon' : undefined),
    storyMusicUrl: '',
  };

  const storyProps = brandTokens
    ? applyBrandTokensToRenderProps(baseStoryProps, brandTokens, {
        headingFont: storyTypo.headingFont,
        bodyFont: storyTypo.bodyFont,
        fontPersonality: storyTypo.fontPersonality,
        honorTemplateTypography: storyTypo.honorTemplateTypography,
      })
    : {
        ...baseStoryProps,
        primaryColor: brandColors.primaryColor,
        accentColor: brandColors.accentColor,
        fontFamily: storyTypo.headingFont,
        bodyFont: storyTypo.bodyFont,
      };

  const res = await fetch(`${BASE_URL}/api/remotion/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compositionId,
      useCreativeDirector: false,
      uploadToR2: false,
      props: storyProps,
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

function resolveLibrarySlot(
  library: BrandTemplateLibrary,
  slotKey: string | undefined,
  templateId: string,
  format: 'story' | 'post',
): BrandTemplateLibrarySlot | undefined {
  if (slotKey) return library.slots.find((s) => s.key === slotKey);
  if (!templateId) return undefined;
  return library.slots.find((s) =>
    format === 'post' ? s.posterTemplateId === templateId : s.storyTemplateId === templateId,
  );
}

async function fetchWorkspaceLogoUrl(workspaceId: string): Promise<string> {
  const crew = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
  const key = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
  try {
    const res = await fetch(`${crew}/api/v1/brand-context/${workspaceId}`, {
      headers: { 'X-Internal-Api-Key': key, 'X-Tenant-Id': workspaceId },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return '';
    const ctx = await res.json() as Record<string, unknown>;
    return resolveProductionLogoUrl([String(ctx.logo_url ?? '')]);
  } catch {
    return '';
  }
}

async function resolveShowcaseSlotTypography(input: {
  library: BrandTemplateLibrary;
  slot?: BrandTemplateLibrarySlot;
  templateId: string;
  format: 'story' | 'post';
  workspaceId?: string;
  sector?: string;
  brandName: string;
  kitHeadingFont: string;
  kitBodyFont: string;
}) {
  const slotFields = {
    fontMode: input.slot?.fontMode,
    fontPersonality: input.slot?.fontPersonality,
    headingFont: input.slot?.headingFont,
    bodyFont: input.slot?.bodyFont,
    format: input.format,
    storyTemplateId: input.slot?.storyTemplateId,
    posterTemplateId: input.slot?.posterTemplateId,
  };
  const tokens = input.workspaceId
    ? await fetchBrandProductionTokensForWorkspace(input.workspaceId, {
        sector: input.sector,
        brandName: input.brandName,
      })
    : null;
  return resolveSlotRenderTypography({
    slot: slotFields,
    templateId: input.templateId,
    format: input.format,
    brandHeadingFont: tokens?.headingFont ?? input.kitHeadingFont,
    brandBodyFont: tokens?.bodyFont ?? input.kitBodyFont,
    sector: input.sector,
  });
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
