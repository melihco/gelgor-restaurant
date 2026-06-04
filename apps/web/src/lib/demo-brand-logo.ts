/**
 * Showcase / dev — SVG wordmark when tenant logo URL yok.
 * Logo-forward layout'ların boş kalmaması için.
 */
export function buildDemoBrandLogoSvg(brandName: string, accentColor: string): string {
  const words = brandName.trim().split(/\s+/).filter(Boolean);
  const line1 = words.slice(0, 2).join(' ') || brandName.slice(0, 12);
  const line2 = words.slice(2).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="140" viewBox="0 0 420 140">
  <rect x="8" y="8" width="124" height="124" rx="28" fill="${accentColor}" opacity="0.18"/>
  <rect x="8" y="8" width="124" height="124" rx="28" fill="none" stroke="${accentColor}" stroke-width="3"/>
  <text x="70" y="82" text-anchor="middle" fill="#ffffff" font-family="Georgia, serif" font-size="42" font-weight="700">${line1.charAt(0)}</text>
  <text x="156" y="58" fill="#ffffff" font-family="Arial, sans-serif" font-size="28" font-weight="800" letter-spacing="6">${line1.toUpperCase()}</text>
  ${line2 ? `<text x="156" y="92" fill="${accentColor}" font-family="Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="8">${line2.toUpperCase()}</text>` : ''}
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function resolveShowcaseLogoUrl(input: {
  brandName: string;
  accentColor: string;
  logoUrl?: string | null;
}): string {
  const raw = (input.logoUrl ?? '').trim();
  if (raw.startsWith('http') || raw.startsWith('data:') || raw.startsWith('/')) return raw;
  return buildDemoBrandLogoSvg(input.brandName, input.accentColor);
}
