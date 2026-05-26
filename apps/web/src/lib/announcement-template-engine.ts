/**
 * Unified SVG renderer for agency announcement overlay templates.
 */

import type { AnnouncementOverlayInput, TemplateLayoutSpec } from './announcement-template-types';
import {
  buildSvgTextBlock,
  estimateTextWidth,
  fitTextToWidth,
  resolveContentBounds,
  type ContentBounds,
  type FitTextResult,
} from './announcement-text-fit';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveOverlayFonts(
  opts: AnnouncementOverlayInput,
  heroStyle?: TemplateLayoutSpec['heroStyle'],
): { heroFont: string; detailFont: string; scriptFont: string } {
  const scriptFont = "'Brush Script MT', 'Segoe Script', 'Playfair Display', Georgia, serif";
  if (opts.brandKit) {
    const heading = heroStyle === 'script'
      ? scriptFont
      : opts.brandKit.headingFontStack;
    return {
      heroFont: heading,
      detailFont: opts.brandKit.bodyFontStack,
      scriptFont,
    };
  }
  const raw = (
    opts.vibeTypography?.headline_font
    ?? opts.vibeTypography?.heading_personality
    ?? opts.vibeTypography?.headline_style
    ?? ''
  ).toLowerCase();
  if (heroStyle === 'script') {
    return { heroFont: scriptFont, detailFont: "Georgia, 'Times New Roman', serif", scriptFont };
  }
  if (raw.includes('sans') || raw.includes('condensed') || raw.includes('impact') || raw.includes('modern')) {
    return {
      heroFont: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      detailFont: "'Helvetica Neue', Helvetica, sans-serif",
      scriptFont,
    };
  }
  if (raw.includes('script') || raw.includes('handwritten')) {
    return { heroFont: scriptFont, detailFont: 'Georgia, serif', scriptFont };
  }
  return { heroFont: "Georgia, 'Times New Roman', serif", detailFont: "Georgia, 'Times New Roman', serif", scriptFont };
}

function resolveOverlayColors(opts: AnnouncementOverlayInput): {
  accent: string;
  text: string;
  shadow: string;
  primary: string;
} {
  return {
    accent: opts.brandKit?.accentColor ?? opts.accentColor,
    text: opts.brandKit?.textColor ?? opts.textColor,
    shadow: opts.brandKit?.shadowColor ?? '#000000',
    primary: opts.brandKit?.primaryColor ?? opts.accentColor,
  };
}

function heroText(opts: AnnouncementOverlayInput): string {
  return (opts.artistName ?? opts.eventName ?? '').trim();
}

function detailText(opts: AnnouncementOverlayInput): string {
  return [opts.date, opts.time].filter(Boolean).join('  ·  ');
}

function formatAdjust(spec: TemplateLayoutSpec, contentType: AnnouncementOverlayInput['contentType']): TemplateLayoutSpec {
  if (contentType === 'story') return spec;
  const delta = contentType === 'square' ? -0.03 : -0.02;
  return {
    ...spec,
    gradientStart: Math.max(0.08, spec.gradientStart + delta),
    gradientEnd: Math.max(spec.gradientStart + 0.12, spec.gradientEnd + delta),
  };
}

function buildGradientLayer(
  spec: TemplateLayoutSpec,
  width: number,
  height: number,
  shadow: string,
): string {
  if (spec.stripOnly) {
    const stripTop = Math.round(height * spec.gradientStart);
    return `<rect x="0" y="${stripTop}" width="${width}" height="${height - stripTop}" fill="${shadow}" opacity="${spec.stripOpacity}"/>`;
  }

  if (spec.textZone === 'top_center' && spec.family === 'top_masthead') {
    const endPx = Math.round(height * spec.gradientEnd);
    return `
  <defs>
    <linearGradient id="gradTop" x1="0" y1="0" x2="0" y2="${endPx}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${shadow}" stop-opacity="0.78"/>
      <stop offset="55%" stop-color="${shadow}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="${shadow}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#gradTop)"/>`;
  }

  const gradStartPx = Math.round(height * spec.gradientStart);
  const peakOpacity = spec.vignetteDeep ? 0.62 : 0.55;
  const endOpacity = spec.vignetteDeep ? 0.88 : 0.82;

  if (spec.diagonal) {
    return `
  <defs>
    <linearGradient id="gradDiag" x1="0" y1="${Math.round(height * 0.35)}" x2="${width}" y2="${height}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${shadow}" stop-opacity="0"/>
      <stop offset="45%" stop-color="${shadow}" stop-opacity="${peakOpacity * 0.7}"/>
      <stop offset="100%" stop-color="${shadow}" stop-opacity="${endOpacity}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#gradDiag)"/>`;
  }

  return `
  <defs>
    <linearGradient id="grad" x1="0" y1="${gradStartPx}" x2="0" y2="${height}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${shadow}" stop-opacity="0"/>
      <stop offset="35%" stop-color="${shadow}" stop-opacity="${peakOpacity}"/>
      <stop offset="100%" stop-color="${shadow}" stop-opacity="${endOpacity}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#grad)"/>`;
}

function buildVignetteOverlay(width: number, height: number, deep: boolean): string {
  if (!deep) return '';
  return `
  <defs>
    <radialGradient id="vig" cx="50%" cy="65%" r="75%">
      <stop offset="40%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="${deep ? 0.35 : 0.2}"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#vig)"/>`;
}

function buildFrame(spec: TemplateLayoutSpec, width: number, height: number, accent: string): string {
  if (spec.frame === 'none') return '';
  const inset = Math.round(width * 0.045);
  const stroke = Math.max(1, Math.round(width * 0.002));
  if (spec.frame === 'double') {
    const inset2 = inset + Math.round(width * 0.018);
    return `
  <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" fill="none" stroke="${accent}" stroke-width="${stroke}" opacity="0.55"/>
  <rect x="${inset2}" y="${inset2}" width="${width - inset2 * 2}" height="${height - inset2 * 2}" fill="none" stroke="${accent}" stroke-width="${stroke}" opacity="0.35"/>`;
  }
  return `<rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" fill="none" stroke="${accent}" stroke-width="${stroke}" opacity="0.6"/>`;
}

function buildFrostedCard(
  spec: TemplateLayoutSpec,
  width: number,
  height: number,
): { markup: string; top: number; cardH: number; padX: number } {
  if (!spec.frostedCard) {
    return { markup: '', top: 0, cardH: 0, padX: 0 };
  }
  const cardTop = Math.round(height * spec.frostedY);
  const padX = Math.round(width * 0.06);
  const cardH = height - cardTop - Math.round(height * 0.04);
  const rx = Math.round(width * 0.04);
  const markup = `
  <rect x="${padX}" y="${cardTop}" width="${width - padX * 2}" height="${cardH}" rx="${rx}" fill="#ffffff" opacity="0.14"/>
  <rect x="${padX}" y="${cardTop}" width="${width - padX * 2}" height="${cardH}" rx="${rx}" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.22"/>`;
  return { markup, top: cardTop, cardH, padX };
}

