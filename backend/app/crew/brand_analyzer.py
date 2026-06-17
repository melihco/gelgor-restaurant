"""
Brand Analyzer — automatically learns about a business from its online accounts.

Fetches publicly available data from:
- Website pages (title, meta description, visible text snippets)
- Instagram public profile (bio, recent post captions, hashtags)
- Google Business Profile (description, categories)

Produces a structured BrandAnalysis that gets stored in CompanyProfile.BrandAnalysis
and injected into every agent's prompt context.
"""

from __future__ import annotations

import re
import json
import asyncio
from typing import Any
from urllib.parse import urljoin, urlparse

import structlog
import httpx

from app.config import get_settings
from app.crew.industry_playbooks import (
    get_industry_playbook,
    merge_playbook_content_needs,
    normalize_industry_id,
    risk_rules_for_industry,
    template_families_for,
)

logger = structlog.get_logger()

_MAX_REFERENCE_IMAGES = 150
_IMAGE_SKIP_SUBSTR = (
    "google-analytics",
    "facebook.com/tr",
    "doubleclick",
    "googletagmanager",
    "pixel",
    "1x1",
    "spacer.gif",
    "blank.gif",
    "/emoji/",
    "favicon",
    "logo",
    "caka-logo",
    "instagram.png",
    "facebook.png",
    "twitter.png",
    "linkedin.png",
    "youtube.png",
    "/icons/",
    "-icon.",
    "/avatar/",
    "gravatar",
    "wpcf7",
    "loading.gif",
    "spinner",
    "placeholder",
    "thumb_placeholder",
    # ── Ephemeral CDN URLs — expire within 24h, never store as references ──
    "scontent-",        # Instagram CDN (scontent-lga3-3.cdninstagram.com, etc.)
    "cdninstagram.com", # Instagram photo CDN
    "fbcdn.net",        # Facebook CDN (same expiry behaviour)
    "instagram.fcdn",   # Another Instagram CDN pattern
)
# Sub-pages worth crawling for images — ordered by priority
_CRAWL_PATH_HINTS = (
    "galeri", "gallery", "foto", "photo", "photography",
    "lookbook", "medya", "media", "images", "img",
    "hakkimizda", "about", "about-us",
    "menu", "yemek", "food", "drinks", "bar",
    "etkinlik", "event", "activities",
    "mekan", "venue", "ambiance",
    "slider", "banner", "carousel",
    "uploads", "wp-content",
    "portfolio", "showcase", "works",
    "service", "hizmet",
)
_GALLERY_PATH_HINTS = _CRAWL_PATH_HINTS  # backward compat alias


def _absolute_url(base: str, href: str) -> str | None:
    href = (href or "").strip()
    if not href or href.startswith("data:") or href.startswith("#"):
        return None
    if href.startswith("javascript:") or href.startswith("mailto:"):
        return None
    try:
        joined = urljoin(base, href)
        parsed = urlparse(joined)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            return None
        return joined.split("#")[0]
    except Exception:
        return None


def _probably_photo_url(url: str) -> bool:
    u = url.lower()
    if any(s in u for s in _IMAGE_SKIP_SUBSTR):
        return False
    if u.endswith((".svg", ".ico", ".mp4", ".mov", ".webm", ".ogg", ".woff", ".woff2", ".ttf", ".js", ".css")):
        return False
    return True


def _best_from_srcset(raw: str, base: str) -> str | None:
    best_u: str | None = None
    best_w = -1
    for part in raw.split(","):
        seg = part.strip().split()
        if not seg:
            continue
        cand = seg[0].strip()
        w = 0
        if len(seg) > 1 and seg[1].endswith("w"):
            try:
                w = int(seg[1][:-1])
            except ValueError:
                w = 0
        abs_u = _absolute_url(base, cand)
        if abs_u and w >= best_w:
            best_w = w
            best_u = abs_u
    return best_u


def extract_image_urls_from_html(html: str, page_url: str) -> list[str]:
    """
    Extract ALL image URLs from raw HTML.
    Handles: og:image, img tags, lazy-load (data-src/data-lazy/data-original),
    srcset, picture/source, CSS background-image, JSON blobs, Cloudinary/imgix,
    WordPress attachments, JSON-LD structured data, and direct image links.
    """
    found: list[str] = []

    def push(u: str | None) -> None:
        if not u or not _probably_photo_url(u):
            return
        # Normalise: strip query params from CDN URLs to get the clean image
        clean = u.split("?")[0] if any(cdn in u for cdn in
            ("cloudinary.com", "imgix.net", "imagekit.io", "fastly.net",
             "cloudfront.net", "cdn.shopify", "wp-content")) else u
        found.append(clean)

    # ── 1. Meta og/twitter images ────────────────────────────────────────
    for pattern in (
        r'<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
    ):
        for m in re.finditer(pattern, html, re.IGNORECASE):
            push(_absolute_url(page_url, _clean_html_text(m.group(1))))

    # ── 2. <img> tags — all lazy-load patterns ───────────────────────────
    for m in re.finditer(r"<img[^>]+>", html, re.IGNORECASE | re.DOTALL):
        tag = m.group(0)
        # Try all known lazy-load attribute names in priority order
        for attr in ("data-src", "data-lazy-src", "data-lazy", "data-original",
                     "data-full-url", "data-img-src", "data-image", "data-bg",
                     "data-background", "data-echo", "data-defer-src",
                     "data-lazy-load", "data-pagespeed-lazy-src", "src"):
            src_m = re.search(rf'{attr}=["\']([^"\']+)["\']', tag, re.IGNORECASE)
            if src_m and not src_m.group(1).startswith("data:"):
                push(_absolute_url(page_url, src_m.group(1)))
                break
        # srcset and data-srcset — pick highest resolution
        for sset_attr in ("srcset", "data-srcset", "data-lazy-srcset"):
            sset_m = re.search(rf'{sset_attr}=["\']([^"\']+)["\']', tag, re.IGNORECASE)
            if sset_m:
                push(_best_from_srcset(sset_m.group(1), page_url))

    # ── 3. <picture> / <source> tags ────────────────────────────────────
    for m in re.finditer(r"<source[^>]+>", html, re.IGNORECASE):
        tag = m.group(0)
        for attr in ("srcset", "data-srcset", "src"):
            src_m = re.search(rf'{attr}=["\']([^"\']+)["\']', tag, re.IGNORECASE)
            if src_m:
                push(_best_from_srcset(src_m.group(1), page_url))
                break

    # ── 4. CSS background-image ──────────────────────────────────────────
    for m in re.finditer(r'url\(["\']?(https?://[^"\')\s]+)["\']?\)', html, re.IGNORECASE):
        push(m.group(1))

    # ── 5. JSON blobs — all flavours ────────────────────────────────────
    # Generic: any key whose value is an image URL
    JSON_IMG_KEYS = re.compile(
        r'"(?:url|src|image|photo|thumbnail|cover|background|imageUrl|imgUrl|'
        r'photoUrl|image_url|photo_url|thumbnail_url|cover_image|banner|'
        r'featured_image|picture|avatar|logo|hero|gallery_image|media_url|'
        r'full_url|original_url|display_url|hd_profile_pic_url_info|'
        r'pic_url|img|image_src)"\s*:\s*"(https?://[^"]+)"',
        re.IGNORECASE,
    )
    for m in JSON_IMG_KEYS.finditer(html):
        push(m.group(1))

    # Bare image URL strings in any JSON (not in a key, just a value)
    for m in re.finditer(
        r'"(https?://[^\s"\'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"',
        html, re.IGNORECASE
    ):
        push(m.group(1))

    # ── 6. JSON-LD structured data ───────────────────────────────────────
    for ld_m in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
        html, re.IGNORECASE
    ):
        try:
            import json as _json
            ld = _json.loads(ld_m.group(1))
            for key in ("image", "logo", "photo", "thumbnail", "primaryImageOfPage"):
                val = ld.get(key)
                if isinstance(val, str):
                    push(_absolute_url(page_url, val))
                elif isinstance(val, list):
                    for item in val:
                        if isinstance(item, str):
                            push(_absolute_url(page_url, item))
                        elif isinstance(item, dict):
                            push(_absolute_url(page_url, item.get("url", "")))
        except Exception:
            pass

    # ── 7. Direct image file links ──────────────────────────────────────
    for m in re.finditer(
        r'href=["\']([^"\']+\.(?:jpg|jpeg|png|webp)(?:\?[^"\']*)?)["\']',
        html, re.IGNORECASE
    ):
        push(_absolute_url(page_url, m.group(1)))

    # ── 8. WordPress & Cloudinary specifics ─────────────────────────────
    # wp-content/uploads patterns (already caught by JSON blob, but explicit)
    for m in re.finditer(
        r'(https?://[^\s"\'<>]+/wp-content/uploads/[^\s"\'<>]+\.(?:jpg|jpeg|png|webp))',
        html, re.IGNORECASE
    ):
        push(m.group(1).split("?")[0])

    # Cloudinary transformations — extract the base image URL
    for m in re.finditer(
        r'(https?://res\.cloudinary\.com/[^\s"\'<>]+/image/upload/[^\s"\'<>]+\.(?:jpg|jpeg|png|webp))',
        html, re.IGNORECASE
    ):
        # Strip Cloudinary transformation params (w_xxx, h_xxx, etc.)
        raw = m.group(1)
        clean = re.sub(r'/(?:w|h|c|f|q|e|l|t|fl|dpr|g|ar|r|so|du|sp|vc|br|cs|color|overlay|underlay)_[^/]+', '', raw)
        push(clean)

    out: list[str] = []
    seen: set[str] = set()
    for u in found:
        base = u.split("?")[0].lower()
        if base not in seen:
            seen.add(base)
            out.append(u.split("?")[0])  # always strip query params
    return out


