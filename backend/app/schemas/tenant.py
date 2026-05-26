from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.schemas.common import OrmBase


class TenantCreate(BaseModel):
    name: str
    slug: str
    contact_email: EmailStr
    logo_url: str | None = None


class TenantUpdate(BaseModel):
    name: str | None = None
    contact_email: EmailStr | None = None
    logo_url: str | None = None
    is_active: bool | None = None


class TenantRead(OrmBase):
    id: uuid.UUID
    name: str
    slug: str
    contact_email: str
    logo_url: str | None
    is_active: bool
    created_at: datetime