function buildSideBar(
  spec: TemplateLayoutSpec,
  heroY: number,
  heroSize: number,
  padX: number,
  accent: string,
): string {
  if (spec.sideBar === 'none') return '';
  const barH = Math.round(heroSize * 1.15);
  const x = spec.sideBar === 'left' ? padX - 6 : padX - 14;
  return `<rect x="${x}" y="${heroY - barH / 2}" width="3" height="${barH}" fill="${accent}" opacity="0.85"/>`;
}

function buildAccentLines(
  spec: TemplateLayoutSpec,
  cx: number,
  aboveY: number,
  belowY: number,
  heroSize: number,
  accent: string,
): string {
  if (spec.accentLine === 'none') return '';
  const lineW = Math.round(spec.accentLineWidth * (cx * 2));
  // Thinner, crisper lines — 1–1.5px, not scaled to font size (avoids fat lines on large headlines)
  const sw = Math.max(0.8, Math.round(heroSize * 0.025));
  const parts: string[] = [];
  if (spec.accentLine === 'above' || spec.accentLine === 'both') {
    parts.push(`<line x1="${cx - lineW}" y1="${aboveY}" x2="${cx + lineW}" y2="${aboveY}" stroke="${accent}" stroke-width="${sw}" opacity="0.55"/>`);
  }
  if (spec.accentLine === 'below' || spec.accentLine === 'both') {
    parts.push(`<line x1="${cx - lineW}" y1="${belowY}" x2="${cx + lineW}" y2="${belowY}" stroke="${accent}" stroke-width="${sw}" opacity="0.55"/>`);
  }
  return parts.join('\n  ');
}

function buildDateBadge(
  spec: TemplateLayoutSpec,
  opts: AnnouncementOverlayInput,
  width: number,
  height: number,
  detailFont: string,
  accent: string,
  textColor: string,
): string {
  if (spec.dateBadge === 'none') return '';
  const dateLabel = (opts.date ?? opts.time ?? 'SOON').toUpperCase();
  const pillSize = Math.round(width * 0.034);
  const maxPillW = Math.round(width * 0.72);
  const dateFit = fitTextToWidth(dateLabel, maxPillW - Math.round(width * 0.08), pillSize, 0.08, 0.55, 1);
  const pillW = Math.min(maxPillW, Math.max(Math.round(width * 0.32), estimateTextWidth(dateLabel, dateFit.fontSize, dateFit.letterSpacing) + Math.round(width * 0.08)));
  const pillH = Math.round(dateFit.fontSize * 1.35);
  const safeLabel = escapeXml(dateLabel);

  if (spec.dateBadge === 'top_pill') {
    const cx = width / 2;
    const pillY = Math.round(height * 0.12);
    return `
  <rect x="${cx - pillW / 2}" y="${pillY - pillH / 2}" width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="${accent}" opacity="0.92"/>
  <text x="${cx}" y="${pillY}" font-family="${detailFont}" font-size="${dateFit.fontSize}" font-weight="bold" letter-spacing="${dateFit.letterSpacing}" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${safeLabel}</text>`;
  }

  if (spec.dateBadge === 'top_left_pill') {
    const padX = Math.round(width * 0.08);
    const pillY = Math.round(height * 0.10);
    return `
  <rect x="${padX}" y="${pillY - pillH / 2}" width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="${accent}" opacity="0.9"/>
  <text x="${padX + pillW / 2}" y="${pillY}" font-family="${detailFont}" font-size="${dateFit.fontSize}" font-weight="bold" letter-spacing="${dateFit.letterSpacing}" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${safeLabel}</text>`;
  }

  return '';
}

function extractDateHighlight(date?: string): string {
  const match = (date ?? '').match(/\d{1,2}/);
  return match?.[0] ?? '15';
}

function extractMonthLabel(date?: string): string {
  const parts = (date ?? '').split(/\s+/).filter(Boolean);
  const month = parts.find((p) => !/^\d/.test(p));
  return (month ?? 'AUG').slice(0, 3).toUpperCase();
}

function buildDuotoneWash(
  spec: TemplateLayoutSpec,
  width: number,
  height: number,
  accent: string,
  primary: string,
): string {
  if (spec.duotoneWash === 'none') return '';
  const fill = spec.duotoneWash === 'primary' ? primary : accent;
  return `<rect x="0" y="0" width="${width}" height="${height}" fill="${fill}" opacity="${spec.duotoneOpacity}"/>`;
}

function buildColorBlockPanel(
  spec: TemplateLayoutSpec,
  width: number,
  height: number,
  accent: string,
  primary: string,
): { markup: string; boundsPatch: Partial<ContentBounds> | null } {
  if (spec.colorBlock === 'none') return { markup: '', boundsPatch: null };

  const fill = spec.family === 'color_split' && spec.colorBlock === 'bottom_panel'
    ? primary
    : accent;
  const opacity = spec.colorBlockOpacity;
  const pad = Math.round(width * 0.06);
  const size = spec.colorBlockSize;

  if (spec.colorBlock === 'bottom_panel') {
    const panelTop = Math.round(height * (1 - size));
    return {
      markup: `<rect x="0" y="${panelTop}" width="${width}" height="${height - panelTop}" fill="${fill}" opacity="${opacity}"/>`,
      boundsPatch: {
        top: panelTop + pad,
        bottom: height - pad,
        left: pad,
        right: width - pad,
        maxWidth: width - pad * 2,
        anchorX: width / 2,
        textAnchor: 'middle',
      },
    };
  }

  if (spec.colorBlock === 'left_panel') {
    const panelW = Math.round(width * size);
    return {
      markup: `<rect x="0" y="0" width="${panelW}" height="${height}" fill="${fill}" opacity="${opacity}"/>`,
      boundsPatch: {
        top: Math.round(height * 0.42),
        bottom: height - pad,
        left: pad,
        right: panelW - pad,
        maxWidth: panelW - pad * 2,
        anchorX: pad + 8,
        textAnchor: 'start',
      },
    };
  }

  if (spec.colorBlock === 'right_panel') {
    const panelW = Math.round(width * size);
    const left = width - panelW;
    return {
      markup: `<rect x="${left}" y="0" width="${panelW}" height="${height}" fill="${fill}" opacity="${opacity}"/>`,
      boundsPatch: {
        top: Math.round(height * 0.42),
        bottom: height - pad,
        left: left + pad,
        right: width - pad,
        maxWidth: panelW - pad * 2,
        anchorX: width - pad - 8,
        textAnchor: 'end',
      },
    };
  }

  const barH = Math.round(height * size);
  return {
    markup: `<rect x="0" y="0" width="${width}" height="${barH}" fill="${fill}" opacity="${opacity}"/>`,
    boundsPatch: {
      top: pad,
      bottom: barH - pad,
      left: pad,
      right: width - pad,
      maxWidth: width - pad * 2,
      anchorX: width / 2,
      textAnchor: 'middle',
    },
  };
}

