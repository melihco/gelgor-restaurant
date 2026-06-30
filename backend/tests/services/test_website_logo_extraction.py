"""Tests for onboarding brand-logo discovery from homepage HTML."""

from app.services.website_brand_kit_service import (
    attach_brand_kit_to_website_result,
    extract_logo_url_from_html,
)

PAGE = "https://yulabodrum.com/"


def test_extracts_logo_from_header_img():
    html = (
        "<html><head><title>Yula</title></head><body>"
        '<header><a href="/"><img src="/assets/yula-bodrum-logo.png" '
        'alt="Yula logo" class="site-logo" width="180"></a></header>'
        "<main>" + ("content " * 60) + "</main></body></html>"
    )
    assert extract_logo_url_from_html(html, PAGE) == "https://yulabodrum.com/assets/yula-bodrum-logo.png"


def test_schema_org_logo_wins_over_img():
    html = (
        "<html><head>"
        '<script type="application/ld+json">'
        '{"@type":"Restaurant","name":"Yula","logo":"https://cdn.yula.com/brand/logo.svg"}'
        "</script></head><body>"
        '<img src="/random-logo.png" alt="logo">'
        + ("x " * 120)
        + "</body></html>"
    )
    assert extract_logo_url_from_html(html, PAGE) == "https://cdn.yula.com/brand/logo.svg"


def test_ignores_favicon_ico_and_tracking_pixels():
    html = (
        "<html><head>"
        '<link rel="icon" href="/favicon.ico">'
        "</head><body>"
        '<img src="https://www.facebook.com/tr?id=1x1" alt="logo">'
        + ("y " * 120)
        + "</body></html>"
    )
    # .ico favicon + facebook tracking pixel must both be rejected → no logo
    assert extract_logo_url_from_html(html, PAGE) == ""


def test_apple_touch_icon_is_fallback():
    html = (
        "<html><head>"
        '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">'
        "</head><body>" + ("z " * 120) + "</body></html>"
    )
    assert extract_logo_url_from_html(html, PAGE) == "https://yulabodrum.com/apple-touch-icon.png"


def test_no_logo_when_no_signals():
    html = "<html><head><title>X</title></head><body>" + ("w " * 120) + "</body></html>"
    assert extract_logo_url_from_html(html, PAGE) == ""


def test_attach_sets_logo_url_without_overwriting():
    result = {"url": PAGE}
    html = (
        '<html><body><img src="/logo.png" alt="brand logo">'
        + ("a " * 120)
        + "</body></html>"
    )
    attach_brand_kit_to_website_result(result, html)
    assert result["logo_url"] == "https://yulabodrum.com/logo.png"

    # Pre-existing logo must not be overwritten
    result2 = {"url": PAGE, "logo_url": "https://manual.example/uploaded.png"}
    attach_brand_kit_to_website_result(result2, html)
    assert result2["logo_url"] == "https://manual.example/uploaded.png"
