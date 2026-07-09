#!/usr/bin/env python3
"""Resume local→live DB push: per-table pg_restore + batched OutputArtifacts copy."""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

import asyncpg

ROOT = Path(__file__).resolve().parents[1]
PG_BIN = os.environ.get("PG_BIN", "/opt/homebrew/opt/postgresql@18/bin")
LOCAL = os.environ.get(
    "LOCAL_DATABASE_URL",
    "postgresql://nexus:nexus_dev_2024@localhost:5432/nexus_db",
)
DUMP_DIR = os.environ.get(
    "DUMP_DIR",
    str(ROOT / "backups" / "nexus_local_dir_20260701"),
)

# Tables at/after OutputArtifacts in pg_restore TOC (OutputArtifacts handled separately).
TABLES_AFTER_OUTPUT_ARTIFACTS = [
    "Tenants",
    "Users",
    "action_logs",
    "agent_definitions",
    "agent_instances",
    "approvals",
    "artifact_cost_ledger",
    "brand_assets",
    "brand_contexts",
    "brand_design_templates",
    "brand_post_templates",
    "brand_rules",
    "brand_scheduled_templates",
    "content_assets",
    "content_reviews",
    "integration_connections",
    "meta_ad_campaigns",
    "mission_cost_ledger",
    "mission_task_nodes",
    "missions",
    "package_agent_allocations",
    "packages",
    "production_jobs",
    "prompt_profiles",
    "suggestions",
    "scheduled_posts",
    "social_connections",
    "special_days",
    "tasks",
    "tenants",
    "workspace_usage_daily",
    "workspaces",
]


def live_url() -> str:
    if os.environ.get("LIVE_DATABASE_URL"):
        return os.environ["LIVE_DATABASE_URL"]
    api_key = os.environ["RENDER_API_KEY"]
    pg_id = os.environ.get("RENDER_POSTGRES_ID", "dpg-d8gkt4f7f7vs73esgf00-a")
    req = urllib.request.Request(
        f"https://api.render.com/v1/postgres/{pg_id}/connection-info",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)["externalConnectionString"]


def pg_restore_table(live: str, table: str) -> None:
    qualified = f'public."{table}"' if table[0].isupper() else f"public.{table}"
    cmd = [
        f"{PG_BIN}/pg_restore",
        "-Fd",
        "--data-only",
        f"--table={qualified}",
        "--no-owner",
        "--no-acl",
        f"-d{live}",
        DUMP_DIR,
    ]
    print(f"  pg_restore {qualified}...", flush=True)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 and "already exists" not in (proc.stderr or ""):
        err = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
        print(f"    WARN: {' | '.join(err)}", flush=True)


async def copy_output_artifacts(local: str, live: str, batch_size: int = 200) -> None:
    print("  batched copy OutputArtifacts...", flush=True)
    src = await asyncpg.connect(local)
    dst = await asyncpg.connect(live, ssl="require")
    try:
        await dst.execute('TRUNCATE TABLE "OutputArtifacts" CASCADE')
        cols = [
            r["column_name"]
            for r in await src.fetch(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'OutputArtifacts'
                ORDER BY ordinal_position
                """
            )
        ]
        col_list = ", ".join(f'"{c}"' for c in cols)
        total = await src.fetchval('SELECT count(*) FROM "OutputArtifacts"')
        print(f"    rows={total}, batch={batch_size}", flush=True)
        offset = 0
        while offset < total:
            rows = await src.fetch(
                f'SELECT {col_list} FROM "OutputArtifacts" ORDER BY "Id" OFFSET $1 LIMIT $2',
                offset,
                batch_size,
            )
            if not rows:
                break
            records = [tuple(r[c] for c in cols) for r in rows]
            await dst.copy_records_to_table(
                "OutputArtifacts",
                records=records,
                columns=cols,
            )
            offset += len(rows)
            print(f"    copied {offset}/{total}", flush=True)
    finally:
        await src.close()
        await dst.close()


async def verify(live: str) -> None:
    conn = await asyncpg.connect(live, ssl="require")
    try:
        for rel in (
            "OutputArtifacts",
            "production_jobs",
            "missions",
            "brand_contexts",
            "Tenants",
        ):
            if rel[0].isupper():
                n = await conn.fetchval(f'SELECT count(*) FROM "{rel}"')
            else:
                n = await conn.fetchval(f"SELECT count(*) FROM {rel}")
            print(f"  {rel}: {n}", flush=True)
    finally:
        await conn.close()


async def main() -> None:
    live = live_url()
    print("Live target connected.", flush=True)
    print("==> Restore tables after OutputArtifacts", flush=True)
    for table in TABLES_AFTER_OUTPUT_ARTIFACTS:
        pg_restore_table(live, table)
    await copy_output_artifacts(LOCAL, live)
    print("==> Verify", flush=True)
    await verify(live)


if __name__ == "__main__":
    asyncio.run(main())