function buildCornerStamp(
  spec: TemplateLayoutSpec,
  opts: AnnouncementOverlayInput,
  width: number,
  height: number,
  accent: string,
  textColor: string,
  detailFont: string,
): string {
  if (spec.cornerStamp === 'none') return '';
  const r = Math.round(width * 0.11);
  const cx = spec.cornerStamp === 'top_left' ? Math.round(width * 0.16) : Math.round(width * 0.84);
  const cy = Math.round(height * 0.12);
  const day = extractDateHighlight(opts.date);
  const month = extractMonthLabel(opts.date);
  return `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${accent}" opacity="0.92"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="none" stroke="${textColor}" stroke-width="1.5" opacity="0.35"/>
  <text x="${cx}" y="${cy - Math.round(r * 0.12)}" font-family="${detailFont}" font-size="${Math.round(r * 0.55)}" font-weight="bold" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${escapeXml(day)}</text>
  <text x="${cx}" y="${cy + Math.round(r * 0.34)}" font-family="${detailFont}" font-size="${Math.round(r * 0.22)}" font-weight="600" letter-spacing="2" fill="${textColor}" text-anchor="middle" dominant-baseline="middle" opacity="0.9">${escapeXml(month)}</text>`;
}

function buildMagazineDate(
  spec: TemplateLayoutSpec,
  opts: AnnouncementOverlayInput,
  width: number,
  height: number,
  accent: string,
  detailFont: string,
): string {
  if (spec.magazineDate === 'none') return '';
  const day = extractDateHighlight(opts.date);
  const month = extractMonthLabel(opts.date);
  if (spec.magazineDate === 'stacked') {
    const x = Math.round(width * 0.08);
    const y = Math.round(height * 0.22);
    return `
  <text x="${x}" y="${y}" font-family="${detailFont}" font-size="${Math.round(width * 0.22)}" font-weight="bold" fill="${accent}" opacity="0.22">${escapeXml(day)}</text>
  <text x="${x}" y="${y + Math.round(width * 0.08)}" font-family="${detailFont}" font-size="${Math.round(width * 0.05)}" font-weight="600" letter-spacing="4" fill="${accent}" opacity="0.28">${escapeXml(month)}</text>`;
  }
  const cx = width * 0.72;
  const cy = height * 0.38;
  return `<text x="${cx}" y="${cy}" font-family="${detailFont}" font-size="${Math.round(width * 0.34)}" font-weight="bold" fill="${accent}" text-anchor="middle" dominant-baseline="middle" opacity="0.16">${escapeXml(day)}</text>`;
}

function buildSideVerticalLabel(
  spec: TemplateLayoutSpec,
  brand: string,
  width: number,
  height: number,
  accent: string,
  detailFont: string,
): string {
  if (spec.sideVerticalLabel === 'none' || !brand) return '';
  const x = spec.sideVerticalLabel === 'left' ? Math.round(width * 0.045) : Math.round(width * 0.955);
  const y = Math.round(height * 0.56);
  const size = Math.round(width * 0.028);
  return `<text x="${x}" y="${y}" font-family="${detailFont}" font-size="${size}" font-weight="600" letter-spacing="5" fill="${accent}" text-anchor="middle" dominant-baseline="middle" opacity="0.75" transform="rotate(-90 ${x} ${y})">${escapeXml(brand.slice(0, 24))}</text>`;
}

function buildSvgFilters(spec: TemplateLayoutSpec): string {
  if (!spec.neonGlow) return '';
  return `
  <defs>
    <filter id="neonGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>`;
}

function buildHeroTextBlock(
  layer: {
    y: number;
    fit: FitTextResult;
    fontFamily: string;
    fontWeight: string | number;
    fill: string;
    opacity: number;
  },
  bounds: ContentBounds,
  spec: TemplateLayoutSpec,
  accent: string,
  shadow: string,
): string {
  const filterAttr = spec.neonGlow ? ' filter="url(#neonGlow)"' : '';
  const fill = spec.neonGlow ? accent : layer.fill;

  if (spec.heroStyle === 'outline') {
    const lines = layer.fit.lines.map((line, i) => {
      const dy = i === 0 ? 0 : layer.fit.lineHeight;
      const y = layer.fit.lines.length === 1
        ? layer.y
        : layer.y - Math.round((layer.fit.blockHeight - layer.fit.lineHeight) / 2);
      return `<tspan x="${bounds.anchorX}" dy="${i === 0 ? 0 : dy}" stroke="${accent}" stroke-width="${Math.max(1, Math.round(layer.fit.fontSize * 0.04))}" paint-order="stroke fill">${escapeXml(line)}</tspan>`;
    }).join('');
    const firstY = layer.fit.lines.length === 1
      ? layer.y
      : layer.y - Math.round((layer.fit.blockHeight - layer.fit.lineHeight) / 2);
    return `<text x="${bounds.anchorX}" y="${firstY}" font-family="${layer.fontFamily}" font-size="${layer.fit.fontSize}" font-weight="${layer.fontWeight}" letter-spacing="${layer.fit.letterSpacing}" fill="${layer.fill}" text-anchor="${bounds.textAnchor}" dominant-baseline="middle" opacity="${layer.opacity}">${lines}</text>`;
  }

  if (spec.heroStyle === 'knockout') {
    const padX = Math.round(bounds.maxWidth * 0.04);
    const padY = Math.round(layer.fit.blockHeight * 0.22);
    const boxW = Math.min(bounds.maxWidth, Math.round(layer.fit.fontSize * Math.max(...layer.fit.lines.map((l) => l.length)) * 0.58) + padX * 2);
    const boxH = layer.fit.blockHeight + padY * 2;
    const boxX = bounds.textAnchor === 'middle'
      ? bounds.anchorX - boxW / 2
      : bounds.textAnchor === 'end'
        ? bounds.anchorX - boxW
        : bounds.anchorX;
    const boxY = layer.y - boxH / 2;
    const textBlock = buildSvgTextBlock({
      x: bounds.anchorX,
      y: layer.y,
      fontFamily: layer.fontFamily,
      fontWeight: layer.fontWeight,
      fill: layer.fill,
      textAnchor: bounds.textAnchor,
      opacity: layer.opacity,
      fit: layer.fit,
    });
    return `<rect x="${Math.round(boxX)}" y="${Math.round(boxY)}" width="${Math.round(boxW)}" height="${Math.round(boxH)}" rx="${Math.round(boxH * 0.12)}" fill="${shadow}" opacity="0.72"/>${textBlock}`;
  }

  return buildSvgTextBlock({
    x: bounds.anchorX,
    y: layer.y,
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
    fill,
    textAnchor: bounds.textAnchor,
    opacity: layer.opacity,
    fit: layer.fit,
  }).replace('<text ', `<text${filterAttr} `);
}

