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

/** Short operator-facing copy for flip cards / checklist (keeps technical detail when useful). */
export function humanizeProductionSlotError(error?: string | null): string | null {
  const raw = String(error ?? '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('aylık kredi limiti') || lower.includes('sa kredi')) {
    return raw.length > 90 ? `${raw.slice(0, 87)}…` : raw;
  }
  if (lower.includes('fal.ai balance exhausted') || lower.includes('exhausted balance')) {
    return 'fal.ai bakiyesi tükendi — billing’den yükleme gerekir';
  }
  if (lower.includes('gallery_theme_mismatch') || lower.includes('caption–görsel') || lower.includes('caption-görsel')) {
    return raw.length > 90 ? `${raw.slice(0, 87)}…` : raw;
  }
  if (lower.includes('library_template_required') || lower.includes('no renderable template')) {
    return 'Marka şablonu yok — Şablon Kütüphanesi’nden önizleme üretin';
  }
  if (lower.includes('erişilemiyor') || lower.includes('expired') || lower.includes('geçersiz url')) {
    return 'Galeri fotoğrafı erişilemiyor — Galeri’den yenileyin';
  }
  if (lower.includes('production_in_flight') || lower.includes('enqueue_failed')) {
    return 'Üretim kuyruğu meşgul — tekrar deneyin';
  }
  return raw.length > 90 ? `${raw.slice(0, 87)}…` : raw;
}
