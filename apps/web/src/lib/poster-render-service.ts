/**
 * Agency poster render — photo + announcement SVG overlay (Sharp + Resvg).
 * Replaces amateur CSS PosterLayoutEngine for production-quality output.
 */
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import {
  buildAnnouncementOverlaySvg,
  resolveFormatDimensions,
  type AnnouncementContentFormat,
  type AnnouncementTemplateId,
} from './announcement-template-library';
import {
  fontNameToStack,
  mergeBrandKit,
  resolveAnnouncementBrandKit,
  type AnnouncementBrandKit,
} from './announcement-brand-kit';
import { loadFontFiles, primaryFamily } from './svg-font-loader';
import { getPosterTemplate } from './poster-template-catalog';
import { sanitizePosterText } from './announcement-text-fit';
import { auditPosterOverlayCopy, resolvePosterOverlayCopy } from './poster-copy';
import { buildPosterGrafikerRetryHeadline } from './poster-quality';
import {
  grafikerMeetsBar,
  runGrafikerReviewOnImageBuffer,
  type GrafikerReviewResult,
} from './remotion-quality';
import { resolveTextOverlayPrefs } from './brand-text-overlay-prefs';
import type { PosterLayoutFamily } from './poster-template-types';

const FAMILY_MAP: Record<PosterLayoutFamily, string> = {
  lineup_tiered: 'concert_lineup',
  festival_grid: 'festival_poster',
  dj_night: 'dj_night',
  promo_split: 'promo_banner',
  gala_invite: 'gala_invite',
  editorial_date: 'magazine_date',
  event_masthead: 'top_masthead',
  restaurant_feature: 'luxury_bottom',
  neon_club: 'neon_night',
  art_deco: 'gala_invite',
};

export interface AgencyPosterRenderInput {
  posterTemplateId: string;
  photoUrl: string;
  format: 'story' | 'post' | 'portrait';
  headline: string;
  subtitle?: string;
  brandName: string;
  location?: string;
  eventDate?: string;
  eventTime?: string;
  cta?: string;
  primaryColor?: string;
  accentColor?: string;
  headlineColor?: string;
  textColor?: string;
  fontFamily?: string;
  bodyFont?: string;
  logoUrl?: string;
  lineupArtists?: string[];
  sector?: string;
  /** Pre-resolved kit (Marka Detayı tokens) — wins over inline colors/fonts */
  brandKit?: AnnouncementBrandKit;
  brandTheme?: Record<string, unknown> | null;
  /** Faz 2.2 — production tier; premium preserves full Grafiker (gpt-4o high) */
  profileTier?: 'economy' | 'agency' | 'premium';
}

async function rasterizeOverlayWithFonts(
  svg: string,
  width: number,
  brandKit: AnnouncementBrandKit,
): Promise<Buffer | null> {
  try {
    const families = [
      primaryFamily(brandKit.headingFontStack),
      primaryFamily(brandKit.bodyFontStack),
      'Great Vibes',
      'Allura',
      'Playfair Display',
      'Inter',
      'Anton',
      'Oswald',
      'Bebas Neue',
    ].filter(Boolean);
    const fontFiles = await loadFontFiles(families);
    if (!fontFiles.length) return null;
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: width },
      font: {
        fontFiles,
        loadSystemFonts: true,
        defaultFontFamily: primaryFamily(brandKit.bodyFontStack) || 'Inter',
      },
    });
    return Buffer.from(resvg.render().asPng());
  } catch {
    return null;
  }
}

export function posterTemplateToAnnouncementId(posterTemplateId: string): AnnouncementTemplateId {
  const poster = getPosterTemplate(posterTemplateId);
  if (!poster) return 'agency_concert_lineup_01';
  const annFamily = FAMILY_MAP[poster.family] ?? 'concert_lineup';
  const nn = String(poster.variantIndex + 1).padStart(2, '0');
  return `agency_${annFamily}_${nn}` as AnnouncementTemplateId;
}

function toAnnouncementFormat(format: AgencyPosterRenderInput['format']): AnnouncementContentFormat {
  if (format === 'post') return 'square';
  if (format === 'portrait') return 'post';
  return 'story';
}