function buildOfferBand(
  spec: TemplateLayoutSpec,
  width: number,
  height: number,
  accent: string,
  primary: string,
  shadow: string,
): { bandTop: number; bandH: number; markup: string } {
  if (spec.bandMode === 'none') {
    return { bandTop: height, bandH: 0, markup: '' };
  }
  const bandH = Math.round(height * spec.bandHeight);
  const bandTop = height - bandH;
  const fill = spec.bandMode === 'primary_bottom' ? primary : accent;
  const rx = spec.bandMode === 'accent_bottom_rounded' ? Math.round(width * 0.06) : 0;
  const gradStartPx = Math.round(bandTop - height * 0.08);
  const markup = `
  <defs>
    <linearGradient id="gradBand" x1="0" y1="${gradStartPx}" x2="0" y2="${bandTop}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${shadow}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${shadow}" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${bandTop}" fill="url(#gradBand)"/>
  <rect x="0" y="${bandTop}" width="${width}" height="${bandH}" rx="${rx}" fill="${fill}" opacity="0.94"/>`;
  return { bandTop, bandH, markup };
}

function layoutTextStack(
  layers: Array<{
    key: string;
    text: string;
    baseSize: number;
    trackingRatio: number;
    fontFamily: string;
    fontWeight: string | number;
    fill: string;
    opacity: number;
    fontStyle?: string;
    maxLines?: number;
  }>,
  bounds: ContentBounds,
  height: number,
  anchor: 'bottom' | 'center',
): Array<{ key: string; y: number; fit: FitTextResult; fontFamily: string; fontWeight: string | number; fill: string; opacity: number; fontStyle?: string }> {
  const gap = Math.round(height * 0.014);
  const fitted = layers
    .filter((l) => l.text)
    .map((l) => ({
      ...l,
      fit: fitTextToWidth(
        l.text,
        bounds.maxWidth,
        l.baseSize,
        l.trackingRatio,
        0.5,
        l.maxLines ?? 2,
      ),
    }));

  const totalHeight = fitted.reduce(
    (sum, layer, idx) => sum + layer.fit.blockHeight + (idx > 0 ? gap : 0),
    0,
  );

  let cursorY = anchor === 'center'
    ? Math.round((bounds.top + bounds.bottom - totalHeight) / 2)
    : bounds.bottom;

  const positioned: Array<{
    key: string;
    y: number;
    fit: FitTextResult;
    fontFamily: string;
    fontWeight: string | number;
    fill: string;
    opacity: number;
    fontStyle?: string;
  }> = [];

  if (anchor === 'center') {
    for (const layer of fitted) {
      const y = cursorY + Math.round(layer.fit.blockHeight / 2);
      positioned.push({
        key: layer.key,
        y,
        fit: layer.fit,
        fontFamily: layer.fontFamily,
        fontWeight: layer.fontWeight,
        fill: layer.fill,
        opacity: layer.opacity,
        fontStyle: layer.fontStyle,
      });
      cursorY += layer.fit.blockHeight + gap;
    }
    return positioned;
  }

  for (let i = fitted.length - 1; i >= 0; i -= 1) {
    const layer = fitted[i]!;
    cursorY -= Math.round(layer.fit.blockHeight / 2);
    positioned.unshift({
      key: layer.key,
      y: cursorY,
      fit: layer.fit,
      fontFamily: layer.fontFamily,
      fontWeight: layer.fontWeight,
      fill: layer.fill,
      opacity: layer.opacity,
      fontStyle: layer.fontStyle,
    });
    cursorY -= Math.round(layer.fit.blockHeight / 2) + gap;
  }

  return positioned;
}

function buildOrnamentDivider(
  divider: TemplateLayoutSpec['ornamentDivider'],
  cx: number,
  y: number,
  lineW: number,
  accent: string,
): string {
  if (divider === 'none') return '';
  const x1 = Math.round(cx - lineW / 2);
  const x2 = Math.round(cx + lineW / 2);
  const yR = Math.round(y);
  if (divider === 'thin_rule') {
    // Fade-in/out ends for a more polished look
    const midW = Math.round(lineW * 0.15);
    return `<defs>
    <linearGradient id="ruleGrad${yR}" x1="${x1}" y1="0" x2="${x2}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0"/>
      <stop offset="18%" stop-color="${accent}" stop-opacity="0.45"/>
      <stop offset="82%" stop-color="${accent}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <line x1="${x1}" y1="${yR}" x2="${x2}" y2="${yR}" stroke="url(#ruleGrad${yR})" stroke-width="1"/>`;
  }
  if (divider === 'double_rule') {
    return `<defs>
    <linearGradient id="dblGrad${yR}" x1="${x1}" y1="0" x2="${x2}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0"/>
      <stop offset="15%" stop-color="${accent}" stop-opacity="0.38"/>
      <stop offset="85%" stop-color="${accent}" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <line x1="${x1}" y1="${yR - 3}" x2="${x2}" y2="${yR - 3}" stroke="url(#dblGrad${yR})" stroke-width="0.8"/>
  <line x1="${x1}" y1="${yR + 3}" x2="${x2}" y2="${yR + 3}" stroke="url(#dblGrad${yR})" stroke-width="0.8"/>`;
  }
  if (divider === 'diamond') {
    const d = 5;
    const innerX1 = Math.round(cx - d * 2.5);
    const innerX2 = Math.round(cx + d * 2.5);
    return `<line x1="${x1}" y1="${yR}" x2="${innerX1}" y2="${yR}" stroke="${accent}" stroke-width="0.8" opacity="0.38"/>
  <line x1="${innerX2}" y1="${yR}" x2="${x2}" y2="${yR}" stroke="${accent}" stroke-width="0.8" opacity="0.38"/>
  <polygon points="${cx},${yR - d} ${cx + d},${yR} ${cx},${yR + d} ${cx - d},${yR}" fill="none" stroke="${accent}" stroke-width="1" opacity="0.55"/>
  <circle cx="${cx}" cy="${yR}" r="1.8" fill="${accent}" opacity="0.65"/>`;
  }
  if (divider === 'star_row') {
    const stars: string[] = [];
    const count = 5;
    const gap = lineW / (count + 1);
    for (let i = 1; i <= count; i++) {
      const sx = Math.round(x1 + gap * i);
      const op = i === 3 ? 0.65 : i === 2 || i === 4 ? 0.48 : 0.32;
      stars.push(`<text x="${sx}" y="${yR + 4}" font-size="9" fill="${accent}" text-anchor="middle" opacity="${op}">★</text>`);
    }
    return stars.join('\n  ');
  }
  if (divider === 'art_deco') {
    const w = Math.round(lineW * 0.28);
    const halfW = Math.round(w / 2);
    const innerX1 = cx - halfW - 8;
    const innerX2 = cx + halfW + 8;
    return `<line x1="${x1}" y1="${yR}" x2="${Math.round(innerX1)}" y2="${yR}" stroke="${accent}" stroke-width="0.8" opacity="0.32"/>
  <line x1="${Math.round(innerX2)}" y1="${yR}" x2="${x2}" y2="${yR}" stroke="${accent}" stroke-width="0.8" opacity="0.32"/>
  <polygon points="${Math.round(cx - halfW)},${yR} ${cx},${yR - 7} ${Math.round(cx + halfW)},${yR} ${cx},${yR + 7}" fill="none" stroke="${accent}" stroke-width="1.2" opacity="0.52"/>
  <circle cx="${cx}" cy="${yR}" r="2.2" fill="${accent}" opacity="0.60"/>
  <circle cx="${Math.round(cx - halfW - 4)}" cy="${yR}" r="1" fill="${accent}" opacity="0.35"/>
  <circle cx="${Math.round(cx + halfW + 4)}" cy="${yR}" r="1" fill="${accent}" opacity="0.35"/>`;
  }
  return '';
}

