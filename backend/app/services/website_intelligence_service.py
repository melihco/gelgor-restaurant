"""
Website Intelligence — structured brand discovery from business websites.

Extracts:
  - Menu categories + product/drink images (digital menu sites like QR platforms)
  - Venue / ambiance photos (gallery pages)
  - Brand text blocks for prompts
  - Correct brand display name (avoids menu-page titles like "Biralar")

Used by brand onboarding (analyze_brand) and injected into agent prompts.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urljoin, urlparse

import structlog

from app.crew.brand_analyzer import extract_image_urls_from_html, _probably_photo_url

logger = structlog.get_logger()

# Single-word titles that are menu categories, NOT brand names
_MENU_TITLE_BLOCKLIST = frozenset({
    "biralar", "beers", "şaraplar", "wines", "burgerler", "burgers",
    "atıştırmalıklar", "snacks", "cocktails", "coctails", "kokteyller",
    "soft içecekler", "rakı", "gin", "vodka", "whiskey", "rum", "cognac",
    "liqueur", "vermouth", "shots", "menu", "menü", "yemekler", "içecekler",
    "drinks", "food", "gallery", "galeri", "home", "anasayfa",
})

_MENU_PATH_HINTS = re.compile(
    r"(menu|menü|menuler|menus|kategori|category|categories|"
    r"bira|beer|sarap|wine|burger|cocktail|coctail|kokteyl|"
    r"atistirma|snack|drink|icecek|yemek|food|bar|bottle|raki|gin|vodka|"
    r"whiskey|rum|cognac|liqueur|vermouth|shot|galeri|gallery|foto|photo|"
    r"venue|mekan|about|hakkimizda|etkinlik|event)",
    re.IGNORECASE,
)

# Beauty / nail / personal care — these service pages look like menu pages
# but must be classified as SERVICE categories, not food menus.
_BEAUTY_PATH_HINTS = re.compile(
    r"(tirnak|tırnak|nail|manikür|manikyur|manicure|pedikyur|pedikür|pedicure|"
    r"kalici.oje|nail.art|protez|jel.tirnak|cilt.bakim|cilt|epilasyon|lazer|"
    r"masaj|masage|massage|wax|agda|kirpik|lash|kas.tasarim|kás|brow|threading|"
    r"berber|kuafor|kuaför|sac.boya|sac.bakim|hizmetlerimiz|hizmet|fiyat.list)",
    re.IGNORECASE,
)

_VENUE_PATH_HINTS = re.compile(
    r"(galeri|gallery|photo|foto|venue|mekan|ambiance|about|hakkimizda|"
    r"etkinlik|event|team|ekip|slider|hero)",
    re.IGNORECASE,
)


def _base_domain(url: str) -> str:
    p = urlparse(url if url.startswith("http") else f"https://{url}")
    return f"{p.scheme}://{p.netloc}".rstrip("/")


def _same_domain(url: str, base: str) -> bool:
    try:
        return urlparse(url).netloc == urlparse(base).netloc
    except Exception:
        return False


def discover_internal_urls(html: str, page_url: str, base: str) -> list[str]:
    """Extract same-domain links worth crawling (menu categories, gallery, about)."""
    found: list[str] = []
    seen: set[str] = set()
    for m in re.finditer(r'href=["\']([^"\']+)["\']', html, re.IGNORECASE):
        href = m.group(1).strip()
        if href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        full = urljoin(page_url, href).split("#")[0]
        if not full.startswith("http") or not _same_domain(full, base):
            continue
        path = urlparse(full).path.lower()
        if not _MENU_PATH_HINTS.search(path) and not _MENU_PATH_HINTS.search(href.lower()):
            continue
        key = full.rstrip("/").lower()
        if key not in seen:
            seen.add(key)
            found.append(full)
    return found


def classify_image_url(url: str) -> str:
    """Classify image as venue, service_product, menu_product, or other."""
    low = url.lower()
    if any(x in low for x in ("logo", "icon", "favicon", "avatar", "sprite")):
        return "logo"
    if _VENUE_PATH_HINTS.search(low):
        return "venue"
    # Beauty/nail service images — classified as service visuals, not menu_product
    if _BEAUTY_PATH_HINTS.search(low):
        return "service_product"
    if _MENU_PATH_HINTS.search(low):
        return "menu_product"
    if any(ext in low for ext in (".webp", ".jpg", ".jpeg", ".png")):
        # Heuristic: small product shots often in /uploads/ or CDN with product names
        if any(x in low for x in ("/upload/", "/uploads/", "/media/", "/product", "/item")):
            return "menu_product"
    return "other"


def infer_brand_display_name(
    *,
    homepage_html: str = "",
    page_title: str = "",
    og_site_name: str = "",
    company_name: str = "",
    google_name: str = "",
    instagram_name: str = "",
) -> str:
    """
    Pick a sensible brand name — never a menu category page title.
    Priority: explicit profile > og:site_name > homepage h1 > google > instagram > title.
    """
    candidates: list[str] = []

    for c in (company_name, og_site_name, google_name, instagram_name):
        if c and c.strip():
            candidates.append(c.strip())

    if homepage_html:
        for pat in (
            r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:site_name["\']',
            r"<h1[^>]*>([^<]{3,80})</h1>",
        ):
            m = re.search(pat, homepage_html, re.IGNORECASE)
            if m:
                candidates.append(re.sub(r"\s+", " ", m.group(1)).strip())

    if page_title and page_title.strip():
        candidates.append(page_title.strip())

    for name in candidates:
        clean = re.sub(r"\s*[|\-–—].*$", "", name).strip()
        low = clean.lower()
        if len(clean) < 3:
            continue
        if low in _MENU_TITLE_BLOCKLIST:
            continue
        if any(w == low for w in _MENU_TITLE_BLOCKLIST):
            continue
        # Reject if title is ONLY a known menu category word
        words = set(re.findall(r"\w+", low))
        if words and words.issubset(_MENU_TITLE_BLOCKLIST):
            continue
        return clean[:120]

    return company_name or google_name or instagram_name or page_title or "Unknown Brand"


def extract_og_site_name(html: str) -> str:
    for pat in (
        r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:site_name["\']',
    ):
        m = re.search(pat, html, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return ""


def extract_category_headings(html: str) -> list[str]:
    """Pull h1-h3 headings that look like menu category names."""
    headings: list[str] = []
    for tag in ("h1", "h2", "h3"):
        for m in re.finditer(rf"<{tag}[^>]*>([^<]{{2,60}})</{tag}>", html, re.IGNORECASE):
            text = re.sub(r"\s+", " ", m.group(1)).strip()
            if text and text.lower() not in _MENU_TITLE_BLOCKLIST:
                headings.append(text)
    return headings[:12]


def build_menu_catalog(
    pages: list[dict[str, Any]],
    base_url: str,
) -> dict[str, Any]:
    """
    Build structured menu catalog from crawled pages.

    Each page dict: {url, html?, title?, text?, image_urls?}
    Returns: {categories: [{name, url, items: [{name, image_url}], image_urls}], ...}
    """
    categories: list[dict[str, Any]] = []
    seen_cat_urls: set[str] = set()

    for page in pages:
        url = page.get("url") or ""
        html = page.get("html") or ""
        title = (page.get("title") or "").strip()
        text = (page.get("text") or page.get("markdown") or "").strip()

        imgs = list(page.get("image_urls") or [])
        if html and not imgs:
            imgs = [u for u in extract_image_urls_from_html(html, url) if _probably_photo_url(u)]

        if not imgs and not title and not text:
            continue

        path = urlparse(url).path
        cat_name = title
        if not cat_name and html:
            headings = extract_category_headings(html)
            cat_name = headings[0] if headings else ""
        if not cat_name and text:
            cat_name = text.split("\n")[0][:60].strip()
        if not cat_name:
            slug = path.rstrip("/").split("/")[-1] or "general"
            cat_name = slug.replace("-", " ").replace("_", " ").title()

        if cat_name.lower() in _MENU_TITLE_BLOCKLIST or len(cat_name) < 2:
            continue

        key = url.rstrip("/").lower()
        if key in seen_cat_urls:
            continue
        seen_cat_urls.add(key)

        # Build item list from image filenames + alt text
        items: list[dict[str, str]] = []
        if html:
            for m in re.finditer(r'<img[^>]+alt=["\']([^"\']{2,80})["\'][^>]*>', html, re.IGNORECASE):
                alt = m.group(1).strip()
                if alt.lower() not in ("image", "photo", "logo", ""):
                    items.append({"name": alt, "image_url": ""})

        menu_imgs = [u for u in imgs if classify_image_url(u) in ("menu_product", "other")]
        venue_imgs = [u for u in imgs if classify_image_url(u) == "venue"]

        categories.append({
            "name": cat_name[:80],
            "url": url,
            "items": items[:20],
            "menu_image_urls": menu_imgs[:30],
            "venue_image_urls": venue_imgs[:15],
            "image_count": len(imgs),
        })

    return {
        "categories": categories,
        "category_count": len(categories),
        "total_menu_images": sum(len(c.get("menu_image_urls") or []) for c in categories),
        "total_venue_images": sum(len(c.get("venue_image_urls") or []) for c in categories),
    }


def merge_image_lists(*lists: list[str], max_images: int = 200) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for lst in lists:
        for u in lst or []:
            if not isinstance(u, str) or not u.startswith("http"):
                continue
            key = u.split("?")[0].lower()
            if key in seen or not _probably_photo_url(u):
                continue
            seen.add(key)
            out.append(u.split("?")[0])
            if len(out) >= max_images:
                return out
    return out


def build_website_intelligence(
    website_url: str,
    website_data: dict[str, Any],
    *,
    homepage_html: str = "",
    crawled_pages: list[dict[str, Any]] | None = None,
    company_name: str = "",
    google_name: str = "",
    instagram_name: str = "",
) -> dict[str, Any]:
    """
    Enrich raw website crawl output with structured menu + image intelligence.
    Mutates and returns website_data with added keys.
    """
    if not website_url:
        return website_data

    base = _base_domain(website_url)
    pages = list(crawled_pages or [])

    # Build page list from website_data if no explicit pages
    if not pages and website_data.get("image_urls"):
        pages.append({
            "url": website_url,
            "html": homepage_html,
            "title": website_data.get("title", ""),
            "text": website_data.get("text_snippet", ""),
            "image_urls": website_data.get("image_urls", []),
        })

    menu_catalog = build_menu_catalog(pages, base) if pages else {"categories": []}

    all_menu_imgs: list[str] = []
    all_venue_imgs: list[str] = []
    category_names: list[str] = []
    for cat in menu_catalog.get("categories") or []:
        category_names.append(cat.get("name", ""))
        all_menu_imgs.extend(cat.get("menu_image_urls") or [])
        all_venue_imgs.extend(cat.get("venue_image_urls") or [])

    flat_imgs = list(website_data.get("image_urls") or [])
    merged = merge_image_lists(flat_imgs, all_menu_imgs, all_venue_imgs, max_images=200)

    # Prefer venue images first, then menu product shots
    def _rank(u: str) -> tuple[int, str]:
        kind = classify_image_url(u)
        order = {"venue": 0, "other": 1, "menu_product": 2, "logo": 9}.get(kind, 3)
        return (order, u.lower())

    merged.sort(key=_rank)

    brand_name = infer_brand_display_name(
        homepage_html=homepage_html,
        page_title=website_data.get("title", ""),
        og_site_name=extract_og_site_name(homepage_html),
        company_name=company_name,
        google_name=google_name,
        instagram_name=instagram_name,
    )

    intel: dict[str, Any] = {
        "site_url": website_url,
        "brand_display_name": brand_name,
        "extraction_method": website_data.get("source", "unknown"),
        "pages_crawled": len(pages),
        "menu_catalog": menu_catalog,
        "menu_categories": category_names[:20],
        "menu_image_urls": all_menu_imgs[:120],
        "venue_image_urls": all_venue_imgs[:80],
        "total_images": len(merged),
        "has_digital_menu": len(category_names) >= 3,
    }

    website_data["website_intelligence"] = intel
    website_data["image_urls"] = merged
    website_data["inferred_brand_name"] = brand_name
    if brand_name and brand_name.lower() not in _MENU_TITLE_BLOCKLIST:
        website_data["title"] = brand_name

    logger.info(
        "website_intelligence_built",
        url=website_url,
        brand=brand_name,
        categories=len(category_names),
        images=len(merged),
        has_menu=intel["has_digital_menu"],
    )
    return website_data


def format_website_intelligence_for_prompt(intel: dict[str, Any] | None) -> list[str]:
    """Serialize website_intelligence for agent backstory / task prompts."""
    if not intel:
        return []

    # Determine if this is a beauty/service business so we use correct terminology
    brand = intel.get("brand_display_name") or ""
    cats = intel.get("menu_categories") or []
    beauty_signals = ["tırnak", "nail", "manikür", "pedikyur", "güzellik", "kuaför",
                      "berber", "spa", "epilasyon", "cilt", "estetik", "lash"]
    all_text = " ".join([brand.lower()] + [c.lower() for c in cats])
    is_beauty_business = any(s in all_text for s in beauty_signals)

    section_label = (
        "## 🌐 Website Intelligence — Services & Treatments"
        if is_beauty_business
        else "## 🌐 Website Intelligence — Product / Service Catalog"
    )
    lines = [section_label]

    if brand:
        lines.append(f"- **Brand (from website)**: {brand}")

    if cats:
        category_label = "Service/treatment categories" if is_beauty_business else "Product/service categories"
        lines.append(f"- **{category_label}** ({len(cats)}): {', '.join(cats[:12])}")

    catalog = intel.get("menu_catalog") or {}
    for cat in (catalog.get("categories") or [])[:8]:
        name = cat.get("name", "")
        imgs = cat.get("menu_image_urls") or []
        items = cat.get("items") or []
        item_names = [i.get("name") for i in items if i.get("name")][:6]
        line = f"  - **{name}**"
        if item_names:
            line += f": {', '.join(item_names)}"
        if imgs:
            line += f" ({len(imgs)} photos)"
        lines.append(line)

    venue_count = len(intel.get("venue_image_urls") or [])
    menu_count = len(intel.get("menu_image_urls") or [])
    if venue_count or menu_count:
        lines.append(f"- **Photo inventory**: {venue_count} venue/space, {menu_count} product/service")

    lines.append(
        "- IMPORTANT: The above is what this brand ACTUALLY offers. Generate content ONLY about these real products/services."
    )
    lines.append(
        "- If a concept doesn't match any category/item above, it's likely hallucination — DON'T suggest it."
    )
    return lines


def website_intelligence_to_json(intel: dict[str, Any] | None) -> str:
    if not intel:
        return ""
    try:
        return json.dumps(intel, ensure_ascii=False)
    except Exception:
        return ""
