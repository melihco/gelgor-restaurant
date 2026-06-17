"""
Application configuration via pydantic-settings.

All settings are loaded from environment variables (or .env file).
Grouped by concern so that each layer only receives what it needs.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to this file (backend/app/config.py → backend/.env)
# This works regardless of which directory uvicorn was launched from.
_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = "development"
    app_debug: bool = True
    app_secret_key: str = "change-me-to-a-random-64-char-string"
    internal_api_key: str = "smartagency-internal-dev-key"
    enable_public_api: bool = True

    # ── Database ─────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://nexus:nexus_dev_2024@localhost:5432/nexus_db"

    # ── Redis ────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── LLM ──────────────────────────────────────────────
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"           # primary model for creative/strategic tasks
    openai_content_model: str = ""          # if set, content tasks use this model (e.g. gpt-4o)
    openai_lite_model: str = "gpt-4o-mini" # cheap model for analytics, structured data, reports
    crewai_llm_provider: Literal["openai", "anthropic", "ollama"] = "openai"

    # Anthropic Claude — best for creative content (brand voice, captions, copy)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_mcp_model: str = "claude-sonnet-4-6"

    # Agent MCP skill — optional remote MCP servers; Claude fallback when unset
    agent_mcp_enabled: bool = True
    # Local design MCP (default http://127.0.0.1:8010/mcp) — start with scripts/start-design-mcp.sh
    mcp_design_url: str = "http://127.0.0.1:8010/mcp"
    mcp_auth_token: str = ""
    # Optional remote: [{"name":"smartagency-design","url":"https://host/mcp","authorization_token_env":"MCP_AUTH_TOKEN"}]
    mcp_servers_json: str = ""

    # Perplexity — real-time web search for agent market research
    # Get key at: https://www.perplexity.ai/settings/api
    perplexity_api_key: str = ""
    perplexity_model: str = "sonar"

    # ── Web Search (pick ONE — priority: Tavily > Brave > Perplexity) ────────
    # Tavily: tavily.com/pricing — $5/mo (1K searches), AI-optimized
    tavily_api_key: str = ""
    # Brave Search: brave.com/search/api — FREE 2K/mo, then $3/mo
    brave_search_api_key: str = ""
    # Perplexity: $50/mo — only use if above are unavailable
    # (perplexity_api_key already defined above)

    # Brand24 API — optional social listening (brand mentions across web + social)
    # Get key at: https://brand24.com/api/
    brand24_api_key: str = ""

    # Eventbrite API — upcoming events for urgency scoring in Industry Calendar
    # Free key at: https://www.eventbrite.com/platform/api (500 req/day free)
    eventbrite_api_key: str = ""

    # Creatomate — branded video pack (1 Runway video → 5 formats with overlays)
    # €89/mo starter (100 renders), €0.89/extra render
    # Get key at: https://creatomate.com/
    creatomate_api_key: str = ""

    # Shotstack — 16 built-in professional title styles, stage API free
    shotstack_api_key: str = ""
    shotstack_env: str = "stage"   # "stage" (free) or "v1" (production)

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"

    # CrewAI memory — when True, agents remember past outputs via ChromaDB embeddings.
    # Requires: pip install chromadb  |  Adds ~2-3s cold start, significant quality gain.
    crewai_agent_memory: bool = False

    # ── Meta Graph API — Instagram Business + Ads ────────────────────────
    # Create at: https://developers.facebook.com/apps/
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_usd_try_rate: float = 32.0   # TL/USD kuru — META_USD_TRY_RATE env ile override

    # ── Apify — web scraping for brand discovery ─────────────────────────
    apify_api_key: str = ""
    # Fallback to basic HTTP scraping when False or key is empty
    apify_enabled: bool = True
    # Seconds to wait for an Apify actor run (free tier can be slow)
    apify_timeout_seconds: int = 60

    # Tenant learning — inject approved content history and performance into prompts
    tenant_learning_enabled: bool = True
    tenant_learning_max_examples: int = 5

    # ── CEO Intelligence Scheduler (Sprint C) ─────────────────────────────
    scheduler_enabled: bool = True
    # UTC hour for daily health check (06:00 UTC = 09:00 Turkey/UTC+3)
    scheduler_daily_hour: int = 6
    # Warm recommendation cache on startup for workspaces stale > N hours
    scheduler_startup_warm_cache: bool = True
    # How many hours before a recommendation is considered stale
    recommendation_stale_hours: int = 8
    # CrewAI konsol çıktısı; sıralı görevlerde ara adımlar "In Progress" gibi görünür — prod’da false önerilir.
    crew_verbose: bool = False
    # Hard cap for a single internal orchestration call (Python side); keep slightly below .NET HttpClient timeout.
    crew_execution_timeout_seconds: int = 420  # 7 min — content_ideation with quality iterations can take 5-6 min
    # Content crew: lower max_iter + fewer tools on ideation reduces LLM round-trips (faster, more predictable).
    # Quality iterations: 1 = standard (Starter/Pro), 2 = high-quality (Business/Enterprise)
    # 2 iterations = ~40% better output, ~2x LLM cost for content_ideation
    crewai_content_iterations: int = 2
    crewai_content_max_iter: int = 7
    crewai_content_ideation_max_iter: int = 5
    # When False, content_ideation skips Instagram tools (often “not connected” anyway) — big latency win.
    crewai_content_ideation_instagram_tools: bool = False
    # Content calendar is mostly LLM planning; skipping Meta tools reduces tool loops and hang risk.
    crewai_content_calendar_instagram_tools: bool = False
    # Per-task wall clock cap inside CrewAI Agent (seconds); avoids endless tool/LLM loops.
    crewai_content_agent_max_execution_seconds: int = 180

    # ── Google Business ──────────────────────────────────
    google_service_account_json: str = ""
    google_business_account_id: str = ""

    # ── Meta / Instagram ─────────────────────────────────
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_access_token: str = ""

    # ── Google Ads ───────────────────────────────────────
    google_ads_developer_token: str = ""
    google_ads_client_id: str = ""
    google_ads_client_secret: str = ""
    google_ads_refresh_token: str = ""
    google_ads_customer_id: str = ""

    # ── Google Analytics 4 ────────────────────────────────
    ga4_property_id: str = ""
    ga4_credentials_json: str = ""

    # ── Google Search Console ─────────────────────────────
    search_console_site_url: str = ""

    # ── Google OAuth (shared across Google services) ──────
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_redirect_uri: str = "http://localhost:5050/api/integrations/google/callback"

    # ── Auto-produce (Mission → Feed pipeline) ──────────
    nextjs_internal_url: str = "http://localhost:3000"
    nexus_api_url: str = "http://localhost:5050"

    # ── Auto-content (fully autonomous daily content loop) ─
    auto_content_enabled: bool = True
    auto_content_hour: int = 9       # UTC (TR 12:00) — kept for env override; scheduler now runs every 6h
    auto_content_max_daily: int = 12  # max auto-missions per workspace per day (pilot testing)
    workspace_daily_budget_usd: float = 50.0  # full-quality runs (Runway + Remotion + GPT enhance)
    # Varsayılan kapalı kota; AUTO_PRODUCE_BYPASS_LIMITS=false ile günlük USD limiti açılır
    auto_produce_bypass_limits: bool = True

    # ── Token billing (SA Kredi) ─────────────────────────
    # Customer price = API cost × TOKEN_MARKUP_MULTIPLIER (default 10×)
    token_billing_enabled: bool = True
    token_markup_multiplier: float = 10.0
    token_profit_margin_percent: float = 40.0  # target margin shown in UI / pricing docs
    token_usd_value: float = 0.01              # 1 token = $0.01 billed to customer
    token_try_rate: float = 0.35               # 1 token displayed as ₺ (TOKEN_TRY_RATE)
    token_monthly_grant: int = 25_000          # default wallet (Agency tier)
    token_display_name: str = "SA Kredi"

    # ── Image pipeline ───────────────────────────────────
    image_provider: Literal["openai_dalle", "stability", "replicate", "none"] = "none"
    stability_api_key: str = ""
    replicate_api_token: str = ""
    asset_storage_path: str = "./storage/assets"

    # ── CORS ─────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: object) -> str:
        """Railway Postgres uses postgres:// — SQLAlchemy async needs postgresql+asyncpg://."""
        url = str(v or "").strip()
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        if url.startswith("postgresql://") and "+asyncpg" not in url:
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @staticmethod
    def _ensure_http_url(v: object, default: str) -> str:
        url = str(v or "").strip().rstrip("/")
        if not url:
            return default
        if url.startswith(("http://", "https://")):
            return url
        return f"http://{url}"

    @field_validator("nextjs_internal_url", mode="before")
    @classmethod
    def normalize_nextjs_internal_url(cls, v: object) -> str:
        """Render hostport is bare hostname:port — httpx requires a scheme."""
        return cls._ensure_http_url(v, "http://localhost:3000")

    @field_validator("nexus_api_url", mode="before")
    @classmethod
    def normalize_nexus_api_url(cls, v: object) -> str:
        return cls._ensure_http_url(v, "http://localhost:5050")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str) -> str:
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