function buildCornerOrnaments(
  width: number,
  height: number,
  accent: string,
): string {
  const m = Math.round(width * 0.05);
  const len = Math.round(width * 0.10);
  const sw = 1.5;
  const op = 0.4;
  return `
  <line x1="${m}" y1="${m}" x2="${m + len}" y2="${m}" stroke="${accent}" stroke-width="${sw}" opacity="${op}"/>
  <line x1="${m}" y1="${m}" x2="${m}" y2="${m + len}" stroke="${accent}" stroke-width="${sw}" opacity="${op}"/>
  <line x1="${width - m}" y1="${m}" x2="${width - m - len}" y2="${m}" stroke="${accent}" stroke-width="${sw}" opacity="${op}"/>
  <line x1="${width - m}" y1="${m}" x2="${width - m}" y2="${m + len}" stroke="${accent}" stroke-width="${sw}" opacity="${op}"/>
  <line x1="${m}" y1="${height - m}" x2="${m + len}" y2="${height - m}" stroke="${accent}" stroke-width="${sw}" opacity="${op}"/>
  <line x1="${m}" y1="${height - m}" x2="${m}" y2="${height - m - len}" stroke="${accent}" stroke-width="${sw}" opacity="${op}"/>
  <line x1="${width - m}" y1="${height - m}" x2="${width - m - len}" y2="${height - m}" stroke="${accent}" stroke-width="${sw}" opacity="${op}"/>
  <line x1="${width - m}" y1="${height - m}" x2="${width - m}" y2="${height - m - len}" stroke="${accent}" stroke-width="${sw}" opacity="${op}"/>`;
}

function buildPosterHeader(
  header: TemplateLayoutSpec['posterHeader'],
  width: number,
  accent: string,
  textColor: string,
  label: string,
  detailFont: string,
): { markup: string; bottomY: number } {
  if (header === 'none' || !label) return { markup: '', bottomY: 0 };
  const barH = Math.round(width * 0.09);
  const fontSize = Math.round(barH * 0.42);
  const cy = Math.round(barH / 2);
  if (header === 'accent_bar') {
    // Gradient fade at bottom edge prevents harsh line artifact
    return {
      markup: `<defs>
    <linearGradient id="headerBarGrad" x1="0" y1="0" x2="0" y2="${barH}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.94"/>
      <stop offset="85%" stop-color="${accent}" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${barH}" fill="url(#headerBarGrad)"/>
  <text x="${Math.round(width / 2)}" y="${cy}" font-family="${detailFont}" font-size="${fontSize}" font-weight="700" letter-spacing="4" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${escapeXml(label.toUpperCase())}</text>`,
      bottomY: barH,
    };
  }
  if (header === 'outline_bar') {
    // Text only with thin rule below — no full box (avoids bottom-line artifact)
    const m = Math.round(width * 0.04);
    const ruleY = barH - Math.round(m * 0.5);
    return {
      markup: `<text x="${Math.round(width / 2)}" y="${cy}" font-family="${detailFont}" font-size="${fontSize}" font-weight="600" letter-spacing="4" fill="${accent}" text-anchor="middle" dominant-baseline="middle" opacity="0.85">${escapeXml(label.toUpperCase())}</text>
  <line x1="${m * 2}" y1="${ruleY}" x2="${width - m * 2}" y2="${ruleY}" stroke="${accent}" stroke-width="0.8" opacity="0.35"/>`,
      bottomY: barH,
    };
  }
  if (header === 'knockout_bar') {
    const padX = Math.round(width * 0.08);
    const tw = Math.round(label.length * fontSize * 0.58) + padX * 2;
    const boxX = Math.round((width - tw) / 2);
    return {
      markup: `<rect x="${boxX}" y="${Math.round(barH * 0.2)}" width="${tw}" height="${Math.round(barH * 0.65)}" rx="${Math.round(barH * 0.1)}" fill="${accent}" opacity="0.88"/>
  <text x="${Math.round(width / 2)}" y="${cy}" font-family="${detailFont}" font-size="${fontSize}" font-weight="700" letter-spacing="3" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${escapeXml(label.toUpperCase())}</text>`,
      bottomY: barH,
    };
  }
  return { markup: '', bottomY: 0 };
}

