/**
 * Canva-quality design floor for gpt-image-1 designed posts / template replicas.
 *
 * Quality bar: boutique hospitality Instagram — photo lock, type fit, logo quiet
 * zone, photo-led craft. Opaque geometric paint slabs are a fail unless a hard
 * layout document explicitly demands color_block / wedge roles.
 */

export type CanvaQualityChannel = 'feed_post' | 'reel' | 'story';

export type CanvaQualityPinMode = 'hard' | 'soft' | 'unlocked';

export type CanvaQualityIntensity =
  | 'photo_first'
  | 'elegant_light'
  | 'balanced'
  | 'designed'
  | 'bold_editorial';

/** Panel roles that authorize opaque paint geometry under hard pin. */
const OPAQUE_LAYOUT_ROLES = new Set(['color_block', 'wedge', 'ticket']);

export function layoutDemandsOpaquePaint(input: {
  pinMode?: CanvaQualityPinMode | string | null;
  layoutPanelRoles?: readonly string[] | null;
}): boolean {
  if (input.pinMode !== 'hard') return false;
  const roles = input.layoutPanelRoles ?? [];
  return roles.some((r) => OPAQUE_LAYOUT_ROLES.has(String(r)));
}

export function buildCanvaQualityDesignContract(input?: {
  channel?: CanvaQualityChannel;
  hasTemplateLayoutRef?: boolean;
  brandPrimary?: string;
  brandAccent?: string;
  /**
   * Compact form for design-card prompts (must coexist with intensity + text contracts).
   * Full form for template replica headers.
   */
  compact?: boolean;
  intensityLevel?: CanvaQualityIntensity | string | null;
  pinMode?: CanvaQualityPinMode | string | null;
  /** From design_spec.layout.panels[].role — drives hard-pin geometry language. */
  layoutPanelRoles?: readonly string[] | null;
}): string {
  const channel = input?.channel ?? 'feed_post';
  const isVertical = channel === 'reel' || channel === 'story';
  const hardOpaque = layoutDemandsOpaquePaint({
    pinMode: input?.pinMode,
    layoutPanelRoles: input?.layoutPanelRoles,
  });
  const intensity = String(input?.intensityLevel ?? 'balanced');
  const photoLedIntensity =
    intensity === 'photo_first'
    || intensity === 'elegant_light'
    || intensity === 'balanced'
    || intensity === 'designed'
    || intensity === 'bold_editorial';

  if (input?.compact) {
    return [
      'CANVA QUALITY FLOOR:',
      'PHOTO LOCK — exact reference photo.',
      'TYPE CRAFT — designed display + hierarchy + asymmetric lockup.',
      'TYPE FIT — letters in scrim ≥8% pad.',
      isVertical ? 'GEOMETRY — 9:16 UI-safe.' : 'GEOMETRY — 4:5 crop-safe.',
      hardOpaque
        ? 'LAYOUT LAW — soft plates OK; forbid paint slabs ≥20%.'
        : 'LAYOUT LAW — photo-led; FORBIDDEN opaque panels / paint wedges.',
      'COHESION — type+photo+logo as one template.',
      'LOGO — quiet corner. PASS BAR — photo-led agency standard.',
    ].join(' ');
  }

  const geometry = hardOpaque
    ? (isVertical
      ? [
          'SLOT GEOMETRY (9:16 HARD PIN): Match the numeric layout document / IMAGE 2 panel roles exactly (including color_block/wedge when present); photo window keeps the hero subject fully visible.',
          'SAFE CROP: Keep all letterforms inside the central readable frame — top 12% and bottom 15% are Instagram UI danger zones (no critical type).',
        ]
      : [
          'SLOT GEOMETRY (4:5 HARD PIN): Match the numeric layout document / IMAGE 2 panel roles exactly (including color_block/wedge when present) with ≥10% inner padding in type zones.',
          'SAFE CROP: GPT may render 2:3 then crop to 4:5 — keep ALL type inside the central 4:5 safe region (never park headlines in extreme top/bottom strips that cover-crop will clip).',
        ])
    : (isVertical
      ? [
          'SLOT GEOMETRY (9:16): Prefer translucent scrim / asymmetric type lockup / thin brand rules ON a full-bleed photo — not a tall opaque header stack.',
          'SAFE CROP: Keep all letterforms inside the central readable frame — top 12% and bottom 15% are Instagram UI danger zones (no critical type).',
          'FORBIDDEN: opaque geometric header/diagonal paint covering ≥25% of frame unless a hard layout document demands color_block|wedge.',
        ]
      : [
          photoLedIntensity
            ? 'SLOT GEOMETRY (4:5 feed): Prefer translucent scrim / asymmetric corner type lockup / thin brand rules on a full-bleed photo — NOT a top color panel sandwich.'
            : 'SLOT GEOMETRY (4:5 feed): Prefer type-led editorial or soft plates with a clear photo hero — solid color_block only when the hard layout document demands it.',
          'SAFE CROP: GPT may render 2:3 then crop to 4:5 — keep ALL type inside the central 4:5 safe region (never park headlines in extreme top/bottom strips that cover-crop will clip).',
          'FORBIDDEN: opaque geometric header/diagonal paint covering ≥25% of frame unless pinMode=hard and layout.panels include color_block|wedge.',
        ]);

  const colors = input?.brandPrimary && input?.brandAccent
    ? `BRAND COLORS for craft accents/scrims only: ${input.brandPrimary} + ${input.brandAccent} — never opaque full-bleed paint that swallows the photo.`
    : 'BRAND COLORS for craft accents/scrims only — never opaque full-bleed paint that swallows the photo.';

  const layoutLaw = input?.hasTemplateLayoutRef
    ? (hardOpaque
      ? 'LAYOUT LAW: When a template layout reference image is attached under hard pin with opaque panel roles, copy its panel geometry, type zones, and color-block ratios exactly — only mission photo + mission copy change.'
      : 'LAYOUT LAW: Template reference may guide soft craft finish — prefer photo-led type/scrim editorial; do NOT invent a solid top/side paint slab just because a preview had one.')
    : (hardOpaque
      ? 'LAYOUT LAW: Hard numeric layout authorizes solid craft plates — still keep the photo hero readable.'
      : 'LAYOUT LAW: One intentional type/scrim/asymmetric editorial shell — not random AI collage, not opaque geometric paint slabs.');

  return [
    '═══ CANVA QUALITY FLOOR (mandatory — agency portfolio bar) ═══',
    'PHOTO LOCK (non-negotiable): Keep the EXACT venue/product photograph from the reference image(s). Same place, same furniture, same subjects. Light color grade OK. FORBIDDEN: inventing a different beach, resort, kitchen, or stock scene.',
    layoutLaw,
    ...geometry,
    'TYPE FIT (non-negotiable): Every letter of headline/subtitle must sit fully inside its plate/scrim/band with ≥8% padding from that shape\'s edges. If copy is long, SHRINK point size or wrap to max 2–3 short lines — never expand paint past shell ratios, never let glyphs straddle plate→photo edges.',
    'TYPE HIERARCHY: One dominant punchline at intentional scale; optional short support at ~⅓–⅖ headline size with contrasting weight/tracking; no dual competing slogans; no emoji-as-design; no meta labels (POST/STORY/REEL).',
    'TYPE PLACEMENT: Asymmetric / magazine lockup (offset masthead, lower-left, or corner stack) — never the sole look of dead-centered generic serif inside a thin empty rectangular frame.',
    'LOGO: Do NOT draw any brand mark. Leave a quiet empty corner for post-production composite — never over letterforms or the photo hero.',
    colors,
    'TASTE FAIL (reject this look): amateur text overflow, clipart sun/icons instead of reserved logo zone, Canva sandwich paint slabs, opaque brand-color side/diagonal panel ≥20% with white text on paint, flat opaque header ≥25% with centered white sans only, thin empty border + centered Times as the only craft, system-sans dump, cramped edge-hugging type, foreign scene invention.',
    'PASS BAR: Photo-led editorial — type in negative space, thin accent rules. Mid-tier color-panel template-pack energy is a fail.',
  ].join('\n');
}

