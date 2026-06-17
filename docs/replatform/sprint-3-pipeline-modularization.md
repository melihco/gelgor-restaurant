# Sprint 3 — Pipeline & UX Modularization

Sprint 3 thins the auto-produce monolith and centralizes Feed/Mission Hub read models.

## Modules

| Module | Role |
|--------|------|
| `apps/web/src/lib/auto-produce/plan-phase.ts` | Budget, ICS parse, FD assignments, stack context |
| `apps/web/src/lib/auto-produce/build-production-queue.ts` | Manifest / fallback slot queue |
| `apps/web/src/lib/auto-produce/pipeline-telemetry.ts` | Run id + step duration/fail reason |
| `apps/web/src/lib/artifact-view-model.ts` | Feed card view-model (kind, bundle, quality) |
| `apps/web/src/lib/production-quality-scorecard.ts` | Normalized PIS / FD / Grafiker / gallery / bundle |
| `apps/web/src/lib/mission-artifact-quality.ts` | Mission-level quality aggregation for Hub alerts |

## auto-produce phases

1. **Context** — `fetchProductionContext` (existing)
2. **Plan** — `runAutoProducePlanPhase` (new)
3. **Gallery** — `fetchGalleryContext` (existing, telemetry-wrapped)
4. **Queue** — `buildAutoProduceProductionQueue` (new)
5. **Slot loop** — still in `route.ts` (next slice: extract render/persist)

## UI contract

- `PlatformFeed` cards use `buildFeedArtifactViewModel`
- `detectFeedArtifactKind` replaces inline kind heuristics
- `MissionHub` skip alerts include artifact quality via `summarizeMissionArtifactQuality`

## Quality parity (do not regress)

Refactors must preserve production and Feed behavior:

1. **Feed kind detection** — `detectFeedArtifactKind` keeps legacy signal order:
   story/canvas before reel; Canva export hints; paid ad roles; Remotion story vs reel.
2. **Production queue** — empty manifest queue falls back to per-idea routing (pre-Sprint-3).
3. **Approval gate** — hard block only on rejected gallery match; Grafiker/bundle weak signals
   remain soft warnings. PIS does not add approval friction (Hub alerts only).
4. **Plan phase** — logic moved, not rewritten; FD gates and budget checks unchanged.

When extracting new modules from `route.ts`, diff behavior against main before merging.

1. Plan + queue logic lives outside `route.ts`
2. Feed cards read view-model, not scattered bundle heuristics
3. Quality scorecard drives approval gate + mission alerts
4. auto-produce responses include `pipelineRunId` + `pipelineSteps`

## Next slice

- Extract slot render/persist from `route.ts` into `slot-producer.ts`
- Wire `FeedArtifactQualityStrip` to scorecard fields
- Unit tests for plan-phase blocked/ready outcomes
