/** Stable error codes emitted by auto-produce for factory retry policy. */

export const GALLERY_THEME_MISMATCH_CODE = 'gallery_theme_mismatch';

const GALLERY_THEME_MISMATCH_MESSAGE_MARKERS = [
  'caption–görsel tema çatışması',
  'caption-görsel tema çatışması',
  'gallery_theme_mismatch',
] as const;

/**
 * Pipeline stage that produced a gallery-theme failure. Surfaced in
 * `last_error` so ops can tell WHERE a slot died without replaying the run:
 * - `hard_veto`     — deterministic caption↔photo conflict, rematch exhausted
 * - `judge_reject`  — AI judge failed the pick closed
 * - `no_candidate`  — no gallery photo cleared the pick/escalation chain
 */
export type GalleryMismatchStage = 'hard_veto' | 'judge_reject' | 'no_candidate';

export function galleryThemeMismatchMessage(
  headline: string,
  stage?: GalleryMismatchStage,
): string {
  const snippet = headline.trim().slice(0, 40) || 'içerik';
  const base = `Caption–görsel tema çatışması — "${snippet}" için uygun galeri fotoğrafı yok`;
  return stage ? `${base} [aşama: ${stage}]` : base;
}

/** Failures that will not succeed on retry without new gallery data or ideation edits. */
export function isNonRetryableProductionFailure(
  error?: string | null,
  errorCode?: string | null,
): boolean {
  const code = String(errorCode ?? '').trim().toLowerCase();
  if (code === GALLERY_THEME_MISMATCH_CODE) return true;
  const msg = String(error ?? '').trim().toLowerCase();
  if (!msg) return false;
  return GALLERY_THEME_MISMATCH_MESSAGE_MARKERS.some((marker) => msg.includes(marker));
}
