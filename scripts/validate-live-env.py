#!/usr/bin/env python3
"""Validate live/staging environment readiness.

This script intentionally avoids printing secret values. It loads common local
env files when present, then validates required keys and placeholder values.

Usage:
  python scripts/validate-live-env.py
  python scripts/validate-live-env.py --strict
  python scripts/validate-live-env.py --strict --require-publish
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_FILES = (
    ROOT / ".env.production",
    ROOT / ".env",
    ROOT / "backend" / ".env",
    ROOT / "apps" / "web" / ".env.local",
)

PLACEHOLDER_TOKENS = (
    "replace-with",
    "your_",
    "your-",
    "change-me",
    "example.com",
    "dev-key",
    "dummy",
    "test",
)


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def merged_env() -> tuple[dict[str, str], list[Path]]:
    env: dict[str, str] = {}
    loaded: list[Path] = []
    for path in ENV_FILES:
        values = load_env_file(path)
        if values:
            env.update(values)
            loaded.append(path)
    env.update({k: v for k, v in os.environ.items() if v is not None})
    return env, loaded


def is_missing(env: dict[str, str], key: str) -> bool:
    value = str(env.get(key, "")).strip()
    return not value


def is_placeholder(env: dict[str, str], key: str) -> bool:
    value = str(env.get(key, "")).strip().lower()
    if not value:
        return False
    return any(token in value for token in PLACEHOLDER_TOKENS)


def has_any(env: dict[str, str], keys: tuple[str, ...]) -> bool:
    return any(not is_missing(env, key) for key in keys)


def add_required_group(
    failures: list[str],
    env: dict[str, str],
    label: str,
    keys: tuple[str, ...],
) -> None:
    if not has_any(env, keys):
        failures.append(f"{label}: set one of {', '.join(keys)}")


def validate(strict: bool, require_publish: bool) -> int:
    env, loaded = merged_env()
    failures: list[str] = []
    warnings: list[str] = []

    required = (
        "INTERNAL_API_KEY",
        "OPENAI_API_KEY",
        "NEXT_PUBLIC_API_URL",
    )
    for key in required:
        if is_missing(env, key):
            failures.append(f"{key}: missing")
        elif is_placeholder(env, key):
            failures.append(f"{key}: placeholder/dev value")

    add_required_group(
        failures,
        env,
        "Database",
        ("DATABASE_URL", "POSTGRES_URL", "POSTGRES_CONNECTION_STRING"),
    )
    add_required_group(
        failures,
        env,
        "Redis/distributed locks",
        ("REDIS_URL", "UPSTASH_REDIS_REST_URL"),
    )
    add_required_group(
        failures,
        env,
        "Crew backend URL",
        ("CREW_BACKEND_URL", "PYTHON_BACKEND_URL"),
    )

    r2_required = (
        "CLOUDFLARE_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
    )
    for key in r2_required:
        if is_missing(env, key):
            failures.append(f"{key}: missing (required for media upload/R2)")
        elif is_placeholder(env, key):
            failures.append(f"{key}: placeholder/dev value")

    optional_ai = ("FAL_API_KEY", "RUNWAY_API_SECRET")
    for key in optional_ai:
        if is_missing(env, key):
            warnings.append(f"{key}: missing (feature will degrade/fallback)")
        elif is_placeholder(env, key):
            warnings.append(f"{key}: placeholder/dev value")

    if require_publish:
        publish_groups = {
            "Meta publish": ("META_ACCESS_TOKEN", "MERTCAFE_API_KEY"),
            "Meta app": ("META_APP_ID", "META_APP_SECRET"),
        }
        for label, keys in publish_groups.items():
            add_required_group(failures, env, label, keys)

    print("Live env validation")
    print(f"- loaded files: {', '.join(str(p.relative_to(ROOT)) for p in loaded) or 'none'}")
    print(f"- strict: {strict}")
    print(f"- require_publish: {require_publish}")

    if warnings:
        print("\nWarnings:")
        for item in warnings:
            print(f"  - {item}")

    if failures:
        print("\nFailures:")
        for item in failures:
            print(f"  - {item}")
        return 1 if strict else 0

    print("\nOK: required live env checks passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="exit non-zero on failures")
    parser.add_argument("--require-publish", action="store_true", help="require Meta/Mertcafe publish secrets")
    args = parser.parse_args()
    return validate(strict=args.strict, require_publish=args.require_publish)


if __name__ == "__main__":
    raise SystemExit(main())
