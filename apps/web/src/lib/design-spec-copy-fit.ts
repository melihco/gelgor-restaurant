/**
 * Phase C — fit-before-paint for design_spec.layout text slots.
 *
 * Measures mission headline/subtitle against normalized textSlots before
 * deterministic overlay. Hard pins fail-closed on overflow; soft pins still
 * emit the best fitted lines for Satori.
 *
 * MULTI-TENANT: Only layout geometry + copy — no brand UUID / name branches.
 */

import {
  estimateTextWidth,
  FIT_WIDTH_SAFETY,
  fitTextToWidth,
  sanitizePosterText,
  type FitTextResult,
} from '@/lib/announcement-text-fit';
import {
  hasUsableDesignSpecLayout,
  type DesignSpecLayout,
  type DesignSpecNormRect,
  type DesignSpecTextSlot,
} from '@/lib/design-spec-layout';
import type { FalLogoPosition } from '@/lib/fal-logo-placement';

export type DesignSpecCopyFitFailReason =
  | 'missing_layout'
  | 'empty_headline'
  | 'headline_overflow'
  | 'subtitle_overflow';

export interface DesignSpecSlotFit {
  role: 'headline' | 'subtitle';
  zonePx: { x: number; y: number; width: number; height: number };
  fit: FitTextResult;
  /** Joined fitted lines — use as on-canvas paint string. */
  paintedText: string;
  ok: boolean;
  overflowWidth: boolean;
  overflowHeight: boolean;
}

export interface DesignSpecCopyFitResult {
  layout: DesignSpecLayout | null;
  headline: DesignSpecSlotFit | null;
  subtitle: DesignSpecSlotFit | null;
  /** Ready-to-paint mission strings (may be shortened/wrapped lines joined). */
  fittedHeadline: string;
  fittedSubtitle: string | null;
  ok: boolean;
  failReason: DesignSpecCopyFitFailReason | null;
  renderPath: DesignSpecLayout['renderPath'];
}

function zoneToPixels(
  zone: DesignSpecNormRect,
  canvasW: number,
  canvasH: number,
  paddingNorm: number,
): { x: number; y: number; width: number; height: number } {
  const padX = zone.width * canvasW * paddingNorm;
  const padY = zone.height * canvasH * paddingNorm;
  return {
    x: Math.round(zone.x * canvasW + padX),
    y: Math.round(zone.y * canvasH + padY),
    width: Math.max(24, Math.round(zone.width * canvasW - padX * 2)),
    height: Math.max(16, Math.round(zone.height * canvasH - padY * 2)),
  };
}

function pickSlot(
  layout: DesignSpecLayout,
  role: DesignSpecTextSlot['role'],
): DesignSpecTextSlot | null {
  return layout.textSlots.find((t) => t.role === role) ?? null;
}

function wordsOf(text: string): string[] {
  return sanitizePosterText(text).split(/\s+/).filter(Boolean);
}

/** True when wrap/shrink dropped words from the mission string. */
function fitDroppedWords(original: string, fit: FitTextResult): boolean {
  const source = wordsOf(original);
  if (source.length === 0) return false;
  const painted = new Set(wordsOf(fit.lines.join(' ')).map((w) => w.toLocaleLowerCase('tr-TR')));
  // Allow tiny stop-word loss; fail if ≥2 content words vanished or >25% lost.
  let missing = 0;
  for (const w of source) {
    if (!painted.has(w.toLocaleLowerCase('tr-TR'))) missing += 1;
  }
  if (missing === 0) return false;
  if (missing >= 2) return true;
  return missing / source.length > 0.25;
}

function slotFits(
  fit: FitTextResult,
  maxWidth: number,
  maxHeight: number,
  originalText: string,
): {
  ok: boolean;
  overflowWidth: boolean;
  overflowHeight: boolean;
} {
  const safeWidth = maxWidth * FIT_WIDTH_SAFETY;
  const widest = Math.max(
    ...fit.lines.map((line) => estimateTextWidth(line, fit.fontSize, fit.letterSpacing)),
    0,
  );
  const overflowWidth = widest > safeWidth + 0.5 || fitDroppedWords(originalText, fit);
  const overflowHeight = fit.blockHeight > maxHeight + 0.5;
  return {
    ok: !overflowWidth && !overflowHeight && fit.lines.length > 0,
    overflowWidth,
    overflowHeight,
  };
}

