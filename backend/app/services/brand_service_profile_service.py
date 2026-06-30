"""
Brand Service Profile — validated, mission-critical brand positioning.

The flat ``business_type`` classification is brittle (a Bodrum beach-club bar
was inferred as ``local_products_shop``, which cascaded into the wrong template
kit, content pillars, CTA style and gallery affinity). This service derives a
structured, authoritative positioning profile that the mission engine reads as
the source of truth, decoupled from the classifier.

Design:
  - ``derive_brand_service_profile`` uses an LLM when available, with a fully
    deterministic heuristic fallback so the pipeline never hard-depends on the
    network (and so tests are stable).
  - ``build_service_profile_prompt`` serialises the profile into a compact,
    high-priority prompt block injected at the top of the agent Business
    Profile section.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

_logger = structlog.get_logger()

PROFILE_VERSION = 1

VALID_CTA_STYLES = ("reservation", "ecommerce", "booking", "visit", "contact")
VALID_SEASONALITY = ("year_round", "summer", "winter", "seasonal")

# Heuristic category signals — ordered most-specific first. Each rule maps a set
# of keyword signals (matched against the combined discovery text) to a category
# + CTA style + seasonality default. Used by the deterministic fallback and to
# sanity-check / repair a low-confidence classifier output.
_CATEGORY_RULES: list[dict[str, Any]] = [
    {
        "category": "beach_club_bar",
        "cta_style": "reservation",
        "seasonality": "summer",
        "signals": [
            "beach club", "beach bar", "drink & chill", "drink and chill", "kokteyl",
            "cocktail", "sahil", "plaj", "sunset", "gün batımı", "şezlong", "sezlong",
            "dj", "beach", "şarap & ", "rosé",
        ],
    },
    {
        "category": "restaurant_bar",
        "cta_style": "reservation",
        "seasonality": "year_round",
        "signals": [
            "restaurant", "restoran", "bistro", "fine dining", "à la carte", "ala carte",
            "menu", "menü", "şef", "chef", "tabak", "reservation", "rezervasyon", "bar",
        ],
    },
    {
        "category": "cafe_bakery",
        "cta_style": "visit",
        "seasonality": "year_round",
        "signals": ["cafe", "kafe", "kahve", "coffee", "bakery", "fırın", "pastane", "patisserie", "brunch", "kahvaltı"],
    },
    {
        "category": "hotel_hospitality",
        "cta_style": "booking",
        "seasonality": "year_round",
        "signals": ["hotel", "otel", "resort", "suite", "konaklama", "pansiyon", "villa", "boutique hotel"],
    },
    {
        "category": "beauty_wellness",
        "cta_style": "booking",
        "seasonality": "year_round",
        "signals": ["salon", "kuaför", "güzellik", "spa", "masaj", "nail", "tırnak", "lash", "kirpik", "estetik"],
    },
    {
        "category": "fitness_studio",
        "cta_style": "booking",
        "seasonality": "year_round",
        "signals": ["gym", "fitness", "pilates", "yoga", "crossfit", "antrenman", "spor salonu"],
    },
    {
        "category": "clinic_healthcare",
        "cta_style": "contact",
        "seasonality": "year_round",
        "signals": ["clinic", "klinik", "dental", "diş", "medical", "tıp", "sağlık", "aesthetic clinic"],
    },
    {
        "category": "local_products_shop",
        "cta_style": "ecommerce",
        "seasonality": "year_round",
        "signals": ["yöresel", "organik", "doğal ürün", "el yapımı", "zeytinyağı", "reçel", "bal ", "online sipariş", "kargo"],
    },
    {
        "category": "fashion_retail",
        "cta_style": "ecommerce",
        "seasonality": "seasonal",
        "signals": ["fashion", "moda", "giyim", "koleksiyon", "butik", "boutique", "tasarım giyim"],
    },
]

_CTA_PRESETS: dict[str, list[str]] = {
    "reservation": ["Rezervasyon Yap", "Masanı Ayır"],
    "booking": ["Randevu Al", "Yerini Ayır"],
    "ecommerce": ["Hemen Sipariş Ver", "İncele"],
    "visit": ["Bizi Ziyaret Et", "Yolunu Düşür"],
    "contact": ["İletişime Geç", "Bilgi Al"],
}

# Canonical CTA style per category (derived from _CATEGORY_RULES). A category is the
# strong, validated signal; cta_style is a derived attribute that MUST stay consistent
# with it. Used to repair an LLM result that names the right category but a wrong/free-
# form cta_style (e.g. category=restaurant_bar with cta_style=visit instead of
# reservation — which produced e-commerce CTAs for a beach bar).
_CATEGORY_CANONICAL_CTA: dict[str, str] = {
    rule["category"]: rule["cta_style"] for rule in _CATEGORY_RULES
}


def reconcile_cta_with_category(profile: dict[str, Any]) -> dict[str, Any]:
    """Force cta_style + primary_ctas to match the category's canonical CTA style."""
    category = str(profile.get("category") or "").strip().lower()
    canonical = _CATEGORY_CANONICAL_CTA.get(category)
    if canonical and str(profile.get("cta_style") or "").strip().lower() != canonical:
        profile["cta_style"] = canonical
        profile["primary_ctas"] = list(_CTA_PRESETS.get(canonical, profile.get("primary_ctas") or []))
    return profile