function buildPosterFooter(
  footer: TemplateLayoutSpec['posterFooter'],
  width: number,
  height: number,
  accent: string,
  textColor: string,
  info: string,
  detailFont: string,
  ticketLabel?: string,
): string {
  if (footer === 'none' || !info) return '';
  const barH = Math.round(width * 0.085);
  const fontSize = Math.round(barH * 0.36);
  const barTop = height - barH;
  const cy = barTop + Math.round(barH / 2);
  if (footer === 'solid_bar') {
    // Gradient top edge blends footer into background — no sharp line artifact
    const gradH = Math.round(barH * 0.4);
    return `<defs>
    <linearGradient id="footerBarGrad" x1="0" y1="${barTop - gradH}" x2="0" y2="${barTop}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.90"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${barTop - gradH}" width="${width}" height="${gradH}" fill="url(#footerBarGrad)"/>
  <rect x="0" y="${barTop}" width="${width}" height="${barH}" fill="${accent}" opacity="0.90"/>
  <text x="${Math.round(width / 2)}" y="${cy}" font-family="${detailFont}" font-size="${fontSize}" font-weight="600" letter-spacing="2" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${escapeXml(info.toUpperCase())}</text>`;
  }
  if (footer === 'transparent_bar') {
    const gradH = Math.round(barH * 0.6);
    return `<defs>
    <linearGradient id="footerTransGrad" x1="0" y1="${barTop - gradH}" x2="0" y2="${barTop}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.45"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${barTop - gradH}" width="${width}" height="${gradH}" fill="url(#footerTransGrad)"/>
  <rect x="0" y="${barTop}" width="${width}" height="${barH}" fill="#000" opacity="0.45"/>
  <text x="${Math.round(width / 2)}" y="${cy}" font-family="${detailFont}" font-size="${fontSize}" font-weight="500" letter-spacing="2" fill="${textColor}" text-anchor="middle" dominant-baseline="middle" opacity="0.9">${escapeXml(info.toUpperCase())}</text>`;
  }
  if (footer === 'pill_row') {
    const items = [info, ticketLabel].filter(Boolean) as string[];
    const pillW = Math.round((width - 40) / items.length);
    const pillH = Math.round(barH * 0.6);
    const pillY = barTop + Math.round((barH - pillH) / 2);
    const pillR = Math.round(pillH / 2);
    return items.map((item, i) => {
      const px = 20 + i * (pillW + 8);
      return `<rect x="${px}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillR}" fill="${accent}" opacity="0.85"/>
  <text x="${px + Math.round(pillW / 2)}" y="${pillY + Math.round(pillH / 2)}" font-family="${detailFont}" font-size="${Math.round(fontSize * 0.88)}" font-weight="600" letter-spacing="1" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${escapeXml(item.toUpperCase())}</text>`;
    }).join('\n  ');
  }
  return '';
}

function buildLineupStack(
  artists: string[],
  mode: TemplateLayoutSpec['posterMode'],
  cx: number,
  topY: number,
  bottomY: number,
  maxWidth: number,
  heroFont: string,
  detailFont: string,
  textColor: string,
  accent: string,
  divider: TemplateLayoutSpec['ornamentDivider'],
): string {
  if (!artists.length) return '';
  const availH = bottomY - topY;

  if (mode === 'lineup_tiered') {
    const tiers = [
      { artists: artists.slice(0, 1), sizeRatio: 0.18, weight: 'bold' as const, spacing: 4, op: 0.97 },
      { artists: artists.slice(1, 3), sizeRatio: 0.10, weight: '600' as const, spacing: 3, op: 0.88 },
      { artists: artists.slice(3, 7), sizeRatio: 0.065, weight: '500' as const, spacing: 2, op: 0.75 },
      { artists: artists.slice(7), sizeRatio: 0.05, weight: '500' as const, spacing: 1, op: 0.62 },
    ].filter(t => t.artists.length > 0);

    const totalUnits = tiers.reduce((s, t) => s + t.sizeRatio * t.artists.length + 0.02, 0);
    const scale = Math.min(1, availH / (maxWidth * totalUnits * 1.2));
    let curY = topY;
    const parts: string[] = [];

    for (let ti = 0; ti < tiers.length; ti++) {
      const tier = tiers[ti]!;
      const fs = Math.round(maxWidth * tier.sizeRatio * scale);
      for (const artist of tier.artists) {
        const fit = fitTextToWidth(artist.toUpperCase(), maxWidth, fs, 0.06, 0.55, 1);
        curY += fit.blockHeight;
        parts.push(buildSvgTextBlock({
          x: cx, y: curY - Math.round(fit.blockHeight * 0.3),
          fontFamily: ti === 0 ? heroFont : detailFont,
          fontWeight: tier.weight, fill: textColor,
          textAnchor: 'middle', opacity: tier.op, fit,
        }));
        curY += Math.round(fs * 0.15);
      }
      if (ti < tiers.length - 1) {
        parts.push(buildOrnamentDivider(divider, cx, curY, maxWidth * 0.7, accent));
        curY += Math.round(fs * 0.5);
      }
    }
    return parts.join('\n  ');
  }

  if (mode === 'lineup_stack' || mode === 'dj_set') {
    const fs = Math.round(Math.min(maxWidth * 0.09, availH / (artists.length * 1.8)));
    let curY = topY + Math.round(fs * 0.8);
    const parts: string[] = [];
    for (let i = 0; i < artists.length; i++) {
      const isFirst = i === 0;
      const currentFs = isFirst ? Math.round(fs * 1.35) : fs;
      const fit = fitTextToWidth(artists[i]!.toUpperCase(), maxWidth, currentFs, 0.04, 0.5, 1);
      parts.push(buildSvgTextBlock({
        x: cx, y: curY,
        fontFamily: isFirst ? heroFont : detailFont,
        fontWeight: isFirst ? 'bold' : '500',
        fill: textColor, textAnchor: 'middle',
        opacity: isFirst ? 0.97 : 0.78 - i * 0.03, fit,
      }));
      curY += fit.blockHeight + Math.round(fs * 0.35);
      if (i === 0 && artists.length > 1) {
        parts.push(buildOrnamentDivider(divider, cx, curY - Math.round(fs * 0.15), maxWidth * 0.6, accent));
      }
    }
    return parts.join('\n  ');
  }

  if (mode === 'festival_grid') {
    const cols = 2;
    const colW = Math.round(maxWidth / cols);
    const fs = Math.round(Math.min(colW * 0.17, availH / (Math.ceil(artists.length / cols) * 2.2)));
    let curY = topY + Math.round(fs * 0.6);
    const parts: string[] = [];
    for (let i = 0; i < artists.length; i += cols) {
      for (let c = 0; c < cols && i + c < artists.length; c++) {
        const ax = cx - maxWidth / 2 + colW * c + colW / 2;
        const fit = fitTextToWidth(artists[i + c]!.toUpperCase(), colW * 0.88, fs, 0.03, 0.5, 1);
        parts.push(buildSvgTextBlock({
          x: ax, y: curY, fontFamily: detailFont, fontWeight: '600',
          fill: textColor, textAnchor: 'middle', opacity: 0.82, fit,
        }));
      }
      curY += Math.round(fs * 2.0);
    }
    return parts.join('\n  ');
  }

  if (mode === 'gala_centered') {
    // Elegant centered layout: main name in script/hero font, supporting details smaller
    const mainArtist = artists[0] ?? '';
    const supporting = artists.slice(1);
    const parts: string[] = [];

    // Main name — large, centered, with full descender/ascender clearance
    const mainFs = Math.round(Math.min(maxWidth * 0.16, availH * 0.35));
    const mainFit = fitTextToWidth(mainArtist, maxWidth, mainFs, 0.02, 0.5, 2);
    const mainY = topY + Math.round(availH * 0.38);
    parts.push(buildSvgTextBlock({
      x: cx, y: mainY, fontFamily: heroFont, fontWeight: '600',
      fill: textColor, textAnchor: 'middle', opacity: 0.97, fit: mainFit,
    }));

    // Art deco ornament below main name
    if (divider !== 'none') {
      const ornY = mainY + Math.round(mainFit.blockHeight / 2) + Math.round(mainFs * 0.22);
      parts.push(buildOrnamentDivider(divider, cx, ornY, maxWidth * 0.55, accent));

      // Supporting artists below ornament
      if (supporting.length > 0) {
        const supFs = Math.round(Math.min(maxWidth * 0.065, (availH - (ornY - topY)) / (supporting.length * 1.6)));
        let curY = ornY + Math.round(mainFs * 0.5);
        for (const artist of supporting) {
          const fit = fitTextToWidth(artist.toUpperCase(), maxWidth * 0.8, supFs, 0.08, 0.55, 1);
          parts.push(buildSvgTextBlock({
            x: cx, y: curY, fontFamily: detailFont, fontWeight: '500',
            fill: textColor, textAnchor: 'middle', opacity: 0.72, fit,
          }));
          curY += fit.blockHeight + Math.round(supFs * 0.4);
        }
      }
    }
    return parts.join('\n  ');
  }

  return '';
}

