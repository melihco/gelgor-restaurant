"""Pydantic schemas for the special-days reference calendar."""

from __future__ import annotations

from pydantic import BaseModel


class SpecialDayRead(BaseModel):
    name: str
    name_en: str | None = None
    category: str
    theme_hint: str
    month: int
    day: int
    mmdd: str
    importance: int
    days_until: int
    country_code: str


class SpecialDaysResponse(BaseModel):
    country_code: str
    sector: str
    days: list[SpecialDayRead]
