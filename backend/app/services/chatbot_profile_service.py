"""Build and persist brand chatbot profiles from brand_context signals."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand_context import BrandContext
from app.schemas.brand_chatbot import (
    BrandChatbotProfile,
    BrandChatbotProfilePatch,
    ChatbotConversationRules,
    ChatbotFaqItem,
    ChatbotProductCategory,
)
from app.services import brand_context_service

ProfileMode = Literal["restaurant", "ecommerce", "general"]

_RESTAURANT_CATEGORIES = frozenset({
    "restaurant_bar", "cafe_bakery", "beach_club_bar",
})
_ECOMMERCE_CATEGORIES = frozenset({
    "local_products_shop", "fashion_retail",
})
_RESTAURANT_SECTORS = frozenset({
    "restaurant_cafe", "coffee_shop", "beach_club", "restaurant", "cafe",
})
_ECOMMERCE_SECTORS = frozenset({
    "local_products_shop", "fashion_boutique", "fashion_retail",
})

_CATEGORY_SKIP = frozenset({
    "genel", "about us", "contact us", "mağaza", "magaza",
    "hakkımızda", "iletisim", "iletişim", "home", "anasayfa", "menu", "menü",
})

_JUNK_CATEGORY_RE = re.compile(
    r"w[oO][fF]2|woff2?|@font-face|font/|\.ttf\b|\.otf\b|"
    r"data:application|base64|__webpack|gtag\(|dataLayer",
    re.IGNORECASE,
)
_PHONE_RE = re.compile(
    r"(?:"
    r"(?:\+90|0090|0)\s*[\(\-]?\s*\d{3}\s*[\)\-]?\s*\d{3}\s*[\s\-]?\d{2}\s*[\s\-]?\d{2}"
    r"|(?:\+90|0)\s*\d{3}\s*\d{3}\s*\d{2}\s*\d{2}"
    r")",
    re.IGNORECASE,
)
_TEL_LINK_RE = re.compile(r"tel:\s*([+\d\s\-()]+)", re.IGNORECASE)
_PHONE_LABEL_RE = re.compile(
    r"(?:telefon|tel|phone|gsm|whatsapp|wp)\s*[:\-]?\s*([+\d\s\-()]{10,20})",
    re.IGNORECASE,
)


def _normalize_display_name(raw: str, wi: dict | None = None) -> str:
    """Prefer structured brand name; fall back to cleaned business_name."""
    if isinstance(wi, dict):
        inferred = str(wi.get("brand_display_name") or "").strip()
        if inferred and inferred.lower() not in _CATEGORY_SKIP:
            return inferred

    name = (raw or "").strip()
    if not name:
        return "Marka"
    if ".com" in name.lower() or name.startswith("http"):
        slug = re.sub(r"^https?://", "", name.lower()).split("/")[0]
        slug = slug.replace(".com.tr", "").replace(".com", "").replace(".tr", "")
        slug = slug.replace("www.", "")
        return slug.replace("-", " ").replace("_", " ").title()
    name = re.sub(r"^Anasayfa\s*[-\u2013|]\s*", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s*[-\u2013|]\s*Anasayfa$", "", name, flags=re.IGNORECASE)
    return name.strip() or "Marka"


def _brand_ctx_dict(ctx: BrandContext) -> dict:
    return {
        "business_name": ctx.business_name,
        "business_type": ctx.business_type,
        "description": ctx.description,
        "website_summary": ctx.website_summary,
        "instagram_bio": ctx.instagram_bio,
        "visual_style": ctx.visual_style,
        "location": ctx.location,
    }


def _resolve_profile_mode(ctx: BrandContext) -> tuple[ProfileMode, str, str]:
    """
    Return (mode, category, cta_style) from brand_service_profile or heuristics.
    """
    sp = ctx.brand_service_profile if isinstance(ctx.brand_service_profile, dict) else {}
    category = str(sp.get("category") or "").strip().lower()
    cta_style = str(sp.get("cta_style") or "").strip().lower()

    if not category:
        from app.services.brand_service_profile_service import heuristic_service_profile

        derived = heuristic_service_profile(_brand_ctx_dict(ctx))
        category = str(derived.get("category") or "").strip().lower()
        cta_style = str(derived.get("cta_style") or "").strip().lower()

    sector = str(ctx.business_type or "").strip().lower()

    if category in _RESTAURANT_CATEGORIES or sector in _RESTAURANT_SECTORS:
        return "restaurant", category, cta_style or "reservation"
    if category in _ECOMMERCE_CATEGORIES or sector in _ECOMMERCE_SECTORS:
        return "ecommerce", category, cta_style or "ecommerce"
    if cta_style in ("reservation", "visit", "booking"):
        return "restaurant", category, cta_style
    if cta_style == "ecommerce":
        return "ecommerce", category, cta_style
    return "general", category, cta_style or "contact"


def is_valid_category_name(name: str) -> bool:
    """Reject scraped junk (fonts, binary, markdown headers, non-human text)."""
    raw = (name or "").strip()
    if not raw or len(raw) < 3:
        return False
    if raw.startswith("#") or raw.startswith("##"):
        return False
    if raw.lower() in _CATEGORY_SKIP:
        return False
    if _JUNK_CATEGORY_RE.search(raw):
        return False
    # Mostly non-letter characters → not a human category label
    letters = sum(1 for c in raw if c.isalpha())
    if letters < max(3, len(raw) * 0.35):
        return False
    # Long unbroken alphanumeric blobs (font/binary payloads)
    if len(raw) > 40 and " " not in raw:
        return False
    return True


def _extract_phone(*text_blobs: str | None) -> str:
    for blob in text_blobs:
        if not blob:
            continue
        for m in _TEL_LINK_RE.finditer(blob):
            phone = re.sub(r"\s+", " ", m.group(1)).strip()
            if len(re.sub(r"\D", "", phone)) >= 10:
                return phone
        for m in _PHONE_LABEL_RE.finditer(blob):
            phone = re.sub(r"\s+", " ", m.group(1)).strip()
            if len(re.sub(r"\D", "", phone)) >= 10:
                return phone
        for m in _PHONE_RE.finditer(blob):
            phone = re.sub(r"\s+", " ", m.group(0)).strip()
            if len(re.sub(r"\D", "", phone)) >= 10:
                return phone
    return ""


def _extract_address(ctx: BrandContext, wi: dict | None) -> str:
    location = (ctx.location or "").strip()
    if location:
        return location

    for blob in (ctx.website_summary, ctx.description):
        if not blob:
            continue
        for pat in (
            r"(?:adres|address)\s*[:\-]\s*([^\n]{8,120})",
            r"📍\s*([^\n#@]{4,100})",
        ):
            m = re.search(pat, blob, re.IGNORECASE)
            if m:
                return m.group(1).strip().rstrip(".,")

    if isinstance(wi, dict):
        contact = wi.get("contact") or {}
        if isinstance(contact, dict):
            addr = str(contact.get("address") or "").strip()
            if addr:
                return addr
    return ""


def _extract_shipping_policy(description: str, website_summary: str) -> str:
    blob = f"{description or ''}\n{website_summary or ''}"
    if "2500" in blob and ("kargo" in blob.lower() or "ücretsiz" in blob.lower()):
        return "2500 ₺ ve üzeri siparişlerde kargo ücretsizdir."
    if "kargo" in blob.lower() or "shipping" in blob.lower():
        for line in blob.splitlines():
            low = line.lower()
            if "kargo" in low or "shipping" in low:
                clean = line.strip()
                if 10 <= len(clean) <= 300:
                    return clean
    return ""


def _categories_from_website_intelligence(wi: dict | None) -> list[ChatbotProductCategory]:
    if not isinstance(wi, dict):
        return []
    catalog = wi.get("menu_catalog") or {}
    categories_raw = catalog.get("categories") if isinstance(catalog, dict) else []
    out: list[ChatbotProductCategory] = []
    seen: set[str] = set()
    for cat in categories_raw if isinstance(categories_raw, list) else []:
        if not isinstance(cat, dict):
            continue
        raw_name = str(cat.get("name") or "").strip()
        if not is_valid_category_name(raw_name):
            continue
        name = re.sub(r"\s*[–-]\s*[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü\s]+\s*$", "", raw_name).strip()
        if not is_valid_category_name(name) or name.lower() in seen:
            continue
        seen.add(name.lower())

        highlights: list[str] = []
        items = cat.get("items") or []
        if isinstance(items, list):
            for item in items[:6]:
                if isinstance(item, dict):
                    item_name = str(item.get("name") or "").strip()
                    if item_name and len(item_name) < 60:
                        highlights.append(item_name)
        if not highlights:
            image_count = int(cat.get("image_count") or 0)
            if image_count > 0:
                highlights.append(f"{image_count} ürün görseli")

        out.append(ChatbotProductCategory(name=name, description="", highlights=highlights))
    return out


def _categories_from_pillars(content_pillars: str | None) -> list[ChatbotProductCategory]:
    pillars_raw = content_pillars or "[]"
    try:
        pillars = json.loads(pillars_raw) if isinstance(pillars_raw, str) else pillars_raw
    except json.JSONDecodeError:
        pillars = []
    if not isinstance(pillars, list):
        return []
    out: list[ChatbotProductCategory] = []
    for p in pillars[:6]:
        name = str(p).replace("_", " ").title()
        if is_valid_category_name(name):
            out.append(ChatbotProductCategory(name=name))
    return out


def _build_menu_summary(
    *,
    display_name: str,
    mode: ProfileMode,
    categories: list[ChatbotProductCategory],
    description: str,
    website_summary: str,
    location: str,
) -> str:
    if mode == "restaurant":
        intro_parts: list[str] = []
        if description and len(description.strip()) > 20:
            intro_parts.append(description.strip()[:400])
        elif website_summary:
            # First meaningful paragraph from website intelligence
            for para in re.split(r"\n{2,}", website_summary):
                p = para.strip()
                if len(p) > 30 and not _JUNK_CATEGORY_RE.search(p):
                    intro_parts.append(p[:500])
                    break
        if not intro_parts:
            loc = f" ({location})" if location else ""
            intro_parts.append(f"{display_name}{loc}, yerel lezzetler ve sıcak bir atmosfer sunar.")

        lines = intro_parts[:1]
        if categories:
            lines.append("")
            lines.append("**Menü öne çıkanları:**")
            for cat in categories[:10]:
                hl = f" — {', '.join(cat.highlights[:4])}" if cat.highlights else ""
                lines.append(f"- **{cat.name}**{hl}")
        return "\n".join(lines).strip()

    if mode == "ecommerce":
        menu_lines = [
            f"**{c.name}**" + (f": {c.description}" if c.description else "")
            for c in categories[:10]
        ]
        if menu_lines:
            loc = f" ({location})" if location else ""
            return (
                f"{display_name}{loc}, seçkin ürünlerini online satışa sunar.\n\n"
                + "\n".join(f"- {line}" for line in menu_lines)
            )
        fallback = (website_summary or description or "").strip()
        return fallback[:1200] if fallback else f"{display_name} ürün kataloğu."

    fallback = (website_summary or description or "").strip()
    return fallback[:1200] if fallback else display_name


def _restaurant_faqs(
    display_name: str,
    website_url: str,
    phone: str,
    instagram: str,
) -> list[ChatbotFaqItem]:
    contact = phone or (f"@{instagram}" if instagram else "Instagram DM")
    site = website_url or "web sitemiz"
    return [
        ChatbotFaqItem(
            question="Rezervasyon nasıl yapılır?",
            answer=(
                f"{display_name} için rezervasyon {contact} üzerinden veya "
                f"{site} adresinden iletişime geçerek yapılabilir."
            ),
        ),
        ChatbotFaqItem(
            question="Çalışma saatleri nedir?",
            answer=(
                "Güncel çalışma saatleri için web sitesine bakın veya "
                f"{contact} üzerinden sorabilirsiniz."
            ),
        ),
        ChatbotFaqItem(
            question="Menüde neler var?",
            answer=(
                f"{display_name} menüsünde mevsimsel ve yerel lezzetler bulunur. "
                f"Detaylı menü için {site} adresini ziyaret edin."
            ),
        ),
    ]


def _ecommerce_faqs(
    display_name: str,
    shipping: str,
    website_url: str,
) -> list[ChatbotFaqItem]:
    site = website_url or "web sitemiz"
    faqs = [
        ChatbotFaqItem(
            question="Sipariş nasıl verilir?",
            answer=(
                f"{display_name} ürünlerini {site} üzerinden sepete ekleyerek "
                "online sipariş verebilirsiniz. Instagram DM üzerinden de ürün "
                "bilgisi alabilirsiniz."
            ),
        ),
        ChatbotFaqItem(
            question="Hangi ürün grupları var?",
            answer=(
                f"Güncel ürün kategorileri ve stok durumu için {site} "
                "adresindeki kataloğa bakın."
            ),
        ),
    ]
    if shipping:
        faqs.append(ChatbotFaqItem(question="Kargo ücreti var mı?", answer=shipping))
    return faqs


def _general_faqs(display_name: str, website_url: str, phone: str) -> list[ChatbotFaqItem]:
    site = website_url or "web sitemiz"
    contact = phone or site
    return [
        ChatbotFaqItem(
            question="Nasıl iletişime geçebilirim?",
            answer=f"{display_name} ile {contact} üzerinden iletişime geçebilirsiniz.",
        ),
    ]


def _restaurant_conversation_rules(tone: str, language: str) -> ChatbotConversationRules:
    return ChatbotConversationRules(
        language=language,
        tone=tone,
        greeting_style="Samimi ve kısa; sıcak bir selamlama ile karşıla.",
        do_list=[
            "Rezervasyon ve menü sorularında net yönlendirme yap",
            "Mevsimsel ve imza lezzetleri vurgula",
            "Telefon, WhatsApp veya web sitesi iletişim kanallarını paylaş",
            "Türkçe yanıt ver; kısa paragraflar kullan",
        ],
        dont_list=[
            "Stok/fiyat uydurma — emin değilsen web sitesine yönlendir",
            "Sağlık iddiası veya kesin diyet vaadi yapma",
            "Kişisel veri toplama (TC, kart bilgisi vb.)",
        ],
        escalation_triggers=[
            "iade", "şikayet", "alerji", "rezervasyon iptali",
            "toplantı", "etkinlik", "grup rezervasyonu", "iş birliği",
        ],
    )


def _ecommerce_conversation_rules(tone: str, language: str, shipping: str) -> ChatbotConversationRules:
    do_list = [
        "Ürün önerirken köken ve üretim hikayesini vurgula",
        "Sipariş sorularında web sitesine yönlendir",
        "Türkçe yanıt ver; kısa paragraflar kullan",
    ]
    if shipping:
        do_list.insert(2, "Kargo koşullarını doğru aktar")
    return ChatbotConversationRules(
        language=language,
        tone=tone,
        greeting_style="Samimi ve kısa; müşteriyi sıcak bir selamlama ile karşıla.",
        do_list=do_list,
        dont_list=[
            "Tıbbi iddia veya kesin sağlık vaadi yapma",
            "Stok/fiyat uydurma — emin değilsen web sitesine yönlendir",
            "Kişisel veri toplama (TC, kart bilgisi vb.)",
        ],
        escalation_triggers=[
            "iade", "şikayet", "bozuk ürün", "yanlış sipariş",
            "toptan", "bayilik", "iş birliği",
        ],
    )


def _general_conversation_rules(tone: str, language: str) -> ChatbotConversationRules:
    return ChatbotConversationRules(
        language=language,
        tone=tone,
        greeting_style="Samimi ve kısa selamlama.",
        do_list=[
            "Marka tonuna uygun, net yanıtlar ver",
            "Emin olmadığın konularda iletişim kanallarına yönlendir",
        ],
        dont_list=[
            "Stok/fiyat uydurma",
            "Kişisel veri toplama (TC, kart bilgisi vb.)",
        ],
        escalation_triggers=["şikayet", "iade", "iş birliği"],
    )


def _build_agent_context_markdown(
    profile: BrandChatbotProfile,
    brand_tone: str,
    target_audience: str,
    location: str,
    *,
    mode: ProfileMode,
) -> str:
    default_address = "Belirtilmedi"
    if mode == "ecommerce" and not profile.address:
        default_address = "Online satış"
    lines = [
        f"# {profile.business_display_name} — Chatbot / Agent Kimliği",
        "",
        "## İşletme",
        f"- **Konum:** {location or 'Belirtilmedi'}",
        f"- **Web:** {profile.website_url or '—'}",
        f"- **Instagram:** @{profile.instagram_handle}" if profile.instagram_handle else "",
        f"- **Çalışma saatleri:** {profile.business_hours}",
        f"- **Adres:** {profile.address or default_address}",
        f"- **Telefon:** {profile.phone or 'Web sitesi / DM'}",
        "",
        "## Marka sesi",
        f"- **Ton:** {brand_tone or profile.conversation_rules.tone or 'samimi, sıcak'}",
        f"- **Hedef kitle:** {target_audience or 'Yerel müşteriler'}",
        "",
        "## Ürün & menü",
        profile.menu_summary or "—",
        "",
    ]
    if profile.product_categories:
        section = "Kategoriler" if mode == "ecommerce" else "Menü kategorileri"
        lines.append(f"### {section}")
        for cat in profile.product_categories[:12]:
            hl = f" ({', '.join(cat.highlights)})" if cat.highlights else ""
            lines.append(f"- **{cat.name}**{hl}")
        lines.append("")
    if profile.shipping_policy:
        lines.append(f"## Kargo\n{profile.shipping_policy}\n")
    if profile.order_process:
        lines.append(f"## Sipariş / rezervasyon\n{profile.order_process}\n")
    if profile.faqs:
        lines.append("## SSS")
        for faq in profile.faqs[:8]:
            lines.append(f"**S: {faq.question}**\nA: {faq.answer}\n")
    if profile.conversation_rules.do_list:
        lines.append("## Yap")
        for item in profile.conversation_rules.do_list:
            lines.append(f"- {item}")
        lines.append("")
    if profile.conversation_rules.dont_list:
        lines.append("## Yapma")
        for item in profile.conversation_rules.dont_list:
            lines.append(f"- {item}")
        lines.append("")
    return "\n".join(line for line in lines if line is not None).strip()


def analyze_chatbot_profile(ctx: BrandContext) -> BrandChatbotProfile:
    """Deterministic chatbot profile from existing brand intelligence (no LLM required)."""
    wi = ctx.website_intelligence if isinstance(ctx.website_intelligence, dict) else {}
    mode, _category, cta_style = _resolve_profile_mode(ctx)

    display_name = _normalize_display_name(ctx.business_name or "", wi)
    website_url = (ctx.website_url or "").strip()
    instagram = (ctx.instagram_handle or "").strip().lstrip("@")
    address = _extract_address(ctx, wi)
    phone = _extract_phone(ctx.website_summary, ctx.description, ctx.instagram_bio)

    categories = _categories_from_website_intelligence(wi)
    if not categories:
        categories = _categories_from_pillars(ctx.content_pillars)

    shipping = _extract_shipping_policy(ctx.description or "", ctx.website_summary or "")
    menu_summary = _build_menu_summary(
        display_name=display_name,
        mode=mode,
        categories=categories,
        description=ctx.description or "",
        website_summary=ctx.website_summary or "",
        location=ctx.location or "",
    )

    tone = (ctx.brand_tone or "samimi, sıcak, davetkar").strip()
    language = (ctx.languages or "tr").split(",")[0].strip() or "tr"

    if mode == "restaurant":
        rules = _restaurant_conversation_rules(tone, language)
        faqs = _restaurant_faqs(display_name, website_url, phone, instagram)
        shipping_policy = ""
        payment_methods = ""
        order_process = (
            f"Rezervasyon için {phone or 'telefon/WhatsApp'} veya "
            f"{website_url or 'web sitesi'} üzerinden iletişime geçin."
            if cta_style in ("reservation", "booking")
            else f"Ziyaret için {website_url or 'web sitesi'} veya {phone or 'Instagram DM'}."
        )
        business_hours = "Güncel saatler için web sitesine bakın."
    elif mode == "ecommerce":
        rules = _ecommerce_conversation_rules(tone, language, shipping)
        faqs = _ecommerce_faqs(display_name, shipping, website_url)
        shipping_policy = shipping
        payment_methods = "Online ödeme (web sitesi üzerinden)"
        site_label = website_url or "web sitesi"
        order_process = (
            f"1) {site_label}'de ürün seç → 2) Sepete ekle → "
            "3) Ödeme ve teslimat bilgilerini gir → 4) Sipariş onayı"
        )
        business_hours = "Pazartesi–Cumartesi 09:00–18:00 (online sipariş 7/24)"
    else:
        rules = _general_conversation_rules(tone, language)
        faqs = _general_faqs(display_name, website_url, phone)
        shipping_policy = shipping
        payment_methods = ""
        order_process = f"İletişim: {phone or website_url or 'Instagram DM'}"
        business_hours = "Pazartesi–Cumartesi 09:00–18:00"

    profile = BrandChatbotProfile(
        version=1,
        analyzed_at=datetime.now(timezone.utc),
        source="auto_analysis",
        business_display_name=display_name,
        business_hours=business_hours,
        address=address,
        phone=phone,
        price_range="₺₺",
        website_url=website_url,
        instagram_handle=instagram,
        menu_summary=menu_summary.strip(),
        product_categories=categories,
        shipping_policy=shipping_policy,
        payment_methods=payment_methods,
        order_process=order_process,
        faqs=faqs,
        conversation_rules=rules,
        operator_notes=f"{display_name} Instagram DM chatbot — SmartAgency marka analizi",
        analysis_confidence=78 if categories else 55,
    )
    profile.agent_context_markdown = _build_agent_context_markdown(
        profile,
        ctx.brand_tone or "",
        ctx.target_audience or "",
        ctx.location or "",
        mode=mode,
    )
    return profile


async def get_chatbot_profile(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> tuple[BrandChatbotProfile | None, datetime | None]:
    ctx = await brand_context_service.get_brand_context(db, workspace_id)
    if not ctx or not ctx.chatbot_profile:
        return None, ctx.chatbot_profile_updated_at if ctx else None
    try:
        return BrandChatbotProfile.model_validate(ctx.chatbot_profile), ctx.chatbot_profile_updated_at
    except Exception:
        return None, ctx.chatbot_profile_updated_at


async def save_chatbot_profile(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    profile: BrandChatbotProfile,
) -> datetime:
    now = datetime.now(timezone.utc)
    payload = profile.model_dump(mode="json")
    await db.execute(
        update(BrandContext)
        .where(BrandContext.workspace_id == workspace_id)
        .execution_options(synchronize_session=False)
        .values(
            chatbot_profile=payload,
            chatbot_profile_updated_at=now,
        )
    )
    await db.commit()
    return now


async def patch_chatbot_profile(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    patch: BrandChatbotProfilePatch,
) -> tuple[BrandChatbotProfile, datetime]:
    ctx = await brand_context_service.ensure_brand_context(db, workspace_id)
    existing = BrandChatbotProfile.model_validate(ctx.chatbot_profile) if ctx.chatbot_profile else BrandChatbotProfile()
    merged = existing.model_copy(update=patch.model_dump(exclude_none=True))
    merged.source = "manual"
    if not merged.agent_context_markdown.strip():
        mode, _, _ = _resolve_profile_mode(ctx)
        merged.agent_context_markdown = _build_agent_context_markdown(
            merged,
            ctx.brand_tone or "",
            ctx.target_audience or "",
            ctx.location or "",
            mode=mode,
        )
    updated_at = await save_chatbot_profile(db, workspace_id, merged)
    return merged, updated_at


async def analyze_and_save_chatbot_profile(
    db: AsyncSession,
    workspace_id: uuid.UUID,
) -> tuple[BrandChatbotProfile, datetime]:
    ctx = await brand_context_service.ensure_brand_context(db, workspace_id)
    ctx = await brand_context_service.seed_missing_brand_fields(db, ctx)
    profile = analyze_chatbot_profile(ctx)
    updated_at = await save_chatbot_profile(db, workspace_id, profile)
    return profile, updated_at
