/**
 * Gallery Match Quality Gate — AI judge orchestration tests.
 *
 * These exercise the fail-closed decision logic with an INJECTED judge so no
 * network call is made. Covers multilingual captions and two sectors
 * (local_products_shop + gym).
 */
import { describe, it, expect } from 'vitest';
import {
  confirmGalleryPickWithAiJudge,
  gatePhotoMatchResult,
  type GalleryJudgeInput,
  type GalleryJudgeVerdict,
} from '@/lib/gallery-ai-match-judge';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';

const HONEY = 'https://cdn.example.com/honey.jpg';
const OLIVE_OIL = 'https://cdn.example.com/olive-oil.jpg';
const DUMBBELL = 'https://cdn.example.com/dumbbell.jpg';

function shopGallery(): Record<string, GalleryPhotoMeta> {
  return {
    [HONEY]: { primarySubject: 'honey', contentTags: ['honey', 'bal'], description: 'Honey jars.' },
    [OLIVE_OIL]: { primarySubject: 'olive_oil', contentTags: ['olive oil', 'zeytinyağı'], description: 'Olive oil bottle.' },
  };
}

/** Build a fixed-verdict judge fn for injection. */
function fixedJudge(verdict: GalleryJudgeVerdict | null) {
  return async (_input: GalleryJudgeInput) => verdict;
}

const model = 'gpt-4o-mini';

describe('confirmGalleryPickWithAiJudge — fail-closed gate', () => {
  it('strong deterministic score accepts WITHOUT calling the judge', async () => {
    let called = false;
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Doğal balımız',
      headline: 'Süzme bal',
      subjectKey: 'honey',
      businessType: 'local_products_shop',
      selectedUrl: HONEY,
      deterministicScore: 70,
      galleryAnalysis: shopGallery(),
      candidateUrls: [HONEY, OLIVE_OIL],
      enabled: true,
      judgeFn: async () => {
        called = true;
        return null;
      },
    });
    expect(decision.action).toBe('accept');
    expect(decision.judged).toBe(false);
    expect(called).toBe(false);
  });

  it('accepts a gray-zone pick the judge confirms (Turkish caption)', async () => {
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Süzme çiçek balı raflarda',
      headline: 'Bal çeşitleri',
      subjectKey: 'honey',
      businessType: 'local_products_shop',
      selectedUrl: HONEY,
      deterministicScore: 32,
      galleryAnalysis: shopGallery(),
      candidateUrls: [HONEY, OLIVE_OIL],
      enabled: true,
      judgeFn: fixedJudge({
        pickIndex: 0,
        confidence: 0.9,
        canonicalSubject: 'honey',
        reason: 'jar clearly honey',
        model,
        usage: null,
      }),
    });
    expect(decision.action).toBe('accept');
    expect(decision.url).toBe(HONEY);
    expect(decision.judged).toBe(true);
  });

  it('swaps to the judge-preferred candidate (English caption)', async () => {
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Cold pressed olive oil',
      headline: 'Early harvest',
      subjectKey: 'olive_oil',
      businessType: 'local_products_shop',
      selectedUrl: HONEY,
      deterministicScore: 30,
      galleryAnalysis: shopGallery(),
      candidateUrls: [HONEY, OLIVE_OIL],
      enabled: true,
      // candidates are [selected(HONEY), OLIVE_OIL] → index 1 is olive oil
      judgeFn: fixedJudge({
        pickIndex: 1,
        confidence: 0.88,
        canonicalSubject: 'olive_oil',
        reason: 'olive oil bottle matches caption',
        model,
        usage: null,
      }),
    });
    expect(decision.action).toBe('swap');
    expect(decision.url).toBe(OLIVE_OIL);
  });

  it('fails closed when the judge returns low confidence', async () => {
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Antrenman sonrası protein',
      headline: 'Fitness beslenme',
      subjectKey: 'protein',
      businessType: 'gym',
      selectedUrl: DUMBBELL,
      deterministicScore: 30,
      galleryAnalysis: {
        [DUMBBELL]: { primarySubject: 'dumbbell', contentTags: ['dumbbell', 'halter'], description: 'Dumbbells.' },
      },
      candidateUrls: [DUMBBELL],
      enabled: true,
      judgeFn: fixedJudge({
        pickIndex: 0,
        confidence: 0.3,
        reason: 'not confident it depicts protein product',
        model,
        usage: null,
      }),
    });
    expect(decision.action).toBe('reject');
    expect(decision.url).toBeUndefined();
  });

  it('fails closed when the judge says NONE (pickIndex null)', async () => {
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Bitki çayı seçkimiz',
      headline: 'Herbal tea',
      subjectKey: 'herbal_tea',
      businessType: 'local_products_shop',
      selectedUrl: HONEY,
      deterministicScore: 29,
      galleryAnalysis: shopGallery(),
      candidateUrls: [HONEY, OLIVE_OIL],
      enabled: true,
      judgeFn: fixedJudge({
        pickIndex: null,
        confidence: 0.95,
        reason: 'no herbal tea in gallery',
        rejectReason: 'gallery lacks herbal_tea',
        model,
        usage: null,
      }),
    });
    expect(decision.action).toBe('reject');
    expect(decision.rejectReason).toBeTruthy();
  });

  it('keeps deterministic pick (accept) when the judge is unavailable', async () => {
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Doğal balımız',
      headline: 'Bal',
      subjectKey: 'honey',
      businessType: 'local_products_shop',
      selectedUrl: HONEY,
      deterministicScore: 33,
      galleryAnalysis: shopGallery(),
      candidateUrls: [HONEY, OLIVE_OIL],
      enabled: true,
      judgeFn: fixedJudge(null),
    });
    expect(decision.action).toBe('accept');
    expect(decision.judged).toBe(false);
    expect(decision.url).toBe(HONEY);
  });

  it('does not call the judge when disabled', async () => {
    let called = false;
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Doğal balımız',
      headline: 'Bal',
      subjectKey: 'honey',
      businessType: 'local_products_shop',
      selectedUrl: HONEY,
      deterministicScore: 30,
      galleryAnalysis: shopGallery(),
      candidateUrls: [HONEY, OLIVE_OIL],
      enabled: false,
      judgeFn: async () => {
        called = true;
        return null;
      },
    });
    expect(decision.action).toBe('accept');
    expect(called).toBe(false);
  });
});

