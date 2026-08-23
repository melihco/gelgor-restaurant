import { describe, expect, it } from 'vitest';
import {
  buildOperatorTypeBudget,
  inferTypeBudgetFromSample,
  parseTemplateTypeBudget,
  planTypeBudgetBackfill,
  resolveTypeBudgetForRegenerate,
  seedGeneratedTypeBudget,
} from '../template-type-budget';
import {
  fitMissionOverlayToTemplateBudget,
  resolveTemplateOverlayCopyBudget,
} from '../fal-caption-headline';

describe('template-type-budget SSOT', () => {
  it('parses camel/snake and clamps headline bounds', () => {
    const budget = parseTemplateTypeBudget({
      headline: { max_chars: 2, max_words: 99, max_lines: 0 },
      source: 'operator',
    });
    expect(budget).not.toBeNull();
    expect(budget!.headline.maxChars).toBe(8);
    expect(budget!.headline.maxWords).toBe(6);
    expect(budget!.headline.maxLines).toBe(1);
    expect(budget!.source).toBe('operator');
  });

  it('seeds generated budget from sample for beach_club punchline', () => {
    const budget = seedGeneratedTypeBudget({
      sampleHeadline: 'DJ Night',
      sampleSubtitle: 'Bu Gece',
      showSubline: true,
    });
    expect(budget.source).toBe('generated');
    expect(budget.headline.maxWords).toBe(2);
    expect(budget.headline.maxChars).toBe(8);
    expect(budget.subtitle?.maxWords).toBe(2);
  });

  it('seeds kids_party_venue sample without subtitle when showSubline false', () => {
    const budget = inferTypeBudgetFromSample({
      sampleHeadline: 'Doğum Günü',
      sampleSubtitle: 'Parti',
      showSubline: false,
      source: 'migrated_from_sample',
    });
    expect(budget.source).toBe('migrated_from_sample');
    expect(budget.headline.maxWords).toBe(2);
    expect(budget.subtitle).toBeNull();
  });

  it('preserves operator budget on regenerate', () => {
    const operator = buildOperatorTypeBudget({
      headline: { maxChars: 16, maxWords: 2, maxLines: 1 },
      showSubline: false,
    });
    const next = resolveTypeBudgetForRegenerate({
      existingSpec: { type_budget: operator },
      nextSampleHeadline: 'Çok daha uzun yeni punchline',
      nextShowSubline: true,
    });
    expect(next).toEqual(operator);
  });

  it('re-seeds non-operator budget from next sample', () => {
    const next = resolveTypeBudgetForRegenerate({
      existingSpec: {
        type_budget: seedGeneratedTypeBudget({ sampleHeadline: 'Eski' }),
      },
      nextSampleHeadline: 'Yeni Gece',
      nextShowSubline: false,
    });
    expect(next.source).toBe('generated');
    expect(next.headline.maxWords).toBe(2);
    expect(next.headline.maxChars).toBe(9);
  });
});

describe('type_budget backfill plan', () => {
  it('migrates beach_club sample when type_budget missing', () => {
    const plan = planTypeBudgetBackfill({
      designSpec: {
        sampleHeadline: 'DJ Night',
        sampleSubtitle: 'Bu Gece',
        showSubline: true,
        vibe: 'bold',
      },
      migratedAt: '2026-08-07T00:00:00.000Z',
    });
    expect(plan.action).toBe('patch');
    if (plan.action !== 'patch') return;
    expect(plan.typeBudget.source).toBe('migrated_from_sample');
    expect(plan.typeBudget.headline.maxWords).toBe(2);
    expect(plan.nextSpec.type_budget).toEqual(plan.typeBudget);
    expect(plan.nextSpec.vibe).toBe('bold');
    expect(plan.nextSpec.typeBudgetMigrateSource).toBe('backfill_from_sample');
  });

  it('migrates kids_party_venue headline-only sample', () => {
    const plan = planTypeBudgetBackfill({
      designSpec: {
        sampleHeadline: 'Doğum Günü',
        showSubline: false,
      },
    });
    expect(plan.action).toBe('patch');
    if (plan.action !== 'patch') return;
    expect(plan.typeBudget.subtitle).toBeNull();
    expect(plan.typeBudget.headline.maxChars).toBe(10);
  });

  it('skips operator and already-present budgets', () => {
    expect(planTypeBudgetBackfill({
      designSpec: {
        sampleHeadline: 'X',
        type_budget: buildOperatorTypeBudget({
          headline: { maxChars: 12, maxWords: 2 },
          showSubline: false,
        }),
      },
    })).toEqual({ action: 'skip', reason: 'operator' });

    expect(planTypeBudgetBackfill({
      designSpec: {
        sampleHeadline: 'X',
        type_budget: seedGeneratedTypeBudget({ sampleHeadline: 'X' }),
      },
    })).toEqual({ action: 'skip', reason: 'already_present' });
  });

  it('uses fallbackHeadline when sample missing', () => {
    const plan = planTypeBudgetBackfill({
      designSpec: { showSubline: false },
      fallbackHeadline: 'Parti Evi',
    });
    expect(plan.action).toBe('patch');
    if (plan.action !== 'patch') return;
    expect(plan.typeBudget.headline.maxWords).toBe(2);
  });
});

describe('type_budget production precedence', () => {
  it('operator budget wins over bold_editorial 4-word intensity (beach_club)', () => {
    const budget = resolveTemplateOverlayCopyBudget({
      channel: 'feed_post',
      designIntensity: 'bold_editorial',
      sampleHeadline: 'Where friends gather for golden hour',
      typeBudget: buildOperatorTypeBudget({
        headline: { maxChars: 16, maxWords: 2, maxLines: 1 },
        showSubline: false,
      }),
    });
    expect(budget.source).toBe('operator_type_budget');
    expect(budget.headline.maxWords).toBe(2);
    expect(budget.headline.maxLen).toBe(16);
  });

  it('generated budget keeps soft floor for tiny kids_party sample', () => {
    const budget = resolveTemplateOverlayCopyBudget({
      channel: 'feed_post',
      designIntensity: 'designed',
      sampleHeadline: 'Parti',
      typeBudget: seedGeneratedTypeBudget({
        sampleHeadline: 'Parti',
        showSubline: false,
      }),
    });
    expect(budget.source).toBe('generated_type_budget');
    expect(budget.headline.maxWords).toBeGreaterThanOrEqual(3);
    // Inferred (non-operator) zones only advise on characters: the floor has to
    // hold the word budget, or Turkish copy gets cut to a bare suffix.
    expect(budget.headline.maxLen).toBeGreaterThanOrEqual(23);
  });

  it('operator fit does not relax past declared zone', () => {
    const fitted = fitMissionOverlayToTemplateBudget({
      headline: 'Where friends gather for golden hour cocktails',
      channel: 'feed_post',
      designIntensity: 'designed',
      sampleHeadline: 'DJ Night',
      typeBudget: buildOperatorTypeBudget({
        headline: { maxChars: 12, maxWords: 2, maxLines: 1 },
        showSubline: false,
      }),
    });
    expect(fitted.budget.source).toBe('operator_type_budget');
    expect(fitted.headline.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(fitted.headline.length).toBeLessThanOrEqual(12);
  });
});
