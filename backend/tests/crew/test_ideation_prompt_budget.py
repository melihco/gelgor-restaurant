from app.crew.agents.content_agent import ideation_research_tools_enabled
from app.crew.context import BrandInfo
from app.crew.prompts.content_prompts import (
    CONTENT_IDEATION_TASK,
    collapse_repeated_lines,
    sector_scope_block,
    trial_and_saas_mix_block,
)
from app.crew.tasks.content_tasks import (
    _build_gallery_scene_block,
    _is_fallback_gallery_description,
)


def _brand(sector: str) -> BrandInfo:
    return BrandInfo(
        business_name="Test Marka",
        business_type=sector,
        description="Yerel ürün ve mekan.",
        languages="tr",
        content_pillars=["product_highlight", "producer_story"],
    )


def test_sector_scope_is_own_industry_only() -> None:
    shop = sector_scope_block("local_products_shop", "Dükkan")
    beach = sector_scope_block("beach_club", "Plaj")
    assert "ürün hikayeleri" in shop
    assert "SaaS" not in shop
    assert "gym" not in shop.lower()
    assert "gün batımı" in beach or "şezlong" in beach
    assert "kargo" in beach  # forbidden for beach
    assert trial_and_saas_mix_block("local_products_shop", 16) == ""
    assert trial_and_saas_mix_block("beach_club", 16) == ""
    assert "FREE TRIAL" in trial_and_saas_mix_block("saas", 16)


def _task_text(sector: str) -> str:
    return CONTENT_IDEATION_TASK.format(
        business_name="Test Marka",
        business_type=sector,
        location="Datça",
        brand_tone="samimi",
        target_audience="yerel",
        count=8,
        time_period="next week",
        campaign_goals="satış",
        description="Yerel ürün ve mekan.",
        keywords="zeytinyağı",
        available_assets="none",
        brief="haftalık plan",
        content_pillars="product_highlight",
        pillar_coverage_block="",
        autonomy_mode="disabled",
        reference_image_urls_list="gallery",
        output_language="Turkish",
        format_mix_rule="4 post",
        sector_scope_block=sector_scope_block(sector, "Test Marka"),
        trial_and_saas_mix_block=trial_and_saas_mix_block(sector, 8),
    )


def test_shop_and_beach_task_drops_foreign_sector_encyclopedia() -> None:
    shop_text = _task_text("local_products_shop")
    beach_text = _task_text("beach_club")
    assert "local_products_shop" in shop_text
    assert "nail_salon" not in shop_text
    assert "tech_company / SaaS" not in shop_text
    assert "FREE TRIAL" not in shop_text
    assert "beach_club" in beach_text
    assert "SaaS MIX" not in beach_text
    assert "HALLUCINATION ZERO-TOLERANCE" in shop_text
    assert "HALLUCINATION ZERO-TOLERANCE" in beach_text


def test_gallery_skips_whatsapp_fallback_keeps_real_analysis() -> None:
    import json

    oil = "https://cdn.example.com/oil.jpg"
    wa = "https://cdn.example.com/wa.jpeg"
    brand = _brand("local_products_shop")
    brand.gallery_analysis = json.dumps({
        oil: {
            "contentTags": ["olive_oil", "bottle"],
            "description": "Labeled olive oil bottle on a shelf",
            "usageContext": "product hero",
        },
        wa: {
            "contentTags": ["content", "whatsapp"],
            "description": "Metadata fallback analysis for a brand gallery image. URL tokens suggest: content, whatsapp.",
            "usageContext": "conservative brand/gallery background",
        },
    })
    assert _is_fallback_gallery_description(
        "Metadata fallback analysis. URL tokens suggest: whatsapp"
    )
    block = _build_gallery_scene_block(brand)
    assert oil in block
    assert wa not in block
    assert "whatsapp" not in block.lower()


def test_website_summary_drops_repeat_kargo_banner() -> None:
    raw = "\n".join(["Doğal reçel", "KARGO ÜCRETSİZ"] * 6)
    collapsed = collapse_repeated_lines(raw)
    assert collapsed.count("KARGO ÜCRETSİZ") == 1


def test_ideation_research_tools_off_by_default() -> None:
    assert ideation_research_tools_enabled() is False
