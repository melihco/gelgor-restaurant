import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitAiCostLine = vi.fn();
vi.mock('@/lib/ai-cost-telemetry', () => ({ emitAiCostLine: (...args: unknown[]) => emitAiCostLine(...args) }));

import {
  beginOpenAiPaintSlot,
  bookOpenAiImagePaint,
  catalogOpenAiImageUsd,
  clearOpenAiPaintSlot,
  getOpenAiPaintSlotSpend,
  meteredOpenAiImageUsd,
  recordOpenAiPaintSpend,
  runWithOpenAiImageCostScope,
} from '../openai-image-cost';

describe('openai-image-cost', () => {
  beforeEach(() => {
    emitAiCostLine.mockClear();
    clearOpenAiPaintSlot();
  });

  it('catalog: high portrait gpt-image is a quarter dollar, not a flux $0.04', () => {
    expect(catalogOpenAiImageUsd({ model: 'gpt-image-2', quality: 'high', size: '1024x1536' })).toBeCloseTo(0.25, 3);
    expect(catalogOpenAiImageUsd({ model: 'gpt-image-1', quality: 'medium', size: '1024x1024' })).toBeCloseTo(0.042, 3);
    expect(catalogOpenAiImageUsd({ model: 'gpt-image-1-mini', quality: 'high', size: '1024x1536' })).toBeCloseTo(0.0625, 3);
    expect(catalogOpenAiImageUsd({ model: 'dall-e-3', quality: 'hd' })).toBeCloseTo(0.08, 3);
  });

  it('metered: uses usage tokens when the provider sends them', () => {
    const usd = meteredOpenAiImageUsd('gpt-image-1', {
      input_tokens: 1200,
      output_tokens: 6240,
      input_tokens_details: { image_tokens: 1000, text_tokens: 200 },
    });
    // 200 text × $5 + 1000 image × $10 + 6240 out × $40 per 1M
    expect(usd).toBeCloseTo(0.001 + 0.01 + 0.2496, 4);
    expect(meteredOpenAiImageUsd('gpt-image-1', null)).toBeNull();
    expect(meteredOpenAiImageUsd('gpt-image-1', { input_tokens: 0, output_tokens: 0 })).toBeNull();
  });

  it('books every paint (kept or discarded) with a unique ledger key and scope context', async () => {
    const result = await runWithOpenAiImageCostScope(
      { workspaceId: 'ws-1', missionId: 'm-1', ideaIndex: 3, slotRole: 'fal_designed_post' },
      async (scope) => {
        bookOpenAiImagePaint({ model: 'gpt-image-2', quality: 'high', size: '1024x1536', op: 'edit' });
        bookOpenAiImagePaint({ model: 'gpt-image-2', quality: 'high', size: '1024x1536', op: 'edit' });
        return { usd: scope.spentUsd, paints: scope.paints };
      },
    );
    expect(result.paints).toBe(2);
    expect(result.usd).toBeCloseTo(0.5, 3);
    expect(emitAiCostLine).toHaveBeenCalledTimes(2);
    const [a, b] = emitAiCostLine.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(a.callType).toBe('gpt_image_paint');
    expect(a.missionId).toBe('m-1');
    expect(a.slotKey).toBe('3::fal_designed_post');
    expect(a.persist).toBe(true);
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it('slot register: loop can subtract paints already booked at the source', () => {
    expect(getOpenAiPaintSlotSpend()).toEqual({ usd: 0, paints: 0 });
    beginOpenAiPaintSlot();
    recordOpenAiPaintSpend(0.25, 1);
    recordOpenAiPaintSpend(0.5, 2);
    expect(getOpenAiPaintSlotSpend()).toEqual({ usd: 0.75, paints: 3 });
    clearOpenAiPaintSlot();
    recordOpenAiPaintSpend(0.25);
    expect(getOpenAiPaintSlotSpend()).toEqual({ usd: 0, paints: 0 });
  });
});