def pick_gallery_link(links: list[str], page_url: str) -> str | None:
    for link in links:
        low = link.lower()
        if any(h in low for h in _GALLERY_PATH_HINTS):
            u = _absolute_url(page_url, link)
            if u:
                return u
    return None


# ── Instagram public profile fetcher ─────────────────────────────────────────

async def fetch_instagram_profile(handle: str) -> dict[str, Any]:
    """
    Fetch publicly available Instagram profile data without OAuth.
    Uses Instagram's public profile page.
    Returns dict with: bio, full_name, follower_count, post_count, recent_captions, hashtags
    """
    handle = handle.lstrip("@").strip()
    result: dict[str, Any] = {
        "handle": handle,
        "bio": "",
        "full_name": "",
        "follower_count": None,
        "post_count": None,
        "recent_captions": [],
        "top_hashtags": [],
        "content_themes": [],
        "posting_style": "",
        "feed_image_urls": [],
        "raw_fetch_ok": False,
    }

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    }

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            # Try Instagram oEmbed for basic info
            oembed_url = f"https://www.instagram.com/api/v1/users/web_profile_info/?username={handle}"
            resp = await client.get(oembed_url, headers=headers)

            if resp.status_code == 200:
                data = resp.json()
                user = data.get("data", {}).get("user", {})
                result["bio"] = user.get("biography", "")
                result["full_name"] = user.get("full_name", "")
                result["follower_count"] = user.get("edge_followed_by", {}).get("count")
                result["post_count"] = user.get("edge_owner_to_timeline_media", {}).get("count")
                result["raw_fetch_ok"] = True

                # Extract recent post captions
                edges = user.get("edge_owner_to_timeline_media", {}).get("edges", [])
                captions = []
                all_hashtags: list[str] = []
                for edge in edges[:12]:
                    node = edge.get("node", {})
                    cap_edges = node.get("edge_media_to_caption", {}).get("edges", [])
                    du = node.get("display_url") or node.get("thumbnail_src") or node.get("display_src")
                    if isinstance(du, str) and du.startswith("http"):
                        result["feed_image_urls"].append(du.split("?")[0])
                    if cap_edges:
                        cap_text = cap_edges[0].get("node", {}).get("text", "")
                        if cap_text:
                            captions.append(cap_text[:300])
                            # Extract hashtags
                            tags = re.findall(r"#\w+", cap_text)
                            all_hashtags.extend(tags)

                result["recent_captions"] = captions[:6]

                # Top hashtags by frequency
                from collections import Counter
                tag_counts = Counter(all_hashtags)
                result["top_hashtags"] = [t for t, _ in tag_counts.most_common(15)]

                seen_ig: set[str] = set()
                uniq_ig: list[str] = []
                for u in result["feed_image_urls"]:
                    if u not in seen_ig:
                        seen_ig.add(u)
                        uniq_ig.append(u)
                result["feed_image_urls"] = uniq_ig[:18]

    except Exception as e:
        logger.warning("instagram_fetch_failed", handle=handle, error=str(e))

    return result


# ── Google Business public fetcher ───────────────────────────────────────────

async def fetch_google_business_info(url_or_name: str) -> dict[str, Any]:
    """
    Fetch basic Google Business Profile info from a public URL or business name.
    Returns dict with: name, category, description, address
    """
    result: dict[str, Any] = {
        "input": url_or_name,
        "name": "",
        "category": "",
        "description": "",
        "address": "",
        "raw_fetch_ok": False,
    }

    if not url_or_name:
        return result

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            # If it's a full URL (maps.google.com etc.), fetch basic metadata
            if url_or_name.startswith("http"):
                resp = await client.get(url_or_name, headers={"User-Agent": "Mozilla/5.0"})
                if resp.status_code == 200:
                    # Try to extract business name from title
                    title_match = re.search(r"<title>([^<]+)</title>", resp.text)
                    if title_match:
                        result["name"] = title_match.group(1).replace(" - Google Maps", "").strip()
                    result["raw_fetch_ok"] = True
    except Exception as e:
        logger.warning("google_business_fetch_failed", input=url_or_name, error=str(e))

    return result


# ── Website public fetcher ───────────────────────────────────────────────────

def _pick_crawl_subpages(links: list[str], base_url: str, base_domain: str, max_pages: int = 8) -> list[str]:
    """
    From the list of hrefs found on the home page, pick sub-pages most likely
    to contain brand photography. Stays on the same domain.
    """
    candidates: list[tuple[int, str]] = []
    seen: set[str] = set()

    for href in links:
        abs_u = _absolute_url(base_url, href)
        if not abs_u:
            continue
        # Must be same domain
        try:
            from urllib.parse import urlparse as _up
            if _up(abs_u).netloc.replace("www.", "") != base_domain.replace("www.", ""):
                continue
        except Exception:
            continue
        # Skip exact same as base
        if abs_u.rstrip("/") == base_url.rstrip("/"):
            continue
        if abs_u in seen:
            continue
        seen.add(abs_u)

        low = abs_u.lower()
        # Score by how likely this page has photos
        score = 0
        for hint in _CRAWL_PATH_HINTS:
            if hint in low:
                score += 3 if hint in ("galeri", "gallery", "foto", "photo", "slider", "uploads") else 2
                break
        if score == 0:
            continue
        candidates.append((score, abs_u))

    candidates.sort(key=lambda x: -x[0])
    return [u for _, u in candidates[:max_pages]]