describe('gatePhotoMatchResult — batch pre-assignment gate', () => {
  const HONEY = 'https://cdn.example.com/honey.jpg';
  const gallery = (): Record<string, GalleryPhotoMeta> => ({
    [HONEY]: { primarySubject: 'honey', contentTags: ['honey'], description: 'Honey.' },
  });

  it('passes through strong scores without judging', async () => {
    let called = false;
    const out = await gatePhotoMatchResult(
      { url: HONEY, score: 60, reason: 'strong', confidence: 0.9 },
      { caption: 'Bal', headline: 'Süzme bal', businessType: 'local_products_shop', subjectKey: 'honey' },
      gallery(),
      [HONEY],
      { enabled: true, judgeFn: async () => { called = true; return null; } },
    );
    expect(out?.url).toBe(HONEY);
    expect(called).toBe(false);
  });

  it('returns null when judge rejects a gray-zone batch pick', async () => {
    const out = await gatePhotoMatchResult(
      { url: HONEY, score: 32, reason: 'weak', confidence: 0.4 },
      { caption: 'Bitki çayı', headline: 'Herbal tea', businessType: 'local_products_shop', subjectKey: 'herbal_tea' },
      gallery(),
      [HONEY],
      {
        enabled: true,
        judgeFn: async () => ({
          pickIndex: null,
          confidence: 0.9,
          reason: 'no herbal tea',
          model: 'gpt-4o-mini',
          usage: null,
        }),
      },
    );
    expect(out).toBeNull();
  });
});
