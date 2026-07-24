#!/usr/bin/env python3
"""Reset SA Kredi spend for the current calendar month (all workspaces).

Tokens are derived from workspace_usage_daily.cost_usd (see token_billing_service).
This script zeros cost_usd + breakdown for usage_date >= month start.

Usage:
  # Dry-run (default)
  DATABASE_URL='postgresql://...' python3 scripts/reset-monthly-sa-credits.py

  # Apply
  DATABASE_URL='postgresql://...' python3 scripts/reset-monthly-sa-credits.py --execute

  # Optional: only one workspace
  DATABASE_URL='...' python3 scripts/reset-monthly-sa-credits.py --workspace-id <uuid> --execute
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from urllib.parse import urlparse, urlunparse


def _normalize_db_url(url: str) -> str:
    """asyncpg / SQLAlchemy URLs → libpq-compatible for psycopg."""
    u = url.strip()
    if u.startswith("postgresql+asyncpg://"):
        u = "postgresql://" + u[len("postgresql+asyncpg://") :]
    if u.startswith("postgres://"):
        u = "postgresql://" + u[len("postgres://") :]
    return u


def _redacted(url: str) -> str:
    try:
        p = urlparse(url)
        netloc = p.hostname or ""
        if p.port:
            netloc = f"{netloc}:{p.port}"
        if p.username:
            netloc = f"{p.username}:***@{netloc}"
        return urlunparse((p.scheme, netloc, p.path, "", "", ""))
    except Exception:
        return "(unparseable)"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Apply UPDATE (default is dry-run)")
    parser.add_argument("--workspace-id", default=None, help="Limit to one workspace UUID")
    parser.add_argument(
        "--month",
        default=None,
        help="Month start YYYY-MM-DD (default: first day of current UTC month)",
    )
    args = parser.parse_args()

    raw = os.environ.get("DATABASE_URL") or os.environ.get("CREW_DATABASE_URL") or ""
    if not raw.strip():
        print("ERROR: set DATABASE_URL (Python/crew Postgres)", file=sys.stderr)
        return 2

    db_url = _normalize_db_url(raw)
    month_start = date.fromisoformat(args.month) if args.month else date.today().replace(day=1)

    print(f"db: {_redacted(db_url)}")
    print(f"month_start: {month_start.isoformat()}")
    print(f"mode: {'EXECUTE' if args.execute else 'DRY-RUN'}")
    if args.workspace_id:
        print(f"workspace_id: {args.workspace_id}")

    # Prefer asyncpg (already in backend venv); fall back to psycopg*.
    try:
        import asyncio

        import asyncpg

        async def _run_asyncpg() -> int:
            conn = await asyncpg.connect(db_url, timeout=30)
            try:
                where = "usage_date >= $1"
                params: list = [month_start]
                if args.workspace_id:
                    where += " AND workspace_id = $2::uuid"
                    params.append(args.workspace_id)

                row = await conn.fetchrow(
                    f"""
                    SELECT
                      COUNT(*)::bigint AS rows,
                      COUNT(DISTINCT workspace_id)::bigint AS workspaces,
                      COALESCE(SUM(cost_usd), 0)::float AS cost_sum,
                      COALESCE(SUM(CASE WHEN cost_usd > 0 THEN 1 ELSE 0 END), 0)::bigint AS nonzero
                    FROM workspace_usage_daily
                    WHERE {where}
                    """,
                    *params,
                )
                print(
                    f"matched rows={row['rows']} workspaces={row['workspaces']} "
                    f"nonzero_cost_rows={row['nonzero']} sum_cost_usd={row['cost_sum']:.4f}"
                )
                if not args.execute:
                    print("Dry-run only — re-run with --execute to zero cost_usd/breakdown.")
                    return 0

                status = await conn.execute(
                    f"""
                    UPDATE workspace_usage_daily
                    SET
                      cost_usd = 0,
                      breakdown = '{{}}'::jsonb,
                      updated_at = NOW()
                    WHERE {where}
                      AND (cost_usd <> 0 OR COALESCE(breakdown, '{{}}'::jsonb) <> '{{}}'::jsonb)
                    """,
                    *params,
                )
                print(f"updated: {status}")
                row2 = await conn.fetchrow(
                    f"""
                    SELECT
                      COUNT(*)::bigint AS rows,
                      COALESCE(SUM(cost_usd), 0)::float AS cost_sum
                    FROM workspace_usage_daily
                    WHERE {where}
                    """,
                    *params,
                )
                print(f"after: rows={row2['rows']} sum_cost_usd={row2['cost_sum']:.4f}")
                return 0
            finally:
                await conn.close()

        rc = asyncio.run(_run_asyncpg())
        if rc == 0 and args.execute:
            print("OK: monthly SA Kredi spend reset for matched workspaces.")
        return rc
    except ImportError:
        pass

    try:
        import psycopg
    except ImportError:
        try:
            import psycopg2 as psycopg  # type: ignore
        except ImportError:
            print("ERROR: need asyncpg, psycopg, or psycopg2 installed", file=sys.stderr)
            return 2

    connect = getattr(psycopg, "connect", None)
    if connect is None:
        print("ERROR: unsupported psycopg API", file=sys.stderr)
        return 2

    with connect(db_url) as conn:
        with conn.cursor() as cur:
            where = "usage_date >= %s"
            params: list = [month_start]
            if args.workspace_id:
                where += " AND workspace_id = %s::uuid"
                params.append(args.workspace_id)

            cur.execute(
                f"""
                SELECT
                  COUNT(*)::bigint,
                  COUNT(DISTINCT workspace_id)::bigint,
                  COALESCE(SUM(cost_usd), 0)::float,
                  COALESCE(SUM(CASE WHEN cost_usd > 0 THEN 1 ELSE 0 END), 0)::bigint
                FROM workspace_usage_daily
                WHERE {where}
                """,
                params,
            )
            rows, workspaces, cost_sum, nonzero = cur.fetchone()
            print(
                f"matched rows={rows} workspaces={workspaces} "
                f"nonzero_cost_rows={nonzero} sum_cost_usd={cost_sum:.4f}"
            )

            if not args.execute:
                print("Dry-run only — re-run with --execute to zero cost_usd/breakdown.")
                return 0

            cur.execute(
                f"""
                UPDATE workspace_usage_daily
                SET
                  cost_usd = 0,
                  breakdown = '{{}}'::jsonb,
                  updated_at = NOW()
                WHERE {where}
                  AND (cost_usd <> 0 OR COALESCE(breakdown, '{{}}'::jsonb) <> '{{}}'::jsonb)
                """,
                params,
            )
            updated = cur.rowcount
            conn.commit()
            print(f"updated rows={updated}")

            cur.execute(
                f"""
                SELECT
                  COUNT(*)::bigint,
                  COALESCE(SUM(cost_usd), 0)::float
                FROM workspace_usage_daily
                WHERE {where}
                """,
                params,
            )
            rows2, cost2 = cur.fetchone()
            print(f"after: rows={rows2} sum_cost_usd={cost2:.4f}")

    print("OK: monthly SA Kredi spend reset for matched workspaces.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
