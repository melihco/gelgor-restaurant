/**
 * "+" revise loop — pure helpers.
 *
 * A produced brief card carries a compact `brief_request` snapshot in its
 * metadata. "Düzelt" takes that snapshot + one owner sentence and builds the
 * next brief-produce request: same idea, same look, same photo (unless the
 * note asks for another one), one design, no variants. Rounds are capped so a
 * card is never repainted forever.
 */
import { isBriefOutputType, type BriefOutputType } from '@/lib/brief-intent-resolver';
import {
  BRIEF_DESIGN_DIRECTIONS,
  isBriefDesignDirectionId,
  isBriefGoalId,
  sanitizeBriefDetails,
  type BriefDesignDirectionId,
  type BriefDetails,
  type BriefGoalId,
} from '@/lib/brief-design-direction';

export const BRIEF_MAX_REVISION_ROUNDS = 2;

export interface BriefRequestSnapshot {
  title: string;
  direction: string;
  outputType: BriefOutputType;
  /** Designs (post/story/reel) or slides (carousel). */
  count: number;
  goal: BriefGoalId | null;
  designDirection: BriefDesignDirectionId | null;
  details: BriefDetails;
  lockUserHeadline: boolean;
  photoUrls: string[];
}

export function buildBriefRequestSnapshot(input: {
  title: string;
  direction: string;
  outputType: BriefOutputType;
  count: number;
  goal?: BriefGoalId | null;
  designDirection?: BriefDesignDirectionId | null;
  details?: BriefDetails | null;
  lockUserHeadline?: boolean;
  photoUrls?: string[];
}): BriefRequestSnapshot {
  return {
    title: input.title.trim().slice(0, 120),
    direction: input.direction.trim().slice(0, 600),
    outputType: input.outputType,
    count: Math.max(1, Math.round(Number(input.count) || 1)),
    goal: input.goal ?? null,
    designDirection: input.designDirection ?? null,
    details: sanitizeBriefDetails(input.details ?? {}),
    lockUserHeadline: input.lockUserHeadline === true,
    photoUrls: (input.photoUrls ?? []).filter((u) => typeof u === 'string' && u.trim()).slice(0, 5),
  };
}

export function readBriefRequestSnapshot(
  metadata: Record<string, unknown> | null | undefined,
): BriefRequestSnapshot | null {
  const raw = metadata?.brief_request;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = String(r.title ?? '').trim();
  const outputType = String(r.outputType ?? 'post');
  if (!title || !isBriefOutputType(outputType)) return null;
  return {
    title,
    direction: String(r.direction ?? '').trim(),
    outputType,
    count: Math.max(1, Math.round(Number(r.count) || 1)),
    goal: isBriefGoalId(r.goal) ? r.goal : null,
    designDirection: isBriefDesignDirectionId(r.designDirection) ? r.designDirection : null,
    details: sanitizeBriefDetails(r.details),
    lockUserHeadline: r.lockUserHeadline === true,
    photoUrls: Array.isArray(r.photoUrls) ? r.photoUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0) : [],
  };
}

export function readBriefRevisionRound(metadata: Record<string, unknown> | null | undefined): number {
  const n = Number(metadata?.brief_revision_round);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function canReviseBriefArtifact(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || metadata.source !== 'new_brief') return false;
  if (!readBriefRequestSnapshot(metadata)) return false;
  return readBriefRevisionRound(metadata) < BRIEF_MAX_REVISION_ROUNDS;
}

/** Look id from the stamped variant label ("Cesur" → 'bold'); falls back to the snapshot's pick. */
export function resolveArtifactDesignDirection(
  metadata: Record<string, unknown> | null | undefined,
  fallback: BriefDesignDirectionId | null,
): BriefDesignDirectionId | null {
  const label = String(metadata?.brief_variant_label ?? '').trim().toLowerCase();
  if (label) {
    const hit = BRIEF_DESIGN_DIRECTIONS.find((d) => d.label.toLowerCase() === label || d.id === label);
    if (hit) return hit.id;
  }
  return fallback;
}

const PHOTO_WORD = '(?:foto|fotoğraf|görsel|resim|photo|image|picture)';
const SWAP_WORD = '(?:değiş|farklı|başka|yenile|swap|change|different|another|replace)';
// "\w" has no Turkish letters — use \S and allow up to two words in between ("başka bir görsel").
const WANTS_NEW_PHOTO = new RegExp(
  `${PHOTO_WORD}\\S*(?:\\s+\\S+){0,2}\\s+${SWAP_WORD}|${SWAP_WORD}\\S*(?:\\s+\\S+){0,2}\\s+${PHOTO_WORD}`,
  'iu',
);

/** True when the note asks for a different photo — then the source photo is not pinned. */
export function revisionWantsNewPhoto(note: string): boolean {
  return WANTS_NEW_PHOTO.test(String(note ?? ''));
}

export function sanitizeRevisionNote(note: unknown): string {
  return String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

export interface BriefRevisionProduceBody {
  workspaceId: string;
  title: string;
  extraDirection: string;
  outputType: BriefOutputType;
  count: number;
  photoUrls: string[];
  lockUserHeadline: boolean;
  goal: BriefGoalId | null;
  designDirection: BriefDesignDirectionId | null;
  details: BriefDetails;
  variants: 1;
  revision: { of: string; round: number; note: string };
  background: true;
}

/**
 * Next brief-produce request for a "Düzelt" round. Returns null when the
 * artifact is not revisable (not a brief card, no snapshot, or rounds exhausted).
 */
export function buildBriefRevisionProduceBody(input: {
  workspaceId: string;
  artifactId: string;
  metadata: Record<string, unknown> | null | undefined;
  note: string;
}): BriefRevisionProduceBody | null {
  const snapshot = readBriefRequestSnapshot(input.metadata);
  const note = sanitizeRevisionNote(input.note);
  if (!snapshot || !note) return null;
  const round = readBriefRevisionRound(input.metadata) + 1;
  if (round > BRIEF_MAX_REVISION_ROUNDS) return null;

  const meta = input.metadata ?? {};
  const sourcePhoto = String(meta.selected_gallery_url ?? meta.reference_photo_url ?? '').trim();
  const keepPhoto = !revisionWantsNewPhoto(note);
  const photoUrls = snapshot.photoUrls.length > 0
    ? snapshot.photoUrls
    : keepPhoto && sourcePhoto && snapshot.outputType !== 'carousel'
      ? [sourcePhoto]
      : [];

  return {
    workspaceId: input.workspaceId,
    title: snapshot.title,
    extraDirection: snapshot.direction,
    outputType: snapshot.outputType,
    count: snapshot.outputType === 'carousel' ? snapshot.count : 1,
    photoUrls,
    lockUserHeadline: snapshot.lockUserHeadline,
    goal: snapshot.goal,
    designDirection: resolveArtifactDesignDirection(meta, snapshot.designDirection),
    details: snapshot.details,
    variants: 1,
    revision: { of: input.artifactId, round, note },
    background: true,
  };
}

/** Painter directive for the owner's note — layered last so it wins over the look. */
export function buildRevisionDirective(note: string, round: number): string {
  return `OWNER REVISION (round ${round}, binding — change only this, keep everything else as it was): "${sanitizeRevisionNote(note)}"`;
}
