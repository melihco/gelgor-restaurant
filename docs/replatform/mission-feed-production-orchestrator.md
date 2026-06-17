# Mission Feed Production Orchestrator

Sprint 2 consolidates Mission Hub → Feed production triggers under one Python service.

## Entry points

| Trigger | API / caller | Behavior |
|---------|--------------|----------|
| Background kick | `PUT .../kick-feed-production` | Returns immediately; runs `ensure_mission_feed_production` async |
| Sync reproduce | `PUT .../reproduce-feed` | Blocks until FD + auto-produce complete; returns produced count |
| Graph completion | `task_graph_executor` | Calls same `ensure_mission_feed_production` safety net |
| Feed Director placeholder | `feed_cohesion_review` node | Marks node running, schedules ensure pipeline |

All paths converge on `run_feed_production_pipeline()` → `_trigger_content_production_pipeline()`.

## Brand context

Production uses `build_production_brand_context()`:

- Python `brand_contexts` row via `build_brand_info`
- operating policy enrichment
- gallery usage overlay

Internal .NET orchestration uses `merge_dotnet_brand_with_python_db()` for the same Python DB intelligence fields.

## Feed Director placeholder node

`feed_cohesion_review` remains a visible mission node:

- status + report persisted on the node row
- execution orchestrated inline by the production pipeline (not `engine.execute()`)
- reset on mission restart; recomputed on next production pass

## UI contract

Mission Hub should only:

- enqueue background production (`kick-feed-production`)
- retry synchronously when operator needs a count (`reproduce-feed`)
- persist hub production package / profile tier

Domain decisions (FD, slot map, gallery gates) stay in Python + Next auto-produce.

## Exit criteria (Sprint 2)

1. kick + reproduce + ensure share one orchestrator module
2. brand enrichment unified between mission production and internal orchestration merge
3. ideation node loaders include `output_payload` for merge paths
4. UI routes are thin proxies without duplicate production logic
