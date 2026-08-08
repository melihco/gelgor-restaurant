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
  escalateSubjectAlignedPick,
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
  it('subject-aligned strong score still judges strict food captions (vision)', async () => {
    const FOOD = 'https://cdn.example.com/plated-dish.jpg';
    let called = false;
    let sawVision = false;
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Dive into the rich flavors of our signature dishes!',
      headline: 'Signature Dishes',
      businessType: 'beach_club',
      selectedUrl: FOOD,
      deterministicScore: 70,
      galleryAnalysis: {
        [FOOD]: {
          primarySubject: 'pasta_dish',
          contentTags: ['food', 'dish', 'plate'],
          description: 'Plated pasta.',
        },
      },
      candidateUrls: [FOOD],
      enabled: true,
      judgeFn: async (input) => {
        called = true;
        sawVision = Boolean(input.useVision);
        return {
          pickIndex: 0,
          confidence: 0.95,
          reason: 'plated dish matches signature dishes',
          model,
          usage: null,
        };
      },
    });
    expect(called).toBe(true);
    expect(sawVision).toBe(true);
    expect(decision.action).toBe('accept');
    expect(decision.judged).toBe(true);
    expect(decision.url).toBe(FOOD);
  });

  it('subject-aligned strong product pick may skip judge (SKU meaning via subject_key, not keyword lists)', async () => {
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

  it('non-strict subject-aligned strong score skips the judge (gym)', async () => {
    const MAT = 'https://cdn.example.com/yoga-mat.jpg';
    let called = false;
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Recover after training on the mat',
      headline: 'Recovery',
      subjectKey: 'yoga_mat',
      businessType: 'gym',
      selectedUrl: MAT,
      deterministicScore: 70,
      galleryAnalysis: {
        [MAT]: {
          primarySubject: 'yoga_mat',
          contentTags: ['yoga', 'mat'],
          description: 'Yoga mat on floor',
        },
      },
      candidateUrls: [MAT],
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

  it('any caption without subject lock still judges at a strong score', async () => {
    const VENUE = 'https://cdn.example.com/terrace.jpg';
    const CROWD = 'https://cdn.example.com/crowd.jpg';
    let called = false;
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Join us for an unforgettable evening by the sea',
      headline: 'Special night',
      // no subjectKey — meaning gate must run for arbitrary copy
      businessType: 'beach_club',
      selectedUrl: VENUE,
      deterministicScore: 70,
      galleryAnalysis: {
        [VENUE]: {
          contentTags: ['terrace', 'daylight', 'breakfast'],
          description: 'Sunny breakfast terrace',
          primarySubject: 'breakfast_plate',
        },
        [CROWD]: {
          contentTags: ['crowd', 'evening', 'lights'],
          description: 'Evening crowd by the sea',
          primarySubject: 'venue_ambiance',
        },
      },
      candidateUrls: [VENUE, CROWD],
      enabled: true,
      judgeFn: async () => {
        called = true;
        return {
          pickIndex: 1,
          confidence: 0.9,
          reason: 'evening crowd matches evening caption',
          model,
          usage: null,
        };
      },
    });
    expect(called).toBe(true);
    expect(decision.action).toBe('swap');
    expect(decision.url).toBe(CROWD);
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
      // Hard product veto prunes honey — shortlist is [OLIVE_OIL] only.
      judgeFn: async (input) => {
        expect(input.candidates.map((c) => c.url)).toEqual([OLIVE_OIL]);
        return {
          pickIndex: 0,
          confidence: 0.88,
          canonicalSubject: 'olive_oil',
          reason: 'olive oil bottle matches caption',
          model,
          usage: null,
        };
      },
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

describe('confirmGalleryPickWithAiJudge — theme risk forces AI', () => {
  const STEAK = 'https://cdn.example.com/steak.jpg';
  const COCKTAIL = 'https://cdn.example.com/cocktail.jpg';
  const drinkGallery = (): Record<string, GalleryPhotoMeta> => ({
    [STEAK]: {
      contentTags: ['steak', 'meat', 'plate', 'food'],
      description: 'Grilled steak on a plate',
      suggestedAssetType: 'food_drink_photo',
    },
    [COCKTAIL]: {
      contentTags: ['cocktail', 'drink', 'glass', 'bar'],
      description: 'Colorful cocktail in a glass',
      suggestedAssetType: 'food_drink_photo',
    },
  });

  it('beach_club: strong score still judges cocktail caption vs steak photo', async () => {
    let called = false;
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Yazın serinletici kokteyllerine hazır mısın?',
      headline: 'Kokteyl',
      businessType: 'beach_club',
      selectedUrl: STEAK,
      deterministicScore: 70,
      galleryAnalysis: drinkGallery(),
      candidateUrls: [STEAK, COCKTAIL],
      enabled: true,
      judgeFn: async () => {
        called = true;
        return {
          pickIndex: 1,
          confidence: 0.92,
          reason: 'cocktail glass matches drink caption',
          model,
          usage: null,
        };
      },
    });
    expect(called).toBe(true);
    expect(decision.action).toBe('swap');
    expect(decision.url).toBe(COCKTAIL);
    expect(decision.judged).toBe(true);
  });

  it('rejects theme-risk pick when AI judge is disabled (fail closed)', async () => {
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Yazın serinletici kokteyllerine hazır mısın?',
      headline: 'Kokteyl',
      businessType: 'beach_club',
      selectedUrl: STEAK,
      deterministicScore: 70,
      galleryAnalysis: drinkGallery(),
      candidateUrls: [STEAK, COCKTAIL],
      enabled: false,
    });
    expect(decision.action).toBe('reject');
    // Cocktail is a strict category trigger — fail-closed reason may be strict or theme.
    expect(['ai_judge_required_for_theme', 'ai_judge_required_for_strict_caption'])
      .toContain(decision.rejectReason);
  });

  it('beach_club: rejects no-subject-lock pick when judge disabled (fail closed)', async () => {
    const VENUE = 'https://cdn.example.com/terrace.jpg';
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Join us for an unforgettable evening by the sea',
      headline: 'Special night',
      businessType: 'beach_club',
      selectedUrl: VENUE,
      deterministicScore: 70,
      galleryAnalysis: {
        [VENUE]: {
          contentTags: ['terrace', 'daylight', 'breakfast'],
          description: 'Sunny breakfast terrace',
          primarySubject: 'breakfast_plate',
        },
      },
      candidateUrls: [VENUE],
      enabled: false,
    });
    expect(decision.action).toBe('reject');
    expect(decision.rejectReason).toBe('ai_judge_required_without_subject_lock');
  });

  it('local_products_shop: judge transport failure without subject lock fails closed', async () => {
    const decision = await confirmGalleryPickWithAiJudge({
      caption: 'Raflarda yeni ürünler',
      headline: 'Yeni gelenler',
      businessType: 'local_products_shop',
      selectedUrl: HONEY,
      deterministicScore: 40,
      galleryAnalysis: shopGallery(),
      candidateUrls: [HONEY, OLIVE_OIL],
      enabled: true,
      judgeFn: fixedJudge(null),
    });
    expect(decision.action).toBe('reject');
    expect(decision.rejectReason).toBe('ai_judge_required_without_subject_lock');
  });

});