async def fetch_website_deep(url: str) -> dict[str, Any]:
    """
    Deep website crawl using sitemap + link discovery — no Apify needed.

    1. Discovers URLs via sitemap.xml (handles sitemap indexes)
    2. Falls back to homepage link extraction
    3. Crawls discovered pages in parallel, extracts cleaned text
    4. Scores pages by content richness, returns up to 20K chars
    """
    import html as _html
    from app.crew.apify_scraper import _fetch_sitemap_urls

    url = (url or "").strip()
    result: dict[str, Any] = {
        "url": url, "title": "", "description": "", "keywords": [],
        "text_snippet": "", "links": [], "image_urls": [], "raw_fetch_ok": False,
    }
    if not url:
        return result
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
        result["url"] = url

    from urllib.parse import urlparse as _uparse
    from collections import Counter
    _parsed = _uparse(url)
    base_domain = f"{_parsed.scheme}://{_parsed.netloc}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    }

    NAV_NOISE = re.compile(
        r"^(login|register|wishlist|cart|checkout|skip to|menu \d|0 items|search$)",
        re.IGNORECASE | re.MULTILINE,
    )
    PRODUCT_KEYWORDS = re.compile(
        r"(ürün|product|fiyat|price|₺|\$|€|satın|buy|sepet|about|hakkımızda|hizmet|service|menü|menu)",
        re.IGNORECASE,
    )
    JS_NOISE = re.compile(
        r"(!function\(|function\(\w,\w|var \w=function|module\.exports|"
        r"__webpack_|_sentryDebugIds|gtag\(|dataLayer\.push|"
        r"googletag\.|fbq\(|analytics\.track|"
        r"\\u[0-9a-f]{4}|\\x[0-9a-f]{2}|"
        r"\.prototype\.|typeof window|typeof global|"
        r"try\{var [a-z]=|catch\([a-z]\)\{)",
        re.IGNORECASE,
    )

    def extract_clean_text(html_str: str) -> str:
        # Remove scripts, styles, nav, header, footer
        for tag in ["script", "style", "nav", "header", "footer"]:
            html_str = re.sub(f"<{tag}[\\s\\S]*?</{tag}>", " ", html_str, flags=re.IGNORECASE)
        # Strip remaining tags
        text = re.sub(r"<[^>]+>", " ", html_str)
        # Decode HTML entities
        text = _html.unescape(text)
        # Clean whitespace
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        # Remove nav noise, JS lines, and overlong lines (minified JS)
        lines = [
            ln.strip() for ln in text.split("\n")
            if (
                len(ln.strip()) > 15
                and len(ln.strip()) < 2000
                and not NAV_NOISE.match(ln.strip())
                and not JS_NOISE.search(ln)
            )
        ]
        return "\n".join(lines)

    # Discover URLs
    crawl_urls = await _fetch_sitemap_urls(base_domain)
    if not crawl_urls:
        crawl_urls = [url]

    # Always include homepage
    if url not in crawl_urls:
        crawl_urls.insert(0, url)

    # Discover menu category links from homepage HTML
    homepage_html = ""
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers) as _hc:
            _hr = await _hc.get(url)
            if _hr.status_code < 400:
                homepage_html = _hr.text
                from app.services.website_intelligence_service import discover_internal_urls
                for link in discover_internal_urls(homepage_html, str(_hr.url), base_domain):
                    if link not in crawl_urls:
                        crawl_urls.append(link)
    except Exception:
        pass

    if homepage_html:
        from app.services.website_brand_kit_service import attach_brand_kit_to_website_result
        attach_brand_kit_to_website_result(result, homepage_html)

    logger.info("website_deep_crawl_start", domain=base_domain, urls=len(crawl_urls))

    scored_pages: list[tuple[int, str, str]] = []
    all_image_urls: list[str] = []
    crawled_pages: list[dict[str, Any]] = []
    max_pages = 35 if len(crawl_urls) > 8 else 20
    batch_urls = crawl_urls[:max_pages]
    page_results: list[tuple[int, str, str, list[str]]] = []

    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers) as client:
        TR_CHARS = re.compile(r"[çğışöüÇĞİŞÖÜ]")

        async def fetch_page(page_url: str) -> tuple[int, str, str, list[str]]:
            try:
                r = await client.get(page_url)
                if r.status_code >= 400:
                    # Accept error pages that contain HTML with embedded images (SPA pattern)
                    body = r.text
                    is_html = "html" in r.headers.get("content-type", "") or body.strip().lower().startswith(("<!doc", "<html"))
                    has_imgs = bool(re.search(r'\.(?:jpg|jpeg|png|webp)', body))
                    if not (is_html and has_imgs):
                        return (0, "", "", [])
                html_content = r.text
                title = ""
                tm = re.search(r"<title[^>]*>(.*?)</title>", html_content, re.IGNORECASE | re.DOTALL)
                if tm:
                    title = _html.unescape(re.sub(r"<[^>]+>", "", tm.group(1))).strip()[:160]
                text = extract_clean_text(html_content)
                # Extract images from this page's HTML
                imgs = extract_image_urls_from_html(html_content, page_url)

                if not text:
                    return (0, "", "", imgs)

                # Penalise English-only pages
                tr_ratio = len(TR_CHARS.findall(text)) / max(len(text), 1)
                if tr_ratio < 0.005 and len(text) > 200:
                    return (1, title, text[:1000], imgs)

                score = len(PRODUCT_KEYWORDS.findall(text)) + len(text) // 200
                tr_product_signals = ["zeytinyağı", "bal ", "badem", "reçel", "turşu",
                                      "yöresel", "doğal", "hasat", "ürün", "pekmez"]
                score += sum(5 for w in tr_product_signals if w in text.lower())
                return (score, title, text[:5000], imgs)
            except Exception:
                return (0, "", "", [])

        import asyncio as _asyncio
        tasks = [fetch_page(u) for u in batch_urls]
        page_results = await _asyncio.gather(*tasks)

    for score, title, text, imgs in page_results:
        if text and score > 0:
            scored_pages.append((score, title, text))
        all_image_urls.extend(imgs)

    for page_url, (score, title, text, imgs) in zip(batch_urls, page_results):
        crawled_pages.append({
            "url": page_url,
            "title": title,
            "text": text,
            "html": "",
            "image_urls": imgs,
        })

    if not scored_pages:
        # Fallback: homepage only, no scoring
        try:
            s, t, text = (await fetch_page(url))  # type: ignore
            if text:
                scored_pages.append((s, t, text))
        except Exception:
            pass

    if not scored_pages:
        # Even if no readable text, save any images we collected (SPA/menu sites)
        if all_image_urls:
            seen_imgs: set[str] = set()
            clean_imgs: list[str] = []
            for u in all_image_urls:
                key = u.split("?")[0].lower()
                if key not in seen_imgs and _probably_photo_url(u):
                    seen_imgs.add(key)
                    clean_imgs.append(u.split("?")[0])
            if clean_imgs:
                result["image_urls"] = clean_imgs
                result["raw_fetch_ok"] = True
                logger.info("website_images_only_no_text", domain=base_domain, images=len(clean_imgs))
        from app.services.website_intelligence_service import build_website_intelligence
        build_website_intelligence(url, result, homepage_html=homepage_html, crawled_pages=crawled_pages)
        if homepage_html and not result.get("brand_kit"):
            from app.services.website_brand_kit_service import attach_brand_kit_to_website_result
            attach_brand_kit_to_website_result(result, homepage_html)
        return result

    scored_pages.sort(key=lambda x: x[0], reverse=True)

    result["raw_fetch_ok"] = True
    result["title"] = scored_pages[0][1] or ""

    combined = "\n\n---\n\n".join(t for _, _, t in scored_pages)
    result["text_snippet"] = combined[:20_000]

    # Description from best page
    for line in scored_pages[0][2].split("\n"):
        line = line.strip()
        if len(line) > 80:
            result["description"] = line[:500]
            break

    # Keywords
    words = re.findall(r"\b[a-zA-ZğüşıöçĞÜŞİÖÇ]{4,}\b", combined.lower())
    stop = {"this", "that", "with", "from", "have", "için", "olan", "veya", "ile",
            "daha", "gibi", "kadar", "sonra", "önce"}
    word_counts = Counter(w for w in words if w not in stop)
    result["keywords"] = [w for w, _ in word_counts.most_common(25)]

    # Deduplicate and filter website images
    seen_imgs: set[str] = set()
    clean_imgs: list[str] = []
    for u in all_image_urls:
        key = u.split("?")[0].lower()
        if key not in seen_imgs and _probably_photo_url(u):
            seen_imgs.add(key)
            clean_imgs.append(u.split("?")[0])
        if len(clean_imgs) >= _MAX_REFERENCE_IMAGES:
            break
    result["image_urls"] = clean_imgs

    logger.info("website_deep_crawl_done", domain=base_domain,
                pages=len(scored_pages), total_chars=len(combined),
                images=len(clean_imgs), top_keywords=result["keywords"][:5])
    from app.services.website_intelligence_service import build_website_intelligence
    build_website_intelligence(url, result, homepage_html=homepage_html, crawled_pages=crawled_pages)
    if homepage_html and not result.get("brand_kit"):
        from app.services.website_brand_kit_service import attach_brand_kit_to_website_result
        attach_brand_kit_to_website_result(result, homepage_html)
    return result