function fitSlot(
  role: 'headline' | 'subtitle',
  slot: DesignSpecTextSlot,
  text: string,
  canvasW: number,
  canvasH: number,
): DesignSpecSlotFit {
  const pad = typeof slot.paddingNorm === 'number' ? slot.paddingNorm : 0.08;
  const zonePx = zoneToPixels(slot.zone, canvasW, canvasH, pad);
  const maxLines = Math.max(1, Math.min(6, slot.maxLines || (role === 'headline' ? 3 : 2)));
  // Base size from zone height — leave headroom for line-height.
  const baseFontSize = Math.max(
    18,
    Math.round((zonePx.height / maxLines) * (role === 'headline' ? 0.72 : 0.62)),
  );
  const trackingRatio = role === 'headline' ? 0.02 : 0.01;
  const minRatio = role === 'headline' ? 0.48 : 0.5;
  const fit = fitTextToWidth(
    text,
    zonePx.width,
    baseFontSize,
    trackingRatio,
    minRatio,
    maxLines,
  );
  const bounds = slotFits(fit, zonePx.width, zonePx.height, text);
  return {
    role,
    zonePx,
    fit,
    paintedText: fit.lines.join('\n'),
    ok: bounds.ok,
    overflowWidth: bounds.overflowWidth,
    overflowHeight: bounds.overflowHeight,
  };
}

/**
 * Fit mission copy into layout textSlots before GPT paint.
 * Empty subtitle is OK when showSubline is false / no subtitle slot.
 */
export function fitMissionCopyToLayout(
  layout: DesignSpecLayout | null | undefined,
  mission: { headline: string; subtitle?: string | null },
  opts?: { requireSubtitle?: boolean },
): DesignSpecCopyFitResult {
  if (!hasUsableDesignSpecLayout(layout)) {
    return {
      layout: null,
      headline: null,
      subtitle: null,
      fittedHeadline: sanitizePosterText(mission.headline),
      fittedSubtitle: mission.subtitle?.trim()
        ? sanitizePosterText(mission.subtitle)
        : null,
      ok: false,
      failReason: 'missing_layout',
      renderPath: 'deterministic_compose',
    };
  }

  const headlineRaw = sanitizePosterText(mission.headline);
  if (!headlineRaw) {
    return {
      layout,
      headline: null,
      subtitle: null,
      fittedHeadline: '',
      fittedSubtitle: null,
      ok: false,
      failReason: 'empty_headline',
      renderPath: layout.renderPath,
    };
  }

  const { width: canvasW, height: canvasH } = layout.canvas;
  const headlineSlot = pickSlot(layout, 'headline');
  const subtitleSlot = pickSlot(layout, 'subtitle');

  const headlineFit = headlineSlot
    ? fitSlot('headline', headlineSlot, headlineRaw, canvasW, canvasH)
    : null;

  const subtitleRaw = sanitizePosterText(mission.subtitle ?? '');
  const subtitleFit =
    subtitleRaw && subtitleSlot
      ? fitSlot('subtitle', subtitleSlot, subtitleRaw, canvasW, canvasH)
      : null;

  let failReason: DesignSpecCopyFitFailReason | null = null;
  if (!headlineFit || !headlineFit.ok) {
    failReason = headlineRaw ? 'headline_overflow' : 'empty_headline';
  } else if (opts?.requireSubtitle && subtitleRaw && subtitleFit && !subtitleFit.ok) {
    failReason = 'subtitle_overflow';
  } else if (subtitleFit && !subtitleFit.ok) {
    // Soft: drop overflowing subtitle rather than fail the whole frame.
    failReason = null;
  }

  const dropSubtitle = Boolean(subtitleFit && !subtitleFit.ok);
  const ok = failReason === null && Boolean(headlineFit?.ok);

  return {
    layout,
    headline: headlineFit,
    subtitle: dropSubtitle ? null : subtitleFit,
    fittedHeadline: headlineFit?.paintedText.replace(/\n/g, ' ').trim() || headlineRaw,
    fittedSubtitle: dropSubtitle
      ? null
      : subtitleFit
        ? subtitleFit.paintedText.replace(/\n/g, ' ').trim()
        : subtitleRaw || null,
    ok,
    failReason: ok ? null : failReason ?? 'headline_overflow',
    renderPath: layout.renderPath,
  };
}

/**
 * Hard-pin gate: withhold when copy cannot fit the measured shell.
 * Soft / unlocked pins return ok=true after best-effort fit (may drop subtitle).
 */
