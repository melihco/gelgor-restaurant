import type { UUID } from './common';
import type { ProductionBrandContextSnapshot } from './production';

/** Studio process / artifact stamp. Bump when the SlotTicket shape changes. */
export const STUDIO_VERSION = '1.0.0';

export type StudioStage = 'bind' | 'paint' | 'motion' | 'gate';

export type StudioFormat = 'post' | 'story' | 'reel' | 'carousel';

export type StudioPhotoRole =
  | 'product_for_sale'
  | 'table_prop'
  | 'venue'
  | 'people'
  | 'scene_fill';

export type StudioShellDirection =
  | 'product_hero'
  | 'venue_ambiance'
  | 'social_proof'
  | 'event';

/**
 * Immutable vitrine card. Same fields as the web FeedSlotPack.
 * Paint and motion only read this. Empty field = no card.
 */
export interface StudioFeedPack {
  slotJob: string;
  photoUrl: string;
  photoRole: StudioPhotoRole;
  caption: string;
  headline: string;
  shellDirection: StudioShellDirection;
  evidenceNote: string;
}

export type BindFailureCode =
  | 'missing_slot_job'
  | 'missing_photo'
  | 'missing_caption'
  | 'missing_headline'
  | 'missing_evidence'
  | 'headline_not_from_caption'
  | 'prop_cannot_sell'
  | 'product_needs_identity'
  | 'place_cannot_sell'
  | 'copy_misses_evidence'
  | 'empty_place_command'
  | 'look_unavailable'
  | 'no_pick'
  | 'incomplete_headline';

export interface BindFailure {
  ok: false;
  stage: 'bind';
  codes: BindFailureCode[];
  message: string;
}

export interface StudioIdeaSlice {
  headline?: string;
  caption?: string;
  purpose?: string;
  subjectKey?: string;
  visualDirection?: string;
}

export interface StudioMotionSpec {
  recipe?: Record<string, unknown>;
  audioMood?: string;
}

/**
 * One slot, one ticket. Locked before paint.
 * Crew writes idea copy; bind writes pack; paint does not rewrite pack.
 */
export interface SlotTicket {
  studioVersion: string;
  workspaceId: UUID;
  missionId?: UUID;
  slotKey: string;
  format: StudioFormat;
  slotRole: string;
  pipeline: string;
  catalogSlotKey?: string;
  idea: StudioIdeaSlice;
  pack?: StudioFeedPack;
  brandSnapshot?: ProductionBrandContextSnapshot;
  motion?: StudioMotionSpec;
}

export type StudioDisposition = 'ready' | 'failed' | 'deferred' | 'withheld';

export interface StudioPaintStamp {
  engine: string;
  imageUrl?: string;
  satoriEscapeUsed: boolean;
}

export interface StudioMotionStamp {
  videoUrl?: string;
  audioMuxed?: boolean;
  skipped: boolean;
}

export interface StudioGateStamp {
  publishReady: boolean;
  blockFeed: boolean;
  blockCode: string | null;
  reason: string | null;
}

export interface StudioResultOk {
  ok: true;
  studioVersion: string;
  stage: 'gate';
  ticket: SlotTicket;
  pack: StudioFeedPack;
  paint: StudioPaintStamp;
  motion: StudioMotionStamp;
  gate: StudioGateStamp;
  disposition: StudioDisposition;
}

export interface StudioResultFail {
  ok: false;
  studioVersion: string;
  stage: StudioStage;
  ticket: SlotTicket;
  bind?: BindFailure;
  paint?: StudioPaintStamp;
  motion?: StudioMotionStamp;
  gate?: StudioGateStamp;
  disposition: StudioDisposition;
  error: string;
}

export type StudioResult = StudioResultOk | StudioResultFail;

export const STUDIO_PHOTO_ROLES: readonly StudioPhotoRole[] = [
  'product_for_sale',
  'table_prop',
  'venue',
  'people',
  'scene_fill',
] as const;

export const STUDIO_SHELLS: readonly StudioShellDirection[] = [
  'product_hero',
  'venue_ambiance',
  'social_proof',
  'event',
] as const;

export function isStudioPhotoRole(value: string): value is StudioPhotoRole {
  return (STUDIO_PHOTO_ROLES as readonly string[]).includes(value);
}

export function isStudioShell(value: string): value is StudioShellDirection {
  return (STUDIO_SHELLS as readonly string[]).includes(value);
}

/** Structural pack check only — semantic sell/place rules stay in web feed-slot-pack. */
export function parseStudioFeedPack(
  input: Partial<StudioFeedPack> | null | undefined,
): { ok: true; pack: StudioFeedPack } | { ok: false; codes: BindFailureCode[] } {
  const codes: BindFailureCode[] = [];
  if (!input) {
    return { ok: false, codes: ['missing_slot_job', 'missing_photo', 'missing_caption', 'missing_headline', 'missing_evidence'] };
  }
  if (!String(input.slotJob ?? '').trim()) codes.push('missing_slot_job');
  if (!String(input.photoUrl ?? '').trim()) codes.push('missing_photo');
  if (!String(input.caption ?? '').trim()) codes.push('missing_caption');
  if (!String(input.headline ?? '').trim()) codes.push('missing_headline');
  if (!String(input.evidenceNote ?? '').trim()) codes.push('missing_evidence');
  if (!isStudioPhotoRole(String(input.photoRole ?? ''))) codes.push('missing_photo');
  if (!isStudioShell(String(input.shellDirection ?? ''))) codes.push('missing_evidence');
  if (codes.length) return { ok: false, codes: [...new Set(codes)] };
  return {
    ok: true,
    pack: {
      slotJob: String(input.slotJob).trim(),
      photoUrl: String(input.photoUrl).trim(),
      photoRole: input.photoRole as StudioPhotoRole,
      caption: String(input.caption).trim(),
      headline: String(input.headline).trim(),
      shellDirection: input.shellDirection as StudioShellDirection,
      evidenceNote: String(input.evidenceNote).trim(),
    },
  };
}
