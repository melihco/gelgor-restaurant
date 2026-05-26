# SmartAgency — AI-Powered Operating System for Digital Agencies

An AI-powered platform that helps digital agencies automate business operations for their clients. The product now follows a dual-backend architecture:

- `apps/api` = customer-facing .NET application API
- `backend` = internal Python CrewAI orchestration service

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 15)                     │
│         3D Office Visualization  ·  Dashboard  ·  UI        │
│              apps/web/ → localhost:3002                       │
├─────────────────────────────────────────────────────────────┤
│              Product API (.NET / Nexus)                      │
│   Offices · Agents · Briefs · Tasks · Reviews · Notifications│
│              apps/api/ → localhost:5000                      │
├─────────────────────────────────────────────────────────────┤
│        Internal Orchestration Service (FastAPI)              │
│   Crew execution · Prompt/context assembly · Tool adapters   │
│              backend/ → localhost:8000                       │
├─────────────────────────────────────────────────────────────┤
│           CrewAI Orchestration Layer                         │
│   Engine · Agents · Crews · Tasks · Tools · Prompts          │
│              backend/app/crew/                               │
├─────────────────────────────────────────────────────────────┤
│              Integration Layer                               │
│   Google Reviews · Instagram · Google Ads · Image Pipeline   │
│              backend/app/crew/tools/                         │
├─────────────────────────────────────────────────────────────┤
│              Infrastructure                                  │
│   PostgreSQL · Redis · Qdrant                                │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **.NET app API + Python Crew service** | The product-facing API stays aligned with the existing Nexus domain and frontend contracts, while CrewAI remains isolated in Python where it belongs |
| **CrewAI isolated in `backend/app/crew/`** | Nothing outside this package imports from `crewai` directly — if CrewAI's API changes, only this module updates |
| **Brand context pipeline** | Every agent receives real business data (name, tone, assets, rules) so outputs are never generic |
| **.NET owns customer-facing contracts** | Tasks, artifacts, reviews, notifications, and SignalR stay in the application API instead of leaking Python internals to the UI |
| **Python executes, .NET persists** | CrewAI returns structured execution results, and the .NET API persists them into task/artifact/review models |
| **Factory pattern for agents** | Each brand gets a fresh, context-specific agent instance rather than shared singletons |
| **Mock tools in development** | Integration tools return realistic mock data, so the full pipeline works without API credentials |

## Project Structure

```
smart-agency/
├── backend/                        # Internal Python CrewAI service
│   ├── app/
│   │   ├── main.py                 # Internal service entry point
│   │   ├── config.py               # Environment-based settings
│   │   ├── database.py             # Async SQLAlchemy setup
│   │   ├── seed.py                 # Development seed data
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── tenant.py           # Top-level customer
│   │   │   ├── workspace.py        # Brand within a tenant
│   │   │   ├── package.py          # Pricing tier + agent allocations
│   │   │   ├── agent_config.py     # Agent definitions & instances
│   │   │   ├── brand_context.py    # Business info for agent context
│   │   │   ├── integration.py      # External service connections
│   │   │   ├── task.py             # Task, Suggestion, Approval, ActionLog
│   │   │   └── content.py          # Content assets & prompt profiles
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   ├── services/               # Business logic layer
│   │   │   ├── agent_execution_service.py  # Bridges API ↔ CrewAI
│   │   │   ├── approval_service.py         # Human review workflow
│   │   │   ├── brand_context_service.py    # Brand info → BrandInfo
│   │   │   └── ...
│   │   ├── api/internal/           # Service-to-service execution routes
│   │   ├── api/v1/                 # Optional public dev routes
│   │   └── crew/                   # ← CrewAI orchestration boundary
│   │       ├── engine.py           # Single entry point to CrewAI
│   │       ├── context.py          # Brand context builder
│   │       ├── agents/             # CrewAI Agent definitions
│   │       ├── crews/              # Crew compositions
│   │       ├── tasks/              # Task definitions
│   │       ├── tools/              # Custom CrewAI tools
│   │       └── prompts/            # Prompt templates
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── apps/
│   ├── web/                        # Next.js frontend (existing)
│   └── api/                        # Customer-facing .NET application API
├── docker-compose.yml
└── README.md
```

## Quick Start (Local Development)

### Prerequisites

- Python 3.11+
- PostgreSQL 16+ (or use Docker)
- Node.js 18+ (for frontend)
- An OpenAI API key (or Ollama for local models)

### Option 1: Docker (recommended)

```bash
# Set your OpenAI key
export OPENAI_API_KEY=sk-your-key-here

# Start everything
docker compose up -d

# Product API: http://localhost:5000
# Frontend: http://localhost:3002
# Crew service: http://localhost:8000 (internal service)
```

### Option 2: Manual Setup

**1. Start PostgreSQL** (via Docker or local install):

```bash
docker compose up -d postgres redis
```

**2. Start the internal Crew service:**

Tek komut (macOS / Linux):

