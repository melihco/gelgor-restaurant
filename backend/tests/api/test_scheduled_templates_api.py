import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import scheduled_templates as routes
from app.schemas.scheduled_templates import ScheduledTemplateCreate, ScheduledTemplateUpdate


class FakeDb:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1


def make_template(**overrides):
    data = {
        "id": uuid.uuid4(),
        "workspace_id": uuid.uuid4(),
        "slot_index": 1,
        "name": "Gunaydin",
        "description": None,
        "format": "story",
        "media_items": [{"url": "https://cdn.example/story.mp4", "type": "video"}],
        "schedule_type": "daily",
        "schedule_days": [0, 1, 2, 3, 4, 5, 6],
        "schedule_time": "09:00",
        "schedule_end_time": None,
        "timezone": "Europe/Istanbul",
        "status": "active",
        "category": "morning_greeting",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.mark.asyncio
async def test_list_workspace_templates_uses_service(monkeypatch) -> None:
    workspace_id = uuid.uuid4()
    expected = [make_template(workspace_id=workspace_id)]

    async def fake_list_templates(db, wid, *, include_archived=False):
        assert wid == workspace_id
        assert include_archived is True
        return expected

    monkeypatch.setattr(routes, "list_templates", fake_list_templates)

    result = await routes.list_workspace_templates(
        workspace_id,
        include_archived=True,
        db=FakeDb(),
    )

    assert result == expected


@pytest.mark.asyncio
async def test_create_workspace_template_commits_and_returns_template(monkeypatch) -> None:
    workspace_id = uuid.uuid4()
    db = FakeDb()
    created = make_template(workspace_id=workspace_id)
    body = ScheduledTemplateCreate(
        slot_index=1,
        name="Gunaydin",
        format="story",
        media_items=[],
        schedule_time="09:00",
    )

    async def fake_create_template(db_arg, wid, payload):
        assert db_arg is db
        assert wid == workspace_id
        assert payload.name == "Gunaydin"
        return created

    monkeypatch.setattr(routes, "create_template", fake_create_template)

    result = await routes.create_workspace_template(workspace_id, body, db=db)

    assert result == created
    assert db.commits == 1


@pytest.mark.asyncio
async def test_create_workspace_template_returns_400_for_service_value_error(monkeypatch) -> None:
    async def fake_create_template(*_args, **_kwargs):
        raise ValueError("Maximum 10 templates per workspace")

    monkeypatch.setattr(routes, "create_template", fake_create_template)

    with pytest.raises(HTTPException) as exc:
        await routes.create_workspace_template(
            uuid.uuid4(),
            ScheduledTemplateCreate(slot_index=1, name="Overflow"),
            db=FakeDb(),
        )

    assert exc.value.status_code == 400
    assert "Maximum 10" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_get_workspace_template_returns_404_when_missing(monkeypatch) -> None:
    async def fake_get_template(*_args, **_kwargs):
        return None

    monkeypatch.setattr(routes, "get_template", fake_get_template)

    with pytest.raises(HTTPException) as exc:
        await routes.get_workspace_template(uuid.uuid4(), uuid.uuid4(), db=FakeDb())

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_update_workspace_template_commits_when_found(monkeypatch) -> None:
    db = FakeDb()
    updated = make_template(name="Updated")

    async def fake_update_template(db_arg, *_args):
        assert db_arg is db
        return updated

    monkeypatch.setattr(routes, "update_template", fake_update_template)

    result = await routes.update_workspace_template(
        uuid.uuid4(),
        uuid.uuid4(),
        ScheduledTemplateUpdate(name="Updated"),
        db=db,
    )

    assert result.name == "Updated"
    assert db.commits == 1


@pytest.mark.asyncio
async def test_update_workspace_template_returns_404_when_missing(monkeypatch) -> None:
    async def fake_update_template(*_args, **_kwargs):
        return None

    monkeypatch.setattr(routes, "update_template", fake_update_template)

    with pytest.raises(HTTPException) as exc:
        await routes.update_workspace_template(
            uuid.uuid4(),
            uuid.uuid4(),
            ScheduledTemplateUpdate(name="Missing"),
            db=FakeDb(),
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_workspace_template_commits_when_deleted(monkeypatch) -> None:
    db = FakeDb()

    async def fake_delete_template(*_args, **_kwargs):
        return True

    monkeypatch.setattr(routes, "delete_template", fake_delete_template)

    await routes.delete_workspace_template(uuid.uuid4(), uuid.uuid4(), db=db)

    assert db.commits == 1


@pytest.mark.asyncio
async def test_delete_workspace_template_returns_404_when_missing(monkeypatch) -> None:
    async def fake_delete_template(*_args, **_kwargs):
        return False

    monkeypatch.setattr(routes, "delete_template", fake_delete_template)

    with pytest.raises(HTTPException) as exc:
        await routes.delete_workspace_template(uuid.uuid4(), uuid.uuid4(), db=FakeDb())

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_active_feed_templates_resolves_service_output(monkeypatch) -> None:
    template = make_template()
    feed_item = SimpleNamespace(name="Gunaydin", is_active_now=True)

    async def fake_list_templates(*_args, **_kwargs):
        return [template]

    def fake_resolve_active_templates_for_feed(templates):
        assert templates == [template]
        return [feed_item]

    monkeypatch.setattr(routes, "list_templates", fake_list_templates)
    monkeypatch.setattr(routes, "resolve_active_templates_for_feed", fake_resolve_active_templates_for_feed)

    result = await routes.get_active_feed_templates(uuid.uuid4(), db=FakeDb())

    assert result == [feed_item]