# Service-profile categories → production playbook slugs (mirrors apps/web sector-production-profile).
_CATEGORY_TO_CANONICAL_SECTOR: dict[str, str] = {
    "beach_club_bar": "beach_club",
    "restaurant_bar": "restaurant_cafe",
    "cafe_bakery": "coffee_shop",
    "hotel_hospitality": "hospitality",
    "beauty_wellness": "beauty_wellness",
    "fitness_studio": "fitness_gym",
    "clinic_healthcare": "healthcare_clinic",
    "local_products_shop": "local_products_shop",
    "fashion_retail": "fashion_boutique",
}


def canonical_sector_from_category(category: str) -> str:
    """Map validated service-profile category to the canonical sector slug."""
    key = str(category or "").strip().lower()
    if not key:
        return ""
    return _CATEGORY_TO_CANONICAL_SECTOR.get(key, key)


def context_updates_from_service_profile(profile: dict[str, Any]) -> dict[str, Any]:
    """
    Flat brand_context fields to sync from a validated service profile.

    Keeps ``business_type`` and ``default_ctas`` aligned with authoritative
    positioning so agent prompts and Nexus industry hydration stay consistent.
    """
    updates: dict[str, Any] = {}
    category = str(profile.get("category") or "").strip()
    if not category:
        return updates

    canonical = canonical_sector_from_category(category)
    if canonical:
        updates["business_type"] = canonical

    cta_style = str(profile.get("cta_style") or "").strip()
    if cta_style in _CTA_PRESETS:
        updates["default_ctas"] = json.dumps(_CTA_PRESETS[cta_style], ensure_ascii=False)

    return updates


def _combined_discovery_text(brand_ctx: dict[str, Any]) -> str:
    parts = [
        brand_ctx.get("business_name"),
        brand_ctx.get("business_type"),
        brand_ctx.get("description"),
        brand_ctx.get("website_summary"),
        brand_ctx.get("instagram_bio"),
        brand_ctx.get("visual_style"),
    ]
    # Gallery tags add strong signal about what the venue actually shows.
    gallery = brand_ctx.get("gallery_analysis")
    if isinstance(gallery, str) and gallery.strip():
        try:
            gallery = json.loads(gallery)
        except Exception:
            gallery = None
    if isinstance(gallery, dict):
        tag_blob: list[str] = []
        for meta in list(gallery.values())[:40]:
            if isinstance(meta, dict):
                tag_blob.extend(str(t) for t in (meta.get("contentTags") or [])[:6])
        parts.append(" ".join(tag_blob))
    return " ".join(str(p) for p in parts if p).lower()


