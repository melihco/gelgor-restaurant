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

  it('maps circuit-open status without claiming balance is empty', () => {
    expect(humanizeProductionSlotError('provider_billing_circuit_open')).toMatch(/kilitli|tekrar dene/i);
    expect(humanizeProductionSlotError('provider_billing_circuit_open')).not.toMatch(/bakiyesi tükendi/);
  });

  it('maps missing library template', () => {
    expect(
      humanizeProductionSlotError(
        'library_template_required: no renderable template for catalog_slot_key=x',
      ),
    ).toMatch(/Marka şablonu yok/);
  });

  it('maps locked slot without saved shell (shop + beach)', () => {
    expect(
      humanizeProductionSlotError(
        'library_template_replica_required: saved shell preview missing for Ürün hero',
      ),
    ).toMatch(/Kayıtlı şablon kabuğu yok/);
    expect(
      humanizeProductionSlotError(
        'library_template_replica_required: saved shell preview unreachable',
      ),
    ).toMatch(/slot o kabuğa kilitli/);
  });
});

describe('isNonRetryableProductionFailure', () => {
  it('detects gallery theme mismatch', () => {
    expect(
      isNonRetryableProductionFailure('Caption–görsel tema çatışması — "Brunch" için uygun galeri fotoğrafı yok'),
    ).toBe(true);
  });

  it('detects gallery volume shortfall by code and by shoot-request copy', () => {
    expect(isNonRetryableProductionFailure(null, 'gallery_volume_shortfall')).toBe(true);
    expect(
      isNonRetryableProductionFailure(
        'Galeride yeterli farklı marka fotoğrafı yok — bu slot için yeni çekim yükleyin',
      ),
    ).toBe(true);
  });
});
