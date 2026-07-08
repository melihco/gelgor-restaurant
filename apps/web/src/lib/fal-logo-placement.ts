/**
 * fal.ai logo placement — art director / Canva archetype / brand defaults.
 *
 * Priority (highest first):
 *   1. Agent fal_design_brief.logo_position / logo_zone
 *   2. Canva archetype default for the resolved layout
 *   3. Brand post_design_defaults.logo_position
 *   4. Channel-safe fallback
 *
 * Integrity rules (never redraw logo) live in buildFalLogoPlacementContract.
 */

import type { CanvaArchetypeId } from './canva-archetype-catalog';
import type { BrandPostDesignDefaults } from '@/types/brand-theme';

export type FalLogoPosition = BrandPostDesignDefaults['logo_position'];

export type FalLogoPlacementSource =
  | 'agent'
  | 'archetype'
  | 'brand_default'
  | 'channel_fallback';

export interface ResolvedFalLogoPlacement {
  position: FalLogoPosition | null;
  /** Free-text zone from art director — e.g. "inside top color panel, left of headline". */
  zoneHint: string | null;
  source: FalLogoPlacementSource;
}

const VALID_POSITIONS: ReadonlySet<FalLogoPosition> = new Set([
  'top_left',
  'top_center',
  'top_right',
  'bottom_left',
  'bottom_center',
  'bottom_right',
]);

/** Per-archetype logo anchor — mirrors Remotion event-card family logic. */
export const CANVA_ARCHETYPE_LOGO_POSITION: Partial<Record<CanvaArchetypeId, FalLogoPosition>> = {
  diagonal_brand_split: 'top_left',
  split_feature_panel: 'top_right',
  magazine_cover_drop: 'top_left',
  frosted_quote_card: 'bottom_right',
  cinematic_full_bleed: 'bottom_right',
  campaign_hero_block: 'top_center',
  event_ticket_stub: 'top_center',
  neon_night_promo: 'top_center',
  social_proof_banner: 'bottom_right',
  promo_price_stack: 'top_center',
  editorial_date_masthead: 'top_center',
  product_hero_card: 'bottom_right',
  graphic_shape_stack: 'top_right',
  before_after_diptych: 'top_center',
  location_pin_card: 'bottom_left',
  polaroid_memory: 'bottom_right',
  noir_editorial: 'top_left',
  gallery_carousel_tease: 'bottom_right',
};