def _match_category(text: str) -> tuple[str, dict[str, Any]] | None:
    for rule in _CATEGORY_RULES:
        if any(sig in text for sig in rule["signals"]):
            return rule["category"], rule
    return None


def heuristic_service_profile(brand_ctx: dict[str, Any]) -> dict[str, Any]:
    """Deterministic fallback profile derived purely from discovery text."""
    text = _combined_discovery_text(brand_ctx)
    matched = _match_category(text)
    if matched:
        category, rule = matched
        cta_style = rule["cta_style"]
        seasonality = rule["seasonality"]
        confidence = 0.6
    else:
        category = str(brand_ctx.get("business_type") or "general_business").strip() or "general_business"
        cta_style = "contact"
        seasonality = "year_round"
        confidence = 0.3

    return _normalize_profile(
        {
            "category": category,
            "category_confidence": confidence,
            "signature_offerings": [],
            "cta_style": cta_style,
            "primary_ctas": _CTA_PRESETS.get(cta_style, _CTA_PRESETS["contact"]),
            "seasonality": seasonality,
            "value_props": [],
            "content_guardrails": [],
            "source": "heuristic",
        }
    )


def _normalize_profile(raw: dict[str, Any]) -> dict[str, Any]:
    """Coerce an arbitrary profile dict into the canonical, validated shape."""
    cta_style = str(raw.get("cta_style") or "").strip().lower()
    if cta_style not in VALID_CTA_STYLES:
        cta_style = "contact"
    seasonality = str(raw.get("seasonality") or "").strip().lower()
    if seasonality not in VALID_SEASONALITY:
        seasonality = "year_round"

    try:
        confidence = float(raw.get("category_confidence"))
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))

    def _str_list(value: Any, limit: int) -> list[str]:
        if not isinstance(value, list):
            return []
        out: list[str] = []
        for item in value:
            s = str(item).strip()
            if s and s not in out:
                out.append(s)
            if len(out) >= limit:
                break
        return out

    primary_ctas = _str_list(raw.get("primary_ctas"), 4) or _CTA_PRESETS.get(cta_style, _CTA_PRESETS["contact"])

    return {
        "category": str(raw.get("category") or "general_business").strip() or "general_business",
        "category_confidence": confidence,
        "signature_offerings": _str_list(raw.get("signature_offerings"), 8),
        "cta_style": cta_style,
        "primary_ctas": primary_ctas,
        "seasonality": seasonality,
        "value_props": _str_list(raw.get("value_props"), 6),
        "content_guardrails": _str_list(raw.get("content_guardrails"), 6),
        "source": str(raw.get("source") or "onboarding_llm"),
        "version": PROFILE_VERSION,
    }


