"""Resolve tenant operating profile and evaluate capability / gallery policies."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.crew.industry_playbooks import get_industry_playbook, merge_playbook_content_needs, risk_rules_for_industry
from app.crew.tenant_capability_catalog import (
    BARBER_SALON_PLAYBOOK_ID,
    BEFORE_AFTER_ASSET_TYPES,
    CLIENT_ASSET_TYPES,
    EXTRA_CONTENT_CAPABILITIES,
    WORKFLOW_CAPABILITIES,
    TenantCapabilityDefinition,
    gallery_policy_for_industry,
    list_capabilities_for_industry,
    normalize_industry_id,
)


@dataclass
class ResolvedTenantOperatingProfile:
    tenant_id: str
    industry: str
    playbook_id: str
    enabled_capabilities: list[str] = field(default_factory=list)
    gallery_policy: dict = field(default_factory=dict)
    risk_rules: dict[str, str] = field(default_factory=dict)
    custom_rules: str = ""


def _parse_json_array(raw: str | None) -> list[str]:
    if not raw or not str(raw).strip():
        return []
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return []
        return [str(x).strip() for x in parsed if str(x).strip()]
    except (json.JSONDecodeError, TypeError):
        return []


def _parse_gallery_policy(raw: str | None, industry: str) -> dict:
    base = gallery_policy_for_industry(industry)
    out = {
        "allowedAssetIntents": list(base.allowed_asset_intents),
        "clientPhotoPolicy": base.client_photo_policy,
        "beforeAfterPolicy": base.before_after_policy,
        "maxGalleryPhotos": base.max_gallery_photos,
        "requireConsentMetadata": base.require_consent_metadata,
    }
    if not raw or not str(raw).strip():
        return out
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            out.update({k: v for k, v in parsed.items() if v is not None})
    except json.JSONDecodeError:
        pass
    return out


def resolve_tenant_operating_profile(
    *,
    tenant_id: str,
    industry: str,
    content_needs_json: str | None = None,
    operating_capabilities_json: str | None = None,
    gallery_policy_json: str | None = None,
    risk_rules_json: str | None = None,
    custom_rules: str | None = None,
) -> ResolvedTenantOperatingProfile:
    playbook_id = normalize_industry_id(industry)
    if playbook_id == BARBER_SALON_PLAYBOOK_ID:
        from app.crew.industry_playbooks import IndustryPlaybook

        playbook = IndustryPlaybook(
            id=BARBER_SALON_PLAYBOOK_ID,
            label="Berber / Kuaför",
            default_content_needs=[
                "service_intro",
                "social_proof",
                "post_service_client_result",
                "lead_generation",
                "behind_the_scenes",
            ],
            risky_signals=["personal_data", "before_after", "price"],
            approval_required_for=["personal_data", "before_after"],
            preferred_channels=["instagram_story", "instagram_reel", "instagram_post"],
        )
        default_needs = list(playbook.default_content_needs)
        risk_rules = {signal: "allow" for signal in playbook.risky_signals}
        for signal in playbook.approval_required_for:
            risk_rules[signal] = "approval_required"
    else:
        playbook = get_industry_playbook(industry)
        default_needs = list(playbook.default_content_needs)
        risk_rules = risk_rules_for_industry(industry)

    explicit = _parse_json_array(operating_capabilities_json)
    from_content = _parse_json_array(content_needs_json)
    eligible = {c.id for c in list_capabilities_for_industry(industry)}

    if explicit:
        enabled = list(explicit)
    elif from_content:
        enabled = list(from_content)
    else:
        enabled = merge_playbook_content_needs(industry, default_needs)
        if playbook_id in (BARBER_SALON_PLAYBOOK_ID, "beauty_wellness"):
            for extra in ("gallery_manage", "gallery_client_upload"):
                if extra not in enabled:
                    enabled.append(extra)
        elif "gallery_manage" not in enabled:
            enabled.append("gallery_manage")

    profile_rules = {}
    if risk_rules_json:
        try:
            parsed = json.loads(risk_rules_json)
            if isinstance(parsed, dict):
                profile_rules = {str(k): str(v) for k, v in parsed.items()}
        except json.JSONDecodeError:
            pass
    merged_rules = {**risk_rules, **profile_rules}

    return ResolvedTenantOperatingProfile(
        tenant_id=tenant_id,
        industry=industry,
        playbook_id=playbook_id,
        enabled_capabilities=list(dict.fromkeys(enabled)),
        gallery_policy=_parse_gallery_policy(gallery_policy_json, industry),
        risk_rules=merged_rules,
        custom_rules=(custom_rules or "").strip(),
    )


def _capability_def(capability_id: str) -> TenantCapabilityDefinition | None:
    for cap in (*WORKFLOW_CAPABILITIES, *EXTRA_CONTENT_CAPABILITIES):
        if cap.id == capability_id:
            return cap
    return None


def evaluate_capability_policy(
    profile: ResolvedTenantOperatingProfile,
    capability_id: str,
    *,
    risk_signals: list[str] | None = None,
) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if capability_id in profile.enabled_capabilities and _capability_def(capability_id) is None:
        return "allow", []

    cap = _capability_def(capability_id)
    if not cap:
        return "blocked", ["unknown_capability"]
    if cap.industries and profile.playbook_id not in cap.industries:
        return "blocked", ["industry_not_eligible"]
    if capability_id not in profile.enabled_capabilities:
        return "blocked", ["capability_disabled"]
    for req in cap.requires:
        if req not in profile.enabled_capabilities:
            return "blocked", [f"requires:{req}"]

    decision = "allow"
    for signal in (*cap.risk_signals, *(risk_signals or [])):
        rule = profile.risk_rules.get(signal, "allow")
        if rule == "blocked":
            return "blocked", [f"risk_blocked:{signal}"]
        if rule == "approval_required":
            decision = "approval_required"
            reasons.append(f"risk_approval:{signal}")
    return decision, reasons


def evaluate_gallery_asset_policy(
    profile: ResolvedTenantOperatingProfile,
    asset_type: str,
) -> tuple[str, list[str], bool]:
    """Returns (decision, reasons, force_unapproved)."""
    normalized = (asset_type or "").strip().lower()
    policy = profile.gallery_policy

    if "gallery_manage" not in profile.enabled_capabilities:
        return "blocked", ["gallery_manage_disabled"], False

    if normalized in CLIENT_ASSET_TYPES:
        if "gallery_client_upload" not in profile.enabled_capabilities:
            return "blocked", ["gallery_client_upload_disabled"], False
        decision = policy.get("clientPhotoPolicy", "approval_required")
        if decision == "blocked":
            return "blocked", ["client_photos_blocked"], False
        return decision, (["client_photos_need_approval"] if decision == "approval_required" else []), decision == "approval_required"

    if normalized in BEFORE_AFTER_ASSET_TYPES:
        if "gallery_before_after" not in profile.enabled_capabilities:
            return "blocked", ["gallery_before_after_disabled"], False
        decision = policy.get("beforeAfterPolicy", "approval_required")
        if decision == "blocked":
            return "blocked", ["before_after_blocked"], False
        return decision, (["before_after_need_approval"] if decision == "approval_required" else []), decision == "approval_required"

    allowed = policy.get("allowedAssetIntents") or []
    if normalized in allowed or normalized in ("logo", "venue_reference", "hero_image", "venue_photo"):
        return "allow", [], False
    return "approval_required", ["asset_type_not_in_allowed_intents"], True


def build_operating_policy_prompt_block(profile: ResolvedTenantOperatingProfile) -> str:
    caps = ", ".join(profile.enabled_capabilities) or "none"
    gp = profile.gallery_policy
    return (
        "## Tenant Operating Policy\n"
        f"- Industry playbook: {profile.playbook_id}\n"
        f"- Enabled capabilities: {caps}\n"
        f"- Gallery: client photos {gp.get('clientPhotoPolicy')}, "
        f"before/after {gp.get('beforeAfterPolicy')}, max {gp.get('maxGalleryPhotos')} photos\n"
        + (f"- Custom rules: {profile.custom_rules[:500]}\n" if profile.custom_rules else "")
    )
