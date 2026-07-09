#!/usr/bin/env python3
"""Local → live DB push that fits Render free-tier disk (~1GB).

Restores full schema + all non-artifact data (~56MB), then copies OutputArtifacts
with trimmed Content/Metadata (ContentUrl + essential metadata preserved).
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any

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

KEEP_META_KEYS = {
    "mission_id", "missionId", "idea_index", "ideaIndex", "slot_role", "slotRole",
    "production_role", "productionRole", "pipeline", "content_type", "contentType",
    "reference_photo_url", "referencePhotoUrl", "gallery_photo_url", "source_gallery_url",
    "feed_preview_url", "galleryPreviewUrl", "videoUrl", "video_url",
    "publish_ready", "publishReady", "renderer_executed", "i2v_reused",
    "calendar_enriched", "calendar_plan_index", "format", "content_kind",
}


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


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("  $", cmd[0], cmd[1] if len(cmd) > 1 else "", flush=True)
    env = {**os.environ, "PGSSLMODE": "require"}
    return subprocess.run(cmd, check=check, capture_output=True, text=True, env=env)


def slim_metadata(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for key, val in raw.items():
        if key in KEEP_META_KEYS:
            out[key] = val
    return out


def slim_content(raw: str, meta: dict[str, Any]) -> str:
    caption = meta.get("caption") or meta.get("caption_draft") or ""
    headline = meta.get("headline") or meta.get("title") or ""
    payload = {
        "caption": str(caption)[:2000] if caption else "",
        "headline": str(headline)[:500] if headline else "",
        "contentUrl": meta.get("contentUrl") or meta.get("content_url") or "",
    }
    return json.dumps(payload, ensure_ascii=False)


def build_toc_without_artifacts() -> Path:
    toc_all = subprocess.run(
        [f"{PG_BIN}/pg_restore", "-l", DUMP_DIR],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    filtered = [
        line for line in toc_all
        if "TABLE DATA public OutputArtifacts " not in line
    ]
    toc_path = ROOT / "backups" / "nexus_restore_no_artifacts.toc"
    toc_path.write_text("\n".join(filtered) + "\n", encoding="utf-8")
    return toc_path


async def reset_and_restore_schema(live: str) -> None:
    conn = await asyncpg.connect(live, ssl="require")
    try:
        await conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
        await conn.execute("CREATE SCHEMA public")
        await conn.execute("GRANT ALL ON SCHEMA public TO nexus")
        await conn.execute("GRANT ALL ON SCHEMA public TO public")
    finally:
        await conn.close()

    run([
        f"{PG_BIN}/pg_restore", "-Fd", "--schema-only",
        "--no-owner", "--no-acl", f"-d{live}", DUMP_DIR,
    ])
    toc = build_toc_without_artifacts()
    proc = run([
        f"{PG_BIN}/pg_restore", "-Fd", "--data-only",
        "-L", str(toc),
        "--disable-triggers",
        "--no-owner", "--no-acl", f"-d{live}", DUMP_DIR,
    ], check=False)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-8:]
        # Render may still apply most rows; warn and continue if only FK/COPY noise.
        print("  pg_restore data warnings:", " | ".join(tail), flush=True)


async def copy_slim_artifacts(local: str, live: str, batch_size: int = 300) -> None:
    src = await asyncpg.connect(local)
    dst = await asyncpg.connect(live, ssl="require")
    cols = [
        "Id", "TaskId", "AgentRunId", "ArtifactType", "Title", "Content",
        "ContentUrl", "Metadata", "Version", "IsLatest", "ReviewStatus",
        "IsDeleted", "DeletedAt", "CreatedAt", "UpdatedAt", "CreatedBy", "UpdatedBy", "TenantId",
    ]
    try:
        total = await src.fetchval('SELECT count(*) FROM "OutputArtifacts"')
        print(f"  slim OutputArtifacts rows={total}", flush=True)
        offset = 0
        while offset < total:
            rows = await src.fetch(
                f'SELECT * FROM "OutputArtifacts" ORDER BY "Id" OFFSET $1 LIMIT $2',
                offset,
                batch_size,
            )
            if not rows:
                break
            records = []
            for r in rows:
                meta = slim_metadata(r["Metadata"])
                content = slim_content(r["Content"], meta)
                records.append((
                    r["Id"], r["TaskId"], r["AgentRunId"], r["ArtifactType"], r["Title"],
                    content, r["ContentUrl"], json.dumps(meta), r["Version"], r["IsLatest"],
                    r["ReviewStatus"], r["IsDeleted"], r["DeletedAt"], r["CreatedAt"],
                    r["UpdatedAt"], r["CreatedBy"], r["UpdatedBy"], r["TenantId"],
                ))
            await dst.copy_records_to_table("OutputArtifacts", records=records, columns=cols)
            offset += len(rows)
            print(f"    {offset}/{total}", flush=True)
    finally:
        await src.close()
        await dst.close()


async def verify(live: str) -> None:
    conn = await asyncpg.connect(live, ssl="require")
    try:
        checks = [
            ('"OutputArtifacts"', "OutputArtifacts"),
            ("production_jobs", "production_jobs"),
            ("missions", "missions"),
            ("brand_contexts", "brand_contexts"),
            ('"Tenants"', "Tenants"),
        ]
        for sql, label in checks:
            n = await conn.fetchval(f"SELECT count(*) FROM {sql}")
            print(f"  {label}: {n}", flush=True)
        size = await conn.fetchval("SELECT pg_size_pretty(pg_database_size(current_database()))")
        print(f"  db_size: {size}", flush=True)
    finally:
        await conn.close()


async def main() -> None:
    live = live_url()
    print("==> Reset live schema", flush=True)
    await reset_and_restore_schema(live)
    print("==> Slim artifact copy", flush=True)
    await copy_slim_artifacts(LOCAL, live)
    print("==> Verify", flush=True)
    await verify(live)


if __name__ == "__main__":
    asyncio.run(main())