const POSITION_LABELS: Record<FalLogoPosition, string> = {
  top_left: 'top-left corner',
  top_center: 'top-center',
  top_right: 'top-right corner',
  bottom_left: 'bottom-left corner',
  bottom_center: 'bottom-center',
  bottom_right: 'bottom-right corner',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function parseFalLogoPosition(raw: unknown): FalLogoPosition | null {
  const normalized = str(raw)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  if (!normalized) return null;
  if (VALID_POSITIONS.has(normalized as FalLogoPosition)) {
    return normalized as FalLogoPosition;
  }
  if (/top.*left|upper.*left/.test(normalized)) return 'top_left';
  if (/top.*right|upper.*right/.test(normalized)) return 'top_right';
  if (/top.*center|upper.*center|masthead/.test(normalized)) return 'top_center';
  if (/bottom.*left|lower.*left/.test(normalized)) return 'bottom_left';
  if (/bottom.*right|lower.*right/.test(normalized)) return 'bottom_right';
  if (/bottom.*center|lower.*center/.test(normalized)) return 'bottom_center';
  return null;
}

export function formatFalLogoPositionLabel(position: FalLogoPosition): string {
  return POSITION_LABELS[position];
}

function inferPositionFromLayoutPattern(layoutPattern: string): FalLogoPosition | null {
  const p = layoutPattern.toLowerCase();
  if (p.includes('diagonal') && p.includes('top-left')) return 'top_left';
  if (p.includes('diagonal') || p.includes('wedge')) return 'top_left';
  if (p.includes('split') && p.includes('left')) return 'top_right';
  if (p.includes('split') && p.includes('right')) return 'top_left';
  if (p.includes('masthead') || p.includes('cover')) return 'top_center';
  if (p.includes('quote') || p.includes('frosted')) return 'bottom_right';
  if (p.includes('ticket') || p.includes('event')) return 'top_center';
  if (p.includes('neon') || p.includes('campaign')) return 'top_center';
  return null;
}

function channelFallback(channel: 'feed_post' | 'reel' | 'story'): FalLogoPosition {
  return channel === 'reel' || channel === 'story' ? 'bottom_right' : 'bottom_right';
}

/** Reels/stories with upper headline stacks need logo away from the type zone. */
function adjustLogoPlacementForHeadlineZone(input: {
  placement: ResolvedFalLogoPlacement;
  channel: 'feed_post' | 'reel' | 'story';
  layoutPattern?: string | null;
  typographyMode?: string | null;
}): ResolvedFalLogoPlacement {
  const { placement, channel } = input;
  if (channel !== 'reel' && channel !== 'story') return placement;

  const layoutText = `${input.layoutPattern ?? ''} ${input.typographyMode ?? ''}`.toLowerCase();
  const upperHeadline = /oversized|upper|stack|masthead|full_bleed|bold_display|campaign_hero|poster|headline|typography.*hero|editorial_display|layered_graphics/.test(
    layoutText,
  );
  if (!upperHeadline || !placement.position) return placement;

  const topAnchors: FalLogoPosition[] = ['top_center', 'top_left', 'top_right'];
  if (!topAnchors.includes(placement.position)) return placement;

  return {
    ...placement,
    position: 'bottom_right',
    zoneHint: placement.zoneHint
      ? `${placement.zoneHint} Keep logo bottom-right — headline occupies upper/middle frame.`
      : 'Bottom-right above Instagram UI safe zone — never over the headline stack.',
  };
}

function finalizeFalLogoPlacement(
  placement: ResolvedFalLogoPlacement,
  input: {
    channel: 'feed_post' | 'reel' | 'story';
    layoutPattern?: string | null;
    typographyMode?: string | null;
  },
): ResolvedFalLogoPlacement {
  return adjustLogoPlacementForHeadlineZone({
    placement,
    channel: input.channel,
    layoutPattern: input.layoutPattern,
    typographyMode: input.typographyMode,
  });
}

export function resolveArchetypeLogoPosition(
  archetypeId: string | null | undefined,
): FalLogoPosition | null {
  const id = str(archetypeId) as CanvaArchetypeId;
  if (!id) return null;
  return CANVA_ARCHETYPE_LOGO_POSITION[id] ?? null;
}

export function resolveFalLogoPlacement(input: {
  agentLogoPosition?: unknown;
  agentLogoZone?: unknown;
  canvaArchetypeId?: string | null;
  layoutPattern?: string | null;
  typographyMode?: string | null;
  brandLogoPosition?: FalLogoPosition | null;
  channel?: 'feed_post' | 'reel' | 'story';
}): ResolvedFalLogoPlacement {
  const channel = input.channel ?? 'feed_post';
  const layoutCtx = {
    channel,
    layoutPattern: input.layoutPattern,
    typographyMode: input.typographyMode,
  };
  const agentPosition = parseFalLogoPosition(input.agentLogoPosition);
  const agentZone = str(input.agentLogoZone);

  if (agentPosition) {
    return finalizeFalLogoPlacement({
      position: agentPosition,
      zoneHint: agentZone || null,
      source: 'agent',
    }, layoutCtx);
  }

  if (agentZone.length >= 8) {
    return finalizeFalLogoPlacement({
      position: parseFalLogoPosition(agentZone) ?? inferPositionFromLayoutPattern(agentZone),
      zoneHint: agentZone,
      source: 'agent',
    }, layoutCtx);
  }

  const fromArchetype = resolveArchetypeLogoPosition(input.canvaArchetypeId);
  if (fromArchetype) {
    return finalizeFalLogoPlacement(
      { position: fromArchetype, zoneHint: null, source: 'archetype' },
      layoutCtx,
    );
  }

  const fromLayout = input.layoutPattern
    ? inferPositionFromLayoutPattern(input.layoutPattern)
    : null;
  if (fromLayout) {
    return finalizeFalLogoPlacement(
      { position: fromLayout, zoneHint: null, source: 'archetype' },
      layoutCtx,
    );
  }

  if (input.brandLogoPosition) {
    return finalizeFalLogoPlacement({
      position: input.brandLogoPosition,
      zoneHint: null,
      source: 'brand_default',
    }, layoutCtx);
  }

  return finalizeFalLogoPlacement({
    position: channelFallback(channel),
    zoneHint: null,
    source: 'channel_fallback',
  }, layoutCtx);
}

export function formatFalLogoPlacementDirective(
  placement: ResolvedFalLogoPlacement,
  channel: 'feed_post' | 'reel' | 'story',
): string {
  const parts: string[] = [];
  if (placement.zoneHint) {
    parts.push(`Art director logo zone: ${placement.zoneHint.slice(0, 160)}.`);
  } else if (placement.position) {
    parts.push(
      `Logo anchor: ${formatFalLogoPositionLabel(placement.position)} — chosen to match this layout (source: ${placement.source}).`,
    );
  }
  if (channel === 'reel' || channel === 'story') {
    parts.push('Respect Instagram UI safe zones (top 12%, bottom 15%).');
  }
  parts.push('Keep logo off photo focal points (faces, hands, hero dish/product).');
  return parts.join(' ');
}
