#!/usr/bin/env python3
"""Sync local .env secrets to Render services (web, api, crew).

Reads apps/web/.env.local and backend/.env — never commits secrets.
Usage:
  export RENDER_API_KEY=rnd_...
  python3 scripts/sync-render-env-from-local.py [--deploy]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_ENV = ROOT / "apps/web/.env.local"
BACKEND_ENV = ROOT / "backend/.env"

SERVICES = {
    "web": "srv-d8gktfn7f7vs73esgsvg",
    "api": "srv-d8gktf77f7vs73esgs80",
    "crew": "srv-d8gkten7f7vs73esgrkg",
}

PUBLIC_API = "https://smartagency-api.onrender.com"
PUBLIC_WEB = "https://smartagency-web.onrender.com"
INTERNAL_API = "smartagency-api:10000"
INTERNAL_WEB = "smartagency-web:10000"
INTERNAL_CREW = "smartagency-crew:10000"


def parse_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        out[key] = val
    return out


def merge_env() -> dict[str, str]:
    web = parse_dotenv(WEB_ENV)
    backend = parse_dotenv(BACKEND_ENV)
    merged = {**backend, **web}
    return merged


def build_service_env(merged: dict[str, str]) -> dict[str, dict[str, str]]:
    shared = {
        "INTERNAL_API_KEY": merged.get("INTERNAL_API_KEY", "smartagency-internal-dev-key"),
        "OPENAI_API_KEY": merged.get("OPENAI_API_KEY", ""),
        "APIFY_API_KEY": merged.get("APIFY_API_KEY", ""),
        "META_APP_ID": merged.get("META_APP_ID", ""),
        "META_APP_SECRET": merged.get("META_APP_SECRET", ""),
        "APP_ENV": "production",
        "ASPNETCORE_ENVIRONMENT": "Production",
        "NODE_ENV": "production",
        "NEXT_PUBLIC_USE_DEMO_CONTEXT": "false",
        "OrchestrationService__UseDevMock": "false",
        "ENABLE_PUBLIC_API": "true",
    }

    web_env = {
        **shared,
        "FAL_API_KEY": merged.get("FAL_API_KEY", ""),
        "RUNWAY_API_SECRET": merged.get("RUNWAY_API_SECRET") or merged.get("RUNWAYML_API_SECRET", ""),
        "RUNWAYML_API_SECRET": merged.get("RUNWAYML_API_SECRET") or merged.get("RUNWAY_API_SECRET", ""),
        "RUNWAY_MODEL": merged.get("RUNWAY_MODEL", "gen4_turbo"),
        "RUNWAY_API_VERSION": merged.get("RUNWAY_API_VERSION", "2024-11-06"),
        "RUNWAY_DEFAULT_DURATION": merged.get("RUNWAY_DEFAULT_DURATION", "5"),
        "RUNWAY_DEFAULT_RATIO": merged.get("RUNWAY_DEFAULT_RATIO", "720:1280"),
        "RUNWAY_TIMEOUT_MS": merged.get("RUNWAY_TIMEOUT_MS", "240000"),
        "OPENAI_API_KEY": merged.get("OPENAI_API_KEY", ""),
        "AI_MODEL_TIER": merged.get("AI_MODEL_TIER", "starter"),
        "SMART_AGENCY_IMAGE_PROVIDER": merged.get("SMART_AGENCY_IMAGE_PROVIDER", "flux"),
        "SMART_AGENCY_IMAGE_MODEL": merged.get("SMART_AGENCY_IMAGE_MODEL", "gpt-image-1"),
        "SMART_AGENCY_IMAGE_QUALITY": merged.get("SMART_AGENCY_IMAGE_QUALITY", "medium"),
        "FAL_IMAGE_MODEL": merged.get("FAL_IMAGE_MODEL", "fal-ai/flux/schnell"),
        "PREFER_FAL_DESIGNED_POSTS": merged.get("PREFER_FAL_DESIGNED_POSTS", "true"),
        "GRAFIKER_LITE": merged.get("GRAFIKER_LITE", "true"),
        "CD_LITE": merged.get("CD_LITE", "true"),
        "SKIP_ENHANCE_FOR_REMOTION_GRADE": merged.get("SKIP_ENHANCE_FOR_REMOTION_GRADE", "true"),
        "VIDEO_TIER_SCOPE": merged.get("VIDEO_TIER_SCOPE", "true"),
        "VENUE_PHOTO_PRESERVE": merged.get("VENUE_PHOTO_PRESERVE", "false"),
        "AUTO_PRODUCE_SUBTLE_ENHANCE": merged.get("AUTO_PRODUCE_SUBTLE_ENHANCE", "false"),
        "AUTO_PRODUCE_GALLERY_ONLY": merged.get("AUTO_PRODUCE_GALLERY_ONLY", "false"),
        "AUTO_PRODUCE_MAX_DAILY": merged.get("AUTO_PRODUCE_MAX_DAILY", "500"),
        "MISSION_AUTO_PRODUCE_MAX_PER_RUN": merged.get("MISSION_AUTO_PRODUCE_MAX_PER_RUN", "5"),
        "AUTO_PRODUCE_DAILY_BUDGET_USD": merged.get("AUTO_PRODUCE_DAILY_BUDGET_USD", "50"),
        "AUTO_PRODUCE_BYPASS_LIMITS": merged.get("AUTO_PRODUCE_BYPASS_LIMITS", "true"),
        "AUTO_PRODUCE_RUNWAY": merged.get("AUTO_PRODUCE_RUNWAY", "false"),
        "AUTO_PRODUCE_MAX_REELS_DAILY": merged.get("AUTO_PRODUCE_MAX_REELS_DAILY", "15"),
        "CREATOMATE_API_KEY": merged.get("CREATOMATE_API_KEY", ""),
        "ANTHROPIC_API_KEY": merged.get("ANTHROPIC_API_KEY", ""),
        "MERTCAFE_BASE_URL": merged.get("MERTCAFE_BASE_URL", ""),
        "MERTCAFE_API_KEY": merged.get("MERTCAFE_API_KEY", ""),
        "MERTCAFE_WORKSPACE_API_KEYS": merged.get("MERTCAFE_WORKSPACE_API_KEYS", ""),
        "CLOUDFLARE_ACCOUNT_ID": merged.get("CLOUDFLARE_ACCOUNT_ID", ""),
        "R2_ACCESS_KEY_ID": merged.get("R2_ACCESS_KEY_ID", ""),
        "R2_SECRET_ACCESS_KEY": merged.get("R2_SECRET_ACCESS_KEY", ""),
        "R2_BUCKET_NAME": merged.get("R2_BUCKET_NAME", "smartagency-media"),
        "R2_ENDPOINT": merged.get("R2_ENDPOINT", ""),
        "R2_PUBLIC_URL": merged.get("R2_PUBLIC_URL", ""),
        "META_USD_TRY_RATE": merged.get("META_USD_TRY_RATE", "32"),
        "NEXT_PUBLIC_SITE_URL": PUBLIC_WEB,
        "NEXUS_API_URL": PUBLIC_API,
        "NEXT_PUBLIC_API_URL": PUBLIC_API,
        "NEXT_PUBLIC_SIGNALR_URL": PUBLIC_API,
        "BACKEND_ORIGIN": f"http://{INTERNAL_API}",
        "NEXTJS_INTERNAL_URL": f"http://{INTERNAL_WEB}",
        "CREW_BACKEND_URL": f"http://{INTERNAL_CREW}",
    }

    api_env = {
        **shared,
        "FRONTEND_BASE_URL": PUBLIC_WEB,
        "Cors__AllowedOrigins__0": PUBLIC_WEB,
        "RateLimit__PermitLimit": "480",
        "Auth__EnsureSeedAdminLogin": "true",
        "OrchestrationService__BaseUrl": f"http://{INTERNAL_CREW}",
    }

    crew_env = {
        **shared,
        "APP_DEBUG": "false",
        "DATABASE_URL": os.environ.get("RENDER_CREW_DATABASE_URL", ""),
        "NEXUS_API_URL": f"http://{INTERNAL_API}",
        "NEXTJS_INTERNAL_URL": f"http://{INTERNAL_WEB}",
        "META_USD_TRY_RATE": merged.get("META_USD_TRY_RATE", "32"),
        "AUTO_PRODUCE_BYPASS_LIMITS": merged.get("AUTO_PRODUCE_BYPASS_LIMITS", "true"),
        "OPENAI_MODEL": merged.get("OPENAI_MODEL", "gpt-4o-mini"),
        "OPENAI_CONTENT_MODEL": merged.get("OPENAI_CONTENT_MODEL", "gpt-4o-mini"),
        "OPENAI_LITE_MODEL": merged.get("OPENAI_LITE_MODEL", "gpt-4o-mini"),
        "AI_MODEL_TIER": merged.get("AI_MODEL_TIER", "starter"),
        "ANTHROPIC_API_KEY": merged.get("ANTHROPIC_API_KEY", ""),
        "CREATOMATE_API_KEY": merged.get("CREATOMATE_API_KEY", ""),
        "WORKSPACE_DAILY_BUDGET_USD": merged.get("AUTO_PRODUCE_DAILY_BUDGET_USD", "50"),
        "AUTO_FEED_PRODUCTION_ENABLED": "true",
        "AUTO_MISSION_PROPOSAL_ENABLED": "true",
        "AUTO_CONTENT_ENABLED": "true",
        "SCHEDULER_ENABLED": "true",
        "TENANT_LEARNING_ENABLED": "true",
        "ENABLE_VISUAL_PRODUCTION_DIRECTOR": merged.get("ENABLE_VISUAL_PRODUCTION_DIRECTOR", "true"),
    }

    return {"web": web_env, "api": api_env, "crew": crew_env}


def render_request(method: str, path: str, body: dict | None = None) -> dict:
    api_key = os.environ.get("RENDER_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("RENDER_API_KEY required")
    url = f"https://api.render.com/v1{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        raise RuntimeError(f"{method} {path} -> {e.code}: {err[:400]}") from e


def set_env_var(service_id: str, key: str, value: str) -> None:
    if value is None or str(value).strip() == "":
        return
    for attempt in range(5):
        try:
            render_request("PUT", f"/services/{service_id}/env-vars/{key}", {"value": value})
            time.sleep(0.35)
            return
        except RuntimeError as e:
            if "429" in str(e) and attempt < 4:
                time.sleep(2 ** attempt)
                continue
            raise


def fetch_crew_database_url() -> str:
    pg_id = os.environ.get("RENDER_POSTGRES_ID", "dpg-d8gkt4f7f7vs73esgf00-a")
    info = render_request("GET", f"/postgres/{pg_id}/connection-info")
    internal = info.get("internalConnectionString") or ""
    if internal.startswith("postgresql://"):
        internal = "postgresql+asyncpg://" + internal[len("postgresql://") :]
    return internal


def trigger_deploy(service_id: str) -> str:
    out = render_request("POST", f"/services/{service_id}/deploys", {"clearCache": "clear"})
    dep = out.get("deploy") or out
    return str(dep.get("id") or dep)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deploy", action="store_true", help="Trigger deploy after sync")
    args = parser.parse_args()

    merged = merge_env()
    if not merged.get("OPENAI_API_KEY") or not merged.get("FAL_API_KEY"):
        raise SystemExit(f"Missing keys in {WEB_ENV} — OPENAI_API_KEY and FAL_API_KEY required")

    os.environ.setdefault("RENDER_POSTGRES_ID", "dpg-d8gkt4f7f7vs73esgf00-a")
    crew_db = fetch_crew_database_url()
    if crew_db:
        os.environ["RENDER_CREW_DATABASE_URL"] = crew_db

    service_env = build_service_env(merged)
    counts: dict[str, int] = {}
    for name, sid in SERVICES.items():
        env_map = service_env[name]
        if name == "crew" and crew_db:
            env_map["DATABASE_URL"] = crew_db
        n = 0
        for key, val in env_map.items():
            if val is None:
                continue
            set_env_var(sid, key, str(val))
            n += 1
        counts[name] = n
        print(f"[sync] {name}: {n} env vars set on {sid}")

    if args.deploy:
        for name, sid in SERVICES.items():
            dep_id = trigger_deploy(sid)
            print(f"[deploy] {name}: deploy {dep_id} started")

    print("[done] Render env sync complete")


if __name__ == "__main__":
    main()
