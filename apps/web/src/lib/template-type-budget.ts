/**
 * Per-template on-canvas type budget (`design_spec.type_budget`).
 *
 * Operator-set budgets win over intensity / sample inference.
 * Generated & migrated budgets apply a soft mission-punch floor.
 * When absent, callers fall back to sampleHeadline + channel intensity.
 */

export type TemplateTypeBudgetSource = 'operator' | 'generated' | 'migrated_from_sample';

export type TemplateTypeBudgetLine = {
  maxChars: number;
  maxWords: number;
  maxLines: number;
};

export type TemplateTypeBudget = {
  headline: TemplateTypeBudgetLine;
  subtitle: TemplateTypeBudgetLine | null;
  source: TemplateTypeBudgetSource;
};

const HEADLINE_CHARS = { min: 8, max: 48 } as const;
const HEADLINE_WORDS = { min: 1, max: 6 } as const;
const HEADLINE_LINES = { min: 1, max: 4 } as const;
const SUB_CHARS = { min: 6, max: 36 } as const;
const SUB_WORDS = { min: 1, max: 5 } as const;
const SUB_LINES = { min: 1, max: 3 } as const;

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(max, Math.max(min, v));
}

export function clampHeadlineTypeBudgetLine(
  partial: Partial<TemplateTypeBudgetLine> | null | undefined,
  fallback: TemplateTypeBudgetLine,
): TemplateTypeBudgetLine {
  return {
    maxChars: clampInt(partial?.maxChars, HEADLINE_CHARS.min, HEADLINE_CHARS.max, fallback.maxChars),
    maxWords: clampInt(partial?.maxWords, HEADLINE_WORDS.min, HEADLINE_WORDS.max, fallback.maxWords),
    maxLines: clampInt(partial?.maxLines, HEADLINE_LINES.min, HEADLINE_LINES.max, fallback.maxLines),
  };
}

export function clampSubtitleTypeBudgetLine(
  partial: Partial<TemplateTypeBudgetLine> | null | undefined,
  fallback: TemplateTypeBudgetLine,
): TemplateTypeBudgetLine {
  return {
    maxChars: clampInt(partial?.maxChars, SUB_CHARS.min, SUB_CHARS.max, fallback.maxChars),
    maxWords: clampInt(partial?.maxWords, SUB_WORDS.min, SUB_WORDS.max, fallback.maxWords),
    maxLines: clampInt(partial?.maxLines, SUB_LINES.min, SUB_LINES.max, fallback.maxLines),
  };
}

function parseLine(
  raw: unknown,
  clamp: (p: Partial<TemplateTypeBudgetLine>, fb: TemplateTypeBudgetLine) => TemplateTypeBudgetLine,
  fallback: TemplateTypeBudgetLine,
): TemplateTypeBudgetLine | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const hasAny =
    o.maxChars != null || o.max_chars != null
    || o.maxWords != null || o.max_words != null
    || o.maxLines != null || o.max_lines != null;
  if (!hasAny) return null;
  return clamp(
    {
      maxChars: (o.maxChars ?? o.max_chars) as number | undefined,
      maxWords: (o.maxWords ?? o.max_words) as number | undefined,
      maxLines: (o.maxLines ?? o.max_lines) as number | undefined,
    },
    fallback,
  );
}

const DEFAULT_HEADLINE: TemplateTypeBudgetLine = { maxChars: 28, maxWords: 3, maxLines: 1 };
const DEFAULT_SUBTITLE: TemplateTypeBudgetLine = { maxChars: 22, maxWords: 3, maxLines: 1 };

/**
 * Parse `design_spec.type_budget` (camel or snake). Returns null when absent/invalid.
 */
export function parseTemplateTypeBudget(raw: unknown): TemplateTypeBudget | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const headline = parseLine(
    o.headline,
    clampHeadlineTypeBudgetLine,
    DEFAULT_HEADLINE,
  );
  if (!headline) return null;

  const sourceRaw = String(o.source ?? '').trim().toLowerCase();
  const source: TemplateTypeBudgetSource =
    sourceRaw === 'operator'
      ? 'operator'
      : sourceRaw === 'migrated_from_sample'
        ? 'migrated_from_sample'
        : 'generated';

  let subtitle: TemplateTypeBudgetLine | null = null;
  if (o.subtitle != null && o.subtitle !== false) {
    subtitle = parseLine(
      o.subtitle,
      clampSubtitleTypeBudgetLine,
      DEFAULT_SUBTITLE,
    );
  }

  return { headline, subtitle, source };
}

/** Infer budget from library sample copy (generate seed + migration). */
export function inferTypeBudgetFromSample(input: {
  sampleHeadline?: string | null;
  sampleSubtitle?: string | null;
  showSubline?: boolean | null;
  source?: Exclude<TemplateTypeBudgetSource, 'operator'>;
}): TemplateTypeBudget {
  const sampleH = String(input.sampleHeadline ?? '').trim();
  const sampleS = String(input.sampleSubtitle ?? '').trim();
  const words = sampleH.split(/\s+/).filter(Boolean).length;
  const headline = clampHeadlineTypeBudgetLine(
    {
      maxChars: sampleH.length >= 2 ? sampleH.length : DEFAULT_HEADLINE.maxChars,
      maxWords: words >= 1 ? words : DEFAULT_HEADLINE.maxWords,
      maxLines: 1,
    },
    DEFAULT_HEADLINE,
  );

  const showSub = input.showSubline === false
    ? false
    : input.showSubline === true
      ? true
      : Boolean(sampleS);

  let subtitle: TemplateTypeBudgetLine | null = null;
  if (showSub) {
    const sw = sampleS.split(/\s+/).filter(Boolean).length;
    subtitle = clampSubtitleTypeBudgetLine(
      {
        maxChars: sampleS.length >= 2 ? sampleS.length : DEFAULT_SUBTITLE.maxChars,
        maxWords: sw >= 1 ? sw : DEFAULT_SUBTITLE.maxWords,
        maxLines: 1,
      },
      DEFAULT_SUBTITLE,
    );
  }

  return {
    headline,
    subtitle,
    source: input.source ?? 'generated',
  };
}

