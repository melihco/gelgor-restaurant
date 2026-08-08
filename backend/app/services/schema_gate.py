"""
Schema gate — fail-loud when factory-critical columns are missing.

No Alembic: create_all does not add columns. Manual SQL in backend/migrations/
must be applied on deploy; this gate catches drift before production_jobs /
slot catalog silently break.

Multi-tenant: checks table/column presence only — no brand/tenant branches.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Literal

import structlog
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.ext.asyncio import AsyncEngine

logger = structlog.get_logger()

# Render private-network boots can briefly refuse Postgres before DNS/routing is ready.
_SCHEMA_GATE_CONNECT_ATTEMPTS = 12
_SCHEMA_GATE_CONNECT_BASE_DELAY_S = 1.5

SchemaGateMode = Literal["fail", "warn", "off"]

# Factory blast-radius columns (keep in sync with migrations 0024–0043).
REQUIRED_COLUMNS: dict[str, tuple[str, ...]] = {
    "production_jobs": ("priority", "slot_key", "started_at", "duration_ms", "queue_wait_ms"),
    "production_slot_definitions": ("optional_tags", "owner_workspace_id", "is_active"),
    "brand_contexts": ("brand_service_profile", "brand_theme"),
    "brand_design_templates": ("catalog_slot_key",),
    "tenant_slot_assignments": ("customization", "enabled", "workspace_id", "slot_key"),
    "canonical_sectors": ("is_active", "sector_id"),
}

REQUIRED_TABLES: tuple[str, ...] = (
    "production_jobs",
    "production_slot_definitions",
    "canonical_sectors",
    "tenant_slot_assignments",
    "brand_contexts",
    "brand_design_templates",
    "production_slot_events",
)

# Idempotent additive DDL — safe to re-run; mirrors migration snippets.
ADDITIVE_DDL: tuple[str, ...] = (
    """
    ALTER TABLE production_jobs
        ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0
    """,
    """
    ALTER TABLE production_jobs
        ADD COLUMN IF NOT EXISTS slot_key VARCHAR(128)
    """,
    """
    ALTER TABLE production_jobs
        ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ
    """,
    """
    ALTER TABLE production_jobs
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ
    """,
    """
    ALTER TABLE production_jobs
        ADD COLUMN IF NOT EXISTS duration_ms INTEGER
    """,
    """
    ALTER TABLE production_jobs
        ADD COLUMN IF NOT EXISTS queue_wait_ms INTEGER
    """,
    """
    CREATE TABLE IF NOT EXISTS production_slot_events (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id          UUID NOT NULL REFERENCES production_jobs(id) ON DELETE CASCADE,
        workspace_id    UUID NOT NULL,
        mission_id      UUID NOT NULL,
        idea_index      INTEGER,
        slot_role       TEXT,
        slot_key        VARCHAR(128),
        format          TEXT,
        pipeline        TEXT,
        event_type      VARCHAR(32) NOT NULL,
        status          VARCHAR(32),
        attempt         INTEGER,
        queue_wait_ms   INTEGER,
        duration_ms     INTEGER,
        provider        VARCHAR(64),
        model           VARCHAR(96),
        artifact_id     UUID,
        error_code      VARCHAR(96),
        error_message   TEXT,
        source_system   VARCHAR(32) NOT NULL DEFAULT 'factory',
        worker_id       TEXT,
        meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
        recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_production_slot_events_mission_time
        ON production_slot_events (mission_id, recorded_at DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_production_slot_events_workspace_time
        ON production_slot_events (workspace_id, recorded_at DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_production_slot_events_job_time
        ON production_slot_events (job_id, recorded_at DESC)
    """,
    """
    ALTER TABLE production_slot_definitions
        ADD COLUMN IF NOT EXISTS optional_tags JSONB NOT NULL DEFAULT '[]'::jsonb
    """,
    """
    ALTER TABLE production_slot_definitions
        ADD COLUMN IF NOT EXISTS owner_workspace_id UUID NULL
    """,
    """
    ALTER TABLE production_slot_definitions
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
    """,
    """
    ALTER TABLE brand_contexts
        ADD COLUMN IF NOT EXISTS brand_service_profile JSONB
    """,
    """
    ALTER TABLE brand_contexts
        ADD COLUMN IF NOT EXISTS brand_theme JSONB
    """,
    """
    ALTER TABLE brand_design_templates
        ADD COLUMN IF NOT EXISTS catalog_slot_key VARCHAR(128)
    """,
    """
    ALTER TABLE tenant_slot_assignments
        ADD COLUMN IF NOT EXISTS customization JSONB NOT NULL DEFAULT '{}'::jsonb
    """,
    """
    ALTER TABLE tenant_slot_assignments
        ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE
    """,
    """
    ALTER TABLE canonical_sectors
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
    """,
)


@dataclass
class SchemaGateReport:
    ok: bool
    missing_tables: list[str] = field(default_factory=list)
    missing_columns: list[str] = field(default_factory=list)  # "table.column"
    applied_additive: bool = False

    @property
    def missing(self) -> list[str]:
        return [
            *(f"table:{t}" for t in self.missing_tables),
            *self.missing_columns,
        ]


async def _existing_tables(conn) -> set[str]:
    rows = await conn.execute(
        text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            """
        )
    )
    return {str(r[0]) for r in rows.fetchall()}


async def _existing_columns(conn, table: str) -> set[str]:
    rows = await conn.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :table
            """
        ),
        {"table": table},
    )
    return {str(r[0]) for r in rows.fetchall()}


async def inspect_schema(engine: AsyncEngine) -> SchemaGateReport:
    """Read-only check of required tables/columns."""
    missing_tables: list[str] = []
    missing_columns: list[str] = []
    async with engine.connect() as conn:
        tables = await _existing_tables(conn)
        for table in REQUIRED_TABLES:
            if table not in tables:
                missing_tables.append(table)
        for table, cols in REQUIRED_COLUMNS.items():
            if table not in tables:
                for col in cols:
                    missing_columns.append(f"{table}.{col}")
                continue
            existing = await _existing_columns(conn, table)
            for col in cols:
                if col not in existing:
                    missing_columns.append(f"{table}.{col}")
    return SchemaGateReport(
        ok=not missing_tables and not missing_columns,
        missing_tables=missing_tables,
        missing_columns=missing_columns,
    )


async def apply_additive_factory_ddl(engine: AsyncEngine) -> None:
    """Apply IF NOT EXISTS column patches for factory-critical fields.

    Skips statements whose target table is missing (create_all / migrations
    must create the table first).
    """
    async with engine.begin() as conn:
        tables = await _existing_tables(conn)
        for statement in ADDITIVE_DDL:
            # First identifier after ALTER TABLE is the target.
            lower = " ".join(statement.split()).lower()
            if "alter table " not in lower:
                await conn.execute(text(statement))
                continue
            table = lower.split("alter table ", 1)[1].split()[0].strip('"')
            if table not in tables:
                logger.warning("schema_gate_skip_ddl_missing_table", table=table)
                continue
            await conn.execute(text(statement))


async def _inspect_schema_with_retry(engine: AsyncEngine) -> SchemaGateReport:
    """Retry inspect on transient connection refused / DB unavailable."""
    last_exc: BaseException | None = None
    for attempt in range(1, _SCHEMA_GATE_CONNECT_ATTEMPTS + 1):
        try:
            return await inspect_schema(engine)
        except (ConnectionRefusedError, OSError, TimeoutError, OperationalError, DBAPIError) as exc:
            last_exc = exc
            delay = min(20.0, _SCHEMA_GATE_CONNECT_BASE_DELAY_S * attempt)
            logger.warning(
                "schema_gate_db_connect_retry",
                attempt=attempt,
                max_attempts=_SCHEMA_GATE_CONNECT_ATTEMPTS,
                delay_s=round(delay, 1),
                error=str(exc)[:200],
            )
            if attempt >= _SCHEMA_GATE_CONNECT_ATTEMPTS:
                break
            await asyncio.sleep(delay)
    assert last_exc is not None
    raise last_exc


async def run_schema_gate(
    engine: AsyncEngine,
    *,
    mode: SchemaGateMode = "fail",
    apply_additive: bool = True,
) -> SchemaGateReport:
    """
    Inspect schema; optionally auto-apply additive DDL; then enforce mode.

    - fail: raise RuntimeError when still missing (blocks startup)
    - warn: log warning, return report
    - off: skip
    """
    if mode == "off":
        return SchemaGateReport(ok=True)

    report = await _inspect_schema_with_retry(engine)
    if report.ok:
        logger.info("schema_gate_ok", checked=len(REQUIRED_COLUMNS))
        return report

    # CREATE TABLE IF NOT EXISTS lives in ADDITIVE_DDL — run when tables OR columns missing.
    if apply_additive and (report.missing_columns or report.missing_tables):
        logger.warning(
            "schema_gate_applying_additive_ddl",
            missing=report.missing[:20],
        )
        try:
            await apply_additive_factory_ddl(engine)
            report = await _inspect_schema_with_retry(engine)
            report.applied_additive = True
        except Exception as exc:
            logger.error("schema_gate_additive_ddl_failed", error=str(exc)[:300])

    if report.ok:
        logger.info("schema_gate_repaired", applied_additive=True)
        return report

    logger.error(
        "schema_gate_missing",
        missing=report.missing,
        hint="Apply backend/migrations/*.sql or scripts/apply_sql_migration.py",
    )
    if mode == "fail":
        raise RuntimeError(
            "schema_gate_failed: missing "
            + ", ".join(report.missing[:12])
            + ("…" if len(report.missing) > 12 else "")
        )
    return report


def resolve_schema_gate_mode(
    *,
    configured: str | None,
    is_development: bool,
) -> SchemaGateMode:
    raw = (configured or "").strip().lower()
    if raw in ("fail", "warn", "off"):
        return raw  # type: ignore[return-value]
    # Dev: warn (don't block local loops). Staging/prod: fail loud.
    return "warn" if is_development else "fail"
