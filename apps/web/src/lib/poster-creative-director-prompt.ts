/**
 * Creative Director system prompt for designed_post / agency poster stills.
 * Separate from story CD — posters use SVG overlay families, not Remotion story layouts.
 */
import type { PosterLayoutFamily } from './poster-template-types';

export const POSTER_LAYOUT_FAMILIES: PosterLayoutFamily[] = [
  'editorial_date',
  'restaurant_feature',
  'promo_split',
  'gala_invite',
  'event_masthead',
  'lineup_tiered',
  'festival_grid',
  'dj_night',
  'neon_club',
  'art_deco',
];

const POSTER_FAMILY_CATALOG = `
editorial_date — magazine date stamp, serif hierarchy, photo-dominant; B2B/service hero
restaurant_feature — luxury bottom gradient band; product/venue spotlight without flat color slabs
promo_split — ONLY for hard promo (% / indirim / kampanya); never default for seasonal copy
gala_invite — formal invite frame, thin border, centered elegance
event_masthead — top bar + bold headline; concerts, launches, dated events
lineup_tiered / festival_grid / dj_night / neon_club — nightlife & entertainment only
art_deco — premium frame, double rule, heritage brands`;

export function buildPosterCreativeDirectorPrompt(): string {
  return `You are the creative director at an Awwwards-caliber social agency reviewing a DESIGNED FEED POST (1080×1080 still, not motion story).

PRIME DIRECTIVE: Ship agency-grade hierarchy — photo leads, typography supports, CTA earns the click.
Target Grafiker score ≥9/10. REJECT template-y 50/50 photo + flat beige/tan block unless real discount promo.

━━━ ANTI-PATTERNS (never ship) ━━━
- Disconnected 50/50 split: photo top + solid color rectangle bottom with generic centered type
- Flat stock-template beige panel with no brand primary/accent integration
- Headline + subtitle same weight or duplicate meaning ("Yaz Fırsatları" + "kolay taşımacılık" ok if distinct)
- Generic CTA ("İletişime Geç", "Keşfet") on B2B/logistics — use action CTAs (Teklif Al, Planla, Detayları İncele)
- Country-only location (Türkiye) as the only context line
- Clipped or faded letters at frame edges; gradient wash making left glyphs pale on light panels
- "Fırsat" seasonal copy routed to promo_split — use editorial_date or restaurant_feature instead

━━━ LAYOUT FAMILY CATALOG (pick ONE) ━━━
${POSTER_FAMILY_CATALOG}

━━━ ROUTING ━━━
logistics / nakliyat / lojistik / freight / B2B service → editorial_date OR restaurant_feature (photo 70%+)
real % / indirim / kampanya / limited offer → promo_split with brand duotone, NOT flat beige
chef / venue / product spotlight → restaurant_feature
dated event / concert / launch night → event_masthead OR gala_invite
agency / SaaS / professional → editorial_date, split typography, no promo_split unless hard offer

━━━ COPY RULES ━━━
- displayHeadline: ≤32 chars, one clear hook; seasonal themes need concrete benefit not vague "fırsatlar"
- displaySubtitle: max 5 words support line; never repeat headline nouns
- categoryLabel: 1–2 WORDS CAPS, sector-specific (ROTA, GÜVEN, YAZ, KAMPANYA only if real promo)
- CTA: sector-native action verb; logistics → Teklif Al | Planla | Hemen Başla

━━━ layoutOverrides (poster visual patches) ━━━
vignette: soft|radial on photo; duotoneWash: primary (brand tint, not beige default)
gradientStart: 0.52–0.68 for bottom text on photo; colorBlockSize ≤0.34 for service brands
heroScale: 0.92–1.08; accentLine: above|left_bar for hierarchy

━━━ RESPONSE JSON ONLY ━━━
{
  "layoutFamily": "editorial_date",
  "variantIndex": 0,
  "categoryLabel": "PANEL",
  "displayHeadline": "RANDEVU PANELİ",
  "displaySubtitle": "tek ekrandan yönet",
  "overlayOpacity": 0.62,
  "headlineWeight": 800,
  "headlineScale": 1.0,
  "layoutOverrides": { "duotoneWash": "primary", "vignette": "soft" },
  "rationale": "1 sentence why this family fits",
  "designScore": 9
}`;
}

export function buildPosterCreativeDirectorUserHints(input: {
  sector?: string;
  businessType?: string;
  headline: string;
  caption?: string;
  templateId?: string;
  grafikerFeedback?: string;
  retryAttempt?: number;
  grafikerScore?: number;
}): string {
  const sector = String(input.sector ?? input.businessType ?? '').toLowerCase();
  const lines: string[] = [];

  if (/nakliyat|nakliye|lojistik|logistics|freight|taşımac|tasimac|transport|kargo/.test(sector)) {
    lines.push(
      'LOGISTICS BRAND: Prefer editorial_date or restaurant_feature — photo-dominant, bottom gradient scrim.',
      'Avoid promo_split unless copy has % or indirim. CTA: Teklif Al or Planla.',
      'Integrate brand primary (navy) + accent; no flat tan/beige template block.',
    );
  }
  if (/saas|yazılım|yazilim|software|agency_services|b2b|platform|randevu.*panel|berber.*panel|kuafor.*panel/.test(sector)) {
    lines.push(
      'SAAS / B2B SOFTWARE: editorial_date only — UI mockup, dashboard, or abstract tech hero.',
      'NEVER physical barber shop exterior, street scene, or logistics fleet unless caption explicitly says so.',
      'CTA: Ücretsiz Dene | Demo Al | Detayları İncele. Subtitle: concrete product benefit, not logistics copy.',
    );
  }
  if (/\bfırsat\b|\bfirsat\b/i.test(input.headline) && !/%|indirim|kampanya/i.test(`${input.headline} ${input.caption ?? ''}`)) {
    lines.push(
      'SOFT SEASONAL (fırsat without discount): NOT a hard promo — do NOT pick promo_split.',
    );
  }
  if (input.templateId?.includes('promo_split')) {
    lines.push(
      `Pre-selected ${input.templateId} — override if copy is not hard promo or layout feels template-y.`,
    );
  }
  if (input.grafikerFeedback) {
    lines.push(
      '',
      `GRAFIKER RETRY (attempt ${input.retryAttempt ?? 1}, prior ${input.grafikerScore ?? '?'}/10):`,
      input.grafikerFeedback,
      'Fix: editorial_date or restaurant_feature, headline ≤28 chars, solid contrast on panel, designScore ≥9.',
    );
  }
  return lines.join('\n');
}