async def fetch_website_info(url: str) -> dict[str, Any]:
    """
    Fetch a public website and extract brand signals + all venue photography.
    Crawls the home page + up to 8 sub-pages (gallery, menu, about, slider…)
    in parallel to collect as many real venue photos as possible.
    """
    url = (url or "").strip()
    result: dict[str, Any] = {
        "url": url,
        "title": "",
        "description": "",
        "keywords": [],
        "text_snippet": "",
        "links": [],
        "image_urls": [],
        "raw_fetch_ok": False,
    }
    if not url:
        return result

    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
        result["url"] = url

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    }

    try:
        from urllib.parse import urlparse as _urlparse
        base_domain = _urlparse(url).netloc

        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            # ── Step 1: fetch home page ───────────────────────────────────
            resp = await client.get(url, headers=headers)
            if resp.status_code >= 400:
                return result

            html = resp.text
            result["raw_fetch_ok"] = True

            title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
            if title_match:
                result["title"] = _clean_html_text(title_match.group(1))[:160]

            desc_match = re.search(
                r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
                html, re.IGNORECASE,
            ) or re.search(
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']description["\']',
                html, re.IGNORECASE,
            )
            if desc_match:
                result["description"] = _clean_html_text(desc_match.group(1))[:400]

            keyword_match = re.search(
                r'<meta[^>]+name=["\']keywords["\'][^>]+content=["\']([^"\']+)["\']',
                html, re.IGNORECASE,
            )
            if keyword_match:
                result["keywords"] = [
                    item.strip() for item in keyword_match.group(1).split(",") if item.strip()
                ][:20]

            body = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", html, flags=re.IGNORECASE)
            body = re.sub(r"<[^>]+>", " ", body)
            result["text_snippet"] = _clean_html_text(body)[:1200]

            links = re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.IGNORECASE)
            result["links"] = [
                link for link in links
                if any(t in link.lower() for t in ["about", "hakk", "menu", "service", "product", "contact", "iletisim"])
            ][:12]

            # ── Step 2: collect images from home page ─────────────────────
            all_images: list[str] = extract_image_urls_from_html(html, url)

            # ── Step 3: identify sub-pages to crawl ───────────────────────
            subpages = _pick_crawl_subpages(links, url, base_domain, max_pages=8)
            logger.info("website_crawl_subpages", url=url, count=len(subpages), pages=subpages)

            # ── Step 4: crawl sub-pages in parallel ───────────────────────
            async def _fetch_subpage(sub_url: str) -> list[str]:
                try:
                    r = await client.get(sub_url, headers=headers, timeout=12.0)
                    if r.status_code < 400:
                        imgs = extract_image_urls_from_html(r.text, sub_url)
                        logger.info("subpage_crawled", url=sub_url, images=len(imgs))
                        return imgs
                except Exception as e:
                    logger.warning("subpage_fetch_failed", url=sub_url, error=str(e))
                return []

            import asyncio as _asyncio
            sub_results = await _asyncio.gather(*[_fetch_subpage(p) for p in subpages])
            for imgs in sub_results:
                all_images.extend(imgs)

            # ── Step 5: deduplicate and limit ─────────────────────────────
            merged: list[str] = []
            seen_m: set[str] = set()
            for u in all_images:
                # Normalise: strip query strings for dedup but keep original URL
                key = u.split("?")[0].lower()
                if key not in seen_m:
                    seen_m.add(key)
                    merged.append(u.split("?")[0])  # strip tracking params
                if len(merged) >= _MAX_REFERENCE_IMAGES:
                    break

            result["image_urls"] = merged
            logger.info(
                "website_images_collected",
                url=url,
                subpages_crawled=len(subpages),
                total_images=len(merged),
            )

    except Exception as e:
        logger.warning("website_fetch_failed", url=url, error=str(e))

    return result


def _clean_html_text(value: str) -> str:
    value = re.sub(r"\s+", " ", value or "")
    return value.strip()


# ── Brand analysis synthesizer ────────────────────────────────────────────────

def synthesize_brand_analysis(
    website_data: dict[str, Any],
    instagram_data: dict[str, Any],
    google_data: dict[str, Any],
    company_profile: dict[str, Any],
) -> str:
    """
    Combine fetched account data with company profile to produce a rich
    brand analysis string for injection into agent prompts.
    """
    sections: list[str] = []

    brand_name = (
        company_profile.get("brand_name")
        or google_data.get("name")
        or website_data.get("title")
        or instagram_data.get("full_name")
        or "Bu işletme"
    )

    # ── Website insights ──────────────────────────────────────────────────────
    if website_data.get("raw_fetch_ok"):
        sections.append("### Web Sitesi")
        if website_data.get("title"):
            sections.append(f"Başlık: {website_data['title']}")
        if website_data.get("description"):
            sections.append(f"Açıklama: {website_data['description'][:500]}")

        # Extract product names + prices from raw text (WooCommerce / e-commerce)
        snippet = website_data.get("text_snippet", "")
        if snippet:
            product_lines: list[str] = []
            price_pattern = re.compile(r"[₺$€]\s?[\d.,]+|[\d.,]+\s?[₺$€]")
            for line in snippet.split("\n"):
                line = line.strip()
                # Product/price lines: short, has price or is all-caps product name
                if price_pattern.search(line) or (line.isupper() and 4 < len(line) < 80):
                    product_lines.append(line)
            if product_lines:
                sections.append(f"\nÜrünler / Hizmetler:")
                for pl in product_lines[:20]:
                    sections.append(f"  - {pl}")

        if website_data.get("keywords"):
            sections.append(f"\nAnahtar kelimeler: {', '.join(website_data['keywords'][:15])}")

        # Full crawl text for agents (truncated but generous)
        if snippet:
            sections.append(f"\nSayfa içeriği:\n{snippet[:8000]}")

    # ── Instagram insights ──────────────────────────────────────────────────
    if instagram_data.get("raw_fetch_ok") or instagram_data.get("bio"):
        sections.append("### Instagram Profili")
        if instagram_data.get("bio"):
            sections.append(f"Bio: {instagram_data['bio']}")
        if instagram_data.get("follower_count"):
            sections.append(f"Takipçi: {instagram_data['follower_count']:,}")
        if instagram_data.get("top_hashtags"):
            sections.append(f"Sık kullanılan hashtag'ler: {', '.join(instagram_data['top_hashtags'][:10])}")
        if instagram_data.get("recent_captions"):
            sections.append("\nSon paylaşımlardan örnekler:")
            for i, cap in enumerate(instagram_data["recent_captions"][:3], 1):
                # Truncate for prompt efficiency
                sections.append(f"  {i}. {cap[:200]}")
    elif instagram_data.get("handle"):
        sections.append(f"### Instagram\nHesap: @{instagram_data['handle']} (profil verisi çekilemedi)")

    # ── Google Business insights ────────────────────────────────────────────
    if google_data.get("raw_fetch_ok") or google_data.get("name"):
        sections.append("\n### Google Business")
        if google_data.get("name"):
            sections.append(f"İşletme adı: {google_data['name']}")
        if google_data.get("category"):
            sections.append(f"Kategori: {google_data['category']}")
        if google_data.get("description"):
            sections.append(f"Açıklama: {google_data['description'][:300]}")

    # ── Inferred content style ──────────────────────────────────────────────
    if instagram_data.get("recent_captions"):
        captions_text = " ".join(instagram_data["recent_captions"])
        # Detect language/tone patterns
        has_emoji = bool(re.search(r"[\U00010000-\U0010ffff]|[\U0001F300-\U0001F9FF]", captions_text))
        has_questions = "?" in captions_text
        is_turkish = bool(re.search(r"[çğışöüÇĞİŞÖÜ]", captions_text))
        avg_len = sum(len(c) for c in instagram_data["recent_captions"]) / max(len(instagram_data["recent_captions"]), 1)

        style_notes: list[str] = []
        if has_emoji:
            style_notes.append("emoji kullanıyor")
        if has_questions:
            style_notes.append("takipçiyle diyalog kuruyor")
        if is_turkish:
            style_notes.append("Türkçe içerik üretiyor")
        if avg_len < 100:
            style_notes.append("kısa ve öz caption yazıyor")
        elif avg_len > 300:
            style_notes.append("uzun ve detaylı caption yazıyor")

        if style_notes:
            sections.append(f"\n### İçerik Stili (Analizden)")
            sections.append(f"{brand_name} genellikle: {', '.join(style_notes)}.")

    if not sections:
        return ""

    header = f"# {brand_name} — Hesap Analizi\n"
    return header + "\n".join(sections)


# ── Main entry point ──────────────────────────────────────────────────────────

_JS_LINE = re.compile(
    r"(!function\(|__webpack_|_sentryDebugIds|gtag\(|dataLayer\.push|"
    r"typeof window|typeof global|try\{var [a-z]=|\\u[0-9a-f]{4})",
    re.IGNORECASE,
)


def _clean_text_block(text: str, max_chars: int = 3500) -> str:
    """Strip JS/tracking lines from any text block and truncate."""
    if not text:
        return ""
    lines = [
        ln for ln in text.split("\n")
        if len(ln.strip()) > 5
        and len(ln.strip()) < 2000
        and not _JS_LINE.search(ln)
    ]
    return "\n".join(lines)[:max_chars].strip()


