import { describe, expect, it } from 'vitest';
import {
  humanizeProductionSlotError,
  isNonRetryableProductionFailure,
} from '../production-slot-failures';

describe('humanizeProductionSlotError', () => {
  it('keeps monthly credit limit message', () => {
    const msg = 'Aylık kredi limiti doldu (25,277 / 25,000 SA Kredi)';
    expect(humanizeProductionSlotError(msg)).toBe(msg);
  });

  it('maps fal balance exhaustion', () => {
    expect(
      humanizeProductionSlotError('fal.ai balance exhausted — top up at fal.ai/dashboard/billing'),
    ).toMatch(/bakiyesi tükendi/);
  });

  it('maps missing library template', () => {
    expect(
      humanizeProductionSlotError(
        'library_template_required: no renderable template for catalog_slot_key=x',
      ),
    ).toMatch(/Marka şablonu yok/);
  });
});

describe('isNonRetryableProductionFailure', () => {
  it('detects gallery theme mismatch', () => {
    expect(
      isNonRetryableProductionFailure('Caption–görsel tema çatışması — "Brunch" için uygun galeri fotoğrafı yok'),
    ).toBe(true);
  });
});
