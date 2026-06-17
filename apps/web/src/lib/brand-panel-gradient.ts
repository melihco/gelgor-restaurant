/**
 * Smooth brand-color panel fades — avoids harsh photo / solid-block splits.
 */

export function shadeHexColor(hex: string, amount: number): string {
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const f = Math.max(0, Math.min(1, 1 - amount));
  const r = Math.round(parseInt(h.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * f);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** CSS linear-gradient for Remotion / React overlays. */
export function brandPanelGradientCss(color: string, peakOpacity = 1): string {
  const darker = shadeHexColor(color, 0.22);
  const o = Math.max(0, Math.min(1, peakOpacity));
  // 11-stop cinematic curve — eliminates gradient banding, smooth S-curve feel
  return `linear-gradient(to bottom,
    ${hexToRgba(color, 0)} 0%,
    ${hexToRgba(color, o * 0.04)} 12%,
    ${hexToRgba(color, o * 0.14)} 24%,
    ${hexToRgba(color, o * 0.28)} 36%,
    ${hexToRgba(color, o * 0.46)} 48%,
    ${hexToRgba(color, o * 0.62)} 58%,
    ${hexToRgba(color, o * 0.76)} 68%,
    ${hexToRgba(color, o * 0.87)} 78%,
    ${hexToRgba(color, o * 0.94)} 87%,
    ${hexToRgba(color, o)} 93%,
    ${hexToRgba(darker, o)} 100%
  )`;
}

/**
 * Pure cinematic scrim — deep black fade without brand colour tint.
 * Use for luxury/editorial overlays where brand colour should not bleed into content.
 */
export function cinematicScrimCss(peakOpacity = 0.88, fromPercent = 30): string {
  const o = Math.max(0, Math.min(1, peakOpacity));
  return `linear-gradient(to bottom,
    rgba(0,0,0,0) 0%,
    rgba(0,0,0,0) ${fromPercent}%,
    rgba(0,0,0,${(o * 0.18).toFixed(2)}) ${fromPercent + 8}%,
    rgba(0,0,0,${(o * 0.38).toFixed(2)}) ${fromPercent + 16}%,
    rgba(0,0,0,${(o * 0.58).toFixed(2)}) ${fromPercent + 24}%,
    rgba(0,0,0,${(o * 0.76).toFixed(2)}) ${fromPercent + 34}%,
    rgba(0,0,0,${(o * 0.88).toFixed(2)}) ${fromPercent + 44}%,
    rgba(0,0,0,${o.toFixed(2)}) 100%
  )`;
}

/**
 * Dual-tone scrim — combines a subtle brand tint at top with deep black at bottom.
 * Signature look: premium lifestyle content on Instagram.
 */
export function dualToneScrimCss(color: string, peakOpacity = 0.92): string {
  const o = Math.max(0, Math.min(1, peakOpacity));
  const darker = shadeHexColor(color, 0.25);
  return `linear-gradient(to bottom,
    rgba(0,0,0,0.52) 0%,
    rgba(0,0,0,0.18) 18%,
    rgba(0,0,0,0) 32%,
    ${hexToRgba(color, o * 0.22)} 52%,
    ${hexToRgba(color, o * 0.58)} 68%,
    ${hexToRgba(color, o * 0.82)} 82%,
    ${hexToRgba(darker, o)} 100%
  )`;
}

/** SVG markup for announcement poster color blocks. */
export function buildBrandPanelSvgGradient(
  id: string,
  fill: string,
  width: number,
  yTop: number,
  height: number,
  opacity: number,
): { defs: string; rect: string } {
  const yBottom = yTop + height;
  const darker = shadeHexColor(fill, 0.2);
  const o = opacity;
  const defs = `<linearGradient id="${id}" x1="0" y1="${yTop}" x2="0" y2="${yBottom}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${fill}" stop-opacity="0"/>
      <stop offset="16%" stop-color="${fill}" stop-opacity="${(o * 0.12).toFixed(3)}"/>
      <stop offset="36%" stop-color="${fill}" stop-opacity="${(o * 0.42).toFixed(3)}"/>
      <stop offset="54%" stop-color="${fill}" stop-opacity="${(o * 0.68).toFixed(3)}"/>
      <stop offset="72%" stop-color="${fill}" stop-opacity="${(o * 0.86).toFixed(3)}"/>
      <stop offset="88%" stop-color="${fill}" stop-opacity="${o.toFixed(3)}"/>
      <stop offset="100%" stop-color="${darker}" stop-opacity="${o.toFixed(3)}"/>
    </linearGradient>`;
  const rect = `<rect x="0" y="${yTop}" width="${width}" height="${height}" fill="url(#${id})"/>`;
  return { defs, rect };
}