```bash
chmod +x scripts/start-crew-backend.sh   # bir kez
./scripts/start-crew-backend.sh
```

Manuel:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt

# Create .env from template
cp .env.example .env
# Edit .env — at minimum set OPENAI_API_KEY

# Start the internal orchestration service
uvicorn app.main:app --reload --port 8000
```

**3. Start the .NET product API:**

```bash
cd apps/api
dotnet run --project src/Nexus.Api/Nexus.Api.csproj
```

Development ortamında Python Crew (`:8000`) yoksa, varsayılan olarak **`OrchestrationService:UseDevMock=true`** devreye girer ve mission/agent çağrıları stub yanıt döner. Gerçek CrewAI için `backend`’i başlatıp `appsettings.Development.json` içinde `UseDevMock` değerini **`false`** yapın.

**4. Start the frontend:**

```bash
cd apps/web
npm install
npm run dev
```

**5. Open the APIs:**

- Product API: http://localhost:5000
- Frontend: http://localhost:3002 (`npm run dev` uses this port)
- Crew service docs (dev only): http://localhost:8000/docs

## End-to-End Vertical Slice: Review Agent

The first production slice is now designed around `.NET -> Python -> .NET persistence`.

### 1. Discover the seeded office and review agent

```bash
curl http://localhost:5000/api/office/default
curl http://localhost:5000/api/agents/office/00000000-0000-0000-0000-000000000002
```

### 2. Execute the Review Agent through the product API

Use the `CustomerReviewResponder` agent id returned above:

```bash
curl -X POST http://localhost:5000/api/agents/{agentId}/execute \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "single_review_response",
    "inputData": {
      "reviewerName": "Ahmet Y.",
      "rating": 1,
      "reviewText": "Yarım saat beklettiler, sipariş yanlış geldi. Bir daha gelmem.",
      "reviewDate": "2026-04-04",
      "language": "tr"
    }
  }'
```

This call creates:

- a `.NET` `Brief`
- a `.NET` `TaskItem`
- a `.NET` `AgentRun`
- a `.NET` `OutputArtifact`

while the actual CrewAI execution happens in the Python service.

### 3. Review generated artifacts

```bash
curl http://localhost:5000/api/artifacts
curl http://localhost:5000/api/artifacts/{artifactId}

curl -X POST http://localhost:5000/api/artifacts/{artifactId}/approve \
  -H "Content-Type: application/json" \
  -d '{ "comments": "Looks good, approve it." }'
```

## Package System

Packages control which agents are available per workspace:

| Package | Agents | Monthly Tasks |
|---------|--------|---------------|
| **Basic** | Review Agent | 50 |
| **Pro** | Review Agent, Content Agent | 200 |
| **Enterprise** | Review Agent, Content Agent, Ads Agent | 1000 |

To change a workspace's package, update its `package_id` — agent instances are automatically provisioned.

## Adding a New Agent

1. Create a prompt file in `backend/app/crew/prompts/`
2. Create an agent factory in `backend/app/crew/agents/`
3. Create task definitions in `backend/app/crew/tasks/`
4. Create a crew composition in `backend/app/crew/crews/`
5. Register the agent role in `backend/app/crew/engine.py` (AGENT_ROLES dict + _dispatch method)
6. Add an AgentDefinition to the seed data
7. Add the role to relevant package allocations

## Using Local Models (Ollama)

To avoid OpenAI costs during development:

```bash
# Install Ollama and pull a model
ollama pull llama3.1

# Set environment variables
CREWAI_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/office/default` | Get default office |
| `GET` | `/api/agents/office/{officeId}` | List agents in an office |
| `GET` | `/api/agents/{id}` | Get agent detail |
| `PUT` | `/api/agents/{id}/state` | Update agent state |
| `POST` | `/api/agents/{id}/execute` | Trigger a CrewAI-backed agent execution |
| `GET` | `/api/briefs` | List briefs |
| `POST` | `/api/briefs` | Create brief |
| `POST` | `/api/briefs/{id}/submit` | Submit brief for decomposition |
| `GET` | `/api/tasks/brief/{briefId}` | List tasks for a brief |
| `GET` | `/api/artifacts` | List generated artifacts / review suggestions |
| `GET` | `/api/artifacts/{id}` | Get artifact detail |
| `POST` | `/api/artifacts/{id}/approve` | Approve artifact |
| `POST` | `/api/artifacts/{id}/reject` | Reject artifact |
| `POST` | `/api/artifacts/{id}/request-revision` | Request revision |
| `GET` | `/api/notifications` | List notifications |
| `PUT` | `/api/notifications/{id}/mark-read` | Mark notification as read |

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Three.js, Zustand, TanStack Query |
| Product API | ASP.NET Core 8, EF Core, SignalR |
| Internal Crew Service | FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| Orchestration | CrewAI |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 |
| Vector Store | Qdrant (for future RAG) |
| LLM | OpenAI (default) / Ollama (local) |
