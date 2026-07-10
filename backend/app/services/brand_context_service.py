"""
Brand context service – manages the brand context pipeline.

The brand context is the most critical piece of the system: it ensures
every agent output is grounded in real business information rather than
producing generic AI content.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.brand_context import BrandContext, BrandAsset
from app.crew.context import BrandInfo
from app.schemas.brand_context import BrandContextCreate, BrandContextUpdate
from app.schemas.internal import InternalBrandContext
from app.services.workspace_service import ensure_nexus_mirror_workspace
from app.services.redis_cache import cache as _cache

logger = structlog.get_logger()

_BRAND_CTX_TTL = 300  # 5 minutes


def _reconcile_logo_with_website(logo_url: str, website_url: str) -> str:
    """Rewrite scraped logo host to match the canonical website_url (e.g. Vercel deploy)."""
    logo = (logo_url or "").strip()
    website = (website_url or "").strip()
    if not logo.startswith(("http://", "https://")) or not website.startswith(("http://", "https://")):
        return logo
    try:
        from urllib.parse import urlparse

        logo_p = urlparse(logo)
        site_p = urlparse(website)
        logo_host = (logo_p.hostname or "").lower().removeprefix("www.")
        site_host = (site_p.hostname or "").lower().removeprefix("www.")
        if not logo_host or not site_host or logo_host == site_host:
            return logo
        query = f"?{logo_p.query}" if logo_p.query else ""
        return f"{site_p.scheme}://{site_p.netloc}{logo_p.path}{query}"
    except Exception:
        return logo


def _brand_ctx_cache_key(workspace_id: uuid.UUID) -> str:
    return f"brand_ctx:{workspace_id}"


async def invalidate_brand_info_cache(workspace_id: uuid.UUID) -> None:
    """Call after any brand context update to bust the Redis cache."""
    await _cache.delete(_brand_ctx_cache_key(workspace_id))
    _brand_info_memory_cache.pop(str(workspace_id), None)


import time as _time

_brand_info_memory_cache: dict[str, tuple[float, "BrandInfo"]] = {}
_BRAND_INFO_MEMORY_TTL = 120  # 2 minutes (covers same mission wave)


# ── Pinterest field extractor ─────────────────────────────────────────────

def _extract_pinterest_fields(visual_inspiration_json: str | None) -> dict:
    """Parse visual_inspiration JSON blob → pinterest_visual_themes + pinterest_top_pins."""
    if not visual_inspiration_json:
        return {"pinterest_visual_themes": [], "pinterest_top_pins": []}
    try:
        data = json.loads(visual_inspiration_json)
        return {
            "pinterest_visual_themes": data.get("visual_themes", [])[:10],
            "pinterest_top_pins": data.get("top_pins", [])[:8],
        }
    except Exception:
        return {"pinterest_visual_themes": [], "pinterest_top_pins": []}


# ── CRUD helpers ───────────────────────────────────────────────────────────

async def get_brand_context(db: AsyncSession, workspace_id: uuid.UUID) -> BrandContext | None:
    result = await db.execute(
        select(BrandContext)
        .options(selectinload(BrandContext.assets))
        .where(BrandContext.workspace_id == workspace_id)
    )
    return result.scalar_one_or_none()


async def create_brand_context(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    data: BrandContextCreate,
) -> BrandContext:
    await ensure_nexus_mirror_workspace(db, workspace_id)
    ctx = BrandContext(
        workspace_id=workspace_id,
        **data.model_dump(),
    )
    db.add(ctx)
    await db.flush()
    return ctx


async def ensure_brand_context(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    business_name: str | None = None,
    business_type: str | None = None,
) -> BrandContext:
    """
    Return existing brand context or create a minimal stub for Nexus tenants
    that completed signup before Python /analyze ran.
    """
    ctx = await get_brand_context(db, workspace_id)
    if ctx:
        return ctx

    await ensure_nexus_mirror_workspace(db, workspace_id)
    ctx = BrandContext(
        workspace_id=workspace_id,
        business_name=(business_name or "Brand").strip() or "Brand",
        business_type=(business_type or "general_business").strip() or "general_business",
        languages="tr",
    )
    db.add(ctx)
    await db.flush()
    logger.info("brand_context_auto_provisioned", workspace_id=str(workspace_id))
    return ctx


async def update_brand_context(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    data: BrandContextUpdate,
) -> BrandContext | None:
    ctx = await ensure_brand_context(db, workspace_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(ctx, field, value)
    if "reference_image_urls" in updates:
        allowed = {_normalize_gallery_url_key(u) for u in _parse_reference_image_urls(ctx.reference_image_urls)}
        try:
            gallery = json.loads(ctx.gallery_analysis or "{}")
        except (json.JSONDecodeError, TypeError):
            gallery = {}
        if isinstance(gallery, dict):
            pruned = {
                url: meta
                for url, meta in gallery.items()
                if _normalize_gallery_url_key(url) in allowed
            }
            if len(pruned) != len(gallery):
                ctx.gallery_analysis = json.dumps(pruned, ensure_ascii=False)
                logger.info(
                    "gallery_analysis_pruned_after_reference_update",
                    workspace_id=str(workspace_id),
                    before=len(gallery),
                    after=len(pruned),
                )
    await db.flush()
    _brand_info_memory_cache.pop(str(workspace_id), None)
    return ctx

def _extract_location_from_sources(instagram: dict, google: dict) -> str:
    """
    Extract location from Instagram bio (📍 marker) or Google Business address.
    Returns empty string if nothing found.
    """
    import re as _re

    # 1. Instagram bio: look for 📍 or common location patterns
    bio = (instagram.get("bio") or "").strip()
    if bio:
        # 📍 marker — most reliable
        pin_match = _re.search(r"📍\s*([^\n#@]+)", bio)
        if pin_match:
            loc = pin_match.group(1).strip().rstrip(".,")
            if loc:
                return loc[:100]

        # Common Turkish city/district names in bio
        TR_PLACES = _re.compile(
            r"\b(istanbul|ankara|izmir|bodrum|antalya|muğla|marmaris|fethiye|"
            r"bitez|gündoğan|türkbükü|yalıkavak|göltürkbükü|akyarlar|ortakent|"
            r"kadıköy|beşiktaş|beyoğlu|şişli|bakırköy|üsküdar|çengelköy|"
            r"bağcılar|ataşehir|maltepe|kartal|pendik|datça|marmaris|"
            r"alanya|side|kemer|belek|lara|kundu)\b",
            _re.IGNORECASE,
        )
        m = TR_PLACES.search(bio)
        if m:
            return m.group(0).title()

    # 2. Google Business address
    address = (google.get("address") or google.get("street") or "").strip()
    if address and len(address) > 3:
        # Take the last meaningful part (city/district usually at end)
        parts = [p.strip() for p in address.replace("/", ",").split(",") if p.strip()]
        if parts:
            return ", ".join(parts[-2:])[:100]

    return ""


# ── JSON helpers ───────────────────────────────────────────────────────────

def _parse_json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return [str(item) for item in parsed] if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _parse_json_dict(value: str | None) -> dict[str, str]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return {str(k): str(v) for k, v in parsed.items()} if isinstance(parsed, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _parse_json_list_of_dicts(value: str | list | None) -> list[dict]:
    """Parse a JSON text column (or already-a-list) into list[dict]."""
    if isinstance(value, list):
        return [d for d in value if isinstance(d, dict)]
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return [d for d in parsed if isinstance(d, dict)] if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _parse_reference_image_urls(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if not isinstance(parsed, list):
            return []
        out: list[str] = []
        for u in parsed:
            s = str(u).strip()
            if _is_usable_gallery_url(s):
                out.append(s)
        return out[:120]
    except (json.JSONDecodeError, TypeError):
        return []


def _r2_media_key_looks_like_image(key: str) -> bool:
    kl = (key or "").strip().lower()
    if not kl:
        return False
    if kl.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp")):
        return True
    import re as _re

    return bool(
        _re.match(r"^[0-9a-f-]{36}/(image|images|posts|stories|reels|videos)/", kl)
    )


def _is_usable_gallery_url(url: str) -> bool:
    s = (url or "").strip()
    if not s:
        return False
    lower = s.lower()
    if lower.startswith("/api/media"):
        q_idx = s.find("?")
        if q_idx == -1:
            return False
        from urllib.parse import parse_qs

        key = (parse_qs(s[q_idx + 1 :]).get("key") or [""])[0]
        return _r2_media_key_looks_like_image(key)
    if not s.startswith("http"):
        return False
    if "/_next/static/" in lower:
        return False
    if "/_next/image" in lower:
        from urllib.parse import parse_qs, urlparse

        if not parse_qs(urlparse(s).query).get("url"):
            return False
    return True


async def append_reference_image_urls(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    new_urls: list[str],
) -> list[str]:
    """
    Atomically prepend new gallery URLs — avoids read-modify-write races and
    dropped /api/media R2 proxy paths during merge.
    """
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:wid))"),
        {"wid": str(workspace_id)},
    )
    ctx = await ensure_brand_context(db, workspace_id)
    existing = _parse_reference_image_urls(ctx.reference_image_urls)
    seen: set[str] = set()
    merged: list[str] = []
    for raw in new_urls:
        s = str(raw).strip()
        if not _is_usable_gallery_url(s):
            continue
        key = _normalize_gallery_url_key(s)
        if key in seen:
            continue
        seen.add(key)
        merged.append(s)
    for url in existing:
        key = _normalize_gallery_url_key(url)
        if key in seen:
            continue
        seen.add(key)
        merged.append(url)
    merged = merged[:120]
    ctx.reference_image_urls = json.dumps(merged, ensure_ascii=False)

    try:
        gallery = json.loads(ctx.gallery_analysis or "{}")
    except (json.JSONDecodeError, TypeError):
        gallery = {}
    if isinstance(gallery, dict):
        allowed = {_normalize_gallery_url_key(u) for u in merged}
        pruned = {
            url: meta
            for url, meta in gallery.items()
            if _normalize_gallery_url_key(url) in allowed
        }
        if len(pruned) != len(gallery):
            ctx.gallery_analysis = json.dumps(pruned, ensure_ascii=False)

    await db.flush()
    _brand_info_memory_cache.pop(str(workspace_id), None)
    logger.info(
        "gallery_urls_appended",
        workspace_id=str(workspace_id),
        added=len(merged) - len(existing),
        total=len(merged),
    )
    return merged


_NON_VENUE_SECTORS = frozenset({
    "agency_services", "ecommerce_retail", "production_company", "mental_health_clinic",
})
_SYNTHETIC_GALLERY_MIN = 8
_SYNTHETIC_GALLERY_FULL = 100
_SECTOR_GALLERY_SEEDS: dict[str, list[str]] | None = None


def _sector_gallery_seed_path() -> "Path":
    from pathlib import Path
    return Path(__file__).resolve().parents[3] / "data" / "sector-gallery-seeds.json"


def _load_sector_gallery_seeds() -> dict[str, list[str]]:
    global _SECTOR_GALLERY_SEEDS
    path = _sector_gallery_seed_path()
    fallback: dict[str, list[str]] = {"general_business": []}
    try:
        if path.is_file():
            mtime = path.stat().st_mtime
            if (
                _SECTOR_GALLERY_SEEDS is not None
                and getattr(_load_sector_gallery_seeds, "_cache_mtime", None) == mtime
            ):
                return _SECTOR_GALLERY_SEEDS
            raw = json.loads(path.read_text(encoding="utf-8"))
            _SECTOR_GALLERY_SEEDS = {
                k: list(v) for k, v in raw.items()
                if isinstance(v, list) and k not in ("full_target", "min_target")
            }
            _load_sector_gallery_seeds._cache_mtime = mtime  # type: ignore[attr-defined]
            return _SECTOR_GALLERY_SEEDS
    except Exception as exc:
        logger.warning("sector_gallery_seed_load_failed", path=str(path), error=str(exc))
    _SECTOR_GALLERY_SEEDS = fallback
    return _SECTOR_GALLERY_SEEDS


def _resolve_synthetic_gallery_target(sector: str, usable_count: int) -> int:
    if usable_count == 0:
        return _SYNTHETIC_GALLERY_FULL
    if sector in _NON_VENUE_SECTORS and usable_count < _SYNTHETIC_GALLERY_FULL:
        return _SYNTHETIC_GALLERY_FULL
    if usable_count < _SYNTHETIC_GALLERY_MIN:
        return _SYNTHETIC_GALLERY_MIN
    return usable_count


def provision_synthetic_gallery(ctx: BrandContext, min_count: int | None = None) -> bool:
    """Fill reference_image_urls with sector stock photos when gallery is too small."""
    from app.crew.industry_playbooks import normalize_industry_id

    existing = [u for u in _parse_reference_image_urls(ctx.reference_image_urls) if _is_usable_gallery_url(u)]
    sector = normalize_industry_id(ctx.business_type or "general_business")
    target = min_count if min_count is not None else _resolve_synthetic_gallery_target(sector, len(existing))

    if len(existing) >= target:
        return False

    if len(existing) > 0 and sector not in _NON_VENUE_SECTORS:
        return False

    seeds_map = _load_sector_gallery_seeds()
    seeds = seeds_map.get(sector) or seeds_map.get("general_business") or []
    seen = {_normalize_gallery_url_key(u) for u in existing}
    merged = list(existing)
    for url in seeds:
        key = _normalize_gallery_url_key(url)
        if key in seen:
            continue
        seen.add(key)
        merged.append(url)
        if len(merged) >= target:
            break

    if len(merged) <= len(existing):
        return False

    ctx.reference_image_urls = json.dumps(merged, ensure_ascii=False)
    logger.info(
        "synthetic_gallery_provisioned",
        workspace_id=str(ctx.workspace_id),
        sector=sector,
        added=len(merged) - len(existing),
        total=len(merged),
        target=target,
    )
    return True


def _normalize_gallery_url_key(url: str) -> str:
    """Stable key for dedupe / gallery_analysis pruning."""
    s = str(url).strip()
    if not s:
        return ""
    lower = s.lower()
    if lower.startswith("/api/media") or "/api/media?" in lower:
        q_idx = s.find("?")
        if q_idx != -1:
            from urllib.parse import parse_qs, unquote

            key = (parse_qs(s[q_idx + 1 :]).get("key") or [""])[0]
            if key:
                return unquote(key).split("?")[0].strip().lower()
    if s.startswith("http://") or s.startswith("https://"):
        return s.split("?")[0].strip().lower()
    return s.split("?")[0].strip().lower()


def _sanitize_text_for_db(value: str | None, *, max_len: int = 4000) -> str:
    """Strip null bytes and other chars PostgreSQL UTF-8 text columns reject."""
    if not value:
        return ""
    cleaned = value.replace("\x00", "").replace("\u0000", "")
    cleaned = "".join(ch for ch in cleaned if ch == "\n" or ch == "\t" or ord(ch) >= 32)
    return cleaned.strip()[:max_len]


def _sanitize_json_value(value):
    if isinstance(value, str):
        return _sanitize_text_for_db(value, max_len=8000)
    if isinstance(value, dict):
        return {k: _sanitize_json_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_json_value(v) for v in value]
    return value


# ── BrandInfo builders ─────────────────────────────────────────────────────

async def seed_missing_brand_fields(db: AsyncSession, ctx: BrandContext) -> BrandContext:
    """
    Ensures critical brand fields are never empty before agent execution.

    For each empty field, infers a value from available data and persists it.
    Uses rule-based inference for fast fields; GPT-4o only for richer inference
    (location extraction, tone calibration) when text data is available.

    Critical fields: business_type, location, brand_tone, target_audience,
                     content_pillars, default_ctas
    """
    from app.crew.brand_analyzer import infer_industry, infer_content_pillars, infer_default_ctas, infer_primary_goals, infer_target_audience
    from app.crew.industry_playbooks import normalize_industry_id, get_industry_playbook
    import os, json as _json

    updates: dict = {}

    # ── business_name — derive from instagram_handle or website_url if blank ─
    if not ctx.business_name or ctx.business_name in ("Unknown Brand", "unknown", ""):
        handle = getattr(ctx, "instagram_handle", None) or ""
        website = getattr(ctx, "website_url", None) or ""
        derived = ""
        if handle:
            # "bitezdondurma" → "Bitez Dondurma", "karamandatca" → "Karaman Datça"
            import re as _re_name
            words = _re_name.sub(r'(?<=[a-zçğıöşü])(?=[A-ZÇĞİÖŞÜ])', ' ', handle)
            words = _re_name.sub(r'([a-zçğıöşü])([0-9])', r'\1 \2', words)
            derived = words.replace('_', ' ').replace('-', ' ').strip().title()
        elif website:
            derived = website.split('.')[0].replace('-', ' ').replace('_', ' ').title()
        if derived:
            updates["business_name"] = derived
            ctx.business_name = derived
            logger.info("seed_business_name", workspace_id=str(ctx.workspace_id), name=derived)

    available_text = " ".join(filter(None, [
        ctx.business_name,
        ctx.description,
        ctx.website_summary,
        ctx.instagram_bio,
        ctx.keywords,
    ]))

    # ── business_type ─────────────────────────────────────────────────────
    if not ctx.business_type or ctx.business_type in ("business", "general_business", ""):
        inferred = infer_industry(available_text)
        normalized = normalize_industry_id(inferred)
        updates["business_type"] = normalized
        ctx.business_type = normalized
        logger.info("seed_business_type", workspace_id=str(ctx.workspace_id), value=normalized)

    # ── content_pillars ───────────────────────────────────────────────────
    existing_pillars = _parse_json_list(ctx.content_pillars)
    if not existing_pillars:
        playbook = get_industry_playbook(ctx.business_type or "general_business")
        pillars = playbook.default_content_needs[:6]
        updates["content_pillars"] = _json.dumps(pillars)
        ctx.content_pillars = updates["content_pillars"]
        logger.info("seed_content_pillars", workspace_id=str(ctx.workspace_id), pillars=pillars)

    # ── default_ctas ─────────────────────────────────────────────────────
    existing_ctas = _parse_json_list(ctx.default_ctas)
    if not existing_ctas:
        primary_goals = infer_primary_goals(available_text, ctx.business_type or "")
        ctas = infer_default_ctas(primary_goals, ctx.business_type or "", ctx.languages or "tr")
        updates["default_ctas"] = _json.dumps(ctas)
        ctx.default_ctas = updates["default_ctas"]
        logger.info("seed_default_ctas", workspace_id=str(ctx.workspace_id), ctas=ctas)

    # ── brand_tone ────────────────────────────────────────────────────────
    if not ctx.brand_tone or ctx.brand_tone in ("professional", ""):
        # Infer from business type + available text
        type_tone_map = {
            "local_products_shop": "samimi, yerel, güvenilir",
            "beach_club":          "enerjik, dinamik, eğlenceli",
            "restaurant_cafe":     "sıcak, davetkar, lezzetli",
            "beauty_wellness":     "güven verici, ilham verici, ferah",
            "ecommerce_retail":    "profesyonel, güvenilir, yenilikçi",
            "real_estate":         "prestijli, güvenilir, uzman",
            "healthcare_clinic":   "güven verici, profesyonel, şefkatli",
        }
        btype = normalize_industry_id(ctx.business_type or "")
        inferred_tone = type_tone_map.get(btype, "profesyonel, samimi, güvenilir")
        updates["brand_tone"] = inferred_tone
        ctx.brand_tone = inferred_tone
        logger.info("seed_brand_tone", workspace_id=str(ctx.workspace_id), tone=inferred_tone)

    # ── target_audience ───────────────────────────────────────────────────
    if not ctx.target_audience:
        audience_parts = infer_target_audience(available_text, ctx.business_type or "")
        audience_str = ", ".join(audience_parts) if audience_parts else "yerel müşteriler ve dijital kullanıcılar"
        # Append location context if available
        if ctx.location:
            audience_str += f" ({ctx.location} ve çevresi)"
        updates["target_audience"] = audience_str
        ctx.target_audience = audience_str
        logger.info("seed_target_audience", workspace_id=str(ctx.workspace_id), audience=audience_str)

    # ── location — name-based heuristic first, then GPT-4o mini ─────────────
    if not ctx.location:
        # Step 1: extract from business name — Turkish cities often embedded in names
        import re as _re
        TR_CITIES = [
            "Datça", "Bodrum", "İstanbul", "Istanbul", "Ankara", "İzmir", "Izmir",
            "Antalya", "Bursa", "Adana", "Konya", "Marmaris", "Fethiye", "Alanya",
            "Muğla", "Mugla", "Bitez", "Kadıköy", "Kadiköy", "Beşiktaş", "Şişli",
            "Ataşehir", "Üsküdar", "Bağcılar", "Beylikdüzü", "Ümraniye", "Pendik",
            "Çeşme", "Cesme", "Kuşadası", "Kusadasi", "Sarıgerme", "Göcek",
            "Trabzon", "Samsun", "Eskişehir", "Gaziantep", "Mersin", "Kayseri",
        ]
        handle_str = getattr(ctx, "instagram_handle", None) or ""
        name_and_bio = " ".join(filter(None, [ctx.business_name, ctx.instagram_bio or "", handle_str]))
        for city in TR_CITIES:
            if city.lower() in name_and_bio.lower():
                updates["location"] = city
                ctx.location = city
                logger.info("seed_location_from_name", workspace_id=str(ctx.workspace_id), location=city)
                break

        # Step 2: if still empty and we have text, try GPT-4o mini
        if not ctx.location and available_text.strip() and len(available_text) > 30:
            openai_key = os.environ.get("OPENAI_API_KEY", "")
            if openai_key:
                try:
                    import httpx as _httpx
                    from app.config import get_settings
                    _key = get_settings().openai_api_key or openai_key
                    r = await _httpx.AsyncClient(timeout=10).post(
                        "https://api.openai.com/v1/chat/completions",
                        headers={"Authorization": f"Bearer {_key}", "Content-Type": "application/json"},
                        json={
                            "model": "gpt-4o-mini",
                            "messages": [
                                {"role": "system", "content": "Extract city/district from brand text. Return ONLY the location (e.g. 'Datça, Muğla'). Empty string if not found."},
                                {"role": "user", "content": available_text[:400]},
                            ],
                            "max_tokens": 25,
                            "temperature": 0,
                        },
                    )
                    loc = r.json()["choices"][0]["message"]["content"].strip().strip('"').strip("'")
                    if loc and len(loc) < 60 and loc.lower() not in ("", "unknown", "not found", "not specified"):
                        updates["location"] = loc
                        ctx.location = loc
                        logger.info("seed_location_gpt", workspace_id=str(ctx.workspace_id), location=loc)
                except Exception:
                    pass

    # ── Invalidate industry_calendar if business_type changed ────────────
    # Stale calendars with wrong industry_type produce wrong seasonal advice
    if "business_type" in updates and ctx.industry_calendar:
        try:
            import json as _json2
            cal = _json2.loads(ctx.industry_calendar)
            if cal.get("industry_type") != updates["business_type"]:
                updates["industry_calendar"] = None
                updates["trend_brief"] = None
                ctx.industry_calendar = None
                logger.info("invalidated_stale_calendar", workspace_id=str(ctx.workspace_id),
                            old_type=cal.get("industry_type"), new_type=updates["business_type"])
        except Exception:
            pass

    # ── description — derive from website_summary or business_type template ─
    if not ctx.description or ctx.description.strip() == "":
        ws = (ctx.website_summary or "").strip()
        bio = getattr(ctx, "instagram_bio", None) or ""
        btype = ctx.business_type or "general_business"
        bname = ctx.business_name or ""

        # Use first non-boilerplate paragraph from website_summary
        derived_desc = ""
        if ws and len(ws) > 80:
            # Skip legal/terms pages — normalize Turkish chars for comparison
            import unicodedata as _ud
            def _norm(s: str) -> str:
                return _ud.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
            ws_norm = _norm(ws[:200])
            skip_signals = ["hizmet sartlari", "kullanim kosullari", "privacy policy",
                            "terms of service", "cookie", "gizlilik politikasi",
                            "kullanici sozlesmesi", "aydinlatma metni"]
            if not any(s in ws_norm for s in skip_signals):
                # Take first 300 chars as description seed
                derived_desc = ws[:300].split('\n')[0].strip()

        if not derived_desc and bio:
            derived_desc = bio

        if not derived_desc:
            # Rule-based fallback per business type
            type_desc_map = {
                "restaurant_cafe":    f"{bname}, lezzetli yemekler ve içecekler sunan yerel bir işletme.",
                "local_products_shop": f"{bname}, yöresel ve doğal ürünler satan bir mağaza.",
                "beach_club":         f"{bname}, deniz kenarında eğlence ve dinlence sunan bir tesis.",
                "healthcare_clinic":  f"{bname}, sağlık ve wellness hizmetleri sunan bir klinik.",
                "ecommerce_retail":   f"{bname}, online alışveriş imkânı sunan bir mağaza.",
                "hotel":              f"{bname}, konaklama ve misafirperverlik hizmetleri sunan bir otel.",
                "beauty_wellness":    f"{bname}, güzellik ve kişisel bakım hizmetleri sunan bir merkez.",
            }
            derived_desc = type_desc_map.get(btype, f"{bname} — {btype.replace('_', ' ')} sektöründe hizmet vermektedir.")

        if derived_desc:
            updates["description"] = derived_desc
            ctx.description = derived_desc

    # ── campaign_goals — derive from business_type + target_audience ──────
    if not ctx.campaign_goals or ctx.campaign_goals.strip() == "":
        btype = ctx.business_type or "general_business"
        audience = ctx.target_audience or "genel kitle"
        type_goals_map = {
            "restaurant_cafe":    "Rezervasyon ve ziyaretçi sayısını artır. Yeni menü ve etkinlikleri duyur.",
            "local_products_shop": "Online ve fiziksel satışları artır. Ürün hikayelerini ve üretici bağlantısını öne çıkar.",
            "beach_club":         "Yaz sezonu doluluk oranını artır. Etkinlik ve paketlere ilgiyi yükselt.",
            "healthcare_clinic":  "Randevu sayısını artır. Sağlık farkındalığı içerikleriyle güven oluştur.",
            "ecommerce_retail":   "Online sipariş ve site trafiğini artır. Tekrarlayan müşteri oranını yükselt.",
            "hotel":              "Doluluk oranını artır. Direkt rezervasyonları güçlendir.",
            "beauty_wellness":    "Yeni müşteri kazanımını artır. Hizmet kalitesini ve dönüşümleri öne çıkar.",
        }
        derived_goals = type_goals_map.get(
            btype,
            f"Marka bilinirliğini artır. {audience} kitlesine ulaşarak etkileşim ve dönüşümü güçlendir."
        )
        updates["campaign_goals"] = derived_goals
        ctx.campaign_goals = derived_goals

    # ── Persist all updates in one write ─────────────────────────────────
    if updates:
        from sqlalchemy import update
        await db.execute(
            update(BrandContext)
            .where(BrandContext.workspace_id == ctx.workspace_id)
            .values(**updates)
        )
        await db.commit()
        logger.info("brand_fields_seeded", workspace_id=str(ctx.workspace_id), fields=list(updates.keys()))

    return ctx


async def persist_brand_service_profile(
    db: AsyncSession, workspace_id: uuid.UUID,
) -> "BrandContext | None":
    """
    Derive the validated Brand Service Profile from discovery data and persist it.

    Authoritative positioning (category, signature offerings, CTA style,
    seasonality, guardrails) that the mission engine reads over the brittle
    `business_type` string. Safe to call repeatedly (idempotent merge).
    """
    from datetime import datetime as _dt, timezone as _tz
    from app.services.brand_service_profile_service import (
        derive_brand_service_profile,
        merge_service_profile,
    )

    ctx = await get_brand_context(db, workspace_id)
    if ctx is None:
        return None

    brand_ctx_dict = {
        "business_name": ctx.business_name,
        "business_type": ctx.business_type,
        "description": ctx.description,
        "website_summary": ctx.website_summary,
        "instagram_bio": ctx.instagram_bio,
        "visual_style": ctx.visual_style,
        "location": ctx.location,
        "gallery_analysis": ctx.gallery_analysis,
    }
    existing_profile = ctx.brand_service_profile if isinstance(ctx.brand_service_profile, dict) else None
    derived = derive_brand_service_profile(brand_ctx_dict)
    profile = merge_service_profile(existing_profile, derived)
    ctx.brand_service_profile = profile
    ctx.brand_service_profile_updated_at = _dt.now(_tz.utc)

    from app.services.brand_service_profile_service import context_updates_from_service_profile

    for field, value in context_updates_from_service_profile(profile).items():
        setattr(ctx, field, value)

    await db.commit()
    await db.refresh(ctx)
    await invalidate_brand_info_cache(workspace_id)
    logger.info(
        "brand_service_profile_persisted",
        workspace_id=str(workspace_id),
        category=profile.get("category"),
        confidence=profile.get("category_confidence"),
        source=profile.get("source"),
    )
    return ctx


async def build_brand_info(db: AsyncSession, workspace_id: uuid.UUID, *, skip_cache: bool = False) -> "BrandInfo | None":
    """
    Convert the database BrandContext + BrandAssets into a BrandInfo dataclass.

    Uses a short-lived in-memory cache to avoid redundant DB loads within the same
    mission wave (multiple nodes executing in parallel for the same workspace).
    """
    cache_key = str(workspace_id)
    if not skip_cache:
        cached = _brand_info_memory_cache.get(cache_key)
        if cached and (_time.time() - cached[0]) < _BRAND_INFO_MEMORY_TTL:
            return cached[1]

    result = await _build_brand_info_uncached(db, workspace_id)
    if result is not None:
        _brand_info_memory_cache[cache_key] = (_time.time(), result)
    return result


async def _build_brand_info_uncached(db: AsyncSession, workspace_id: uuid.UUID) -> BrandInfo | None:
    """
    Convert the database BrandContext + BrandAssets into a BrandInfo dataclass.

    Reads ALL fields including the new discovery intelligence columns added 2025-05-07.
    This is the bridge between the persistence layer and the CrewAI orchestration layer.
    """
    ctx = await get_brand_context(db, workspace_id)
    if not ctx:
        ctx = await ensure_brand_context(db, workspace_id)

    # Ensure critical fields are populated before building BrandInfo
    ctx = await seed_missing_brand_fields(db, ctx)

    asset_descriptions = [
        f"{a.asset_type}: {a.file_name}" + (f" - {a.description}" if a.description else "")
        for a in (ctx.assets or [])
    ]

    # Clean website-scraped business names (e.g. "Anasayfa - Sarnıç Beach" → "Sarnıç Beach")
    import re as _re
    def _clean_brand_name(name: str) -> str:
        name = _re.sub(r'^Anasayfa\s*[-\u2013|]\s*', '', name, flags=_re.IGNORECASE)
        name = _re.sub(r'\s*[-\u2013|]\s*Anasayfa$', '', name, flags=_re.IGNORECASE)
        name = _re.sub(r'\s*\|\s*.+$', '', name)
        return name.strip() or name

    def _looks_like_product_label(name: str) -> bool:
        n = (name or "").strip()
        if not n or " " in n:
            return False
        return bool(_re.match(r"^[A-Z][a-z]+[A-Z]", n))

    def _resolve_canonical_business_type(ctx: BrandContext) -> str:
        sp = getattr(ctx, "brand_service_profile", None) or {}
        if isinstance(sp, dict):
            from app.services.brand_service_profile_service import canonical_sector_from_category

            category = str(sp.get("category") or "").strip()
            if category:
                mapped = canonical_sector_from_category(category)
                if mapped:
                    return mapped
        return str(ctx.business_type or "general_business").strip() or "general_business"

    def _resolve_canonical_business_name(ctx: BrandContext) -> str:
        """Prefer operator-quality names over scraped nav labels (e.g. BerberRandevu → kacta.info)."""
        name = _clean_brand_name(ctx.business_name or "")
        wi = getattr(ctx, "website_intelligence", None)
        if isinstance(wi, str):
            try:
                wi = json.loads(wi)
            except Exception:
                wi = None
        display = ""
        if isinstance(wi, dict):
            display = _clean_brand_name(str(wi.get("brand_display_name") or ""))
        if name and not _looks_like_product_label(name):
            return name
        if display:
            return display
        return name or display or "Brand"

    canonical_name = _resolve_canonical_business_name(ctx)

    return BrandInfo(
        business_name=canonical_name,
        business_type=_resolve_canonical_business_type(ctx),
        description=ctx.description or "",
        brand_tone=ctx.brand_tone or "professional",
        visual_style=ctx.visual_style or "",
        target_audience=ctx.target_audience or "",
        location=ctx.location or "",
        languages=ctx.languages,
        campaign_goals=ctx.campaign_goals or "",
        competitors=ctx.competitors or "",
        custom_rules=ctx.custom_rules or "",
        keywords=ctx.keywords or "",
        asset_descriptions=asset_descriptions if asset_descriptions else None,
        content_pillars=_parse_json_list(ctx.content_pillars),
        default_ctas=_parse_json_list(ctx.default_ctas),
        risk_rules=_parse_json_dict(ctx.risk_rules),
        instagram_top_hashtags=_parse_json_list(ctx.instagram_top_hashtags),
        instagram_handle=(getattr(ctx, "instagram_handle", None) or "").lstrip("@"),
        website_summary=ctx.website_summary or "",
        instagram_bio=ctx.instagram_bio or "",
        discovery_confidence=ctx.discovery_confidence,
        brand_constitution_confirmed=ctx.brand_constitution_confirmed_at is not None,
        reference_image_urls=_parse_reference_image_urls(ctx.reference_image_urls),
        google_rating=getattr(ctx, "google_rating", None) or "",
        google_review_count=getattr(ctx, "google_review_count", None),
        google_review_signals=_parse_json_list_of_dicts(getattr(ctx, "google_review_signals", None)),
        visual_dna=getattr(ctx, "visual_dna", None) or "",
        competitor_brief=getattr(ctx, "competitor_brief", None) or "",
        trend_brief=getattr(ctx, "trend_brief", None) or "",
        competitor_pulse=getattr(ctx, "competitor_pulse", None) or "",
        market_opportunity_ideas=getattr(ctx, "market_opportunity_ideas", None) or "",
        industry_calendar=getattr(ctx, "industry_calendar", None) or "",
        brand_dna=getattr(ctx, "brand_dna", None) or "",
        brand_dna_updated_at=str(getattr(ctx, "brand_dna_updated_at", None) or ""),
        social_signals=getattr(ctx, "social_signals", None) or "",
        tripadvisor_reviews=getattr(ctx, "tripadvisor_reviews", None) or "",
        location_posts=getattr(ctx, "location_posts", None) or "",
        google_trends=getattr(ctx, "google_trends", None) or "",
        gallery_analysis=getattr(ctx, "gallery_analysis", None) or "",
        brand_vibe_profile=getattr(ctx, "brand_vibe_profile", None) or None,
        brand_theme=ctx.brand_theme if isinstance(getattr(ctx, "brand_theme", None), dict) else None,
        brand_theme_updated_at=str(getattr(ctx, "brand_theme_updated_at", None) or ""),
        website_intelligence=getattr(ctx, "website_intelligence", None) or None,
        service_profile=getattr(ctx, "brand_service_profile", None) or None,
        preferred_llm_provider=getattr(ctx, "llm_provider", None) or None,
        preferred_llm_model=getattr(ctx, "llm_model", None) or None,
        tenant_id=str(ctx.workspace_id),
        workspace_id=str(ctx.workspace_id),
        instagram_recent_captions=_parse_json_list(getattr(ctx, "instagram_recent_captions", None)),
        instagram_intelligence=getattr(ctx, "instagram_intelligence", None) or None,
        **_extract_pinterest_fields(getattr(ctx, "visual_inspiration", None)),
    )


def build_brand_info_from_internal(ctx: InternalBrandContext) -> BrandInfo:
    """
    Convert an InternalBrandContext (passed from .NET in /internal/v1/execute)
    into a BrandInfo dataclass.

    New discovery fields have safe defaults — existing .NET callers that don't
    send them yet are NOT broken.
    """
    return BrandInfo(
        business_name=ctx.business_name,
        business_type=ctx.business_type,
        description=ctx.description,
        brand_tone=ctx.brand_tone,
        visual_style=ctx.visual_style,
        target_audience=ctx.target_audience,
        location=ctx.location,
        languages=ctx.languages,
        campaign_goals=ctx.campaign_goals,
        competitors=ctx.competitors,
        custom_rules=ctx.custom_rules,
        keywords=ctx.keywords,
        asset_descriptions=ctx.asset_descriptions if ctx.asset_descriptions else None,
        content_pillars=ctx.content_pillars,
        default_ctas=ctx.default_ctas,
        risk_rules=ctx.risk_rules,
        instagram_top_hashtags=ctx.instagram_top_hashtags,
        instagram_handle=(getattr(ctx, "instagram_handle", None) or "").lstrip("@"),
        website_summary=ctx.website_summary,
        instagram_bio=ctx.instagram_bio,
        discovery_confidence=ctx.discovery_confidence,
        brand_constitution_confirmed=ctx.brand_constitution_confirmed,
        reference_image_urls=_parse_reference_image_urls(ctx.reference_image_urls),
        google_rating=ctx.google_rating,
        google_review_count=ctx.google_review_count,
        google_review_signals=list(ctx.google_review_signals),
        learning_context=ctx.learning_context,
        visual_dna=ctx.visual_dna,
        competitor_brief=ctx.competitor_brief,
        trend_brief=ctx.trend_brief,
        competitor_pulse=getattr(ctx, "competitor_pulse", None) or "",
        market_opportunity_ideas=getattr(ctx, "market_opportunity_ideas", None) or "",
        industry_calendar=getattr(ctx, "industry_calendar", None) or "",
        brand_dna=getattr(ctx, "brand_dna", None) or "",
        brand_dna_updated_at=str(getattr(ctx, "brand_dna_updated_at", None) or ""),
        tripadvisor_reviews=getattr(ctx, "tripadvisor_reviews", None) or "",
        location_posts=getattr(ctx, "location_posts", None) or "",
        google_trends=getattr(ctx, "google_trends", None) or "",
        gallery_analysis=getattr(ctx, "gallery_analysis", None) or "",
        operating_capabilities=list(getattr(ctx, "operating_capabilities", None) or []),
        gallery_policy=dict(getattr(ctx, "gallery_policy", None) or {}),
        brand_theme_updated_at=str(getattr(ctx, "brand_theme_updated_at", None) or ""),
        tenant_id=getattr(ctx, "tenant_id", "") or "",
        workspace_id=getattr(ctx, "tenant_id", "") or "",
    )


def enrich_brand_operating_policy(brand: BrandInfo) -> BrandInfo:
    """Attach resolved operating policy prompt block from capabilities / pillars."""
    from app.services.tenant_policy_service import (
        build_operating_policy_prompt_block,
        resolve_tenant_operating_profile,
    )

    import json as _json

    caps = brand.operating_capabilities or list(brand.content_pillars or [])
    gallery_json = _json.dumps(brand.gallery_policy) if brand.gallery_policy else None
    profile = resolve_tenant_operating_profile(
        tenant_id=brand.tenant_id or "unknown",
        industry=brand.business_type,
        content_needs_json=_json.dumps(brand.content_pillars or []),
        operating_capabilities_json=_json.dumps(caps) if caps else None,
        gallery_policy_json=gallery_json,
        risk_rules_json=_json.dumps(brand.risk_rules) if brand.risk_rules else None,
        custom_rules=brand.custom_rules,
    )
    brand.operating_capabilities = profile.enabled_capabilities
    brand.gallery_policy = profile.gallery_policy
    brand.operating_policy_prompt = build_operating_policy_prompt_block(profile)
    return brand


def merge_dotnet_brand_with_python_db(
    base: BrandInfo,
    py_brand: BrandInfo,
    *,
    dotnet_content_pillars: list[str] | None = None,
) -> BrandInfo:
    """
    Merge Python DB intelligence into a .NET-originated BrandInfo.
    Shared by internal orchestration and mission production paths.
    """
    if py_brand.visual_dna:
        base.visual_dna = py_brand.visual_dna
    if py_brand.competitor_brief:
        base.competitor_brief = py_brand.competitor_brief
    if py_brand.trend_brief:
        base.trend_brief = py_brand.trend_brief
    py_pillars = list(py_brand.content_pillars or [])
    if py_pillars:
        base.content_pillars = py_pillars
    elif dotnet_content_pillars:
        base.content_pillars = list(dotnet_content_pillars)
    if py_brand.default_ctas:
        base.default_ctas = py_brand.default_ctas
    if py_brand.risk_rules:
        base.risk_rules = py_brand.risk_rules
    if py_brand.reference_image_urls:
        base.reference_image_urls = py_brand.reference_image_urls
    if py_brand.instagram_top_hashtags:
        base.instagram_top_hashtags = py_brand.instagram_top_hashtags
    if py_brand.google_rating:
        base.google_rating = py_brand.google_rating
    if py_brand.google_review_count:
        base.google_review_count = py_brand.google_review_count
    if py_brand.google_review_signals:
        base.google_review_signals = py_brand.google_review_signals
    if py_brand.website_summary:
        base.website_summary = py_brand.website_summary
    if py_brand.instagram_bio:
        base.instagram_bio = py_brand.instagram_bio
    base.discovery_confidence = py_brand.discovery_confidence or base.discovery_confidence
    base.brand_constitution_confirmed = py_brand.brand_constitution_confirmed
    if py_brand.languages and py_brand.languages.strip():
        base.languages = py_brand.languages
    if py_brand.brand_dna:
        base.brand_dna = py_brand.brand_dna
    if py_brand.industry_calendar:
        base.industry_calendar = py_brand.industry_calendar
    if py_brand.competitor_pulse:
        base.competitor_pulse = py_brand.competitor_pulse
    if py_brand.market_opportunity_ideas:
        base.market_opportunity_ideas = py_brand.market_opportunity_ideas
    if py_brand.social_signals:
        base.social_signals = py_brand.social_signals
    if py_brand.gallery_analysis:
        base.gallery_analysis = py_brand.gallery_analysis
    if py_brand.brand_vibe_profile:
        base.brand_vibe_profile = py_brand.brand_vibe_profile
    if py_brand.brand_theme:
        base.brand_theme = py_brand.brand_theme
    if py_brand.website_intelligence:
        base.website_intelligence = py_brand.website_intelligence
    if py_brand.preferred_llm_provider:
        base.preferred_llm_provider = py_brand.preferred_llm_provider
    if py_brand.preferred_llm_model:
        base.preferred_llm_model = py_brand.preferred_llm_model
    return base


async def build_production_brand_context(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    apply_gallery_usage: bool = True,
) -> BrandInfo | None:
    """
    Brand context for mission Feed production — same enrichment stack as agent execution.
    """
    brand = await build_brand_info(db, workspace_id)
    if not brand:
        return None
    brand.tenant_id = str(workspace_id)
    enrich_brand_operating_policy(brand)
    if apply_gallery_usage:
        try:
            from app.services.gallery_usage_service import (
                apply_gallery_usage_to_brand,
                fetch_gallery_usage_by_type,
            )

            usage = await fetch_gallery_usage_by_type(str(workspace_id))
            apply_gallery_usage_to_brand(brand, usage)
        except Exception as exc:
            logger.warning(
                "production_gallery_usage_load_failed",
                workspace_id=str(workspace_id),
                error=str(exc)[:200],
            )
    return brand


# ── Discovery persistence ──────────────────────────────────────────────────

def apply_website_brand_kit(
    ctx: BrandContext,
    kit: dict,
    *,
    fill_empty_only: bool = True,
) -> list[str]:
    """
    Apply extracted website typography/colors to brand_context + brand_theme JSON.
    Returns list of field names that were updated.
    """
    if not kit or not isinstance(kit, dict):
        return []

    applied: list[str] = []
    heading = (kit.get("heading_font") or "").strip()
    body = (kit.get("body_font") or "").strip()
    primary = (kit.get("primary_color") or "").strip()
    accent = (kit.get("accent_color") or "").strip()

    def _empty(val: str | None) -> bool:
        return not val or not str(val).strip()

    if heading:
        if not fill_empty_only or _empty(ctx.brand_font_family):
            ctx.brand_font_family = heading[:64]
            applied.append("brand_font_family")

    if primary:
        if not fill_empty_only or _empty(ctx.brand_primary_color):
            ctx.brand_primary_color = primary[:16]
            applied.append("brand_primary_color")

    if accent:
        if not fill_empty_only or _empty(ctx.brand_accent_color):
            ctx.brand_accent_color = accent[:16]
            applied.append("brand_accent_color")

    theme = dict(ctx.brand_theme) if isinstance(ctx.brand_theme, dict) else {}
    typo = dict(theme.get("typography") or {})
    palette = dict(theme.get("palette") or {})

    if heading and (not fill_empty_only or _empty(typo.get("heading_font"))):
        typo["heading_font"] = heading
        applied.append("theme.typography.heading_font")
    if body and (not fill_empty_only or _empty(typo.get("body_font"))):
        typo["body_font"] = body
        applied.append("theme.typography.body_font")
    if primary and (not fill_empty_only or _empty(palette.get("primary"))):
        palette["primary"] = primary
        applied.append("theme.palette.primary")
    if accent and (not fill_empty_only or _empty(palette.get("accent"))):
        palette["accent"] = accent
        applied.append("theme.palette.accent")

    if applied and (typo or palette):
        if typo:
            theme["typography"] = typo
        if palette:
            theme["palette"] = palette
        ctx.brand_theme = theme

    return applied


def _apply_default_brand_fonts(ctx: BrandContext) -> list[str]:
    """Safe typography when website kit extraction fails but fonts are still missing."""
    applied: list[str] = []
    if not (ctx.brand_font_family or "").strip():
        ctx.brand_font_family = "Inter"
        applied.append("brand_font_family_fallback")

    theme = dict(ctx.brand_theme) if isinstance(ctx.brand_theme, dict) else {}
    typo = dict(theme.get("typography") or {})
    if not (typo.get("heading_font") or "").strip():
        typo["heading_font"] = ctx.brand_font_family or "Inter"
        applied.append("theme.typography.heading_font_fallback")
    if not (typo.get("body_font") or "").strip():
        typo["body_font"] = "DM Sans"
        applied.append("theme.typography.body_font_fallback")

    if applied:
        theme["typography"] = typo
        ctx.brand_theme = theme
    return applied


async def enrich_brand_kit_from_website(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    *,
    fill_empty_only: bool = True,
) -> dict:
    """Fetch homepage and apply typography/color kit. Re-derives BrandTheme when applied."""
    from app.crew.brand_analyzer import fetch_website_deep
    from app.services.brand_theme_service import derive_brand_theme, save_brand_theme

    ctx = await ensure_brand_context(db, workspace_id)
    url = (ctx.website_url or "").strip()
    if not url:
        return {"ok": False, "reason": "no_website_url", "applied": []}

    from app.services.website_brand_kit_service import fetch_brand_kit_from_website

    website: dict = {}
    kit = await fetch_brand_kit_from_website(url)
    if not kit or kit.get("confidence", 0) < 25:
        website = await fetch_website_deep(url)
        kit = website.get("brand_kit") if isinstance(website.get("brand_kit"), dict) else {}
    if (not kit or kit.get("confidence", 0) < 25) and url.startswith(("http://", "https://")):
        from urllib.parse import urlparse, urlunparse

        parsed = urlparse(url)
        host = parsed.netloc.lower()
        alt_host = host[4:] if host.startswith("www.") else f"www.{host}"
        alt_url = urlunparse(parsed._replace(netloc=alt_host))
        if alt_url != url:
            alt_kit = await fetch_brand_kit_from_website(alt_url)
            if alt_kit and alt_kit.get("confidence", 0) >= 25:
                kit = alt_kit

    applied: list[str] = []
    if kit and kit.get("confidence", 0) >= 25:
        applied = apply_website_brand_kit(ctx, kit, fill_empty_only=fill_empty_only)

    if not applied and fill_empty_only:
        applied = _apply_default_brand_fonts(ctx)

    if applied:
        theme = await derive_brand_theme(ctx)
        await save_brand_theme(ctx, theme, db)
    else:
        await db.flush()

    await db.commit()

    has_fonts = bool((ctx.brand_font_family or "").strip())
    has_colors = bool((ctx.brand_primary_color or "").strip() and (ctx.brand_accent_color or "").strip())

    if not applied:
        if has_fonts and has_colors:
            return {
                "ok": True,
                "reason": "already_complete",
                "applied": [],
                "kit": kit or {},
                "brand_font_family": ctx.brand_font_family,
                "brand_primary_color": ctx.brand_primary_color,
                "brand_accent_color": ctx.brand_accent_color,
                "theme": ctx.brand_theme,
            }
        return {
            "ok": False,
            "reason": "no_kit_detected",
            "applied": [],
            "website_ok": bool(website.get("raw_fetch_ok")),
            "kit": kit or {},
            "brand_font_family": ctx.brand_font_family,
            "brand_primary_color": ctx.brand_primary_color,
            "brand_accent_color": ctx.brand_accent_color,
            "theme": ctx.brand_theme,
        }

    return {
        "ok": True,
        "applied": applied,
        "kit": kit or {},
        "brand_font_family": ctx.brand_font_family,
        "brand_primary_color": ctx.brand_primary_color,
        "brand_accent_color": ctx.brand_accent_color,
        "theme": ctx.brand_theme,
    }


async def persist_discovery_result(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    analysis_result: dict,
    *,
    website_url: str | None = None,
    instagram_handle: str | None = None,
    google_business_url: str | None = None,
) -> BrandContext:
    """
    Save the output of analyze_brand() into BrandContext (upsert).
    Only overwrites fields that were actually discovered — never clears
    existing manually-entered values with empty strings.
    Caller must NOT flush after this; one flush here covers all mutations.
    """
    await ensure_nexus_mirror_workspace(db, workspace_id)
    ctx = await get_brand_context(db, workspace_id)
    report = analysis_result.get("report", {})
    website = analysis_result.get("website", {})
    instagram = analysis_result.get("instagram", {})
    google = analysis_result.get("google_business", {})

    def _source_ready(
        source_data: dict,
        *,
        configured: bool,
        cached_signal: bool,
    ) -> bool:
        if source_data.get("raw_fetch_ok"):
            return True
        if not configured:
            return False
        return cached_signal

    website_ready = _source_ready(
        website,
        configured=bool(website_url),
        cached_signal=bool(
            website.get("title")
            or website.get("text_snippet")
            or (ctx and ctx.website_summary)
        ),
    )
    instagram_ready = _source_ready(
        instagram,
        configured=bool(instagram_handle),
        cached_signal=bool(
            instagram.get("bio")
            or instagram.get("full_name")
            or (ctx and ctx.instagram_bio)
        ),
    )
    google_ready = _source_ready(
        google,
        configured=bool(google_business_url),
        cached_signal=bool(google.get("name") or google.get("category")),
    )

    sources_ok = int(website_ready) + int(instagram_ready) + int(google_ready)
    confidence = min(90, 30 + sources_ok * 20)

    if ctx is None:
        brand_name = (
            report.get("brand_name")
            or google.get("name")
            or instagram.get("full_name")
            or website.get("title", "")
            or "Unknown Brand"
        )
        ctx = BrandContext(
            workspace_id=workspace_id,
            business_name=brand_name,
            business_type=report.get("industry", "business"),
        )
        db.add(ctx)

    # Source URLs — only set when provided
    if website_url:
        ctx.website_url = website_url
    if instagram_handle:
        ctx.instagram_handle = instagram_handle
    if google_business_url:
        ctx.google_business_url = google_business_url

    # ── Scalar fields ──────────────────────────────────────────────────────
    custom_rules_lower = (ctx.custom_rules or "").lower()
    is_saas_brand = "b2b saas" in custom_rules_lower or "saas" in (ctx.description or "").lower()

    # business_type: re-infer with ALL available text for maximum accuracy.
    new_industry = report.get("industry", "")
    if new_industry:
        from app.crew.brand_analyzer import infer_industry
        from app.crew.industry_playbooks import normalize_industry_id
        all_text = " ".join(filter(None, [
            ctx.business_name, ctx.website_summary or "",
            ctx.instagram_bio or "", ctx.description or "", new_industry,
        ]))
        # Use the raw inferred ID for storage so the TypeScript sector-production-profile
        # system can use the most specific sector (e.g. "jewelry_accessories", not "fashion_retail").
        # normalize_industry_id is only for Python playbook lookups, not for DB storage.
        raw_inferred = infer_industry(all_text)
        better = raw_inferred  # store raw; TypeScript profile handles specific behaviours
        if is_saas_brand and better not in ("agency_services", "ecommerce_retail"):
            better = "agency_services"
        current = ctx.business_type or ""
        GENERIC = {"general_business", "local_service_business", "business", ""}
        SPECIFIC = {
            "local_products_shop", "beach_club", "healthcare_clinic",
            "beauty_wellness", "real_estate", "ecommerce_retail",
            "agency_services", "mental_health_clinic", "production_company",
            # New specific sectors — always preferred over generic labels
            "fashion_retail", "jewelry_accessories", "bakery_patisserie",
            "cafe_bakery", "fitness", "barber_salon", "nightclub_lounge",
        }
        ALLOW_CORRECTIVE_REMAPS = {
            # Stale restaurant/cafe label → more accurate re-analysis result
            ("restaurant_cafe", "agency_services"),
            ("restaurant_cafe", "beauty_wellness"),
            ("restaurant_cafe", "healthcare_clinic"),
            ("restaurant_cafe", "local_products_shop"),
            ("restaurant_cafe", "handmade_product_brand"),
            ("restaurant_cafe", "fashion_retail"),
            ("restaurant_cafe", "jewelry_accessories"),
            ("restaurant_cafe", "bakery_patisserie"),
            ("restaurant_cafe", "fitness"),
            # Coffee shop misidentified — stale
            ("coffee_shop", "agency_services"),
            ("coffee_shop", "beauty_wellness"),
            ("coffee_shop", "fashion_retail"),
            ("coffee_shop", "jewelry_accessories"),
            # Other stale general labels
            ("hospitality_entertainment", "agency_services"),
            ("local_service_business", "agency_services"),
            ("local_service_business", "beauty_wellness"),
            ("local_service_business", "healthcare_clinic"),
            ("local_service_business", "fashion_retail"),
            ("local_service_business", "jewelry_accessories"),
            ("local_service_business", "bakery_patisserie"),
            ("local_service_business", "fitness"),
            ("beach_club", "agency_services"),
            ("general_business", "beauty_wellness"),
            ("general_business", "healthcare_clinic"),
            ("general_business", "local_products_shop"),
            ("general_business", "fashion_retail"),
            ("general_business", "jewelry_accessories"),
            ("general_business", "bakery_patisserie"),
            ("general_business", "fitness"),
        }
        # Additionally: if business name contains strong sector signals and current is generic/wrong,
        # force a name-signal override for key sectors.
        name_lower = (ctx.business_name or "").lower()
        BEAUTY_NAME_SIGNALS = [
            "tırnak", "tirnak", "nail", "manikür", "manikyur", "manicure",
            "pedikür", "pedikyur", "güzellik", "guzellik", "spa", "kuaför",
            "kuafor", "berber", "estetik", "lash", "epilasyon",
        ]
        JEWELRY_NAME_SIGNALS = [
            "mücevher", "mucevher", "jewelry", "kuyumcu", "pırlanta", "pirlanta",
            "altın", "altin", "elmas", "diamond",
        ]
        FASHION_NAME_SIGNALS = [
            "boutique", "moda", "giyim", "fashion", "atelier", "atölye",
        ]
        BAKERY_NAME_SIGNALS = [
            "pastane", "fırın", "firin", "ekmek", "pasta", "patisserie",
        ]
        _stale_labels = (*GENERIC, "restaurant_cafe", "coffee_shop", "local_service_business",
                         "general_business", "hospitality_entertainment")
        name_implies_beauty = any(s in name_lower for s in BEAUTY_NAME_SIGNALS)
        name_implies_jewelry = any(s in name_lower for s in JEWELRY_NAME_SIGNALS)
        name_implies_fashion = any(s in name_lower for s in FASHION_NAME_SIGNALS)
        name_implies_bakery = any(s in name_lower for s in BAKERY_NAME_SIGNALS)
        name_override_to_beauty = name_implies_beauty and current in _stale_labels
        name_override_to_jewelry = name_implies_jewelry and current in _stale_labels
        name_override_to_fashion = name_implies_fashion and current in _stale_labels
        name_override_to_bakery = name_implies_bakery and current in _stale_labels
        any_name_override = (
            name_override_to_beauty or name_override_to_jewelry
            or name_override_to_fashion or name_override_to_bakery
        )
        should_update = (
            current in GENERIC
            or (current not in SPECIFIC and better in SPECIFIC)
            or ((current, better) in ALLOW_CORRECTIVE_REMAPS)
            or any_name_override
        )
        # Apply name-signal override when keyword inference produced a generic fallback
        if name_override_to_beauty and better not in SPECIFIC:
            better = "beauty_wellness"
        if name_override_to_jewelry and better not in SPECIFIC:
            better = "jewelry_accessories"
        if name_override_to_fashion and better not in SPECIFIC:
            better = "fashion_retail"
        if name_override_to_bakery and better not in SPECIFIC:
            better = "bakery_patisserie"
        if should_update:
            if better and better != current:
                ctx.business_type = better
                logger.info("updated_business_type_on_reanalysis",
                            workspace_id=str(ctx.workspace_id), old=current, new=better)

    # brand_tone — overwrite from analysis unless SaaS brand has explicit tone
    if report.get("brand_tone"):
        if not is_saas_brand or not (ctx.brand_tone or "").strip():
            ctx.brand_tone = _sanitize_text_for_db(str(report["brand_tone"]), max_len=500)
    if report.get("visual_style"):
        ctx.visual_style = _sanitize_text_for_db(str(report["visual_style"]), max_len=500)
    if report.get("target_audience") and not is_saas_brand:
        audience = report["target_audience"]
        ctx.target_audience = _sanitize_text_for_db(
            ", ".join(audience) if isinstance(audience, list) else str(audience),
            max_len=500,
        )

    # location — extract from Instagram bio (📍 pattern) or Google Business address
    if not ctx.location or ctx.location in ("Türkiye", "Turkey", ""):
        inferred_location = _extract_location_from_sources(instagram, google)
        if inferred_location:
            ctx.location = inferred_location
            logger.info("location_inferred", workspace_id=str(ctx.workspace_id), location=inferred_location)

    # country_code — resolve from location/languages so the brand gets the right
    # national special-day calendar (drives onboarding event templates).
    if not getattr(ctx, "country_code", None):
        try:
            from app.services.special_day_service import resolve_country_code
            ctx.country_code = resolve_country_code(
                location=ctx.location, languages=ctx.languages,
            )
            logger.info(
                "country_code_resolved",
                workspace_id=str(ctx.workspace_id),
                country_code=ctx.country_code,
            )
        except Exception:
            ctx.country_code = "TR"
    new_summary = report.get("website_summary", "")
    # Filter out JS/tracking noise before saving
    if new_summary:
        import re as _re
        _JS_NOISE = _re.compile(
            r"(!function\(|__webpack_|_sentryDebugIds|gtag\(|dataLayer\.push|"
            r"typeof window|typeof global|try\{var [a-z]=)",
            _re.IGNORECASE,
        )
        clean_lines = [
            ln for ln in new_summary.split("\n")
            if len(ln.strip()) > 5 and len(ln.strip()) < 2000 and not _JS_NOISE.search(ln)
        ]
        new_summary = "\n".join(clean_lines).strip()
    new_summary = _sanitize_text_for_db(new_summary, max_len=4000)
    # Only overwrite if new summary has meaningful content
    if new_summary and len(new_summary.strip()) > 50:
        ctx.website_summary = new_summary
    if instagram.get("bio"):
        ctx.instagram_bio = instagram["bio"][:500]

    # Brand logo — captured from the website during onboarding. Only fill when
    # empty so a user-uploaded logo is never overwritten by a scraped one.
    canonical_site = (ctx.website_url or website_url or "").strip()
    if not (ctx.logo_url or "").strip():
        discovered_logo = _reconcile_logo_with_website(
            (website.get("logo_url") or "").strip(),
            canonical_site,
        )
        if discovered_logo.startswith(("http://", "https://")) and len(discovered_logo) <= 512:
            ctx.logo_url = discovered_logo
            logger.info("logo_url_discovered", workspace_id=str(ctx.workspace_id), logo_url=discovered_logo[:120])
    elif canonical_site:
        reconciled = _reconcile_logo_with_website(ctx.logo_url or "", canonical_site)
        if reconciled != (ctx.logo_url or ""):
            ctx.logo_url = reconciled
            logger.info(
                "logo_url_reconciled_with_website",
                workspace_id=str(ctx.workspace_id),
                logo_url=reconciled[:120],
            )
    # Only update languages from analysis if the user has NOT explicitly set it
    # via the language selector (set-language endpoint). We detect "explicitly set"
    # by checking if languages is already non-default (i.e. not 'tr' from a previous
    # inference). Actually, we should NEVER override a user-set language with inference.
    # The safest rule: only set languages if it's currently unset or still the same
    # as the newly inferred value (i.e. don't override a deliberate user choice).
    inferred = analysis_result.get("inferred_language")
    if inferred and (not ctx.languages or ctx.languages == "en"):
        ctx.languages = inferred
    elif not ctx.languages:
        ctx.languages = "tr"

    # Google Business signals — always refresh
    gb_rating = google.get("rating") or google.get("totalScore")
    if gb_rating is not None:
        ctx.google_rating = str(gb_rating)
    gb_count = google.get("review_count") or google.get("reviewsCount") or google.get("reviewCount")
    if gb_count is not None:
        ctx.google_review_count = int(gb_count)
    reviews = google.get("reviews") or []
    if reviews:
        signals = [
            {"text": (r.get("text") or "").strip()[:160], "stars": r.get("stars") or r.get("rating")}
            for r in reviews
            if (r.get("text") or "").strip()
        ][:20]
        ctx.google_review_signals = json.dumps(signals)

    # JSON discovery output — always refresh from latest analysis
    if not is_saas_brand or not (ctx.content_pillars or "").strip() or ctx.content_pillars == "[]":
        ctx.content_pillars = json.dumps(report.get("content_pillars", []))
    if not is_saas_brand or not (ctx.default_ctas or "").strip() or ctx.default_ctas == "[]":
        ctx.default_ctas = json.dumps(report.get("default_ctas", []))
    ctx.risk_rules = json.dumps(report.get("risk_rules", {}))
    # top_hashtags is surfaced at the top-level of analysis_result as the canonical value
    ctx.instagram_top_hashtags = json.dumps(analysis_result.get("top_hashtags", []))

    refs = analysis_result.get("reference_image_urls")
    if isinstance(refs, list) and refs:
        seen: set[str] = set()
        raw_refs: list[str] = []
        for u in refs:
            if not isinstance(u, str):
                continue
            s = u.strip()
            if not (s.startswith("http://") or s.startswith("https://")):
                continue
            if not _is_usable_gallery_url(s):
                continue
            if s in seen:
                continue
            seen.add(s)
            raw_refs.append(s)
            if len(raw_refs) >= 120:
                break

        ctx.reference_image_urls = json.dumps(raw_refs)

    # Deep Instagram intelligence — captions + GPT-4o analysis
    ig_captions = (analysis_result.get("instagram") or {}).get("recent_captions") or []
    if ig_captions:
        ctx.instagram_recent_captions = json.dumps(ig_captions, ensure_ascii=False)
    ig_intelligence = analysis_result.get("instagram_intelligence")
    if isinstance(ig_intelligence, dict) and ig_intelligence:
        ctx.instagram_intelligence = ig_intelligence

    # Website intelligence — menu catalog + photo inventory from crawl
    wi = analysis_result.get("website_intelligence")
    if isinstance(wi, dict) and wi:
        ctx.website_intelligence = _sanitize_json_value(wi)

    # Tripadvisor reviews
    ta_reviews = analysis_result.get("tripadvisor_reviews")
    if isinstance(ta_reviews, list) and ta_reviews:
        ctx.tripadvisor_reviews = json.dumps(ta_reviews)

    # Hyper-local Instagram location posts
    loc_posts = analysis_result.get("location_posts")
    if isinstance(loc_posts, list) and loc_posts:
        ctx.location_posts = json.dumps(loc_posts)

    ctx.discovery_confidence = confidence
    ctx.last_brand_analysis_at = datetime.now(timezone.utc)

    # Website typography / colors → Marka Detayı + brand_theme
    wi_kit = website.get("brand_kit") if isinstance(website.get("brand_kit"), dict) else {}
    if wi_kit.get("confidence", 0) >= 25:
        apply_website_brand_kit(ctx, wi_kit, fill_empty_only=True)

    saved_refs = _parse_reference_image_urls(ctx.reference_image_urls)
    if len(saved_refs) == 0 and (website_url or (ctx.website_url or "").strip()):
        logger.warning(
            "website_gallery_empty_no_synthetic",
            workspace_id=str(workspace_id),
            website_url=(website_url or ctx.website_url or "")[:120],
        )

    await db.flush()
    return ctx


async def bootstrap_brand_intelligence(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> dict[str, str]:
    """
    Day-1 intelligence seeding for a workspace.

    Populates industry_calendar, trend_brief, competitor_pulse, and
    market_opportunity_ideas if they are currently empty.  Designed to be
    called immediately after brand-constitution confirmation AND by the
    daily scheduler backfill loop for any workspace that still has NULL
    signals.

    Returns a dict describing what was generated / skipped.
    """
    import asyncio as _asyncio
    import json as _json

    from app.config import get_settings
    from app.services.industry_intelligence_service import build_industry_calendar
    from app.crew.crews.market_intelligence_crew import run_market_intelligence

    settings = get_settings()
    results: dict[str, str] = {}

    ctx = await get_brand_context(db, workspace_id)
    if not ctx:
        return {"error": "brand_context_not_found"}

    brand = await build_brand_info(db, workspace_id)
    if not brand or not brand.business_type:
        return {"skipped": "no_business_type"}

    # ── Industry Calendar ─────────────────────────────────────────────────
    if not ctx.industry_calendar:
        try:
            calendar = await build_industry_calendar(
                brand,
                openai_api_key=settings.openai_api_key or "",
                perplexity_api_key=settings.perplexity_api_key or "",
                perplexity_model=settings.perplexity_model,
                tavily_api_key=getattr(settings, "tavily_api_key", "") or "",
                brave_api_key=getattr(settings, "brave_search_api_key", "") or "",
            )
            ctx.industry_calendar = _json.dumps(calendar, ensure_ascii=False)
            ctx.industry_intelligence_updated_at = datetime.now(timezone.utc).isoformat()
            results["industry_calendar"] = "generated"
            logger.info(
                "bootstrap_industry_calendar",
                workspace_id=str(workspace_id),
                industry=calendar.get("industry_type", ""),
            )
        except Exception as exc:
            logger.warning("bootstrap_industry_calendar_failed", workspace_id=str(workspace_id), error=str(exc)[:200])
            results["industry_calendar"] = f"failed:{str(exc)[:80]}"
    else:
        results["industry_calendar"] = "already_present"

    # ── Market Intelligence (trend_brief + competitor_pulse) ──────────────
    if not ctx.trend_brief or not ctx.competitor_pulse:
        try:
            market_result = await _asyncio.to_thread(run_market_intelligence, brand)
            if market_result.get("trend_brief"):
                ctx.trend_brief = market_result["trend_brief"]
                ctx.trend_brief_updated_at = market_result.get("refreshed_at")
            if market_result.get("competitor_pulse"):
                ctx.competitor_pulse = market_result["competitor_pulse"]
            if market_result.get("urgent_content_ideas"):
                ctx.market_opportunity_ideas = _json.dumps(
                    market_result["urgent_content_ideas"], ensure_ascii=False
                )
            ctx.market_intelligence_updated_at = market_result.get("refreshed_at")
            results["market_intelligence"] = "generated"
            logger.info("bootstrap_market_intelligence", workspace_id=str(workspace_id))
        except Exception as exc:
            logger.warning("bootstrap_market_intelligence_failed", workspace_id=str(workspace_id), error=str(exc)[:200])
            results["market_intelligence"] = f"failed:{str(exc)[:80]}"
    else:
        results["market_intelligence"] = "already_present"

    db.add(ctx)
    await db.commit()
    return results
