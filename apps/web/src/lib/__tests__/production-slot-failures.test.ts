import { describe, expect, it } from 'vitest';
import {
  GALLERY_THEME_MISMATCH_CODE,
  galleryThemeMismatchMessage,
  isNonRetryableProductionFailure,
} from '@/lib/production-slot-failures';

describe('production-slot-failures', () => {
  it('galleryThemeMismatchMessage uses stable Turkish copy', () => {
    expect(galleryThemeMismatchMessage('Erken hasat zeytinyağı')).toBe(
      'Caption–görsel tema çatışması — "Erken hasat zeytinyağı" için uygun galeri fotoğrafı yok',
    );
  });

  it('appends a machine-readable stage tag when provided', () => {
    expect(galleryThemeMismatchMessage('Bal Çeşitlerimiz', 'judge_reject')).toBe(
      'Caption–görsel tema çatışması — "Bal Çeşitlerimiz" için uygun galeri fotoğrafı yok [aşama: judge_reject]',
    );
    expect(galleryThemeMismatchMessage('Reçel', 'hard_veto')).toContain('[aşama: hard_veto]');
  });

  it('isNonRetryableProductionFailure matches errorCode and message markers', () => {
    expect(
      isNonRetryableProductionFailure(
        galleryThemeMismatchMessage('Reçel'),
        GALLERY_THEME_MISMATCH_CODE,
      ),
    ).toBe(true);
    // Stage-tagged messages must stay non-retryable (marker still present).
    expect(
      isNonRetryableProductionFailure(galleryThemeMismatchMessage('Bal', 'judge_reject')),
    ).toBe(true);
    expect(isNonRetryableProductionFailure('Remotion 422')).toBe(false);
  });
});
