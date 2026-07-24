"""Verify factory-critical DB columns exist (exit 1 on miss).

Usage:
    cd backend && source .venv/bin/activate
    python scripts/verify_schema.py

Optional: SCHEMA_GATE_APPLY=1 to run additive IF NOT EXISTS DDL then re-check.
"""

from __future__ import annotations

import asyncio
import os
import sys


async def main() -> int:
    from app.database import engine
    from app.services.schema_gate import apply_additive_factory_ddl, inspect_schema

    if os.environ.get("SCHEMA_GATE_APPLY", "").strip() in ("1", "true", "yes"):
        print("Applying additive factory DDL…")
        await apply_additive_factory_ddl(engine)

    report = await inspect_schema(engine)
    await engine.dispose()

    if report.ok:
        print("schema_gate: OK")
        return 0

    print("schema_gate: MISSING")
    for item in report.missing:
        print(f"  - {item}")
    print("Hint: python scripts/apply_sql_migration.py migrations/<file>.sql")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