/** Seed at template generate time from the punchline that was painted. */
export function seedGeneratedTypeBudget(input: {
  sampleHeadline: string;
  sampleSubtitle?: string | null;
  showSubline?: boolean | null;
}): TemplateTypeBudget {
  return inferTypeBudgetFromSample({
    ...input,
    source: 'generated',
  });
}

/** Keep operator budget across regenerate; otherwise use the next generated seed. */
export function resolveTypeBudgetForRegenerate(input: {
  existingSpec?: Record<string, unknown> | null;
  nextSampleHeadline: string;
  nextSampleSubtitle?: string | null;
  nextShowSubline?: boolean | null;
}): TemplateTypeBudget {
  const existing = parseTemplateTypeBudget(
    input.existingSpec?.type_budget ?? input.existingSpec?.typeBudget,
  );
  if (existing?.source === 'operator') return existing;
  return seedGeneratedTypeBudget({
    sampleHeadline: input.nextSampleHeadline,
    sampleSubtitle: input.nextSampleSubtitle,
    showSubline: input.nextShowSubline,
  });
}

/** Operator PATCH helper — always marks source=operator. */
export function buildOperatorTypeBudget(input: {
  headline: Partial<TemplateTypeBudgetLine>;
  subtitle?: Partial<TemplateTypeBudgetLine> | null;
  showSubline?: boolean | null;
}): TemplateTypeBudget {
  const headline = clampHeadlineTypeBudgetLine(input.headline, DEFAULT_HEADLINE);
  const showSub = input.showSubline !== false && input.subtitle !== null;
  const subtitle = showSub && input.subtitle
    ? clampSubtitleTypeBudgetLine(input.subtitle, DEFAULT_SUBTITLE)
    : showSub
      ? DEFAULT_SUBTITLE
      : null;
  return { headline, subtitle, source: 'operator' };
}

export function typeBudgetAppliesSoftFloor(budget: TemplateTypeBudget | null | undefined): boolean {
  if (!budget) return true;
  return budget.source !== 'operator';
}

/** Compact TYPE ZONE line for replica / GPT paint prompts. */
export function formatTypeBudgetPromptLines(budget: TemplateTypeBudget | null | undefined): string[] {
  if (!budget) return [];
  const lines = [
    `TYPE ZONE BUDGET (${budget.source}): headline ≤${budget.headline.maxChars} chars / ${budget.headline.maxWords} words / ${budget.headline.maxLines} lines — do not paint longer copy.`,
  ];
  if (budget.subtitle) {
    lines.push(
      `SUBLINE ZONE BUDGET: ≤${budget.subtitle.maxChars} chars / ${budget.subtitle.maxWords} words / ${budget.subtitle.maxLines} lines.`,
    );
  } else {
    lines.push('NO SUBLINE ZONE — headline only.');
  }
  return lines;
}

export type TypeBudgetBackfillSkipReason =
  | 'operator'
  | 'already_present'
  | 'no_sample';

export type TypeBudgetBackfillPlan =
  | { action: 'skip'; reason: TypeBudgetBackfillSkipReason }
  | {
      action: 'patch';
      typeBudget: TemplateTypeBudget;
      /** Merged design_spec ready for PATCH (preserves prior keys). */
      nextSpec: Record<string, unknown>;
    };

/**
 * Plan a one-shot migration of missing `type_budget` from sampleHeadline.
 * Never overwrites operator budgets; never rewrites existing type_budget.
 */
export function planTypeBudgetBackfill(input: {
  designSpec?: Record<string, unknown> | null;
  /** Used when sampleHeadline is empty (template_name). */
  fallbackHeadline?: string | null;
  /** Optional ISO timestamp for deterministic tests. */
  migratedAt?: string;
}): TypeBudgetBackfillPlan {
  const spec = (input.designSpec && typeof input.designSpec === 'object' && !Array.isArray(input.designSpec))
    ? { ...input.designSpec }
    : {};
  const existing = parseTemplateTypeBudget(spec.type_budget ?? spec.typeBudget);
  if (existing?.source === 'operator') {
    return { action: 'skip', reason: 'operator' };
  }
  if (existing) {
    return { action: 'skip', reason: 'already_present' };
  }

  const sampleHeadline = String(spec.sampleHeadline ?? '').trim()
    || String(input.fallbackHeadline ?? '').trim();
  if (sampleHeadline.length < 2) {
    return { action: 'skip', reason: 'no_sample' };
  }

  const sampleSubtitle = typeof spec.sampleSubtitle === 'string'
    ? spec.sampleSubtitle.trim()
    : '';
  const rawShow = spec.showSubline ?? spec.show_subline;
  const showSubline = typeof rawShow === 'boolean'
    ? rawShow
    : Boolean(sampleSubtitle);

  const typeBudget = inferTypeBudgetFromSample({
    sampleHeadline,
    sampleSubtitle: sampleSubtitle || null,
    showSubline,
    source: 'migrated_from_sample',
  });

  return {
    action: 'patch',
    typeBudget,
    nextSpec: {
      ...spec,
      type_budget: typeBudget,
      typeBudgetMigratedAt: input.migratedAt ?? new Date().toISOString(),
      typeBudgetMigrateSource: 'backfill_from_sample',
    },
  };
}
