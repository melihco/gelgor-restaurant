"""Build and persist brand chatbot profiles from brand_context signals."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone

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


def _normalize_display_name(raw: str) -> str:
    name = (raw or "").strip()
    if not name:
        return "Marka"
    if ".com" in name.lower() or name.startswith("http"):
        # karamandatca.com.tr → Karaman Datça
        slug = re.sub(r"^https?://", "", name.lower()).split("/")[0]
        slug = slug.replace(".com.tr", "").replace(".com", "").replace(".tr", "")
        slug = slug.replace("www.", "")
        if "karaman" in slug and "datca" in slug.replace("ç", "c"):
            return "Karaman Datça"
        return slug.replace("-", " ").replace("_", " ").title()
    return name


def _extract_shipping_policy(description: str, website_summary: str) -> str:
    blob = f"{description or ''}\n{website_summary or ''}"
    if "2500" in blob and ("kargo" in blob.lower() or "ücretsiz" in blob.lower()):
        return "2500 ₺ ve üzeri siparişlerde kargo ücretsizdir."
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
        if not raw_name:
            continue
        name = re.sub(r"\s*[–-]\s*KARAMAN DATÇA\s*$", "", raw_name, flags=re.I).strip()
        name = re.sub(r"^KARAMAN DATÇA\s*$", "", name, flags=re.I).strip()
        skip = {"genel", "about us", "contact us", "mağaza", "magaza", "hakkımızda", "iletisim", "iletişim"}
        if not name or name.lower() in skip or name.lower() in seen:
            continue
        seen.add(name.lower())
        image_count = int(cat.get("image_count") or 0)
        highlights: list[str] = []
        if image_count > 0:
            highlights.append(f"{image_count} ürün görseli")
        out.append(ChatbotProductCategory(name=name, description="", highlights=highlights))
    return out


def _default_faqs(
    display_name: str,
    shipping: str,
    website_url: str,
) -> list[ChatbotFaqItem]:
    faqs = [
        ChatbotFaqItem(
            question="Sipariş nasıl verilir?",
            answer=(
                f"{display_name} ürünlerini {website_url or 'web sitemiz'} üzerinden "
                "sepete ekleyerek online sipariş verebilirsiniz. Instagram DM üzerinden "
                "de ürün bilgisi alabilir ve sipariş süreci hakkında yönlendirme isteyebilirsiniz."
            ),
        ),
        ChatbotFaqItem(
            question="Ürünler doğal mı / katkısız mı?",
            answer=(
                f"{display_name}, Datça'nın yerel meyve ve hammaddeleriyle geleneksel "
                "yöntemlerle üretim yapan bir yöresel ürün markasıdır. Ürün detayları "
                "için web sitesindeki ürün sayfalarına bakılmasını öneririz."
            ),
        ),
        ChatbotFaqItem(
            question="Hangi ürün grupları var?",
            answer=(
                "Reçeller, pekmezler ve özler, badem ezmesi, zeytinyağı, bal, kurabiye "
                "ve Datça'ya özgü yöresel lezzetler. Güncel stok için web sitesine bakın."
            ),
        ),
    ]
    if shipping:
        faqs.append(ChatbotFaqItem(question="Kargo ücreti var mı?", answer=shipping))
    return faqs


def _build_agent_context_markdown(
    profile: BrandChatbotProfile,
    brand_tone: str,
    target_audience: str,
    location: str,
) -> str:
    lines = [
        f"# {profile.business_display_name} — Chatbot / Agent Kimliği",
        "",
        "## İşletme",
        f"- **Konum:** {location or 'Belirtilmedi'}",
        f"- **Web:** {profile.website_url or '—'}",
        f"- **Instagram:** @{profile.instagram_handle}" if profile.instagram_handle else "",
        f"- **Çalışma saatleri:** {profile.business_hours}",
        f"- **Adres:** {profile.address or 'Online satış — Datça merkezli'}",
        f"- **Telefon:** {profile.phone or 'Web sitesi / DM'}",
        "",
        "## Marka sesi",
        f"- **Ton:** {brand_tone or profile.conversation_rules.tone or 'samimi, sıcak'}",
        f"- **Hedef kitle:** {target_audience or 'Yerel ve online müşteriler'}",
        "",
        "## Ürün & menü",
        profile.menu_summary or "—",
        "",
    ]
    if profile.product_categories:
        lines.append("### Kategoriler")
        for cat in profile.product_categories[:12]:
            hl = f" ({', '.join(cat.highlights)})" if cat.highlights else ""
            lines.append(f"- **{cat.name}**{hl}")
        lines.append("")
    if profile.shipping_policy:
        lines.append(f"## Kargo\n{profile.shipping_policy}\n")
    if profile.order_process:
        lines.append(f"## Sipariş süreci\n{profile.order_process}\n")
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
    display_name = _normalize_display_name(ctx.business_name or "")
    website_url = (ctx.website_url or "").strip()
    instagram = (ctx.instagram_handle or "").strip().lstrip("@")
    shipping = _extract_shipping_policy(ctx.description or "", ctx.website_summary or "")
    categories = _categories_from_website_intelligence(ctx.website_intelligence)

    # Enrich Karaman-specific catalog when website crawl lacks item names
    if "karaman" in display_name.lower() or "karaman" in (ctx.business_name or "").lower():
        known = [
            ChatbotProductCategory(
                name="Reçeller",
                description="Datça meyvelerinden geleneksel reçeller",
                highlights=["incir", "portakal", "ayva", "mandalina", "bademli reçel"],
            ),
            ChatbotProductCategory(
                name="Pekmezler ve Özler",
                description="Doğal pekmez ve meyve özleri",
                highlights=["carob", "üzüm", "dut"],
            ),
            ChatbotProductCategory(
                name="Badem Ezmesi & Bademli Ürünler",
                description="Datça bademinden üretilen ezme ve bademli lezzetler",
                highlights=["badem ezmesi", "bademli kurabiye", "bademli reçel"],
            ),
            ChatbotProductCategory(
                name="Zeytinyağı",
                description="Erken hasat ve natürel sızma zeytinyağı",
                highlights=["Datça zeytinyağı"],
            ),
            ChatbotProductCategory(
                name="Bal & Kurabiye",
                description="Süzme çiçek balı ve el yapımı kurabiyeler",
                highlights=["Datça balı", "kurabiye"],
            ),
        ]
        existing_names = {c.name.lower() for c in categories}
        for k in known:
            if k.name.lower() not in existing_names:
                categories.append(k)

    if not categories:
        pillars_raw = ctx.content_pillars or "[]"
        try:
            pillars = json.loads(pillars_raw) if isinstance(pillars_raw, str) else pillars_raw
        except json.JSONDecodeError:
            pillars = []
        if isinstance(pillars, list) and pillars:
            categories = [
                ChatbotProductCategory(name=str(p).replace("_", " ").title())
                for p in pillars[:6]
            ]

    menu_lines = [f"**{c.name}**" + (f": {c.description}" if c.description else "") for c in categories[:10]]
    menu_summary = (
        f"{display_name}, Datça'nın yöresel ve doğal ürünlerini online satışa sunar.\n\n"
        + "\n".join(f"- {line}" for line in menu_lines)
        if menu_lines
        else (ctx.website_summary or ctx.description or "")[:1200]
    )

    tone = (ctx.brand_tone or "samimi, sıcak, davetkar").strip()
    rules = ChatbotConversationRules(
        language=(ctx.languages or "tr").split(",")[0].strip() or "tr",
        tone=tone,
        greeting_style="Samimi ve kısa; müşteriyi isimle karşılamadan, sıcak bir selamlama.",
        do_list=[
            "Ürün önerirken Datça kökenini ve doğal üretimi vurgula",
            "Sipariş ve kargo sorularında web sitesine yönlendir",
            "2500 ₺ üzeri ücretsiz kargo bilgisini paylaş",
            "Badem, reçel, zeytinyağı gibi öne çıkan ürünleri öner",
            "Türkçe yanıt ver; kısa paragraflar kullan",
        ],
        dont_list=[
            "Tıbbi iddia veya kesin sağlık vaadi yapma",
            "Stok/fiyat uydurma — emin değilsen web sitesine yönlendir",
            "Rakip marka veya fiyat karşılaştırması yapma",
            "Kişisel veri toplama (TC, kart bilgisi vb.)",
        ],
        escalation_triggers=[
            "iade", "şikayet", "bozuk ürün", "yanlış sipariş",
            "toplantı", "toptan", "bayilik", "iş birliği",
        ],
    )

    faqs = _default_faqs(display_name, shipping, website_url)

    profile = BrandChatbotProfile(
        version=1,
        analyzed_at=datetime.now(timezone.utc),
        source="auto_analysis",
        business_display_name=display_name,
        business_hours="Pazartesi–Cumartesi 09:00–18:00 (online sipariş 7/24)",
        address=f"Datça, Muğla" if (ctx.location or "").lower().find("datça") >= 0 else (ctx.location or "Datça, Muğla"),
        phone="",
        price_range="₺₺",
        website_url=website_url,
        instagram_handle=instagram,
        menu_summary=menu_summary.strip(),
        product_categories=categories,
        shipping_policy=shipping or "Kargo koşulları için web sitesindeki güncel bilgiye bakın.",
        payment_methods="Online ödeme (web sitesi üzerinden)",
        order_process=(
            "1) karamandatca.com.tr'de ürün seç → 2) Sepete ekle → "
            "3) Ödeme ve teslimat bilgilerini gir → 4) Sipariş onayı e-posta/SMS"
        ),
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
        merged.agent_context_markdown = _build_agent_context_markdown(
            merged,
            ctx.brand_tone or "",
            ctx.target_audience or "",
            ctx.location or "",
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