describe('gatePhotoMatchResult — batch pre-assignment gate', () => {
  const HONEY = 'https://cdn.example.com/honey.jpg';
  const gallery = (): Record<string, GalleryPhotoMeta> => ({
    [HONEY]: { primarySubject: 'honey', contentTags: ['honey'], description: 'Honey.' },
  });

  it('always judges strict food captions even at strong scores', async () => {
    const FOOD = 'https://cdn.example.com/food-plate.jpg';
    let called = false;
    const out = await gatePhotoMatchResult(
      { url: FOOD, score: 60, reason: 'strong', confidence: 0.9 },
      {
        caption: 'Signature dishes on the menu tonight',
        headline: 'Signature Dishes',
        businessType: 'beach_club',
      },
      {
        [FOOD]: {
          primarySubject: 'pasta_dish',
          contentTags: ['food', 'dish'],
          description: 'Plated dish.',
        },
      },
      [FOOD],
      {
        enabled: true,
        judgeFn: async (input) => {
          called = true;
          expect(input.useVision).toBe(true);
          return {
            pickIndex: 0,
            confidence: 0.9,
            reason: 'food ok',
            model,
            usage: null,
          };
        },
      },
    );
    expect(out?.url).toBe(FOOD);
    expect(called).toBe(true);
  });

  it('beach_club: Signature Dishes rejects fashion portrait and swaps to food', async () => {
    const FASHION = 'https://cdn.example.com/woman-dress.jpg';
    const FOOD = 'https://cdn.example.com/plated-dish.jpg';
    const out = await gatePhotoMatchResult(
      { url: FASHION, score: 39, reason: 'people affinity', confidence: 0.5 },
      {
        caption:
          'Dive into the rich flavors of our signature dishes! Every meal is a celebration.',
        headline: 'Signature Dishes',
        businessType: 'beach_club',
      },
      {
        [FASHION]: {
          contentTags: ['woman', 'dress', 'fashion', 'portrait'],
          description: 'Woman in a silk dress posing on a patio.',
          hasPeople: true,
          suggestedAssetType: 'event_photo',
        },
        [FOOD]: {
          contentTags: ['food', 'dish', 'plate', 'pasta'],
          description: 'Plated gourmet pasta dish.',
          suggestedAssetType: 'food_drink_photo',
        },
      },
      [FASHION, FOOD],
      {
        enabled: true,
        judgeFn: async (input) => {
          expect(input.useVision).toBe(true);
          // Fashion must not be in the shortlist when hard-vetoed.
          expect(input.candidates.some((c) => c.url === FASHION)).toBe(false);
          expect(input.candidates[0]?.url).toBe(FOOD);
          return {
            pickIndex: 0,
            confidence: 0.93,
            reason: 'plated dish matches signature dishes',
            model,
            usage: null,
          };
        },
      },
    );
    expect(out?.url).toBe(FOOD);
    expect(out?.reason).toMatch(/ai_judge_swap/);
  });

  it('beach_club: Signature Dishes with only fashion photos fails closed', async () => {
    const FASHION = 'https://cdn.example.com/woman-dress-only.jpg';
    const out = await gatePhotoMatchResult(
      { url: FASHION, score: 39, reason: 'people', confidence: 0.5 },
      {
        caption: 'Signature dishes and Aegean flavors on the menu tonight.',
        headline: 'Signature Dishes',
        businessType: 'beach_club',
      },
      {
        [FASHION]: {
          contentTags: ['woman', 'dress', 'fashion', 'portrait'],
          description: 'Fashion portrait of a guest in evening wear.',
          hasPeople: true,
        },
      },
      [FASHION],
      {
        enabled: true,
        judgeFn: async () => {
          throw new Error('judge must not run when every candidate is hard-vetoed');
        },
      },
    );
    expect(out).toBeNull();
  });

  it('judges strong scores when subject is not locked (gym)', async () => {
    const MAT = 'https://cdn.example.com/yoga-mat.jpg';
    let called = false;
    const out = await gatePhotoMatchResult(
      { url: MAT, score: 60, reason: 'strong', confidence: 0.9 },
      { caption: 'Recover after training', headline: 'Recovery day', businessType: 'gym' },
      { [MAT]: { contentTags: ['yoga', 'mat'], description: 'Yoga mat on floor', primarySubject: 'yoga_mat' } },
      [MAT],
      {
        enabled: true,
        judgeFn: async () => {
          called = true;
          return {
            pickIndex: 0,
            confidence: 0.88,
            reason: 'acceptable recovery mood',
            model,
            usage: null,
          };
        },
      },
    );
    expect(out?.url).toBe(MAT);
    expect(called).toBe(true);
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

describe('escalateSubjectAlignedPick — sub-threshold judge escalation', () => {
  const THYME_HONEY = 'https://cdn.example.com/thyme-honey.jpg';
  const YOGA_MAT = 'https://cdn.example.com/yoga-mat.jpg';

  /** Sparse vision meta — deterministic score stays low, but the canonical
   * subject relation to a "honey" caption is a match (thyme_honey ⊃ honey). */
  const sparseShopGallery = (): Record<string, GalleryPhotoMeta> => ({
    [THYME_HONEY]: { primarySubject: 'thyme_honey', contentTags: [], description: '' },
  });

  const gymGallery = (): Record<string, GalleryPhotoMeta> => ({
    [YOGA_MAT]: { primarySubject: 'yoga_mat', contentTags: ['yoga'], description: 'Yoga mat on floor.' },
  });

  it('rescues a subject-aligned pick the judge confirms (local_products_shop)', async () => {
    const out = await escalateSubjectAlignedPick(
      { caption: 'Bal çeşitlerimiz raflarda', headline: 'Bal Çeşitlerimiz', businessType: 'local_products_shop', subjectKey: 'honey' },
      sparseShopGallery(),
      [THYME_HONEY],
      {
        enabled: true,
        judgeFn: fixedJudge({
          pickIndex: 0,
          confidence: 0.9,
          canonicalSubject: 'honey',
          reason: 'thyme honey jar satisfies generic honey caption',
          model,
          usage: null,
        }),
      },
    );
    expect(out?.url).toBe(THYME_HONEY);
    expect(out?.reason).toContain('judge_escalation');
  });

  it('fails closed when the judge rejects the escalated candidate', async () => {
    const out = await escalateSubjectAlignedPick(
      { caption: 'Bal çeşitlerimiz', headline: 'Bal', businessType: 'local_products_shop', subjectKey: 'honey' },
      sparseShopGallery(),
      [THYME_HONEY],
      {
        enabled: true,
        judgeFn: fixedJudge({
          pickIndex: null,
          confidence: 0.9,
          reason: 'label unreadable, cannot confirm honey',
          rejectReason: 'uncertain product',
          model,
          usage: null,
        }),
      },
    );
    expect(out).toBeNull();
  });

  it('returns null when the judge is unavailable (error) — no invented match', async () => {
    const out = await escalateSubjectAlignedPick(
      { caption: 'Bal çeşitlerimiz', headline: 'Bal', businessType: 'local_products_shop', subjectKey: 'honey' },
      sparseShopGallery(),
      [THYME_HONEY],
      { enabled: true, judgeFn: fixedJudge(null) },
    );
    expect(out).toBeNull();
  });

  it('returns null without judging when disabled', async () => {
    const out = await escalateSubjectAlignedPick(
      { caption: 'Bal çeşitlerimiz', headline: 'Bal', businessType: 'local_products_shop', subjectKey: 'honey' },
      sparseShopGallery(),
      [THYME_HONEY],
      { enabled: false },
    );
    expect(out).toBeNull();
  });

  it('never calls the judge when no candidate subject-aligns (gym sector)', async () => {
    let called = false;
    const out = await escalateSubjectAlignedPick(
      { caption: 'Protein tozu çeşitlerimiz', headline: 'Protein ürünleri', businessType: 'gym', subjectKey: 'protein_powder' },
      gymGallery(),
      [YOGA_MAT],
      {
        enabled: true,
        judgeFn: async () => {
          called = true;
          return null;
        },
      },
    );
    expect(out).toBeNull();
    expect(called).toBe(false);
  });

  it('returns null when the caption has no concrete subject', async () => {
    let called = false;
    const out = await escalateSubjectAlignedPick(
      { caption: 'Harika bir hafta sonu!', headline: 'Mutlu anlar', businessType: 'gym' },
      gymGallery(),
      [YOGA_MAT],
      {
        enabled: true,
        judgeFn: async () => {
          called = true;
          return null;
        },
      },
    );
    expect(out).toBeNull();
    expect(called).toBe(false);
  });
});
