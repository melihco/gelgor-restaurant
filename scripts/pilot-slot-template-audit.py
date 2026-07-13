#!/usr/bin/env python3
"""
Pre-flight audit — catalog slot ↔ brand_design_templates bindings for a workspace.

Mirrors production matching in apps/web/src/lib/catalog-design-template-gallery.ts:
  1. catalog_slot_key (or design_spec.catalogSlotKey) exact match
  2. design_template_type fallback (unclaimed templates only)

Usage:
  # Local (reads backend/.env DATABASE_URL if --dsn omitted)
  python3 scripts/pilot-slot-template-audit.py <workspace-uuid>

  # Live
  export LIVE_DATABASE_URL='postgresql+asyncpg://...'
  python3 scripts/pilot-slot-template-audit.py f00e3308-ebbe-4d75-8592-12d52e7ff1aa --dsn "$LIVE_DATABASE_URL"

  python3 scripts/pilot-slot-template-audit.py <uuid> --json
  python3 scripts/pilot-slot-template-audit.py <uuid> --include-disabled
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

FAL_PIPELINES = frozenset({
    "fal_design",
    "fal_story",
    "fal_reel",
    "fal_only_post",
    "fal_only_story",
    "fal_only_reel",
})

ACTIVE_TEMPLATE_STATUSES = frozenset({"active", "approved"})


def _normalize_dsn(raw: str) -> str:
    dsn = raw.strip().strip('"').strip("'")
    if dsn.startswith("postgresql://") and "+asyncpg" not in dsn:
        dsn = dsn.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "oregon-postgres.render.com" in dsn:
        dsn = dsn.replace("sslmode=require", "ssl=require")
        if "ssl=" not in dsn:
            dsn += "&ssl=require" if "?" in dsn else "?ssl=require"
    return dsn


def _load_default_dsn() -> str:
    env = os.environ.get("LIVE_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
    if env:
        return env
    env_path = BACKEND_ROOT / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def catalog_key_of(template: Any) -> str | None:
    spec = template.design_spec if isinstance(template.design_spec, dict) else {}
    key = template.catalog_slot_key or spec.get("catalogSlotKey")
    return str(key).strip() if key else None


def has_design_prompt(template: Any) -> bool:
    spec = template.design_spec if isinstance(template.design_spec, dict) else {}
    prompt = spec.get("prompt")
    return isinstance(prompt, str) and bool(prompt.strip())


@dataclass
class SlotTemplateRow:
    slot_key: str
    label_tr: str
    format: str
    pipeline: str
    slot_role: str
    design_template_type: str
    enabled: bool
    priority: int
    match_source: str | None
    template_id: str | None
    template_name: str | None
    template_type: str | None
    template_status: str | None
    template_format: str | None
    has_thumbnail: bool
    has_prompt: bool
    production_ready: bool
    issues: list[str]


@dataclass
class AuditReport:
    workspace_id: str
    business_name: str | None
    sector_id: str
    enabled_slot_count: int
    active_template_count: int
    fal_slot_count: int
    fal_slots_with_template: int
    production_ready_fal_slots: int
    rows: list[SlotTemplateRow]
    orphan_templates: list[dict[str, Any]]
    duplicate_catalog_keys: list[dict[str, Any]]
    summary_issues: list[str]


def compatible_template_formats(slot_format: str) -> set[str]:
    """Mirror compatibleFormats() in brand-design-template-matcher.ts."""
    fmt = (slot_format or "post").strip().lower()
    if fmt == "reel":
        return {"reel", "reel_cover", "story"}
    if fmt == "carousel":
        return {"carousel", "post"}
    return {fmt}


def match_slots_to_templates(
    slots: list[Any],
    assignments_by_key: dict[str, Any],
    templates: list[Any],
) -> tuple[dict[str, dict[str, Any]], set[str]]:
    """Return slot_key → {template, match_source} and claimed template ids.

    Two-pass, mirroring catalog-design-template-gallery.ts:
      Pass 1 — catalog_slot_key exact match for ALL slots first.
      Pass 2 — design_template_type fallback with unclaimed templates.
    """
    active = [t for t in templates if (t.status or "") in ACTIVE_TEMPLATE_STATUSES]
    by_catalog: dict[str, Any] = {}
    by_type: dict[str, list[Any]] = {}
    for template in active:
        key = catalog_key_of(template)
        if key and key not in by_catalog:
            by_catalog[key] = template
        by_type.setdefault(str(template.template_type), []).append(template)

    matches: dict[str, dict[str, Any]] = {}
    claimed: set[str] = set()

    # Pass 1 — catalog_slot_key wins over slot iteration order.
    for slot in slots:
        catalog_match = by_catalog.get(slot.slot_key)
        if catalog_match and str(catalog_match.id) not in claimed:
            matches[slot.slot_key] = {"template": catalog_match, "match_source": "catalog_key"}
            claimed.add(str(catalog_match.id))

    # Pass 2 — template_type fallback for slots still unmatched.
    for slot in slots:
        if slot.slot_key in matches:
            continue
        type_candidates = by_type.get(str(slot.design_template_type), [])
        fallback = next((t for t in type_candidates if str(t.id) not in claimed), None)
        if fallback:
            matches[slot.slot_key] = {"template": fallback, "match_source": "template_type"}
            claimed.add(str(fallback.id))

    return matches, claimed


def build_report(
    workspace_id: uuid.UUID,
    business_name: str | None,
    sector_id: str,
    slot_rows: list[dict[str, Any]],
    templates: list[Any],
    include_disabled: bool,
) -> AuditReport:
    slots = [row["slot"] for row in slot_rows]
    assignments_by_key = {row["assignment"].slot_key: row["assignment"] for row in slot_rows}

    if not include_disabled:
        slots = [s for s in slots if assignments_by_key.get(s.slot_key, None) and assignments_by_key[s.slot_key].enabled]

    active_templates = [t for t in templates if (t.status or "") in ACTIVE_TEMPLATE_STATUSES]
    matches, claimed_ids = match_slots_to_templates(slots, assignments_by_key, templates)

    audit_rows: list[SlotTemplateRow] = []
    fal_slot_count = 0
    fal_with_template = 0
    production_ready_fal = 0

    for slot in sorted(slots, key=lambda s: (
        assignments_by_key.get(s.slot_key).priority if assignments_by_key.get(s.slot_key) else 999,
        s.sort_order,
        s.slot_key,
    )):
        assignment = assignments_by_key.get(slot.slot_key)
        enabled = bool(assignment and assignment.enabled)
        match = matches.get(slot.slot_key)
        template = match["template"] if match else None
        match_source = match["match_source"] if match else None

        issues: list[str] = []
        is_fal = slot.pipeline in FAL_PIPELINES
        if is_fal:
            fal_slot_count += 1

        has_thumb = bool(template and template.thumbnail_url)
        has_prompt = bool(template and has_design_prompt(template))
        fmt_ok = not template or str(template.format) in compatible_template_formats(str(slot.format))

        if enabled and is_fal and not template:
            issues.append("GAP:no_template_for_fal_slot")
        if template and not fmt_ok:
            issues.append("WARN:format_mismatch")
        if template and is_fal and not has_thumb:
            issues.append("WARN:missing_thumbnail")
        if template and is_fal and not has_prompt:
            issues.append("WARN:missing_design_spec_prompt")
        if match_source == "template_type" and is_fal:
            issues.append("INFO:fallback_template_type_match")

        production_ready = bool(
            enabled
            and is_fal
            and template
            and has_thumb
            and has_prompt
            and fmt_ok
        )

        if is_fal and template:
            fal_with_template += 1
        if production_ready:
            production_ready_fal += 1

        audit_rows.append(
            SlotTemplateRow(
                slot_key=slot.slot_key,
                label_tr=slot.label_tr,
                format=slot.format,
                pipeline=slot.pipeline,
                slot_role=slot.slot_role,
                design_template_type=slot.design_template_type,
                enabled=enabled,
                priority=assignment.priority if assignment else slot.sort_order,
                match_source=match_source,
                template_id=str(template.id) if template else None,
                template_name=str(template.template_name) if template else None,
                template_type=str(template.template_type) if template else None,
                template_status=str(template.status) if template else None,
                template_format=str(template.format) if template else None,
                has_thumbnail=has_thumb,
                has_prompt=has_prompt,
                production_ready=production_ready,
                issues=issues,
            ),
        )

    # Orphan templates — active but not claimed by any displayed slot
    enabled_slot_keys = {s.slot_key for s in slots if assignments_by_key.get(s.slot_key, None) and assignments_by_key[s.slot_key].enabled}
    orphan_templates: list[dict[str, Any]] = []
    for template in active_templates:
        if str(template.id) in claimed_ids:
            continue
        catalog_key = catalog_key_of(template)
        orphan_templates.append({
            "id": str(template.id),
            "template_name": template.template_name,
            "template_type": template.template_type,
            "format": template.format,
            "catalog_slot_key": catalog_key,
            "status": template.status,
            "has_thumbnail": bool(template.thumbnail_url),
            "has_prompt": has_design_prompt(template),
            "catalog_slot_enabled": catalog_key in enabled_slot_keys if catalog_key else False,
        })

    # Duplicate catalog_slot_key bindings.
    # Special-day variant sets (same key, distinct specialDay.mmdd) are intentional:
    # production picks the in-season one via specialDayProximityBonus.
    def special_day_mmdd(template: Any) -> str | None:
        spec = template.design_spec if isinstance(template.design_spec, dict) else {}
        sd = spec.get("specialDay")
        return str(sd.get("mmdd")) if isinstance(sd, dict) and sd.get("mmdd") else None

    catalog_dupes: dict[str, list[Any]] = {}
    for template in active_templates:
        key = catalog_key_of(template)
        if key:
            catalog_dupes.setdefault(key, []).append(template)

    duplicate_catalog_keys = []
    for key, group in catalog_dupes.items():
        if len(group) <= 1:
            continue
        mmdds = [special_day_mmdd(t) for t in group]
        is_seasonal_set = all(m is not None for m in mmdds) and len(set(mmdds)) == len(mmdds)
        duplicate_catalog_keys.append({
            "catalog_slot_key": key,
            "template_ids": [str(t.id) for t in group],
            "template_names": [t.template_name for t in group],
            "seasonal_variant_set": is_seasonal_set,
        })

    summary_issues: list[str] = []
    gap_count = sum(1 for r in audit_rows if "GAP:no_template_for_fal_slot" in r.issues and r.enabled)
    if gap_count:
        summary_issues.append(f"{gap_count} enabled Fal slot(s) have no matching template")
    hard_dupes = [d for d in duplicate_catalog_keys if not d["seasonal_variant_set"]]
    if hard_dupes:
        summary_issues.append(f"{len(hard_dupes)} catalog_slot_key value(s) bound to multiple non-seasonal templates")
    orphan_unbound = [o for o in orphan_templates if not o["catalog_slot_enabled"]]
    if orphan_unbound:
        summary_issues.append(f"{len(orphan_unbound)} active template(s) not used by any enabled slot")
    if fal_slot_count and production_ready_fal < fal_slot_count:
        summary_issues.append(
            f"production-ready Fal slots: {production_ready_fal}/{fal_slot_count} "
            "(need template + thumbnail + design_spec.prompt + format match)",
        )

    return AuditReport(
        workspace_id=str(workspace_id),
        business_name=business_name,
        sector_id=sector_id,
        enabled_slot_count=sum(1 for r in audit_rows if r.enabled),
        active_template_count=len(active_templates),
        fal_slot_count=fal_slot_count,
        fal_slots_with_template=fal_with_template,
        production_ready_fal_slots=production_ready_fal,
        rows=audit_rows,
        orphan_templates=orphan_templates,
        duplicate_catalog_keys=duplicate_catalog_keys,
        summary_issues=summary_issues,
    )


def print_markdown(report: AuditReport) -> None:
    title = report.business_name or report.workspace_id
    print(f"# Slot ↔ Template audit — {title}")
    print()
    print(f"- **Workspace:** `{report.workspace_id}`")
    print(f"- **Sector:** `{report.sector_id}`")
    print(f"- **Enabled slots:** {report.enabled_slot_count}")
    print(f"- **Active templates:** {report.active_template_count}")
    print(
        f"- **Fal slots ready for production:** {report.production_ready_fal_slots}/"
        f"{report.fal_slot_count} (with template match)",
    )
    print()

    if report.summary_issues:
        print("## Issues")
        for issue in report.summary_issues:
            print(f"- {issue}")
        print()

    print("## Catalog slots")
    print()
    print(
        "| Slot | Format | Pipeline | Enabled | Match | Template | Thumb | Prompt | Ready | Notes |",
    )
    print(
        "|------|--------|----------|---------|-------|----------|-------|--------|-------|-------|",
    )
    for row in report.rows:
        if not row.enabled and row.pipeline not in FAL_PIPELINES:
            continue
        tpl = "—"
        if row.template_name:
            short_id = (row.template_id or "")[:8]
            tpl = f"{row.template_name} (`{short_id}`)"
        notes = ", ".join(row.issues) if row.issues else "—"
        print(
            f"| `{row.slot_key}` | {row.format} | {row.pipeline} | "
            f"{'yes' if row.enabled else 'no'} | {row.match_source or '—'} | {tpl} | "
            f"{'yes' if row.has_thumbnail else 'no'} | {'yes' if row.has_prompt else 'no'} | "
            f"{'yes' if row.production_ready else 'no'} | {notes} |",
        )
    print()

    if report.duplicate_catalog_keys:
        print("## Duplicate catalog_slot_key bindings")
        for dup in report.duplicate_catalog_keys:
            tag = " (seasonal variant set — OK)" if dup["seasonal_variant_set"] else " (CONFLICT)"
            print(f"- `{dup['catalog_slot_key']}` → {dup['template_names']}{tag}")
        print()

    if report.orphan_templates:
        print("## Unclaimed active templates")
        for orphan in report.orphan_templates:
            flag = "enabled slot" if orphan["catalog_slot_enabled"] else "no enabled slot"
            print(
                f"- `{orphan['id'][:8]}…` **{orphan['template_name']}** "
                f"({orphan['template_type']}, catalog=`{orphan['catalog_slot_key'] or '—'}`) — {flag}",
            )
        print()


async def run_audit(
    workspace_id: uuid.UUID,
    *,
    sector_override: str | None,
    include_disabled: bool,
) -> AuditReport:
    from sqlalchemy import select

    from app.database import async_session_factory
    from app.models.brand_context import BrandContext, BrandDesignTemplate
    from app.services.slot_catalog_service import (
        list_tenant_enabled_slots,
        list_tenant_assignments,
        list_slot_definitions,
        resolve_workspace_sector_id,
    )

    async with async_session_factory() as session:
        brand_row = await session.execute(
            select(BrandContext.business_name).where(BrandContext.workspace_id == workspace_id),
        )
        business_name = brand_row.scalar_one_or_none()

        sector_id = sector_override or await resolve_workspace_sector_id(session, workspace_id)
        if not sector_id:
            raise SystemExit(f"Could not resolve sector for workspace {workspace_id}")

        if include_disabled:
            assignments = await list_tenant_assignments(session, workspace_id)
            sector_slots = await list_slot_definitions(session, sector_id=sector_id, active_only=True)
            slot_by_key = {s.slot_key: s for s in sector_slots}
            slot_rows = [
                {"assignment": a, "slot": slot_by_key[a.slot_key]}
                for a in assignments
                if a.slot_key in slot_by_key
            ]
        else:
            slot_rows = await list_tenant_enabled_slots(session, workspace_id)
            if not slot_rows:
                from types import SimpleNamespace

                from app.services.slot_catalog_service import (
                    _load_brand_slot_facilities,
                    _slot_enabled_by_facilities,
                )

                defaults = await list_slot_definitions(session, sector_id=sector_id, active_only=True)
                facilities = await _load_brand_slot_facilities(session, workspace_id)
                slot_rows = []
                for slot in defaults:
                    if not slot.enabled_by_default:
                        continue
                    if not _slot_enabled_by_facilities(slot.optional_tags, facilities):
                        continue
                    slot_rows.append({
                        "assignment": SimpleNamespace(
                            slot_key=slot.slot_key,
                            enabled=True,
                            priority=slot.sort_order,
                        ),
                        "slot": slot,
                    })

        templates_result = await session.execute(
            select(BrandDesignTemplate).where(BrandDesignTemplate.workspace_id == workspace_id),
        )
        templates = list(templates_result.scalars().all())

        return build_report(
            workspace_id,
            str(business_name) if business_name else None,
            sector_id,
            slot_rows,
            templates,
            include_disabled=include_disabled,
        )


def main() -> None:
    import logging

    logging.basicConfig(level=logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    parser = argparse.ArgumentParser(description="Audit catalog slot ↔ design template bindings")
    parser.add_argument("workspace_id", help="Tenant/workspace UUID")
    parser.add_argument("--sector", help="Override sector_id (default: resolve from brand_context)")
    parser.add_argument(
        "--dsn",
        default=_load_default_dsn(),
        help="Postgres DSN (default: LIVE_DATABASE_URL, DATABASE_URL, or backend/.env)",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of markdown")
    parser.add_argument(
        "--include-disabled",
        action="store_true",
        help="Include tenant assignments with enabled=false",
    )
    args = parser.parse_args()

    if not args.dsn:
        raise SystemExit("Set LIVE_DATABASE_URL / DATABASE_URL or pass --dsn")

    try:
        workspace_id = uuid.UUID(args.workspace_id.strip())
    except ValueError as exc:
        raise SystemExit(f"Invalid workspace UUID: {args.workspace_id}") from exc

    os.environ["DATABASE_URL"] = _normalize_dsn(args.dsn)

    report = asyncio.run(
        run_audit(
            workspace_id,
            sector_override=args.sector,
            include_disabled=args.include_disabled,
        ),
    )

    if args.json:
        print(json.dumps(asdict(report), indent=2, ensure_ascii=False))
    else:
        print_markdown(report)

    # Non-zero exit when Fal slots are not production-ready (useful in CI / pre-deploy)
    if report.fal_slot_count > 0 and report.production_ready_fal_slots < report.fal_slot_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
