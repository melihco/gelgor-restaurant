import { describe, it, expect } from 'vitest';
import type { NexusSchema } from '@/lib/generated/nexus-schemas';
import type {
  PlanMonthlyOutputs,
  UsageQuotaMetric,
  UsageQuotaSummary,
} from '@/types';

/**
 * Drift guard (e1c-faz3): the hand-written client types in `@/types` must stay
 * field-aligned with the .NET DTOs, which are the single source of truth via
 * the generated OpenAPI types (`scripts/generate-api-types.mjs`).
 *
 * Swashbuckle 6.5 does not emit `required`, so the generated DTOs are all
 * optional. We therefore compare KEY SETS (normalising optionality with
 * `Required<>`) rather than full structural equality — this catches the most
 * common drift (a field added, removed, or renamed on the .NET side) at
 * `npm run type-check` time, without being brittle about optionality.
 */
type Missing<A, B> = Exclude<keyof Required<A>, keyof Required<B>>;

type SameKeys<A, B> =
  [Missing<A, B>] extends [never]
    ? [Missing<B, A>] extends [never]
      ? true
      : { extraOnGeneratedSide: Missing<B, A> }
    : { extraOnClientSide: Missing<A, B> };

// Each assertion fails to compile if the corresponding .NET DTO field set
// diverges from the hand-written client type.
const _usageMetricParity: SameKeys<UsageQuotaMetric, NexusSchema<'UsageQuotaMetricDto'>> = true;
const _usageSummaryParity: SameKeys<UsageQuotaSummary, NexusSchema<'UsageQuotaSummaryDto'>> = true;
const _planOutputsParity: SameKeys<PlanMonthlyOutputs, NexusSchema<'PlanMonthlyOutputsDto'>> = true;

describe('nexus customer API codegen drift guard', () => {
  it('keeps hand-written @/types field-aligned with generated .NET DTOs', () => {
    // The real assertions are the compile-time `SameKeys<...> = true` checks
    // above; this runtime case documents intent and keeps the suite green.
    expect([_usageMetricParity, _usageSummaryParity, _planOutputsParity]).toEqual([
      true,
      true,
      true,
    ]);
  });
});