/**
 * Compact Canva Pro typography lock — font face, optical size, placement.
 * Survives prompt trim when injected into the protected intensity head.
 */
export function buildCanvaTypeCraftLock(input?: {
  intensityLevel?: CanvaQualityIntensity | string | null;
  /** Vibe fontDescription or brand heading font spirit. */
  fontFace?: string | null;
  fontPersonality?: string | null;
  hasSubtitle?: boolean;
}): string {
  const level = String(input?.intensityLevel ?? 'balanced');
  const face = String(input?.fontFace ?? '').trim()
    || 'custom designer display face matching brand vibe';
  const personality = input?.fontPersonality && input.fontPersonality !== 'brand'
    ? ` Personality ${input.fontPersonality}.`
    : '';

  const size =
    level === 'bold_editorial'
      ? 'SIZE — headline 24–36% frame height, stacked optical lines, tight display tracking.'
      : level === 'designed'
        ? 'SIZE — headline 18–28% frame height; support ~35% of headline size.'
        : level === 'elegant_light' || level === 'photo_first'
          ? 'SIZE — headline 10–16% frame height; whisper hierarchy, still designed.'
          : 'SIZE — headline 16–24% frame height; support ~35–42% of headline size.';

  const support = input?.hasSubtitle
    ? 'SUPPORT — one short line, contrasting weight/tracking (not a second equal slogan).'
    : 'SUPPORT — none; single headline owns the lockup.';

  return [
    'CANVA TYPE CRAFT (mandatory — Canva Pro bar):',
    `FACE — render as ${face}; optical kerning; high contrast on photo.${personality}`,
    'PAIRING — display headline + contrasting support (weight/size/tracking); never one plain Times/Georgia face for everything; never Arial/Helvetica UI sans.',
    size,
    support,
    'PLACEMENT — asymmetric magazine lockup (lower-left / upper-left offset / corner stack); optical alignment to photo edges.',
    'CRAFT MINIMUM (required — pick ≥2): localized soft scrim under glyphs only (≤22% frame, 25–40% opacity) · thin brand-color accent rule · small corner color chip · tracked all-caps eyebrow.',
    'Bare white serif alone on photo = FAIL. Full-width opaque/beige header band as the type host = FAIL.',
    'FORBIDDEN as sole craft: thin empty rectangular border + centered generic serif; plain photo+caption watermark; sticker geometry kits / opaque paint slabs ≥25%.',
    'FINISH — boutique Canva Pro hospitality template: designed type system + light accents on the photo hero.',
  ].join(' ');
}

/** Whether Ideogram/Flux invent paths are allowed for a designed-post attempt. */
export function allowDesignedPostIdeogramFallback(input: {
  /** hard/soft library match */
  hasRenderableTemplateMatch: boolean;
  /** replica lock required (hard/soft with prompt+thumb) */
  replicaLockRequired: boolean;
  requireGroundedGallery?: boolean;
}): boolean {
  // Phase A quality floor: never drop to Ideogram invent for locked / grounded slots.
  if (input.replicaLockRequired) return false;
  if (input.hasRenderableTemplateMatch) return false;
  if (input.requireGroundedGallery) return false;
  return true;
}