export function buildLayoutSvg(opts: AnnouncementOverlayInput, layout: TemplateLayoutSpec): string {
  const { width, height, contentType } = opts;
  const spec = formatAdjust(layout, contentType);
  const colors = resolveOverlayColors(opts);
  const { heroFont, detailFont } = resolveOverlayFonts(opts, spec.heroStyle);
  const heroRaw = heroText(opts);
  const heroDisplay = spec.heroUppercase ? heroRaw.toUpperCase() : heroRaw;
  const detailRaw = detailText(opts);
  const taglineRaw = opts.tagline && spec.showTagline ? opts.tagline : '';
  const brandRaw = spec.showBrand ? (opts.brandName ?? 'BRAND').toUpperCase() : '';
  const venueRaw = spec.showVenueBadge && opts.venueArea ? opts.venueArea.toUpperCase() : '';

  const baseHero = contentType === 'story' ? 0.115 : 0.105;
  const heroBaseSize = Math.round(width * baseHero * spec.heroScale);
  const detailBaseSize = Math.round(heroBaseSize * (spec.stripOnly ? 0.85 : 0.38));
  const badgeBaseSize = Math.round(heroBaseSize * 0.28);
  const brandBaseSize = Math.round(heroBaseSize * 0.30);
  const taglineBaseSize = Math.round(heroBaseSize * 0.26);
  const bottomPad = Math.round(height * 0.055);
  const padX = Math.round(width * 0.08);
  const cx = width / 2;

  const band = buildOfferBand(spec, width, height, colors.accent, colors.primary, colors.shadow);
  const frostedCard = buildFrostedCard(spec, width, height);
  const colorBlock = buildColorBlockPanel(spec, width, height, colors.accent, colors.primary);
  const innerPad = Math.round(width * 0.04);

  const alignForBounds = spec.textZone === 'bottom_right' ? 'end' as const
    : spec.textZone === 'bottom_left' ? 'start' as const
    : spec.align;

  let bounds = resolveContentBounds(
    width,
    height,
    padX,
    alignForBounds,
    spec.frostedCard && frostedCard.cardH > 0
      ? { top: frostedCard.top, height: frostedCard.cardH, padX: frostedCard.padX, innerPad }
      : undefined,
  );

  if (spec.bandMode !== 'none') {
    bounds = {
      ...bounds,
      top: band.bandTop + Math.round(band.bandH * 0.12),
      bottom: band.bandTop + band.bandH - Math.round(band.bandH * 0.1),
      maxWidth: Math.round(width * 0.88),
      anchorX: cx,
      textAnchor: 'middle',
    };
  } else if (colorBlock.boundsPatch) {
    bounds = { ...bounds, ...colorBlock.boundsPatch };
  } else if (!spec.frostedCard) {
    bounds = {
      ...bounds,
      bottom: height - bottomPad,
    };

    if (spec.textZone === 'center') {
      bounds = {
        ...bounds,
        top: Math.round(height * 0.46),
        bottom: Math.round(height * 0.78),
      };
    } else if (spec.textZone === 'top_center') {
      bounds = {
        ...bounds,
        top: Math.round(height * 0.08),
        bottom: Math.round(height * 0.34),
      };
    }
  }

  const stackAnchor: 'bottom' | 'center' = (
    spec.frostedCard && spec.textZone === 'center'
  ) || spec.textZone === 'center'
    ? 'center'
    : 'bottom';

  const detailContent = spec.bandMode !== 'none' && opts.tagline ? opts.tagline : detailRaw;

  const stackLayers = layoutTextStack(
    [
      {
        key: 'hero',
        text: heroDisplay,
        baseSize: heroBaseSize,
        trackingRatio: spec.heroTracking,
        fontFamily: heroFont,
        fontWeight: spec.heroWeight,
        fill: colors.text,
        opacity: 0.97,
        maxLines: 3,
      },
      {
        key: 'detail',
        text: detailContent,
        baseSize: detailBaseSize,
        trackingRatio: 0.18,
        fontFamily: detailFont,
        fontWeight: 500,
        fill: colors.text,
        opacity: 0.88,
        maxLines: 2,
      },
      {
        key: 'tagline',
        text: taglineRaw,
        baseSize: taglineBaseSize,
        trackingRatio: 0.08,
        fontFamily: detailFont,
        fontWeight: 500,
        fill: colors.accent,
        opacity: 0.8,
        fontStyle: spec.taglineItalic ? 'italic' : undefined,
        maxLines: 2,
      },
      {
        key: 'brand',
        text: brandRaw,
        baseSize: brandBaseSize,
        trackingRatio: 0.32,
        fontFamily: detailFont,
        fontWeight: 600,
        fill: colors.text,
        opacity: 0.65,
        maxLines: 2,
      },
    ],
    bounds,
    height,
    stackAnchor,
  );

  let venueY = bounds.top;
  if (stackLayers.length > 0) {
    const heroLayer = stackLayers.find((l) => l.key === 'hero');
    if (heroLayer) venueY = heroLayer.y - Math.round(heroLayer.fit.blockHeight * 0.75);
  }

  const venueFit = venueRaw
    ? fitTextToWidth(venueRaw, bounds.maxWidth, badgeBaseSize, 0.35, 0.55, 1)
    : null;

  // Compute accent line positions: cleanly bracket the hero text
  const heroLayer = stackLayers.find((l) => l.key === 'hero');
  const accentHeroSize = heroLayer?.fit.fontSize ?? heroBaseSize;
  const accentBlockH = heroLayer?.fit.blockHeight ?? Math.round(accentHeroSize * 1.2);
  const accentHeroY = heroLayer?.y ?? Math.round(height * 0.65);
  // Extra breathing room: 20% of font size keeps lines clear of ascenders/descenders
  const accentPad = Math.round(accentHeroSize * 0.20);
  const lineAboveY = accentHeroY - Math.round(accentBlockH / 2) - accentPad;
  const lineBelowY = accentHeroY + Math.round(accentBlockH / 2) + accentPad;

  const isPosterMode = spec.posterMode !== 'none';
  const posterHeaderLabel = isPosterMode ? (opts.venueArea ?? opts.brandName ?? '') : '';
  const posterHeaderBlock = buildPosterHeader(spec.posterHeader, width, colors.accent, colors.text, posterHeaderLabel, detailFont);
  const footerInfo = [opts.venueArea, detailRaw].filter(Boolean).join('  ·  ');
  const posterFooterBlock = buildPosterFooter(spec.posterFooter, width, height, colors.accent, colors.text, footerInfo, detailFont, opts.ticketLabel);
  const cornerOrnaments = spec.cornerOrnament ? buildCornerOrnaments(width, height, colors.accent) : '';

  const artists = opts.lineupArtists ?? (heroRaw ? [heroRaw] : []);
  const lineupTopY = posterHeaderBlock.bottomY > 0
    ? posterHeaderBlock.bottomY + Math.round(height * 0.04)
    : Math.round(height * 0.15);
  const lineupBottomY = spec.posterFooter !== 'none'
    ? height - Math.round(width * 0.085) - Math.round(height * 0.03)
    : Math.round(height * 0.82);
  const lineupMarkup = isPosterMode
    ? buildLineupStack(artists, spec.posterMode, cx, lineupTopY, lineupBottomY, Math.round(width * 0.84), heroFont, detailFont, colors.text, colors.accent, spec.ornamentDivider)
    : '';

  const gradientLayer = spec.bandMode !== 'none' ? band.markup : buildGradientLayer(spec, width, height, colors.shadow);
  const duotone = buildDuotoneWash(spec, width, height, colors.accent, colors.primary);
  const vignette = buildVignetteOverlay(width, height, spec.vignetteDeep);
  const frame = buildFrame(spec, width, height, colors.accent);
  const sideBar = heroLayer
    ? buildSideBar(spec, heroLayer.y, heroLayer.fit.fontSize, padX, colors.accent)
    : '';
  const accentLines = buildAccentLines(spec, cx, lineAboveY, lineBelowY, accentHeroSize, colors.accent);
  const dateBadge = buildDateBadge(spec, opts, width, height, detailFont, colors.accent, colors.text);
  const cornerStamp = buildCornerStamp(spec, opts, width, height, colors.accent, colors.text, detailFont);
  const magazineDate = buildMagazineDate(spec, opts, width, height, colors.accent, detailFont);
  const sideLabel = buildSideVerticalLabel(spec, brandRaw, width, height, colors.accent, detailFont);
  const svgFilters = buildSvgFilters(spec);

  let aboveHeroDate = '';
  if (spec.dateBadge === 'above_hero' && heroLayer) {
    const dateLabel = escapeXml((opts.date ?? opts.time ?? 'SOON').toUpperCase());
    const dateFit = fitTextToWidth(dateLabel, bounds.maxWidth, Math.round(heroBaseSize * 0.32), 0.12, 0.6, 1);
    aboveHeroDate = buildSvgTextBlock({
      x: bounds.anchorX,
      y: heroLayer.y - Math.round(heroLayer.fit.blockHeight * 0.65),
      fontFamily: detailFont,
      fontWeight: 600,
      fill: colors.accent,
      textAnchor: bounds.textAnchor,
      opacity: 0.9,
      fit: dateFit,
    });
  }

  const venueMarkup = venueFit
    ? buildSvgTextBlock({
      x: bounds.anchorX,
      y: venueY,
      fontFamily: detailFont,
      fontWeight: 600,
      fill: colors.accent,
      textAnchor: bounds.textAnchor,
      opacity: 0.92,
      fit: venueFit,
    })
    : '';

  const textBlocks = isPosterMode ? '' : stackLayers.map((layer) => {
    if (layer.key === 'hero') {
      return buildHeroTextBlock(layer, bounds, spec, colors.accent, colors.shadow);
    }
    return buildSvgTextBlock({
      x: bounds.anchorX,
      y: layer.y,
      fontFamily: layer.fontFamily,
      fontWeight: layer.fontWeight,
      fill: layer.fill,
      textAnchor: bounds.textAnchor,
      opacity: layer.opacity,
      fontStyle: layer.fontStyle,
      fit: layer.fit,
    });
  }).join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  ${svgFilters}
  ${gradientLayer}
  ${duotone}
  ${vignette}
  ${colorBlock.markup}
  ${frostedCard.markup}
  ${frame}
  ${cornerOrnaments}
  ${magazineDate}
  ${cornerStamp}
  ${dateBadge}
  ${posterHeaderBlock.markup}
  ${sideBar}
  ${sideLabel}
  ${venueMarkup}
  ${aboveHeroDate}
  ${accentLines}
  ${lineupMarkup}
  ${textBlocks}
  ${posterFooterBlock}
</svg>`.replace(/\n\s*\n\s*\n/g, '\n');
}

export function buildAnnouncementOverlaySvgFromLayout(opts: AnnouncementOverlayInput): Buffer {
  const layout = opts.layout;
  if (!layout) throw new Error('layout spec required');
  return Buffer.from(buildLayoutSvg(opts, layout));
}
