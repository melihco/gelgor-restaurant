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

  it('isNonRetryableProductionFailure matches errorCode and message markers', () => {
    expect(
      isNonRetryableProductionFailure(
        galleryThemeMismatchMessage('Reçel'),
        GALLERY_THEME_MISMATCH_CODE,
      ),
    ).toBe(true);
    expect(isNonRetryableProductionFailure('Remotion 422')).toBe(false);
  });
});
