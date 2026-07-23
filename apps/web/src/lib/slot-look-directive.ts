/**
 * Slot-look SSOT — idea/announcement-specific visual identity for designed posts.
 *
 * Problem we solve: photo-led prompts collapsed every slot into "terrace photo +
 * white type". A viewer must recognize DJ Night vs sunset ritual vs offer WITHOUT
 * reading the headline (silhouette / mood test).
 *
 * MULTI-TENANT: keyed by announcement type + caption/headline signals + sector —
 * never brand UUIDs.
 */

export type SlotLookKind =
  | 'nightlife_event'
  | 'golden_hour'
  | 'offer_booking'
  | 'venue_ambiance'
  | 'product_hero'
  | 'social_proof'
  | 'generic_editorial';

function blob(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function resolveSlotLookKind(input: {
  announcementType?: string | null;
  catalogSlotKey?: string | null;
  headline?: string | null;
  caption?: string | null;
  sector?: string | null;
}): SlotLookKind {
  const ann = String(input.announcementType ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  const text = blob([
    input.catalogSlotKey,
    input.headline,
    input.caption,
    ann,
  ]);
  const sector = String(input.sector ?? '').toLowerCase();

  if (
    ann === 'event_announcement'
    || ann === 'event_teaser'
    || /\b(dj|night|gece|after.?dark|neon|party|club\s*night|seti|canlı\s*set)\b/i.test(text)
  ) {
    return 'nightlife_event';
  }
  if (
    ann === 'campaign_offer'
    || ann === 'offer_campaign'
    || /\b(rezervasyon|offer|indirim|şezlong|daybed|booking|fiyat|menu|menü)\b/i.test(text)
  ) {
    return 'offer_booking';
  }
  if (
    /\b(gün\s*batım|gun\s*batim|sunset|golden\s*hour|altın\s*saat|golden)\b/i.test(text)
    || (ann === 'daily_story' && /\b(batım|sunset|golden|akşam|amber)\b/i.test(text))
  ) {
    return 'golden_hour';
  }
  if (ann === 'social_proof' || /\b(yorum|review|misafir|guest|happy\s*customer)\b/i.test(text)) {
    return 'social_proof';
  }
  if (
    ann === 'product_reveal'
    || ann === 'product_highlight'
    || /local_products|product|retail/i.test(sector)
  ) {
    if (/\b(ürün|product|jar|sku|pack)\b/i.test(text) || /local_products|product/i.test(sector)) {
      return 'product_hero';
    }
  }
  if (ann === 'venue_showcase' || ann === 'behind_the_scenes' || ann === 'daily_story') {
    return 'venue_ambiance';
  }
  return 'generic_editorial';
}

function formatBrandPalette(colors?: { primary?: string; accent?: string } | null): string {
  const primary = String(colors?.primary ?? '').trim();
  const accent = String(colors?.accent ?? '').trim();
  if (primary && accent) return `${primary} + ${accent}`;
  if (primary) return primary;
  if (accent) return accent;
  return '';
}

/**
 * Compact protected prompt block — silhouette test + concrete craft recipe per slot.
 * When brandColors are provided, craft/grade must use those hexes — never a random club palette.
 */
export function buildSlotLookDirective(input: {
  announcementType?: string | null;
  catalogSlotKey?: string | null;
  headline?: string | null;
  caption?: string | null;
  sector?: string | null;
  brandName?: string | null;
  brandColors?: { primary?: string; accent?: string } | null;
}): string {
  const kind = resolveSlotLookKind(input);
  const brand = String(input.brandName ?? 'the venue').trim() || 'the venue';
  const headline = String(input.headline ?? '').trim().slice(0, 48);
  const palette = formatBrandPalette(input.brandColors);
  const paletteLaw = palette
    ? `BRAND PALETTE LOCK: craft plates/type/accents ONLY in ${palette} — inventing off-brand neon pink/cyan/random club colors = FAIL.`
    : 'BRAND PALETTE LOCK: use this brand\'s primary/accent only — inventing a foreign club palette = FAIL.';

  const common = [
    'SLOT LOOK (mandatory — silhouette test):',
    `Kind=${kind}. Without reading text, a viewer must feel THIS slot — not a generic terrace caption.`,
    headline ? `Mission idea: "${headline}".` : '',
    paletteLaw,
  ];

  switch (kind) {
    case 'nightlife_event':
      return [
        ...common,
        `LOOK — ${brand} DJ / night event poster: electric after-dark energy on the real venue photo — THIS brand's night look, not a stock EDM flyer.`,
        palette
          ? `GRADE — dusk-electric grade using ${palette} only; daytime snap alone = FAIL.`
          : 'GRADE — cooler/deeper dusk-electric grade from brand accents — daytime snap alone = FAIL.',
        'TYPE — oversized stacked condensed/impact display (ALL CAPS ok); asymmetric left or lower lockup; support line for night/day.',
        palette
          ? `CRAFT — accent rules/corner night chip + soft dark scrim in ${palette} (≥2 accents). Festival-flyer chaos = FAIL; quiet coastal whisper = FAIL.`
          : 'CRAFT — brand-color accent rules/corner night chip + soft dark scrim (≥2). Festival-flyer chaos = FAIL.',
        'DIFFERENTIATOR — must not resemble a sunset/ambiance post; nightlife energy must dominate.',
      ].filter(Boolean).join(' ');
    case 'golden_hour':
      return [
        ...common,
        `LOOK — ${brand} golden-hour ritual editorial: warm sun-washed hospitality lookbook.`,
        palette
          ? `GRADE — warm sun-washed grade biased toward ${palette}; cool midday blue snap without brand warmth = FAIL.`
          : 'GRADE — amber/gold warmth from brand accents; cool midday blue snap without warm grade = FAIL.',
        'TYPE — refined display (not neon impact); asymmetric masthead or lower-left; short support like Altın saat.',
        palette
          ? `CRAFT — soft warm scrim + thin rule/chip in ${palette} (≥2). Opaque mustard paint slab = FAIL; DJ neon energy = FAIL.`
          : 'CRAFT — soft warm scrim + thin gold/cream rule (≥2). Opaque mustard paint slab = FAIL; DJ neon energy = FAIL.',
        'DIFFERENTIATOR — contemplative sunset mood; must not resemble a DJ night poster.',
      ].filter(Boolean).join(' ');
    case 'offer_booking':
      return [
        ...common,
        `LOOK — ${brand} booking/offer card: clear value hierarchy on the real venue/product photo.`,
        'GRADE — bright, inviting, commercial-clean; keep product/daybed hero readable.',
        'TYPE — bold offer headline + smaller CTA/support; price/benefit emphasis when present.',
        palette
          ? `CRAFT — soft offer plate/scrim + CTA rule/chip in ${palette} (≥2). Pure ambiance whisper = FAIL; nightlife neon = FAIL.`
          : 'CRAFT — soft offer plate/scrim + accent CTA rule (≥2). Pure ambiance whisper = FAIL; nightlife neon = FAIL.',
        'DIFFERENTIATOR — must read as an offer/reservation post at a glance.',
      ].filter(Boolean).join(' ');
    case 'product_hero':
      return [
        ...common,
        `LOOK — ${brand} product hero: packshot/lifestyle product leads; boutique retail craft.`,
        'TYPE — clean modern display; product name hierarchy; minimal clutter.',
        palette
          ? `CRAFT — soft mat/scrim + thin rule in ${palette} (≥2). Venue nightlife poster = FAIL.`
          : 'CRAFT — soft mat/scrim + thin brand rule (≥2). Venue nightlife poster = FAIL.',
        'DIFFERENTIATOR — product-first, not venue ambiance.',
      ].filter(Boolean).join(' ');
    case 'social_proof':
      return [
        ...common,
        `LOOK — ${brand} social-proof: quote/testimonial energy with calm photo hero.`,
        'TYPE — quote-led or short praise line; softer hierarchy than event posters.',
        palette
          ? `CRAFT — frosted/soft plate + thin rule in ${palette} (≥2). DJ neon = FAIL.`
          : 'CRAFT — frosted/soft plate + thin rule (≥2). DJ neon = FAIL.',
      ].filter(Boolean).join(' ');
    case 'venue_ambiance':
      return [
        ...common,
        `LOOK — ${brand} venue ambiance: photo-led lifestyle editorial unique to THIS moment.`,
        'TYPE — refined display in asymmetric lockup; not event-poster scale.',
        palette
          ? `CRAFT — soft scrim + thin rule in ${palette} (≥2). Bare caption watermark = FAIL.`
          : 'CRAFT — soft scrim + thin brand rule (≥2). Bare caption watermark = FAIL.',
        'DIFFERENTIATOR — calm venue story; not DJ night, not hard-sell offer.',
      ].filter(Boolean).join(' ');
    default:
      return [
        ...common,
        `LOOK — ${brand} boutique editorial unique to this slot idea.`,
        'TYPE — designed hierarchy; asymmetric lockup.',
        palette
          ? `CRAFT — ≥2 light accents in ${palette}. Generic identical terrace+serif across slots = FAIL.`
          : 'CRAFT — ≥2 light accents (scrim/rule/chip). Generic identical terrace+serif across slots = FAIL.',
      ].filter(Boolean).join(' ');
  }
}

/**
 * Whether this slot should prefer graphic/event compose over whisper photo-led.
 * Always false: opaque paint-panel / diagonal-slab graphic compose is retired.
 * Nightlife & offers still get energy via grade + type scale — on full-bleed photo.
 */
export function slotLookPrefersGraphicCompose(_kind: SlotLookKind): boolean {
  return false;
}
