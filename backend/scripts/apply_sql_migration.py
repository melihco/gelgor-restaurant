"""Apply a raw .sql migration file against the configured database (dev helper).

Usage:
    cd backend && source .venv/bin/activate
    python scripts/apply_sql_migration.py migrations/0023_production_jobs.sql

asyncpg cannot run multiple statements in a single prepared exec, so we split on
top-level semicolons (good enough for our hand-written DDL migrations) and run each.
"""

from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

from sqlalchemy import text

from app.database import async_session_factory


def _split_statements(sql: str) -> list[str]:
    # Strip line comments, then split on semicolons. Our migrations have no
    # semicolons inside string literals, so this is safe here.
    no_comments = "\n".join(
        line for line in sql.splitlines() if not line.strip().startswith("--")
    )
    parts = [s.strip() for s in re.split(r";\s*(?:\n|$)", no_comments)]
    return [p for p in parts if p]


async def run(path: str) -> None:
    sql = Path(path).read_text(encoding="utf-8")
    statements = _split_statements(sql)
    async with async_session_factory() as db:
        for stmt in statements:
            await db.execute(text(stmt))
        await db.commit()
    print(f"Applied {len(statements)} statement(s) from {path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python scripts/apply_sql_migration.py <path-to.sql>")
        raise SystemExit(2)
    asyncio.run(run(sys.argv[1]))