async function renderAgencyPosterOnce(
  input: AgencyPosterRenderInput,
  headline: string,
): Promise<{
  buffer: Buffer;
  announcementTemplateId: AnnouncementTemplateId;
  width: number;
  height: number;
}> {
  const contentType = toAnnouncementFormat(input.format);
  const { width, height } = resolveFormatDimensions(contentType);
  const announcementTemplateId = posterTemplateToAnnouncementId(input.posterTemplateId);

  const baseKit = input.brandKit ?? resolveAnnouncementBrandKit({
    brandContext: {},
    overrides: {
      brandName: input.brandName,
      primaryColor: input.primaryColor,
      accentColor: input.accentColor,
      ...(input.headlineColor ? { headlineColor: input.headlineColor } : {}),
      ...(input.textColor ? { textColor: input.textColor } : {}),
    },
  });
  const brandKit = mergeBrandKit(baseKit, {
    ...(input.fontFamily ? { headingFontStack: fontNameToStack(input.fontFamily, true) } : {}),
    ...(input.bodyFont ? { bodyFontStack: fontNameToStack(input.bodyFont, false) } : {}),
    ...(input.headlineColor ? { headlineColor: input.headlineColor } : {}),
    ...(input.textColor ? { textColor: input.textColor } : {}),
    ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
  });

  const photoRes = await fetch(input.photoUrl, { signal: AbortSignal.timeout(20_000) });
  if (!photoRes.ok) throw new Error(`Photo fetch failed: ${photoRes.status}`);
  const photoBuffer = Buffer.from(await photoRes.arrayBuffer());

  const resized = await sharp(photoBuffer)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const lineup = input.lineupArtists?.length
    ? input.lineupArtists
    : undefined;

  const copy = resolvePosterOverlayCopy({
    headline,
    ideationHeadline: headline,
    subtitle: input.subtitle,
    brandName: input.brandName,
    location: input.location,
    eventDate: input.eventDate,
    eventTime: input.eventTime,
    cta: input.cta,
    caption: input.subtitle,
    sector: input.sector,
  });

  const poster = getPosterTemplate(input.posterTemplateId);
  auditPosterOverlayCopy(copy, {
    sector: input.sector,
    layoutFamily: poster?.family,
  });

  const textPrefs = resolveTextOverlayPrefs(input.brandTheme ?? null);

  const svgBuf = buildAnnouncementOverlaySvg({
    width,
    height,
    contentType,
    templateId: announcementTemplateId,
    textOverlayDensity: textPrefs.density,
    artistName: copy.headline,
    eventName: copy.headline,
    date: input.eventDate,
    time: input.eventTime,
    venueArea: copy.venueArea,
    brandName: input.brandName,
    tagline: copy.subtitle,
    accentColor: brandKit.accentColor,
    textColor: brandKit.textColor,
    brandKit,
    lineupArtists: lineup,
    ticketLabel: copy.cta ?? input.cta,
    sector: input.sector,
    vibeTypography: { headline_font: input.fontFamily },
  });

  const overlayPng = await rasterizeOverlayWithFonts(svgBuf.toString('utf-8'), width, brandKit);
  const overlayInput = overlayPng ?? svgBuf;

  let finalBuffer = await sharp(resized)
    .composite([{ input: overlayInput, top: 0, left: 0 }])
    .png({ quality: 95 })
    .toBuffer();

  if (brandKit.logoUrl) {
    try {
      const logoRes = await fetch(brandKit.logoUrl, { signal: AbortSignal.timeout(8_000) });
      if (logoRes.ok) {
        const logoBuf = Buffer.from(await logoRes.arrayBuffer());
        const logoH = Math.round(height * 0.045);
        const logoW = Math.round(logoH * 3.5);
        const logo = await sharp(logoBuf).resize(logoW, logoH, { fit: 'inside' }).png().toBuffer();
        finalBuffer = await sharp(finalBuffer)
          .composite([{ input: logo, top: Math.round(height * 0.035), left: Math.round((width - logoW) / 2) }])
          .png({ quality: 95 })
          .toBuffer();
      }
    } catch { /* optional logo */ }
  }

  return { buffer: finalBuffer, announcementTemplateId, width, height };
}

export async function renderAgencyPoster(input: AgencyPosterRenderInput): Promise<{
  buffer: Buffer;
  announcementTemplateId: AnnouncementTemplateId;
  width: number;
  height: number;
  grafikerScore: number | null;
  grafikerPass: boolean;
  grafikerReview: GrafikerReviewResult | null;
}> {
  let headline = sanitizePosterText(input.headline) || 'İçerik';
  let last: Awaited<ReturnType<typeof renderAgencyPosterOnce>> | null = null;
  let grafikerReview: GrafikerReviewResult | null = null;

  for (let attempt = 0; attempt <= 2; attempt++) {
    last = await renderAgencyPosterOnce(input, headline);
    grafikerReview = await runGrafikerReviewOnImageBuffer(
      last.buffer,
      `SpecPoster:${input.format}`,
      { attempt },
      input.profileTier,
    );
    if (grafikerReview) {
      try {
        const { emitQualityEvent } = await import('@/lib/ai-cost-telemetry');
        emitQualityEvent({
          event: 'grafiker',
          pass: grafikerMeetsBar(grafikerReview),
          score: grafikerReview.score,
          attempt,
          label: `poster:${input.format}`,
        });
      } catch { /* telemetri üretimi bozmamalı */ }
    }
    if (!grafikerReview || grafikerMeetsBar(grafikerReview)) break;

    const clipped = (grafikerReview.issues ?? []).some((i) =>
      /clip|cut|crop|overflow|edge|sığ|kesil|truncat/i.test(i),
    ) || grafikerReview.text_legibility === 'poor';

    console.warn(
      `[poster] Grafiker retry ${attempt + 1}: score=${grafikerReview.score}/10 ` +
      `pass=${grafikerReview.pass} clipped=${clipped} | ${grafikerReview.verdict ?? ''}`,
    );

    if (attempt >= 2) break;
    headline = buildPosterGrafikerRetryHeadline(headline, attempt);
  }

  if (!last) throw new Error('Poster render failed');

  const grafikerPass = grafikerReview ? grafikerMeetsBar(grafikerReview) : true;
  return {
    ...last,
    grafikerScore: grafikerReview?.score ?? null,
    grafikerPass,
    grafikerReview,
  };
}