def _build_clean_website_summary(
    website_data: dict,
    instagram_data: dict,
    google_data: dict,
) -> str:
    """
    Build a clean website_summary from all available sources.
    - If website crawl succeeded: use cleaned description + text_snippet
    - If website crawl failed/empty: fall back to Instagram bio + Google description
    - Always strips JS/tracking code from any source
    """
    parts: list[str] = []

    # Website content (primary source)
    web_desc = _clean_text_block(website_data.get("description") or "", 500)
    web_snippet = _clean_text_block(website_data.get("text_snippet") or "", 3000)

    if web_desc:
        parts.append(web_desc)
    if web_snippet and len(web_snippet.strip()) > 80:
        parts.append(web_snippet)

    # If website gave us nothing useful, fall back to social sources
    if not parts or len("\n\n".join(parts).strip()) < 80:
        ig_bio = (instagram_data.get("bio") or "").strip()
        ig_captions = " | ".join(
            (c[:120] for c in (instagram_data.get("recent_captions") or [])[:3])
        )
        google_desc = (google_data.get("description") or google_data.get("category") or "").strip()

        if ig_bio:
            parts.append(f"Instagram: {ig_bio}")
        if ig_captions:
            parts.append(f"Son paylaşımlar: {ig_captions}")
        if google_desc:
            parts.append(f"Google Business: {google_desc}")

    return "\n\n".join(parts)[:4000]


def _infer_brand_tone(text: str, industry: str = "") -> str:
    """
    Infer brand tone from all available text signals.
    Returns a Turkish tone descriptor string.
    """
    blob = f"{text} {industry}".lower()

    # Score each tone
    scores: dict[str, int] = {
        "luxury":       0,
        "energetic":    0,
        "warm":         0,
        "playful":      0,
        "professional": 0,
        "casual":       0,
    }

    # Luxury signals
    for w in ["lüks", "luxury", "premium", "exclusive", "elit", "prestij", "high-end",
              "sophisticated", "rafine", "zarif", "güzellik", "vip"]:
        if w in blob: scores["luxury"] += 2
    # Energetic signals
    for w in ["eğlence", "party", "dj", "gece", "müzik", "festival", "etkinlik",
              "enerji", "dinamik", "canlı", "heyecan", "fun", "exciting",
              "dance", "dans", "konsert", "sahne"]:
        if w in blob: scores["energetic"] += 2
    # Warm/friendly signals
    for w in ["aile", "family", "sıcak", "warm", "samimi", "dostane", "sevgi",
              "kahve", "coffee", "kafe", "cafe", "bite", "ev", "home", "doğal",
              "geleneksel", "yöresel", "köy", "taze", "lezzet"]:
        if w in blob: scores["warm"] += 2
    # Playful signals
    for w in ["eğlenceli", "komik", "neşe", "playful", "cute", "tatlı", "sevimli",
              "dondurma", "ice cream", "çocuk"]:
        if w in blob: scores["playful"] += 2
    # Casual signals
    for w in ["casual", "rahat", "gündelik", "sade", "basit", "doğal", "organik"]:
        if w in blob: scores["casual"] += 1
    # Professional signals
    for w in ["profesyonel", "professional", "uzman", "deneyim", "kalite", "güven",
              "hizmet", "service", "danışman", "clinic", "klinik", "akademi"]:
        if w in blob: scores["professional"] += 2

    # Industry boosts
    if "coffee" in industry or "cafe" in industry or "kahve" in blob:
        scores["warm"] += 3
    if "beach_club" in industry or "dj" in blob:
        scores["energetic"] += 3
    if "luxury" in industry or "premium" in blob:
        scores["luxury"] += 3
    if "local_products" in industry or "yöresel" in blob:
        scores["warm"] += 3
    if "healthcare" in industry or "psikolog" in blob:
        scores["professional"] += 3

    best = max(scores, key=lambda k: scores[k])
    score_val = scores[best]

    # Map to Turkish descriptor
    TONE_MAP = {
        "luxury":       "lüks, zarif, sofistike",
        "energetic":    "enerjik, dinamik, eğlenceli",
        "warm":         "samimi, sıcak, davetkar",
        "playful":      "neşeli, eğlenceli, sevimli",
        "professional": "profesyonel, güvenilir, uzman",
        "casual":       "rahat, doğal, gündelik",
    }

    # If no clear winner (all low scores), use professional as default
    if score_val < 2:
        return "samimi, sıcak, güvenilir"

    return TONE_MAP[best]


async def _analyze_instagram_captions_llm(
    captions: list[str],
    posts_detail: list[dict[str, Any]],
    engagement_stats: dict[str, Any],
    brand_name: str,
    openai_api_key: str,
) -> dict[str, Any]:
    """
    Use GPT-4o to extract structured brand intelligence from real Instagram captions.
    Returns content themes, voice patterns, CTA patterns, and emotional triggers
    that agents use to match the brand's authentic voice.
    """
    import httpx as _httpx

    if not captions:
        return {}

    captions_block = "\n".join(
        f"{i + 1}. {c}" for i, c in enumerate(captions[:15])
    )

    # Top posts by engagement for voice benchmarking
    top_posts = sorted(
        [p for p in posts_detail if p.get("likes", 0) > 0],
        key=lambda p: p.get("likes", 0),
        reverse=True,
    )[:5]
    top_posts_block = ""
    if top_posts:
        top_posts_block = "\n\nEn çok beğenilen paylaşımlar:\n" + "\n".join(
            f"- {p.get('likes', 0)} beğeni | {p.get('type', 'image')} | {p.get('caption', '')[:200]}"
            for p in top_posts
        )

    engagement_block = ""
    if engagement_stats:
        engagement_block = (
            f"\n\nEngagement özeti: Ortalama {engagement_stats.get('avg_likes', 0)} beğeni, "
            f"{engagement_stats.get('avg_comments', 0)} yorum, "
            f"etkileşim oranı %{engagement_stats.get('engagement_rate_pct', 0):.1f}. "
            f"Format dağılımı: {engagement_stats.get('post_type_distribution', {})}."
        )

    system_prompt = (
        "Sen bir sosyal medya marka analistsin. "
        "Instagram caption'larını analiz ederek markanın gerçek sesini, "
        "içerik temalarını ve stratejisini çıkarıyorsun. "
        "Yanıtını JSON formatında ver, başka metin ekleme."
    )

    user_prompt = f"""Marka: {brand_name or 'Bilinmeyen'}

Son Instagram paylaşımları:
{captions_block}{top_posts_block}{engagement_block}

Bu paylaşımları analiz et ve aşağıdaki JSON yapısını döndür:

{{
  "brand_voice": {{
    "primary_tone": "markanın ana tonu (1-3 kelime, Türkçe)",
    "writing_style": "yazım stili özeti",
    "emoji_usage": "yok / az / orta / çok",
    "caption_length": "kısa (< 80 karakter) / orta (80-200) / uzun (> 200)",
    "engagement_style": "soru sorarak / bilgi vererek / hikaye anlatarak / duygusal bağ kurarak"
  }},
  "content_themes": [
    {{"theme": "tema adı", "example": "kısa örnek caption", "frequency": "sık / ara sıra"}}
  ],
  "cta_patterns": ["kullanılan CTA'lar listesi"],
  "emotional_triggers": ["kullanılan duygusal tetikleyiciler"],
  "key_topics": ["sık işlenen konular"],
  "posting_insights": {{
    "best_performing_content_type": "en çok etkileşim alan içerik türü",
    "audience_connection_method": "takipçilerle nasıl bağ kuruyor",
    "brand_personality_traits": ["marka kişilik özellikleri"]
  }},
  "caption_examples": [
    {{"label": "kısa örnek", "text": "en iyi örnek caption"}},
    {{"label": "uzun örnek", "text": "en uzun ve en iyi örnek caption"}}
  ]
}}"""

    try:
        async with _httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {openai_api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 1200,
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                },
            )
            data = resp.json()
            raw = data["choices"][0]["message"]["content"].strip()
            return json.loads(raw)
    except Exception:
        return {}


