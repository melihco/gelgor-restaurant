#!/usr/bin/env python3
"""Seed Karaman Datça chatbot profile + write output JSON."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import async_session_factory
from app.services import chatbot_profile_service

KARAMAN_WS = "327db521-ede2-48e0-8f06-4146ee458c50"
OUTPUT = ROOT.parent / "docs" / "outputs" / "karaman-chatbot-profile.json"


async def main() -> None:
    import uuid

    ws = uuid.UUID(KARAMAN_WS)
    async with async_session_factory() as db:
        profile, updated_at = await chatbot_profile_service.analyze_and_save_chatbot_profile(db, ws)

    payload = {
        "workspace_id": KARAMAN_WS,
        "brand": "Karaman Datça",
        "updated_at": updated_at.isoformat(),
        "profile": profile.model_dump(mode="json"),
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Seeded chatbot profile → {OUTPUT}")
    print(f"Display name: {profile.business_display_name}")
    print(f"Categories: {len(profile.product_categories)}")
    print(f"FAQs: {len(profile.faqs)}")
    print(f"Confidence: {profile.analysis_confidence}%")


if __name__ == "__main__":
    asyncio.run(main())
