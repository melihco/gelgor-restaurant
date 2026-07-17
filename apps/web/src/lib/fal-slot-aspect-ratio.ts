/**
 * Aspect ratio SSOT for fal production slots.
 * Reels/stories are always 9:16 — never animate a 4:5 feed still into a "reel".
 */

export type FalSlotAspectRatio = '9:16' | '4:5' | '1:1';

export function isReelLikeSlot(input: {
  pipeline?: string | null;
  slotRole?: string | null;
  formatHint?: string | null;
  kind?: string | null;
}): boolean {
  const hay = [
    input.pipeline,
    input.slotRole,
    input.formatHint,
    input.kind,
  ].map((v) => String(v ?? '').toLowerCase()).join(' ');
  // Underscore roles like `organic_reel` are not `\breel\b` ( `_` is a word char ).
  return /(?:^|[^a-z0-9])reel(?:[^a-z0-9]|$)|_reel|reel_|instagram_reel|fal_reel|fal_only_reel|campaign_reel|organic_reel/.test(hay);
}

export function isStoryLikeSlot(input: {
  pipeline?: string | null;
  slotRole?: string | null;
  formatHint?: string | null;
  kind?: string | null;
}): boolean {
  const hay = [
    input.pipeline,
    input.slotRole,
    input.formatHint,
    input.kind,
  ].map((v) => String(v ?? '').toLowerCase()).join(' ');
  return /\bstory\b|instagram_story|instagram_canvas|fal_story|fal_only_story/.test(hay)
    && !isReelLikeSlot(input);
}

/** Resolve canvas aspect for a production slot. */
export function resolveFalSlotAspectRatio(input: {
  isPaidAd?: boolean;
  pipeline?: string | null;
  slotRole?: string | null;
  formatHint?: string | null;
  kind?: string | null;
  /** Explicit override from calendar/design card */
  explicit?: FalSlotAspectRatio | null;
}): FalSlotAspectRatio {
  if (input.explicit === '9:16' || input.explicit === '4:5' || input.explicit === '1:1') {
    return input.explicit;
  }
  if (input.isPaidAd) return '4:5';
  if (isReelLikeSlot(input) || isStoryLikeSlot(input)) return '9:16';
  return '4:5';
}
