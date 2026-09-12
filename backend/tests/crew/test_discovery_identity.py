"""Onboarding identity: stay venue vs shop vs beach club. No LLM."""

from app.crew.brand_analyzer import infer_content_pillars, infer_industry, infer_target_audience
from app.crew.discovery_identity import (
    facility_defaults_for_sector,
    identity_first_summary,
    is_editor_chrome_image_url,
    is_stay_venue,
    score_crawled_page,
)

PENSION_ABOUT = (
    "Bodrum Mazı Köyü'nde 10 odalı küçük ve sıcak bir aile pansiyonu ve restoranıdır. "
    "Zeytinyağlı ev yemeklerimiz, el yapımı reçellerimiz ve kendi zeytinlerimizle "
    "çocuklu aileleri ağırlıyoruz. Sabahları kanolarla koy turu."
)
PENSION_MENU = (
    "Kumsal Pansiyon Menu 2026 Ekstralar Anne Patatesi ₺300 Kalamar Tava ₺1000 "
    "reçel zeytinyağı kahvaltı menü"
)
SHOP_TEXT = (
    "Datça yöresel ürün dükkanı. Sızma zeytinyağı, bal, reçel, hasat. "
    "Online sipariş ve kargo. Ambalajlı kavanoz."
)
CLUB_TEXT = (
    "Bodrum beach club. DJ set, sunset bar, kokteyl, rezervasyon. Plaj ve havuz."
)


def test_pension_menu_is_hospitality_not_shop():
    text = f"{PENSION_ABOUT} {PENSION_MENU}"
    assert is_stay_venue(text)
    assert infer_industry(text) == "hospitality"
    pillars = infer_content_pillars(text, "hospitality")
    assert "tasting_experience" not in pillars
    assert "producer_story" not in pillars
    assert "venue_atmosphere" in pillars
    audience = " ".join(infer_target_audience(text, "hospitality"))
    assert "müzik" not in audience
    assert "aile" in audience or "konaklama" in audience


def test_shop_stays_local_products():
    assert infer_industry(SHOP_TEXT) == "local_products_shop"
    pillars = infer_content_pillars(SHOP_TEXT, "local_products_shop")
    assert "product_highlight" in pillars or "producer_story" in pillars


def test_garden_restaurant_with_bungalow_stays_restaurant():
    text = (
        "Bahçe restoranı, serpme köy kahvaltısı, gözleme ve yöresel tabaklar. "
        "Bahçede ahşap bungalov konaklama da var."
    )
    assert infer_industry(text) == "restaurant"


def test_beach_club_not_pension():
    assert infer_industry(CLUB_TEXT) == "beach_club"
    audience = " ".join(infer_target_audience(CLUB_TEXT, "beach_club"))
    assert "müzik" in audience


def test_about_page_outranks_price_menu():
    about = score_crawled_page("https://example.com/hakkimizda", PENSION_ABOUT)
    menu = score_crawled_page("https://example.com/menu", PENSION_MENU * 8)
    assert about > menu


def test_summary_keeps_about_before_prices():
    summary = identity_first_summary(PENSION_ABOUT, PENSION_MENU)
    assert summary.index("10 odalı") < summary.index("Anne Patatesi")


def test_wix_chrome_rejected_real_wix_photo_kept():
    chrome = "https://static.parastorage.com/services/editor-elements-library/dist/sloppyframe.png"
    stock = "https://static.wixstatic.com/media/11062b_abc.jpg"
    venue = "https://static.wixstatic.com/media/f894ab_174136afdbc74b478ea68660591dc670~mv2.jpg"
    assert is_editor_chrome_image_url(chrome)
    assert is_editor_chrome_image_url(stock)
    assert not is_editor_chrome_image_url(venue)


def test_facilities_pension_vs_club_vs_shop():
    stay = facility_defaults_for_sector("hospitality", PENSION_ABOUT)
    club = facility_defaults_for_sector("beach_club", CLUB_TEXT)
    shop = facility_defaults_for_sector("local_products_shop", SHOP_TEXT)
    assert stay["dj_stage"] is False
    assert stay["spa"] is False
    assert stay["full_menu"] is True
    assert club["dj_stage"] is True
    assert shop["dj_stage"] is False
    assert shop["delivery"] is True
