/**
 * Faz 0/1 — AI maliyet telemetrisi + enhance policy regresyon testleri.
 *
 * Amaç: yeni telemetri ve flag'li optimizasyonların (1) hatasız çalıştığını,
 * (2) varsayılanda mevcut davranışı bozmadığını doğrulamak.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { estimateOpenAiUsd, emitAiCostLine, emitQualityEvent } from '@/lib/ai-cost-telemetry';
import {
  shouldRunGptImageEnhance,
  resolveGptEnhanceSkipReason,
  GALLERY_ENHANCE_SKIP_MIN_SCORE,
  type GptEnhancePolicyInput,
} from '@/lib/gpt-enhance-policy';
import type { AiVisualProductionStandard } from '@/lib/ai-visual-production-standard';

describe('estimateOpenAiUsd', () => {
  it('returns 0 for missing usage', () => {
    expect(estimateOpenAiUsd('gpt-4o', null)).toBe(0);
    expect(estimateOpenAiUsd('gpt-4o', undefined)).toBe(0);
  });

  it('computes gpt-4o cost from tokens', () => {
    // 1000 input + 500 output @ gpt-4o ($2.5/$10 per 1M)
    const usd = estimateOpenAiUsd('gpt-4o', { prompt_tokens: 1000, completion_tokens: 500 });
    expect(usd).toBeCloseTo(0.0025 + 0.005, 5);
  });

  it('applies cached-input discount', () => {
    const full = estimateOpenAiUsd('gpt-4o', { prompt_tokens: 10000, completion_tokens: 0 });
    const cached = estimateOpenAiUsd('gpt-4o', {
      prompt_tokens: 10000,
      completion_tokens: 0,
      prompt_tokens_details: { cached_tokens: 10000 },
    });
    // tamamı cache → yarı fiyat
    expect(cached).toBeCloseTo(full / 2, 6);
  });

  it('uses cheaper rate for gpt-4o-mini', () => {
    const mini = estimateOpenAiUsd('gpt-4o-mini', { prompt_tokens: 1000, completion_tokens: 1000 });
    const full = estimateOpenAiUsd('gpt-4o', { prompt_tokens: 1000, completion_tokens: 1000 });
    expect(mini).toBeLessThan(full);
  });
});

describe('telemetry emit — never throws', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); delete process.env.AI_COST_TELEMETRY; });

  it('emits a structured cost line', () => {
    emitAiCostLine({ callType: 'grafiker_vision', usd: 0.01, model: 'gpt-4o', attempt: 0 });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const arg = String(logSpy.mock.calls[0]?.[0] ?? '');
    expect(arg.startsWith('[ai-cost] ')).toBe(true);
    const parsed = JSON.parse(arg.replace('[ai-cost] ', ''));
    expect(parsed.callType).toBe('grafiker_vision');
    expect(parsed.usd).toBe(0.01);
  });

  it('emits a structured quality event', () => {
    emitQualityEvent({ event: 'grafiker', pass: true, score: 9, attempt: 0 });
    const arg = String(logSpy.mock.calls[0]?.[0] ?? '');
    expect(arg.startsWith('[ai-quality] ')).toBe(true);
  });

  it('respects AI_COST_TELEMETRY=false', () => {
    process.env.AI_COST_TELEMETRY = 'false';
    emitAiCostLine({ callType: 'other', usd: 1 });
    emitQualityEvent({ event: 'fallback', transition: 'flux->openai' });
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe('Faz 1.4 — designed_post enhance skip flag', () => {
  const visualStandard = {
    enabled: true,
    enhanceGallerySelected: false,
    adaptiveScene: false,
    formats: new Set(['post', 'story', 'carousel', 'reel']),
  } as unknown as AiVisualProductionStandard;

  const baseInput = (overrides: Partial<GptEnhancePolicyInput> = {}): GptEnhancePolicyInput => ({
    visualStandard,
    contentKind: 'instagram_post',
    assignment: { pipeline: 'fal_design', slot_role: 'designed_post' } as GptEnhancePolicyInput['assignment'],
    businessType: 'restaurant',
    galleryMatchScore: GALLERY_ENHANCE_SKIP_MIN_SCORE + 5,
    pickedFromBrandGallery: true,
    referenceIsStock: false,
    designedPostPhotoEnhance: true,
    ...overrides,
  });

  it('DEFAULT (flag off): designed_post bg enhance still allowed', () => {
    const input = baseInput({ skipEnhanceForRemotionGrade: false });
    expect(resolveGptEnhanceSkipReason(input)).not.toBe('remotion_grade');
  });

  it('flag on + strong gallery match → skip with remotion_grade', () => {
    const input = baseInput({ skipEnhanceForRemotionGrade: true });
    expect(resolveGptEnhanceSkipReason(input)).toBe('remotion_grade');
    expect(shouldRunGptImageEnhance(input)).toBe(false);
  });

  it('flag on but weak match → NOT skipped (quality preserved)', () => {
    const input = baseInput({
      skipEnhanceForRemotionGrade: true,
      galleryMatchScore: GALLERY_ENHANCE_SKIP_MIN_SCORE - 10,
    });
    expect(resolveGptEnhanceSkipReason(input)).not.toBe('remotion_grade');
  });

  it('flag on but stock photo → NOT skipped', () => {
    const input = baseInput({ skipEnhanceForRemotionGrade: true, referenceIsStock: true });
    expect(resolveGptEnhanceSkipReason(input)).not.toBe('remotion_grade');
  });
});
