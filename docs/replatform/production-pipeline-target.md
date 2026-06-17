# Production Pipeline Target

## Current Problem

`apps/web/src/app/api/auto-produce/route.ts` combines:
- template selection
- gallery match selection
- GPT image enhancement
- Remotion orchestration
- Runway branching
- cost policy
- persistence side effects

This file is both orchestration layer and policy engine.

## Target Split

### ProductionCommand
Input:
- `ProductionJobRequest`
- `BrandProfileSnapshot`

### Submodules
- `production-policy`
- `gallery-selection`
- `image-enhance`
- `motion-render`
- `artifact-persist`
- `publish-schedule`

## Immediate Implementation Baseline

The replatform now introduces a stable contract for this split:
- `packages/contracts/src/mission.ts`
- `packages/contracts/src/brand.ts`

The current AI visual flags are normalized into a single brand contract with:
- `aiPhotoEnhance`
- `aiEnhanceGallerySelected`
- `aiAdaptiveScene`

## Operational Rule

When a gallery photo exists:
- `aiEnhanceGallerySelected=true` means edit the matched gallery image
- `aiAdaptiveScene=true` means generate or recompose scene semantics around the caption

These two modes must stay distinct during refactor and telemetry.
