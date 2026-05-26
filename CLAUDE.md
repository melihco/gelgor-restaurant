# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Service Ports

| Service | Port | Notes |
|---------|------|-------|
| Next.js frontend | 3000 | `npm run dev` |
| .NET Nexus API | 5050 (dev) / 5000 (docker) | 5000 conflicts with macOS AirPlay |
| Python Crew service | 8000 | internal-only, not browser-accessible |
| PostgreSQL | 5432 | `nexus_db`, user `nexus`, password `nexus_dev_2024` |
| Redis | 6379 | |
| Qdrant | 6333 | vector store, not yet wired to agents |

## Running the Stack

```bash
# All infrastructure (postgres, redis, qdrant)
docker compose up -d postgres redis qdrant

# Python crew service (one-liner)
./scripts/start-crew-backend.sh
# or manually:
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# .NET API
cd apps/api/src/Nexus.Api && dotnet run

# Frontend
cd apps/web && npm run dev
```

When the Python service is down, `.NET` falls back to mock responses automatically (`OrchestrationService:UseDevMock` in `appsettings.Development.json`). Set `UseDevMock: false` to require real CrewAI execution.

## Database Migrations

No Alembic is configured. New ORM columns require a manual SQL migration:

```bash
# Run against the running postgres
psql "$DATABASE_URL" -f backend/migrations/0001_brand_context_discovery_fields.sql

# Or apply ad-hoc via Python (dev only)
source backend/.venv/bin/activate
python3 -c "
import asyncio
from backend.app.database import async_session_factory
from sqlalchemy import text
async def run():
    async with async_session_factory() as db:
        await db.execute(text('ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...'))
        await db.commit()
asyncio.run(run())
"
```

In development, `create_all` on startup creates new tables but does **not** add columns to existing tables. Always write a migration file in `backend/migrations/` for column additions.

## TypeScript / Frontend

```bash
cd apps/web
npx tsc --noEmit          # type-check only
npm run build             # full production build
```

## Python

```bash
cd backend && source .venv/bin/activate
python3 -c "from app.crew.context import BrandInfo; ..."   # quick smoke test
```

No test runner is configured. Ad-hoc tests are run as `python3 -c "..."` scripts.

---

## Architecture

### Dual-Backend Design

```
Browser → Next.js (3000)
            ├─ /api/nexus-backend/* → rewrite → .NET Nexus (5050)   [customer-facing API]
            ├─ /api/brand-context/*/analyze → Next BFF route → Python (8000)
            └─ /api/brand-context/*/confirm-constitution → Next BFF → Python (8000)

.NET Nexus (5050) → POST /internal/v1/orchestration/execute → Python (8000)
                    authenticated with X-Internal-Api-Key header
```

- **All `/api/...` calls from the browser go to .NET** via a Next.js rewrite proxy (`next.config.ts` `rewrites()`). The `getApiFetchUrl()` utility in `apps/web/src/lib/runtime-config.ts` enforces this.
- **Python is never called directly by the browser**, except through the two Next.js BFF routes in `apps/web/src/app/api/brand-context/`.
- The shared BFF proxy helper is `apps/web/src/lib/crew-proxy.ts`.

### .NET → Python Contract

When .NET triggers a CrewAI execution it POSTs to `/internal/v1/orchestration/execute` with an `InternalAgentExecutionRequest` (defined in `backend/app/schemas/internal.py`). This contains an `InternalBrandContext` with all brand fields. Python builds a `BrandInfo` dataclass from it, runs the crew, and returns `InternalAgentExecutionResponse`. Python never calls back to .NET.

The internal endpoint is authenticated via `INTERNAL_API_KEY` (env var); the Python service verifies it in `backend/app/api/deps.py::verify_internal_api_key`.

### Brand Context Pipeline

Brand intelligence flows as follows:

```
Onboarding (Setup Wizard)
  → POST /api/brand-context/{workspaceId}/analyze  (Next BFF → Python)
  → analyze_brand() in backend/app/crew/brand_analyzer.py
      ├─ Apify: Instagram profile scraper
      ├─ Apify: Google Maps / crawler-google-places  (compass~crawler-google-places)
      └─ Direct HTTP: website landing page
  → persist_discovery_result() saves to brand_contexts table
  → POST /api/brand-context/{workspaceId}/confirm-constitution  (Next BFF → Python)

Agent execution (.NET → Python /execute)
  → build_brand_info_from_internal() converts InternalBrandContext → BrandInfo
  → For content/review tasks: tenant_learning_service loads approved/rejected history
  → build_brand_context_prompt() serialises BrandInfo → markdown string
  → Injected into every agent's backstory
```

`BrandInfo` (dataclass in `backend/app/crew/context.py`) is the single struct that flows through the entire Python stack. Fields added to `BrandInfo` must also be added to `InternalBrandContext` (schema) to flow from .NET; fields only needed for Python-originated executions can stay in `BrandInfo` alone.