def _llm_service_profile(brand_ctx: dict[str, Any]) -> dict[str, Any] | None:
    """Ask the configured LLM to produce a structured positioning profile."""
    try:
        import os
        from openai import OpenAI
    except Exception:
        return None

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    text = _combined_discovery_text(brand_ctx)
    if len(text.strip()) < 20:
        return None

    business_name = str(brand_ctx.get("business_name") or "").strip()
    location = str(brand_ctx.get("location") or "").strip()

    system = (
        "You are a senior brand strategist. From the discovery signals, infer the "
        "TRUE business positioning. Be decisive and accurate — do not echo a wrong "
        "stored business_type. Respond with STRICT JSON only."
    )
    user = (
        f"Business name: {business_name}\n"
        f"Location: {location}\n"
        f"Stored business_type (may be WRONG): {brand_ctx.get('business_type')}\n"
        f"Discovery signals (website, menu, bio, gallery tags):\n{text[:2500]}\n\n"
        "Return JSON with EXACTLY these keys:\n"
        '{"category": "snake_case category e.g. beach_club_bar|restaurant_bar|cafe_bakery|'
        'hotel_hospitality|beauty_wellness|fitness_studio|clinic_healthcare|local_products_shop|'
        'fashion_retail|general_business",\n'
        ' "category_confidence": 0.0-1.0,\n'
        ' "signature_offerings": ["3-6 concrete things this brand sells/offers, in the brand language"],\n'
        f' "cta_style": "one of {list(VALID_CTA_STYLES)}",\n'
        ' "primary_ctas": ["2-3 CTA phrases in Turkish (tr) matching cta_style"],\n'
        f' "seasonality": "one of {list(VALID_SEASONALITY)}",\n'
        ' "value_props": ["2-4 differentiators"],\n'
        ' "content_guardrails": ["2-4 things content MUST NOT do, given the real positioning"]}'
    )

    try:
        client = OpenAI(api_key=api_key)
        model = os.getenv("OPENAI_MODEL", "gpt-4o")
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
            temperature=0.2,
            timeout=60,
        )
        content = resp.choices[0].message.content or "{}"
        data = json.loads(content)
        if not isinstance(data, dict) or not data.get("category"):
            return None
        data["source"] = "onboarding_llm"
        return _normalize_profile(data)
    except Exception as exc:  # noqa: BLE001 — network/LLM failure must not break onboarding
        _logger.warning("brand_service_profile_llm_failed", error=str(exc))
        return None


def derive_brand_service_profile(brand_ctx: dict[str, Any]) -> dict[str, Any]:
    """
    Derive the validated service profile from a brand_context dict.

    LLM-first with a deterministic heuristic fallback. The heuristic also repairs
    a low-confidence LLM result that disagrees with strong keyword signals.
    """
    llm = _llm_service_profile(brand_ctx)
    if llm is not None:
        # If the LLM was unsure but the discovery text strongly matches a known
        # category, prefer the deterministic signal for the category only.
        if llm.get("category_confidence", 0) < 0.45:
            matched = _match_category(_combined_discovery_text(brand_ctx))
            if matched:
                llm["category"] = matched[0]
                if llm.get("cta_style") == "contact":
                    llm["cta_style"] = matched[1]["cta_style"]
                    llm["primary_ctas"] = _CTA_PRESETS.get(llm["cta_style"], llm["primary_ctas"])
        return reconcile_cta_with_category(llm)
    return reconcile_cta_with_category(heuristic_service_profile(brand_ctx))


def build_service_profile_prompt(profile: dict[str, Any] | None) -> list[str]:
    """Serialise the service profile into a high-priority prompt block."""
    if not profile or not isinstance(profile, dict):
        return []
    category = str(profile.get("category") or "").strip()
    if not category:
        return []

    lines = ["### 🎯 Validated Brand Positioning (authoritative — overrides any stale business_type)"]
    lines.append(f"- **Confirmed category**: {category}")

    offerings = profile.get("signature_offerings") or []
    if offerings:
        lines.append(f"- **Signature offerings**: {', '.join(str(o) for o in offerings[:8])}")

    cta_style = str(profile.get("cta_style") or "").strip()
    primary_ctas = profile.get("primary_ctas") or []
    if cta_style:
        cta_line = f"- **CTA style**: {cta_style}"
        if primary_ctas:
            cta_line += f" → {', '.join(str(c) for c in primary_ctas[:3])}"
        lines.append(cta_line)
        lines.append("  Use this CTA style for every caption; do not use an e-commerce CTA for a reservation/booking venue (or vice versa).")

    seasonality = str(profile.get("seasonality") or "").strip()
    if seasonality and seasonality != "year_round":
        lines.append(f"- **Seasonality**: {seasonality} — bias content/timing accordingly.")

    value_props = profile.get("value_props") or []
    if value_props:
        lines.append(f"- **Value props**: {', '.join(str(v) for v in value_props[:6])}")

    guardrails = profile.get("content_guardrails") or []
    if guardrails:
        lines.append("- **Content guardrails (MUST NOT)**:")
        for g in guardrails[:6]:
            lines.append(f"  • {g}")

    lines.append("")
    return lines
