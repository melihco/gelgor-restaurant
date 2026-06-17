# Mission Node Output Contract

Sprint 1 standardizes mission task node outputs around a dual-write model:

- `mission_task_nodes.output_payload` is the canonical structured contract
- `mission_task_nodes.output_summary` remains as raw/debug text and legacy fallback

## Why

Historically, Mission Hub and Feed readers reparsed `output_summary` on every read.
That made the system fragile because small LLM formatting changes could break UI and
production logic even when the underlying result was usable.

The new contract makes node outputs stable, typed, and reusable across:

- `MissionHub`
- `PlatformFeed`
- `reproduce-feed`
- weekly package selection
- slot checklist / pipeline transparency

## Canonical Rules

1. Writers should always dual-write:
   - raw text to `output_summary`
   - parsed JSON to `output_payload`
2. Readers should prefer `output_payload`
3. `output_summary` is only a compatibility fallback for:
   - old rows created before Sprint 1
   - malformed payloads during rollout/debugging

## Shape Rules

`output_payload` may be one of:

- `dict`
- `list[dict]`

Typical patterns:

- `content_ideation` -> `list[dict]`
- `content_calendar` -> `list[dict]`
- `visual_design_cards` -> `list[dict]`
- `content_strategy` -> `dict`
- `feed_cohesion_review` -> `dict`

## Backfill

Legacy rows can be migrated with:

```bash
python3 backend/scripts/backfill_mission_output_payload.py --dry-run
python3 backend/scripts/backfill_mission_output_payload.py --limit 500
```

The script is idempotent:

- only rows with empty `output_payload` are inspected
- only parseable `output_summary` values are written

## Validation Policy

Sprint 1 also tightens validation:

- strategist task nodes with invalid `agent_role` / `task_type` pairs are dropped
- intelligence recommendations with invalid pairs are dropped
- `CrewEngine.execute()` now fails invalid pairs instead of silently correcting them

## Exit Criteria

Sprint 1 is considered complete when:

1. Mission/feed readers are `output_payload`-first
2. backfill path exists for historical rows
3. invalid agent/task pairs are no longer silently rewritten in core mission flows

## Feed Director Note

As of Sprint 2, `feed_cohesion_review` remains an explicit placeholder mission node.

- it is visible in Mission Hub as part of the mission graph
- its report is persisted on the node row
- its execution is orchestrated inline by the production pipeline, not by
  normal `engine.execute()` dispatch

This means restart/retry flows should treat it as derived orchestration state,
not as durable creative work. On mission restart, its status and outputs should
be reset and recomputed from the latest ideation package.
