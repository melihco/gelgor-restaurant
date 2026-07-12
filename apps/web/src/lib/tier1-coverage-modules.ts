/**
 * Tier-1 production policy modules — high regression cost if untested.
 * Used by vitest coverage gates (see vitest.config.ts).
 */
export const TIER1_COVERAGE_GLOBS = [
  'src/lib/production-pipeline-router.ts',
  'src/lib/sector-production-profile.ts',
  'src/lib/mission-production-manifest.ts',
  'src/lib/tenant-operating-policy.ts',
  'src/lib/brand-active-slot-resolver.ts',
  'src/lib/slot-content-needs-bridge.ts',
  'src/lib/gallery-photo-matcher.ts',
  'src/lib/visual-overlay-policy.ts',
  'src/lib/calendar-production-pack.ts',
] as const;