The `ensure_nexus_mirror_workspace()` helper in `workspace_service.py` auto-creates placeholder `tenants`/`workspaces` rows in the Python DB when a Nexus tenant UUID arrives — this is how the two databases stay loosely coupled without a provisioning step.

### CrewAI Boundary

Everything under `backend/app/crew/` is the only place that imports from `crewai`. The public interface is `CrewEngine` in `engine.py`:

```python
engine.execute(agent_role, task_type, brand: BrandInfo, input_data) → dict
```

**Agent roles and their task types** (from `AGENT_ROLES` in `engine.py`):

| Role | Task types |
|------|-----------|
| `review_agent` | `review_analysis`, `single_review_response` |
| `content_agent` | `content_ideation`, `content_calendar` |
| `content_strategy_agent` | `content_strategy` |
| `ads_agent` | `campaign_analysis`, `ad_creative_generation`, `auto_budget_optimize`, `ads_budget_optimization` |
| `analytics_agent` | `traffic_analysis`, `conversion_report`, `weekly_performance` |

Adding a new agent requires: prompt file → agent factory → task definition → crew composition → register in `AGENT_ROLES` → add `AgentDefinition` to seed data.

### LLM Routing

`get_llm(task_type)` in `engine.py` supports three providers via `CREWAI_LLM_PROVIDER` env var:

- `openai` (default) — uses `OPENAI_MODEL` (currently `gpt-4o`); content tasks can use `OPENAI_CONTENT_MODEL` override
- `anthropic` — uses `ANTHROPIC_MODEL` (`claude-3-5-sonnet-20241022`); requires `pip install anthropic`
- `ollama` — local models via `OLLAMA_MODEL`

### Frontend State Model

The frontend is a **single-page app** with client-side routing via `useNavigationStore` (Zustand). There are no Next.js page routes — all pages render in `app/page.tsx` via a `switch` on `currentPage`. Auth state is checked on mount via `getCurrentUserSecurity()`; if it fails, `AuthGate` is shown.

Key stores:
- `navigation-store` — current page, setup required flag
- `workspace-store` — tenantId + officeId (persisted to localStorage)
- `office-store` — selected agent/zone for the 3D office view
- `interaction-store` — modal open states (assign task, artifact center)

### Apify Integration

`backend/app/crew/apify_scraper.py` wraps three Apify actors:

| Actor | Apify slug |
|-------|-----------|
| Instagram profile + posts | `apify~instagram-profile-scraper` |
| Website content crawl | `apify~website-content-crawler` (cheerio mode) |
| Google Maps / Business | `compass~crawler-google-places` |

Actors are called via the run-sync endpoint (`/v2/acts/{actorId}/run-sync-get-dataset-items`). Both `200` and `201` are success status codes. On the free tier, run Instagram and Google sequentially (not in parallel) to stay within the 8192 MB memory limit.

`analyze_brand()` automatically uses Apify when `APIFY_API_KEY` is set; otherwise falls back to direct HTTP scrapers.

### Image Generation

`apps/web/src/app/api/generate-instagram-image/route.ts` handles image generation:

- **Flux** (fal.ai, `fal-ai/flux-pro/v1.1-ultra`) — default provider when `SMART_AGENCY_IMAGE_PROVIDER=flux`
- **GPT-image-1** (OpenAI) — used when `SMART_AGENCY_IMAGE_PROVIDER=openai` or as Flux fallback; supports `images.edit` with `input_fidelity: "high"` when `referenceImageUrls` are provided

Reference image URLs from `brand_context.reference_image_urls` are passed to `images.edit` so generated visuals stay consistent with the actual venue.

### Tenant Learning

`backend/app/services/tenant_learning_service.py` queries `suggestions` table for approved/rejected entries and builds a `TenantLearningSnapshot`. `build_learning_context_prompt()` serialises it to a markdown block injected at the end of every agent's brand context prompt (highest LLM priority position). This is loaded automatically in the internal `/execute` endpoint for content and review task types.

### Key Architectural Constraints

- **Content agent serialisation**: Two parallel `content_agent` executions would deadlock. An `asyncio.Lock` (`_content_agent_execution_lock`) in the internal orchestration endpoint serialises them.
- **`proxyTimeout: 360_000`** in `next.config.ts`: LLM calls can take minutes; the Next.js proxy timeout is set high to avoid 504s during content ideation.
- **`NEXT_PUBLIC_USE_DEMO_CONTEXT=true`** in `.env.local`: Injects hardcoded `X-Tenant-Id` / `X-Office-Id` headers so development works without real auth cookies.
- **Python DB is a mirror**: The Python `brand_contexts` table stores brand intelligence for agent prompts. The authoritative customer data lives in the .NET Nexus database. `workspace_id` in Python always equals the Nexus tenant UUID.
