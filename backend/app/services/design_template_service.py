"""Service for brand design templates — CRUD + bulk upsert + usage tracking."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand_context import BrandDesignTemplate
from app.schemas.design_templates import (
    DesignTemplateBulkUpsert,
    DesignTemplateCreate,
    DesignTemplateUpdate,
)

logger = structlog.get_logger()

# Soft ceiling — onboarding targets 10, but operators may add a few extras.
MAX_TEMPLATES_PER_WORKSPACE = 24
_schema_ready = False


async def ensure_brand_design_templates_schema(db: AsyncSession) -> None:
    """Ensure live DBs have the design-template table and slot-link columns.

    Render dev/prod databases are not Alembic-managed; ``create_all`` creates
    new tables but does not add columns to existing ones. Keeping this guard on
    the service boundary makes template persistence work for every workspace,
    even when an older DB missed migrations 0027/0037.
    """
    global _schema_ready
    if _schema_ready:
        return

    ddl_statements = [
        "CREATE EXTENSION IF NOT EXISTS pgcrypto",
        """
        CREATE TABLE IF NOT EXISTS brand_design_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL,
            template_type VARCHAR(48) NOT NULL,
            template_name VARCHAR(160) NOT NULL,
            format VARCHAR(24) NOT NULL DEFAULT 'story',
            thumbnail_url TEXT,
            design_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
            sector_category VARCHAR(64),
            locale VARCHAR(8),
            catalog_slot_key VARCHAR(128),
            status VARCHAR(24) NOT NULL DEFAULT 'active',
            usage_count INTEGER NOT NULL DEFAULT 0,
            last_used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """,
        "ALTER TABLE brand_design_templates ADD COLUMN IF NOT EXISTS catalog_slot_key VARCHAR(128)",
        "ALTER TABLE brand_design_templates ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE brand_design_templates ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ",
        "ALTER TABLE brand_design_templates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
        "ALTER TABLE brand_design_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
        "UPDATE brand_design_templates SET usage_count = 0 WHERE usage_count IS NULL",
        "UPDATE brand_design_templates SET created_at = now() WHERE created_at IS NULL",
        "UPDATE brand_design_templates SET updated_at = now() WHERE updated_at IS NULL",
        """
        CREATE INDEX IF NOT EXISTS ix_brand_design_templates_workspace
            ON brand_design_templates (workspace_id, status)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_brand_design_templates_type
            ON brand_design_templates (workspace_id, template_type, status)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_brand_design_templates_catalog_slot
            ON brand_design_templates (workspace_id, catalog_slot_key)
            WHERE catalog_slot_key IS NOT NULL
        """,
    ]
    for statement in ddl_statements:
        await db.execute(text(statement))
    await db.commit()
    _schema_ready = True


async def list_templates(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    include_archived: bool = False,
    template_type: str | None = None,
) -> list[BrandDesignTemplate]:
    await ensure_brand_design_templates_schema(db)
    q = select(BrandDesignTemplate).where(
        BrandDesignTemplate.workspace_id == workspace_id
    )
    if not include_archived:
        q = q.where(BrandDesignTemplate.status != "archived")
    if template_type:
        q = q.where(BrandDesignTemplate.template_type == template_type)
    q = q.order_by(BrandDesignTemplate.created_at)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_template(
    db: AsyncSession, workspace_id: uuid.UUID, template_id: uuid.UUID,
) -> BrandDesignTemplate | None:
    await ensure_brand_design_templates_schema(db)
    result = await db.execute(
        select(BrandDesignTemplate).where(
            BrandDesignTemplate.id == template_id,
            BrandDesignTemplate.workspace_id == workspace_id,
        )
    )
    return result.scalar_one_or_none()


async def create_template(
    db: AsyncSession, workspace_id: uuid.UUID, data: DesignTemplateCreate,
) -> BrandDesignTemplate:
    await ensure_brand_design_templates_schema(db)
    existing = await list_templates(db, workspace_id, include_archived=False)
    if len(existing) >= MAX_TEMPLATES_PER_WORKSPACE:
        raise ValueError(
            f"Maximum {MAX_TEMPLATES_PER_WORKSPACE} active templates per workspace"
        )

    template = BrandDesignTemplate(
        workspace_id=workspace_id,
        template_type=data.template_type,
        template_name=data.template_name,
        format=data.format,
        thumbnail_url=data.thumbnail_url,
        design_spec=data.design_spec or {},
        sector_category=data.sector_category,
        locale=data.locale,
        catalog_slot_key=data.catalog_slot_key,
        status="active",
    )
    db.add(template)
    await db.flush()
    return template


async def update_template(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    data: DesignTemplateUpdate,
) -> BrandDesignTemplate | None:
    await ensure_brand_design_templates_schema(db)
    template = await get_template(db, workspace_id, template_id)
    if not template:
        return None

    updates = data.model_dump(exclude_unset=True)
    increment_usage = updates.pop("increment_usage", False)

    for field, value in updates.items():
        setattr(template, field, value)

    if increment_usage:
        template.usage_count = (template.usage_count or 0) + 1
        template.last_used_at = datetime.now(timezone.utc)

    template.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return template


async def delete_template(
    db: AsyncSession, workspace_id: uuid.UUID, template_id: uuid.UUID,
) -> bool:
    await ensure_brand_design_templates_schema(db)
    result = await db.execute(
        delete(BrandDesignTemplate).where(
            BrandDesignTemplate.id == template_id,
            BrandDesignTemplate.workspace_id == workspace_id,
        )
    )
    return result.rowcount > 0


async def bulk_upsert_templates(
    db: AsyncSession, workspace_id: uuid.UUID, data: DesignTemplateBulkUpsert,
) -> list[BrandDesignTemplate]:
    """Replace a workspace's auto-generated design set.

    When ``archive_existing`` is set, prior active templates are archived so the
    fresh batch becomes the live set without losing historical usage data.

    When ``archive_existing`` is false, only active rows whose ``catalog_slot_key``
    collides with the incoming batch are archived — smoke tests and per-slot
    retries do not duplicate live templates.
    """
    await ensure_brand_design_templates_schema(db)

    incoming_keys = {
        item.catalog_slot_key for item in data.templates if item.catalog_slot_key
    }

    if data.archive_existing:
        await db.execute(
            update(BrandDesignTemplate)
            .where(
                BrandDesignTemplate.workspace_id == workspace_id,
                BrandDesignTemplate.status == "active",
            )
            .values(status="archived", updated_at=datetime.now(timezone.utc))
        )
    elif incoming_keys:
        await db.execute(
            update(BrandDesignTemplate)
            .where(
                BrandDesignTemplate.workspace_id == workspace_id,
                BrandDesignTemplate.status == "active",
                BrandDesignTemplate.catalog_slot_key.in_(incoming_keys),
            )
            .values(status="archived", updated_at=datetime.now(timezone.utc))
        )

    created: list[BrandDesignTemplate] = []
    for item in data.templates:
        template = BrandDesignTemplate(
            workspace_id=workspace_id,
            template_type=item.template_type,
            template_name=item.template_name,
            format=item.format,
            thumbnail_url=item.thumbnail_url,
            design_spec=item.design_spec or {},
            sector_category=item.sector_category,
            locale=item.locale,
            catalog_slot_key=item.catalog_slot_key,
            status="active",
        )
        db.add(template)
        created.append(template)

    await db.flush()
    logger.info(
        "design_templates.bulk_upsert",
        workspace_id=str(workspace_id),
        created=len(created),
        archived_existing=data.archive_existing,
    )
    return created
