"""Service for brand scheduled templates — CRUD + schedule resolution."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta

import structlog
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand_context import BrandScheduledTemplate
from app.schemas.scheduled_templates import (
    ScheduledTemplateCreate,
    ScheduledTemplateUpdate,
    ScheduledTemplateFeedItem,
    ScheduledMediaItem,
)

logger = structlog.get_logger()

MAX_TEMPLATES_PER_WORKSPACE = 10


async def list_templates(
    db: AsyncSession, workspace_id: uuid.UUID, *, include_archived: bool = False,
) -> list[BrandScheduledTemplate]:
    q = select(BrandScheduledTemplate).where(
        BrandScheduledTemplate.workspace_id == workspace_id
    ).order_by(BrandScheduledTemplate.slot_index)
    if not include_archived:
        q = q.where(BrandScheduledTemplate.status != "archived")
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_template(
    db: AsyncSession, workspace_id: uuid.UUID, template_id: uuid.UUID,
) -> BrandScheduledTemplate | None:
    result = await db.execute(
        select(BrandScheduledTemplate).where(
            BrandScheduledTemplate.id == template_id,
            BrandScheduledTemplate.workspace_id == workspace_id,
        )
    )
    return result.scalar_one_or_none()


async def create_template(
    db: AsyncSession, workspace_id: uuid.UUID, data: ScheduledTemplateCreate,
) -> BrandScheduledTemplate:
    existing = await list_templates(db, workspace_id)
    if len(existing) >= MAX_TEMPLATES_PER_WORKSPACE:
        raise ValueError(f"Maximum {MAX_TEMPLATES_PER_WORKSPACE} templates per workspace")

    slot_used = any(t.slot_index == data.slot_index for t in existing)
    if slot_used:
        raise ValueError(f"Slot {data.slot_index} is already in use")

    template = BrandScheduledTemplate(
        workspace_id=workspace_id,
        slot_index=data.slot_index,
        name=data.name,
        description=data.description,
        format=data.format,
        media_items=[m.model_dump() for m in data.media_items],
        schedule_type=data.schedule_type,
        schedule_days=data.schedule_days,
        schedule_time=data.schedule_time,
        schedule_end_time=data.schedule_end_time,
        timezone=data.timezone,
        category=data.category,
        status="active",
    )
    db.add(template)
    await db.flush()
    return template


async def update_template(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    data: ScheduledTemplateUpdate,
) -> BrandScheduledTemplate | None:
    template = await get_template(db, workspace_id, template_id)
    if not template:
        return None

    updates = data.model_dump(exclude_unset=True)
    if "media_items" in updates and updates["media_items"] is not None:
        updates["media_items"] = [
            m.model_dump() if isinstance(m, ScheduledMediaItem) else m
            for m in updates["media_items"]
        ]

    for field, value in updates.items():
        setattr(template, field, value)

    template.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return template


async def delete_template(
    db: AsyncSession, workspace_id: uuid.UUID, template_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        delete(BrandScheduledTemplate).where(
            BrandScheduledTemplate.id == template_id,
            BrandScheduledTemplate.workspace_id == workspace_id,
        )
    )
    return result.rowcount > 0


def is_template_active_now(
    template: BrandScheduledTemplate,
    now: datetime | None = None,
) -> bool:
    """Check if a template should be visible in the feed right now."""
    if template.status != "active":
        return False
    if not template.media_items:
        return False

    import zoneinfo
    try:
        tz = zoneinfo.ZoneInfo(template.timezone)
    except Exception:
        tz = zoneinfo.ZoneInfo("Europe/Istanbul")

    if now is None:
        now = datetime.now(timezone.utc)
    local_now = now.astimezone(tz)

    # Check day of week (0=Monday in Python, matches our schema)
    current_day = local_now.weekday()
    if template.schedule_type == "specific_days":
        if current_day not in (template.schedule_days or []):
            return False

    # Parse schedule time
    try:
        h, m = map(int, template.schedule_time.split(":"))
        start_minutes = h * 60 + m
    except (ValueError, AttributeError):
        start_minutes = 600  # default 10:00

    current_minutes = local_now.hour * 60 + local_now.minute

    # Parse end time
    if template.schedule_end_time:
        try:
            eh, em = map(int, template.schedule_end_time.split(":"))
            end_minutes = eh * 60 + em
        except (ValueError, AttributeError):
            end_minutes = start_minutes + 1440  # 24h window
    else:
        end_minutes = start_minutes + 1440  # stays visible until next day's start

    # Handle same-day window
    if end_minutes > start_minutes:
        return start_minutes <= current_minutes < end_minutes
    else:
        # Crosses midnight (e.g. 22:00 - 02:00)
        return current_minutes >= start_minutes or current_minutes < end_minutes


def resolve_active_templates_for_feed(
    templates: list[BrandScheduledTemplate],
    now: datetime | None = None,
) -> list[ScheduledTemplateFeedItem]:
    """Resolve which templates are currently active for the mobile feed."""
    result = []
    for t in templates:
        if t.status == "archived":
            continue
        active = is_template_active_now(t, now)
        result.append(ScheduledTemplateFeedItem(
            template_id=t.id,
            name=t.name,
            format=t.format,
            media_items=[ScheduledMediaItem(**m) for m in (t.media_items or [])],
            schedule_time=t.schedule_time,
            schedule_end_time=t.schedule_end_time,
            is_active_now=active,
            category=t.category,
        ))
    return result