async def analyze_brand(
    website_url: str = "",
    instagram_handle: str = "",
    google_business_url: str = "",
    company_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Run full brand analysis from connected account data.

    Uses Apify actors when APIFY_API_KEY is configured (recommended).
    Falls back to direct HTTP scraping when Apify is unavailable.
    """
    from app.crew.apify_scraper import (
        fetch_instagram_apify,
        fetch_website_apify,
        fetch_google_business_apify,
        fetch_tripadvisor_reviews,
        fetch_instagram_location_posts,
        fetch_competitor_instagram_profiles,
    )

    profile = company_profile or {}
    settings = get_settings()
    use_apify = bool(
        settings.apify_enabled
        and settings.apify_api_key
        and settings.apify_api_key.strip()
    )

    if use_apify:
        logger.info("brand_analyze_using_apify")
        api_key = settings.apify_api_key.strip()
        timeout = settings.apify_timeout_seconds

        # Website: try Apify deep crawl first; fall back to deep direct HTTP on failure/limit
        if website_url:
            website_data = await fetch_website_apify(website_url, api_key, timeout)
            if not website_data.get("raw_fetch_ok"):
                logger.info("apify_website_failed_using_direct_http", url=website_url)
                website_data = await fetch_website_deep(website_url)
        else:
            website_data = await _empty_dict()

        # Instagram + Google: use Apify sequentially (free-tier memory constraint)
        instagram_data = await (
            fetch_instagram_apify(instagram_handle, api_key, timeout)
            if instagram_handle else _empty_dict()
        )

        google_data = await (
            fetch_google_business_apify(google_business_url, api_key, timeout)
            if google_business_url else _empty_dict()
        )

        # Tripadvisor reviews — best effort, non-blocking
        tripadvisor_data: list[dict] = []
        brand_name_for_ta = profile.get("brand_name") or google_data.get("name", "")
        location_for_ta = profile.get("location", "")
        if brand_name_for_ta and location_for_ta:
            try:
                tripadvisor_data = await fetch_tripadvisor_reviews(
                    brand_name_for_ta, location_for_ta, api_key, timeout=60, max_reviews=15
                )
            except Exception as _e:
                logger.debug("tripadvisor_fetch_skipped", error=str(_e))

        # Hyper-local Instagram posts — best effort, non-blocking
        location_posts_data: list[dict] = []
        if location_for_ta:
            try:
                location_posts_data = await fetch_instagram_location_posts(
                    location_for_ta, api_key, timeout=60, max_posts=20
                )
            except Exception as _e:
                logger.debug("location_posts_fetch_skipped", error=str(_e))

        # Competitor Instagram profiles — best effort, sequential (free-tier constraint)
        competitor_instagram_data: list[dict] = []
        competitors_str = profile.get("competitors", "") or ""
        if competitors_str:
            from app.crew.crews.market_intelligence_crew import _extract_competitor_handles
            comp_handles = _extract_competitor_handles(competitors_str)
            if comp_handles:
                try:
                    competitor_instagram_data = await fetch_competitor_instagram_profiles(
                        comp_handles, api_key, timeout=timeout
                    )
                except Exception as _e:
                    logger.debug("competitor_instagram_fetch_skipped", error=str(_e))

    else:
        logger.info("brand_analyze_using_deep_http")
        website_data, instagram_data, google_data = await asyncio.gather(
            fetch_website_deep(website_url) if website_url else _empty_dict(),
            fetch_instagram_profile(instagram_handle) if instagram_handle else _empty_dict(),
            fetch_google_business_info(google_business_url) if google_business_url else _empty_dict(),
        )
        tripadvisor_data = []
        location_posts_data = []
        competitor_instagram_data = []

    # Synthesize
    analysis_text = synthesize_brand_analysis(website_data, instagram_data, google_data, profile)
    # Include brand_name in combined_text — critical for sectors where the business name
    # itself carries the industry signal (e.g. "Kadıköy Tırnak" → nail salon).
    combined_text = " ".join(
        filter(None, [
            profile.get("brand_name") or profile.get("business_name") or profile.get("name", ""),
            website_data.get("title", ""),
            website_data.get("description", ""),
            website_data.get("text_snippet", ""),
            instagram_data.get("bio", ""),
            " ".join(instagram_data.get("recent_captions", [])),
            google_data.get("category", ""),
            google_data.get("description", ""),
        ])
    )

    # Infer language
    captions = " ".join(instagram_data.get("recent_captions", []))
    inferred_language = "tr" if re.search(r"[çğışöüÇĞİŞÖÜ]", f"{captions} {combined_text}") else "tr,en"
    raw_industry = infer_industry(combined_text, profile.get("industry", ""))
    industry = normalize_industry_id(raw_industry)

    # Infer tone — after industry is known so we can use it as a boost signal
    tone_blob = " ".join(filter(None, [
        instagram_data.get("bio", ""),
        captions,
        website_data.get("description", ""),
        google_data.get("description", ""),
    ])).lower()
    inferred_tone = _infer_brand_tone(tone_blob, industry)
    playbook = get_industry_playbook(industry)
    content_pillars = merge_playbook_content_needs(
        industry,
        infer_content_pillars(combined_text, industry),
    )
    primary_goals = infer_primary_goals(combined_text, industry)
    template_needs = template_families_for(industry, content_pillars)
    asset_recommendations = infer_asset_recommendations(content_pillars)
    default_ctas = infer_default_ctas(primary_goals, industry, inferred_language)
    visual_style = infer_visual_style(combined_text, inferred_tone)
    target_audience = infer_target_audience(combined_text, industry)
    missing_questions = infer_missing_questions(
        website_url=website_url,
        instagram_handle=instagram_handle,
        google_business_url=google_business_url,
        content_pillars=content_pillars,
    )

    # Build reference_image_urls: website images first, then Instagram feed
    # Instagram CDN URLs (scontent-, cdninstagram.com, fbcdn.net) are included here;
    # the Next.js BFF analyze/route.ts mirrorToR2() downloads and re-uploads them to R2
    # immediately during the same API call, replacing ephemeral CDN URLs with permanent ones.
    _EPHEMERAL = re.compile(r"^data:|^blob:|localhost|127\.0\.0\.1|example\.com", re.IGNORECASE)

    reference_image_urls: list[str] = []
    seen_ref: set[str] = set()

    def _add_image(u: str) -> bool:
        if not isinstance(u, str):
            return False
        s = u.strip()
        if not s.startswith("http"):
            return False
        # Skip truly unusable URL formats (data URIs, blobs, localhost)
        if _EPHEMERAL.search(s):
            return False
        # Skip obvious non-images (videos, fonts, scripts)
        if s.lower().endswith((".mp4", ".mov", ".webm", ".ogg", ".woff", ".woff2", ".ttf", ".js", ".css")):
            return False
        # Skip tiny template variables like ${image}
        if "${" in s or "{{" in s:
            return False
        base = s.split("?")[0]
        if "/wp-content/uploads" in base.lower():
            base = re.sub(r"-\d+x\d+(?=\.(?:jpe?g|png|webp|gif|avif)$)", "", base, flags=re.IGNORECASE)
        if base in seen_ref:
            return False
        seen_ref.add(base)
        reference_image_urls.append(base)
        return True

    def _reference_image_rank(u: str) -> tuple[int, str]:
        low = u.lower()
        if any(h in low for h in ("/galeri/", "/gallery/", "/photos/", "/foto/")):
            return (0, low)
        if any(h in low for h in ("galeri", "gallery", "photo", "foto")):
            return (1, low)
        if any(h in low for h in ("/menu", "food", "drink", "bar")):
            return (2, low)
        if any(h in low for h in ("/assets/", "/images/")):
            return (4, low)
        return (3, low)

    # 1. Website images (permanent, highest quality)
    for u in sorted((website_data.get("image_urls") or []), key=_reference_image_rank):
        _add_image(u)
        if len(reference_image_urls) >= _MAX_REFERENCE_IMAGES:
            break

    # 2. Instagram feed images — add up to 18 to supplement website images
    ig_added = 0
    for u in (instagram_data.get("feed_image_urls") or []):
        if ig_added >= 18:
            break
        if _add_image(u):
            ig_added += 1

    logger.info(
        "reference_images_collected",
        website=len(reference_image_urls) - ig_added,
        instagram=ig_added,
        total=len(reference_image_urls),
    )

    # Deep Instagram intelligence via GPT-4o — runs only when captions available
    instagram_intelligence: dict[str, Any] = {}
    captions_for_llm = instagram_data.get("recent_captions", [])
    if captions_for_llm and settings.openai_api_key:
        try:
            instagram_intelligence = await _analyze_instagram_captions_llm(
                captions=captions_for_llm,
                posts_detail=instagram_data.get("posts_detail", []),
                engagement_stats=instagram_data.get("engagement_stats", {}),
                brand_name=profile.get("brand_name") or instagram_data.get("full_name") or "",
                openai_api_key=settings.openai_api_key,
            )
            logger.info(
                "instagram_llm_analysis_done",
                handle=instagram_handle,
                themes=len(instagram_intelligence.get("content_themes", [])),
            )
        except Exception as _e:
            logger.warning("instagram_llm_analysis_failed", error=str(_e))

    return {
        "analysis_text": analysis_text,
        "website": website_data,
        "instagram": instagram_data,
        "google_business": google_data,
        "tripadvisor_reviews": tripadvisor_data,
        "location_posts": location_posts_data,
        "competitor_instagram_profiles": competitor_instagram_data,
        "top_hashtags": instagram_data.get("top_hashtags", []),
        "inferred_tone": inferred_tone,
        "inferred_language": inferred_language,
        "reference_image_urls": reference_image_urls,
        "website_intelligence": website_data.get("website_intelligence"),
        "instagram_intelligence": instagram_intelligence,
        "report": {
            "brand_name": (
                profile.get("brand_name")
                or website_data.get("inferred_brand_name")
                or google_data.get("name")
                or instagram_data.get("full_name")
                or website_data.get("title", "")
            ),
            "industry": industry,
            "playbook_id": playbook.id,
            "target_audience": target_audience,
            "brand_tone": inferred_tone,
            "visual_style": visual_style,
            "primary_goals": primary_goals,
            "content_pillars": content_pillars,
            "default_ctas": default_ctas,
            "template_needs": template_needs,
            "asset_recommendations": asset_recommendations,
            "missing_questions": missing_questions,
            "website_summary": _build_clean_website_summary(website_data, instagram_data, google_data),
            "preferred_channels": playbook.preferred_channels,
            "risk_rules": risk_rules_for_industry(industry),
            "approval_required_for": playbook.approval_required_for,
        },
    }


async def _empty_dict() -> dict[str, Any]:
    return {}


def infer_industry(text: str, fallback: str = "") -> str:
    """Infer the sector/industry from combined scraped text.

    Priority order (highest first):
    1. Production company (2+ strong signals) — always overrides stale fallback
    2. Local / artisan food products (2+ signals)
    3. Beauty & personal care (≥1 signal)
    4. Fashion & clothing (≥1 signal)
    5. Bakery / patisserie (≥1 signal, not ambiguous café)
    6. Jewelry (≥1 specific signal)
    7. Fitness / gym (≥1 signal)
    8. fallback — respect previously saved industry for ambiguous cases
    9. Standard patterns: coffee, beach_club, restaurant, hotel, healthcare, agency
    10. general_business (default)

    Fallback is intentionally placed AFTER strong brand-specific signals so that
    a mis-classified brand can be corrected when the website/Instagram clearly
    signals a different sector on re-analysis.
    """
    blob = text.lower()

    # ── 1. Production / creative studio — strongest override ─────────────
    production_signals = [
        "production", "prodüksiyon", "post production", "post-production",
        "video production", "film production", "cinematic", "commercial",
        "artist management", "casting", "location scouting", "art buying",
        "production management", "production development", "digital content production",
        "creative studio", "content studio", "videography",
    ]
    production_hits = sum(1 for w in production_signals if w in blob)
    if production_hits >= 2:
        return "production_company"

    # ── 2. Local / artisan food products ─────────────────────────────────
    # Must run BEFORE restaurant patterns because food product shops can
    # mention "menü", "ürünler", "sipariş" — same words restaurants use.
    local_product_signals = [
        "yöresel", "yoresel", "zeytinyağı", "zeytinyagi", "zeytin yağı",
        "bal ", "badem", "incir", "pekmez", "reçel", "turşu", "peynir",
        "doğal ürün", "dogal urun", "köy ürün", "koy urun",
        "el yapımı gıda", "artisan food", "local product", "local food",
        "organik ürün", "organik gida", "hasat", "üretici",
        "sızma", "naturel", "doğal bal", "kuru meyve",
    ]
    local_product_hits = sum(1 for w in local_product_signals if w in blob)
    if local_product_hits >= 2:
        return "local_products_shop"
    if any(w in blob for w in [
        "yöresel ürün", "yoresel urun", "köy ürünleri", "koy urunleri",
        "zeytinyağı fabrika", "zeytinyagi fabrika", "sızma zeytinyağı",
        "lokum", "türk lokumu", "kuruyemiş", "baharat dükkan",
        "organik market", "çiftlik ürün", "zeytinyağı üretim",
        "bal üretim", "arıcılık", "manav", "aktariye",
    ]):
        return "local_products_shop"

    # ── 3. Beauty & personal care ─────────────────────────────────────────
    # Covers nail salon, spa, hair salon, barber, aesthetics.
    # Runs BEFORE restaurant check (beauty sites also mention "fiyat", "menü").
    beauty_signals = [
        "tırnak", "tirnak", "nail", "manikür", "manikyur", "manicure",
        "pedikür", "pedikyur", "pedicure", "kalıcı oje", "kali oje",
        "nail art", "nail studio", "nail salon", "tırnak bakım", "tırnak tasarım",
        "protez tırnak", "jel tırnak", "spa", "güzellik salonu", "guzellik salonu",
        "güzellik merkezi", "estetik salon", "hair salon", "kuaför", "kuafor",
        "berber", "epilasyon", "lazer epilasyon", "cilt bakım", "cilt bakimi",
        "massage", "masaj", "beauty salon", "beauty center", "aesthetics", "estetisyen",
        "microblading", "lash", "ipek kirpik", "kaş tasarım", "kas tasarim",
        "dermatoloji", "dermatolojik bakım",
    ]
    if sum(1 for w in beauty_signals if w in blob) >= 1:
        return "beauty_wellness"

    # ── 4. Fashion & clothing ─────────────────────────────────────────────
    # Boutique, fashion store, clothing brand — before generic fallback.
    fashion_signals = [
        "fashion", "moda", "giyim", "kıyafet", "kiyafet", "koleksiyon",
        "clothing", "apparel", "boutique", "modacı", "tasarımcı giyim",
        "triko", "kazak", "aksesuar", "şık", "women's clothing", "men's clothing",
        "haute couture", "pret-a-porter", "prêt-à-porter", "sezon koleksiyonu",
        "yeni sezon", "ilkbahar koleksiyonu", "sonbahar koleksiyonu",
        "mağaza", "magaza", "giysi", "elbise", "pantolon", "bluz",
    ]
    fashion_hits = sum(1 for w in fashion_signals if w in blob)
    # Require 2 signals to avoid false positives (e.g. "koleksiyon" alone in a jeweler)
    if fashion_hits >= 2:
        return "fashion_retail"
    # Or a single high-confidence phrase
    if any(w in blob for w in [
        "fashion boutique", "clothing store", "giyim mağaza", "giyim markası",
        "women's fashion", "men's fashion", "fashion brand", "moda markası",
        "butik giyim", "moda evi",
    ]):
        return "fashion_retail"

    # ── 5. Bakery / patisserie ────────────────────────────────────────────
    bakery_signals = [
        "pastane", "fırın", "firin", "ekmek", "börek", "borek",
        "patisserie", "pâtisserie", "bakery", "cake shop", "pasta dükkan",
        "taze ekmek", "çörek", "corek", "simit", "kurabiye",
        "donut", "kruvasan", "croissant", "danish",
    ]
    if any(w in blob for w in bakery_signals):
        # Prevent coffee_shop from being overridden by "pastane" alone in a café
        # that also serves pastries — require the bakery signal to be dominant.
        # A plain café would also have kahve/espresso/latte; a real bakery wouldn't.
        coffee_words = {"coffee", "kahve", "latte", "espresso", "kafe", "roastery"}
        has_coffee = any(w in blob for w in coffee_words)
        if not has_coffee:
            return "bakery_patisserie"
        # Both coffee and bakery signals → treat as café_bakery
        return "cafe_bakery"

    # ── 6. Jewelry ────────────────────────────────────────────────────────
    jewelry_signals = [
        "mücevher", "mucevher", "jewelry", "jewellery", "kuyumcu",
        "pırlanta", "pirlanta", "altın takı", "altin taki", "gümüş takı",
        "gumus taki", "elmas", "diamond", "yüzük", "nişan yüzüğü",
        "kolye", "bileklik", "küpe", "mücevherat",
    ]
    if any(w in blob for w in jewelry_signals):
        return "jewelry_accessories"

    # ── 7. Fitness / gym ──────────────────────────────────────────────────
    fitness_signals = [
        "gym", "spor salonu", "fitness center", "personal training",
        "crossfit", "pilates studio", "yoga stüdyo", "yoga studio",
        "antrenman", "personal trainer", "egzersiz", "spor merkezi",
    ]
    if any(w in blob for w in fitness_signals):
        return "fitness"

    # ── 8. Respect stale fallback for all remaining ambiguous signals ─────
    # Strong sector-specific keywords above can now override a stale value.
    # Everything below this point is lower-confidence pattern matching.
    if fallback:
        return fallback

    # ── 9. Standard patterns ──────────────────────────────────────────────
    if any(w in blob for w in ["coffee", "kahve", "latte", "espresso", "cafe", "kafe", "roastery"]):
        return "coffee_shop"

    # Beach club — exact phrases first, then multi-signal loose check
    if any(w in blob for w in ["beach club", "beach bar", "pool club", "plaj kulüb", "pool party",
                                "gece kulübü", "dj set", "dj night"]):
        return "beach_club"
    # Require at least 2 loose signals to avoid e.g. a hotel with "beach" view being classified here.
    # "rezervasyon" alone is NOT enough — restaurants use it too.
    beach_loose = sum(1 for w in ["beach", "plaj", "havuz", "pool", "club", "dj",
                                   "sunset bar", "açık hava bar", "open air"] if w in blob)
    if beach_loose >= 2:
        return "beach_club"
    # hospitality_entertainment only when combined nightlife signals appear
    hospitality_hits = sum(1 for w in ["sunset bar", "open bar", "dj", "club", "beach", "plaj"] if w in blob)
    if hospitality_hits >= 1 and any(w in blob for w in ["rezervasyon", "reservation"]):
        return "hospitality_entertainment"

    if any(w in blob for w in ["handmade", "el yap", "seramik", "takı", "craft", "atölye"]):
        return "handmade_product_brand"
    if any(w in blob for w in ["sahne", "organizasyon", "event plann"]):
        return "production_company"
    if any(w in blob for w in ["pizza", "burger", "restaurant", "restoran", "chef", "şef",
                                "mutfak", "yemek menüsü", "masa rezervasyon", "sofra"]):
        return "restaurant"
    # "menü" alone is NOT a restaurant signal — service businesses use it for price lists too
    if any(w in blob for w in ["hotel", "otel", "suite", "konaklama", "resort"]):
        return "hospitality"
    if any(w in blob for w in ["psikolog", "terapist", "terapi", "psikoterapi", "klinik", "doktor", "clinic"]):
        return "healthcare_clinic"
    if any(w in blob for w in ["avukat", "hukuk", "law firm", "danışmanlık", "consulting"]):
        return "agency_services"
    return "general_business"


def infer_content_pillars(text: str, industry: str) -> list[str]:
    blob = f"{text} {industry}".lower()

    # Industry-specific defaults take priority — use playbook pillars directly
    from app.crew.industry_playbooks import normalize_industry_id, get_industry_playbook
    normalized = normalize_industry_id(industry)
    playbook = get_industry_playbook(normalized)
    if normalized in ("local_products_shop", "beach_club", "ecommerce_retail", "beauty_wellness"):
        return playbook.default_content_needs[:6]

    # For other industries, build from text signals
    pillars = ["daily_story"]
    if any(w in blob for w in ["event", "dj", "workshop", "lansman", "etkinlik", "organizasyon"]):
        pillars.append("event_announcement")
    if any(w in blob for w in ["product", "ürün", "menu", "menü", "collection", "koleksiyon", "coffee", "kahve"]):
        pillars.append("menu_share" if ("menu" in blob or "menü" in blob or "restaurant" in blob or "coffee" in blob) else "product_highlight")
    if any(w in blob for w in ["discount", "kampanya", "offer", "indirim", "reservation", "rezervasyon"]):
        pillars.append("campaign_offer")
    if any(w in blob for w in ["behind", "atölye", "production", "prodüksiyon", "ekip", "mutfak", "sahne"]):
        pillars.append("behind_the_scenes")
    if any(w in blob for w in ["review", "yorum", "testimonial", "müşteri"]):
        pillars.append("social_proof")
    if any(w in blob for w in ["how", "nasıl", "ipucu", "guide", "education", "eğitim"]):
        pillars.append("educational_post")
    return list(dict.fromkeys(pillars))[:6]


def infer_primary_goals(text: str, industry: str) -> list[str]:
    blob = f"{text} {industry}".lower()
    goals: list[str] = ["awareness"]
    if any(w in blob for w in ["reservation", "rezervasyon", "booking", "randevu"]):
        goals.append("reservation")
    if any(w in blob for w in ["shop", "satış", "order", "sipariş", "store", "ürün"]):
        goals.append("sales")
    if any(w in blob for w in ["community", "topluluk", "club", "üyelik"]):
        goals.append("community")
    return goals[:4]


def infer_template_needs(content_pillars: list[str]) -> list[str]:
    mapping = {
        "daily_story": "generic_story",
        "event_announcement": "event_announcement_story",
        "product_showcase": "product_showcase_post",
        "offer_campaign": "offer_campaign_post",
        "behind_the_scenes": "behind_the_scenes_story",
        "social_proof": "generic_story",
        "educational_post": "generic_instagram_post",
    }
    return list(dict.fromkeys(mapping.get(pillar, "generic_instagram_post") for pillar in content_pillars))


def infer_asset_recommendations(content_pillars: list[str]) -> list[str]:
    assets = ["logo", "brand_background"]
    if "product_highlight" in content_pillars or "menu_share" in content_pillars:
        assets.append("product_image")
    if "event_announcement" in content_pillars:
        assets.extend(["event_image", "artist_photo"])
    if "behind_the_scenes" in content_pillars:
        assets.append("team_or_process_photo")
    return list(dict.fromkeys(assets))


def infer_default_ctas(primary_goals: list[str], industry: str, language: str = "tr") -> list[str]:
    lang = (language or "tr").split(",")[0].strip().lower()
    if lang == "en":
        if "reservation" in primary_goals:
            return ["Book now", "Reserve your spot"]
        if "sales" in primary_goals:
            return ["Explore now", "Order now"]
        if "community" in primary_goals:
            return ["Join us", "Follow us"]
        if "coffee" in industry:
            return ["Try today", "View menu"]
        return ["Learn more", "Get in touch"]
    if "reservation" in primary_goals:
        return ["Rezervasyon Yap", "Yerini Ayırt"]
    if "sales" in primary_goals:
        return ["Hemen İncele", "Sipariş Ver"]
    if "community" in primary_goals:
        return ["Bize Katıl", "Takip Et"]
    if "coffee" in industry:
        return ["Bugün Dene", "Menüyü Gör"]
    return ["Detayları İncele", "İletişime Geç"]


def infer_visual_style(text: str, tone: str) -> str:
    blob = f"{text} {tone}".lower()
    styles: list[str] = []
    if any(w in blob for w in ["premium", "luxury", "exclusive", "lüks"]):
        styles.append("premium, elegant, high-contrast")
    if any(w in blob for w in ["warm", "family", "sıcak", "samimi"]):
        styles.append("warm, natural, people-first")
    if any(w in blob for w in ["minimal", "modern", "design"]):
        styles.append("minimal, modern, clean layout")
    if any(w in blob for w in ["energetic", "dj", "party", "dynamic", "canlı"]):
        styles.append("energetic, vibrant, motion-friendly")
    return "; ".join(styles) or "brand-led, clean, social-first visuals"


def infer_target_audience(text: str, industry: str) -> list[str]:
    blob = f"{text} {industry}".lower()
    if "coffee" in blob or "kafe" in blob:
        return ["yerel kahve severler", "uzaktan çalışanlar", "mahalle müşterileri"]
    if "beach" in blob or "dj" in blob or "club" in blob:
        return ["tatilciler", "etkinlik ve müzik takipçileri", "rezervasyon odaklı misafirler"]
    if "handmade" in blob or "el yap" in blob:
        return ["tasarım ve el işi ürün meraklıları", "hediye arayan müşteriler"]
    if "production" in blob or "prodüksiyon" in blob:
        return ["marka yöneticileri", "event organizatörleri", "kurumsal müşteriler"]
    return ["mevcut müşteriler", "potansiyel müşteriler", "yerel takipçiler"]


def infer_missing_questions(
    website_url: str,
    instagram_handle: str,
    google_business_url: str,
    content_pillars: list[str],
) -> list[str]:
    questions: list[str] = []
    if not website_url:
        questions.append("Web sitesi veya katalog linki var mı?")
    if not instagram_handle:
        questions.append("Instagram profil URL veya kullanıcı adı nedir?")
    if "campaign_offer" in content_pillars:
        questions.append("Fiyat/indirim paylaşımı yapılabilir mi?")
    if "event_announcement" in content_pillars:
        questions.append("Etkinliklerde tarih, saat ve rezervasyon linki hangi kaynaktan alınacak?")
    if not google_business_url:
        questions.append("Google Business veya Maps linki var mı?")
    return questions[:5]