export function assertCopyFitsLayoutForPin(input: {
  fit: DesignSpecCopyFitResult;
  pinMode?: DesignSpecLayout['pinMode'] | null;
  matchQuality?: 'hard' | 'soft' | 'format_fallback' | null;
}): { allow: boolean; reason: string | null } {
  const hard =
    input.pinMode === 'hard'
    || input.matchQuality === 'hard';
  if (!hard) {
    // Soft: proceed with fitted (possibly shortened) copy unless headline empty.
    if (!input.fit.fittedHeadline.trim()) {
      return { allow: false, reason: 'library_template_copy_fit: empty headline after sanitize' };
    }
    return { allow: true, reason: null };
  }
  if (input.fit.failReason === 'missing_layout') {
    // Dual-read: hard pin without layout still allowed — Phase B legacy rows.
    return { allow: true, reason: null };
  }
  if (!input.fit.ok) {
    return {
      allow: false,
      reason: `library_template_copy_fit: ${input.fit.failReason ?? 'overflow'} — refuse paint that cannot fit layout slots`,
    };
  }
  return { allow: true, reason: null };
}

/** Prompt block — measured type metrics for GPT (fit-before-paint). */
export function buildTypeFitPromptBlock(fit: DesignSpecCopyFitResult): string {
  if (!hasUsableDesignSpecLayout(fit.layout) || !fit.headline) return '';
  const hl = fit.headline;
  const lines = [
    '═══ TYPE FIT (MEASURED BEFORE PAINT — HARD LAW) ═══',
    `renderPath=deterministic_compose — Satori/sharp type MUST obey measured slots.`,
    `HEADLINE paint string (exact, may be multi-line): ${hl.fit.lines.map((l) => `"${l}"`).join(' / ')}`,
    `HEADLINE metrics: font≈${hl.fit.fontSize}px · maxLines=${hl.fit.lines.length} · zone ${hl.zonePx.width}×${hl.zonePx.height}px · align=${fit.layout.textSlots.find((t) => t.role === 'headline')?.align ?? 'left'}`,
    'Every glyph of the headline must sit inside its plate/slot with ≥8% pad — never overflow, never straddle plate→photo.',
  ];
  if (fit.subtitle?.fit.lines.length) {
    const sub = fit.subtitle;
    lines.push(
      `SUBTITLE paint string: ${sub.fit.lines.map((l) => `"${l}"`).join(' / ')}`,
      `SUBTITLE metrics: font≈${sub.fit.fontSize}px · zone ${sub.zonePx.width}×${sub.zonePx.height}px`,
    );
  } else {
    lines.push('NO SUBTITLE — render no support line and no panel, bar, or plate where one would go.');
  }
  lines.push(
    'If copy looks long: use the fitted line breaks above — do NOT invent a bigger panel or bottom ticker.',
  );
  return lines.join('\n');
}

/**
 * Map layout.logoSlot centroid → sharp corner enum (Phase C logo via logoSlot).
 */
export function logoSlotToFalPosition(logoSlot: DesignSpecNormRect): FalLogoPosition {
  const cx = logoSlot.x + logoSlot.width / 2;
  const cy = logoSlot.y + logoSlot.height / 2;
  const horizontal = cx < 0.38 ? 'left' : cx > 0.62 ? 'right' : 'center';
  const vertical = cy < 0.45 ? 'top' : 'bottom';
  if (vertical === 'top' && horizontal === 'left') return 'top_left';
  if (vertical === 'top' && horizontal === 'center') return 'top_center';
  if (vertical === 'top') return 'top_right';
  if (horizontal === 'left') return 'bottom_left';
  if (horizontal === 'center') return 'bottom_center';
  return 'bottom_right';
}

/** Prefer layout.logoSlot over prior placement when a usable layout exists. */
export function resolveLogoPlacementFromLayout(
  layout: DesignSpecLayout | null | undefined,
  fallback?: { position: FalLogoPosition | null; zoneHint: string | null; source: string } | null,
): {
  position: FalLogoPosition;
  zoneHint: string;
  source: 'layout_document';
} | null {
  if (!hasUsableDesignSpecLayout(layout)) return null;
  const position = logoSlotToFalPosition(layout.logoSlot);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const zoneHint =
    `layout.logoSlot x=${pct(layout.logoSlot.x)} y=${pct(layout.logoSlot.y)} ` +
    `w=${pct(layout.logoSlot.width)} h=${pct(layout.logoSlot.height)}` +
    (fallback?.zoneHint ? ` · prior: ${fallback.zoneHint}` : '');
  return { position, zoneHint, source: 'layout_document' };
}
