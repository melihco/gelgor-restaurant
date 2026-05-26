"""
Apify-powered scrapers for brand discovery.

Replaces the fragile public-API scrapers in brand_analyzer.py with
reliable Apify actors that handle:
  - Instagram: real post data, engagement, images (no OAuth needed)
  - Website: JavaScript-rendered sites, multi-page crawl
  - Google Maps/Business: name, category, address, rating, reviews

Each function mirrors the return shape of the original fetch_* functions
so brand_analyzer.py can swap them in without changes downstream.

Fallback: if Apify is disabled or the API key is missing, returns an empty
dict with raw_fetch_ok=False so the rest of the pipeline degrades gracefully.
"""

from __future__ import annotations

import asyncio
import re
from collections import Counter
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

# Apify Run-Sync endpoint — starts an actor, waits for it, returns dataset items.
_APIFY_BASE = "https://api.apify.com/v2"


async def _run_actor(
    actor_id: str,
    input_json: dict,
    api_key: str,
    timeout: int = 60,
) -> list[dict]:
    """
    Start an Apify actor synchronously and return its dataset items.
    Returns [] on any error so callers always get a safe result.
    """
    url = f"{_APIFY_BASE}/acts/{actor_id}/run-sync-get-dataset-items"
    params = {"token": api_key}
    try:
        async with httpx.AsyncClient(timeout=timeout + 10) as client:
            resp = await client.post(
                url,
                params=params,
                json=input_json,
                timeout=timeout,
            )
            # 200 = completed inline, 201 = accepted + dataset returned
            if resp.status_code in (200, 201):
                data = resp.json()
                # Some actors wrap items in {"data": [...]}
                if isinstance(data, dict) and "data" in data:
                    data = data["data"]
                return data if isinstance(data, list) else []
            logger.warning(
                "apify_actor_error",
                actor=actor_id,
                status=resp.status_code,
                body=resp.text[:200],
            )
    except Exception as exc:
        logger.warning("apify_actor_failed", actor=actor_id, error=str(exc))
    return []


# ── Instagram ─────────────────────────────────────────────────────────────────

async def fetch_instagram_apify(handle: str, api_key: str, timeout: int = 60) -> dict[str, Any]:
    """
    Fetch Instagram profile + recent posts via Apify.
    Returns the same shape as the original fetch_instagram_profile().
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
        "source": "apify",
    }

    items = await _run_actor(
        "apify~instagram-profile-scraper",
        {
            "usernames": [handle],
            "resultsLimit": 20,
        },
        api_key=api_key,
        timeout=timeout,
    )

    if not items:
        return result

    profile = items[0]

    result["bio"] = profile.get("biography") or profile.get("bio") or ""
    result["full_name"] = profile.get("fullName") or profile.get("full_name") or ""
    result["follower_count"] = profile.get("followersCount") or profile.get("followers_count")
    result["post_count"] = profile.get("postsCount") or profile.get("posts_count")
    result["raw_fetch_ok"] = True

    # Recent posts — Apify returns them nested under latestPosts or posts
    posts = profile.get("latestPosts") or profile.get("posts") or []
    captions: list[str] = []
    all_hashtags: list[str] = []
    image_urls: list[str] = []

    for post in posts[:20]:
        caption = post.get("caption") or post.get("text") or ""
        if caption:
            captions.append(caption[:400])
            all_hashtags.extend(re.findall(r"#\w+", caption))

        for img_key in ("displayUrl", "imageUrl", "thumbnailUrl", "display_url"):
            img = post.get(img_key)
            if isinstance(img, str) and img.startswith("http"):
                image_urls.append(img.split("?")[0])
                break

    result["recent_captions"] = captions[:8]

    tag_counts = Counter(all_hashtags)
    result["top_hashtags"] = [t for t, _ in tag_counts.most_common(15)]

    seen: set[str] = set()
    result["feed_image_urls"] = [u for u in image_urls if not (u in seen or seen.add(u))][:18]  # type: ignore[func-returns-value]

    # Infer posting style from bio + captions
    all_text = " ".join([result["bio"]] + captions).lower()
    if any(w in all_text for w in ["her gün", "daily", "günlük"]):
        result["posting_style"] = "daily posts"
    elif any(w in all_text for w in ["haftalık", "weekly"]):
        result["posting_style"] = "weekly posts"

    logger.info(
        "apify_instagram_ok",
        handle=handle,
        posts=len(posts),
        hashtags=len(result["top_hashtags"]),
        images=len(result["feed_image_urls"]),
    )
    return result


# ── Website ───────────────────────────────────────────────────────────────────

async def _fetch_sitemap_urls(base_domain: str, timeout: int = 15) -> list[str]:
    """
    Fetch sitemap — handles both flat sitemaps and sitemap indexes (WordPress/WooCommerce).

    Priority order for crawl start URLs:
      1. Product category pages  (/urun-kategori/, /category/, /shop/)
      2. About / info pages      (/about-us/, /hakkimizda/, /about/)
      3. Contact page
      4. Individual product pages (up to 5 for product name extraction)

    Also tries homepage link extraction if sitemap is missing/blocked.
    """
    SITEMAP_PATHS = ["/sitemap.xml", "/wp-sitemap.xml", "/sitemap_index.xml"]

    SKIP = re.compile(
        r"(/cart|/checkout|/sepet|/odeme|/login|/register|/hesabim|/account"
        r"|/wp-admin|/wp-json|/wp-login|/feed$|/feed/|/tag/|/author/"
        r"|/page/\d+|/\?p=\d|/comments"
        r"|\.jpg|\.jpeg|\.png|\.gif|\.webp|\.svg|\.ico|\.pdf|\.zip|\.xml$"
        r"|\.css$|\.js$|/assets/css/|/assets/js/)",
        re.IGNORECASE,
    )

    # Score URLs: higher = crawl first
    def score_url(u: str) -> int:
        p = u.lower().rstrip("/")
        # Product categories (most valuable — show full product catalog)
        if re.search(r"/(urun-kategori|product_cat|urun-kategori)", p):                  return 100
        # About / company info (valuable for brand analysis)
        if re.search(r"/(about|hakkimizda|about-us|hakkinda|biz-kimiz|hakkimizdak)", p): return 90
        # Store main page
        if re.search(r"/(magaza|shop|store|urunler|products)$", p):                      return 80
        # Gallery / photography pages (critical for permanent venue photos)
        if re.search(r"/(galeri|gallery|foto|photos?)(?:\.html?|/)?$", p):               return 85
        if re.search(r"/(galeri|gallery|foto|photos?)/", p):                             return 85
        # Contact
        if re.search(r"/(contact|iletisim|contact-us)$", p):                             return 60
        # Individual product pages (good for product names/descriptions)
        if re.search(r"/(urun|product)/[^/]+$", p):                                      return 30
        # Generic WordPress categories (/category/xxx) — low value unless brand-specific
        if re.search(r"/category/", p):                                                   return 5
        return 10

    all_urls: list[str] = []

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True,
                                  headers={"User-Agent": "Mozilla/5.0 (compatible; SmartAgencyBot/1.0)"}) as client:

        # ── Step 1: Try sitemap ───────────────────────────────────────────
        for path in SITEMAP_PATHS:
            try:
                r = await client.get(f"{base_domain}{path}")
                if r.status_code != 200:
                    continue

                locs = re.findall(r"<loc>(https?://[^<]+)</loc>", r.text)
                if not locs:
                    continue

                # Detect sitemap index (contains .xml sub-sitemaps)
                sub_sitemaps = [l for l in locs if l.endswith(".xml") and base_domain in l]
                page_urls    = [l for l in locs if not l.endswith(".xml")]

                if sub_sitemaps:
                    # Sitemap index — fetch sub-sitemaps
                    logger.info("sitemap_index_found", domain=base_domain, subs=len(sub_sitemaps))
                    for sub in sub_sitemaps:
                        # Skip users, cms_block, feed sitemaps
                        if re.search(r"(user|cms_block|feed|post-1\.xml)", sub, re.IGNORECASE):
                            continue
                        try:
                            rs = await client.get(sub)
                            if rs.status_code == 200:
                                sub_locs = re.findall(r"<loc>(https?://[^<]+)</loc>", rs.text)
                                page_urls.extend(sub_locs)
                        except Exception:
                            continue
                else:
                    logger.info("sitemap_flat_found", domain=base_domain, urls=len(page_urls))

                all_urls.extend(page_urls)
                break   # sitemap found

            except Exception:
                continue

        # ── Step 2: Homepage link extraction (always, complements sitemap) ─
        try:
            r = await client.get(base_domain + "/")
            hrefs = re.findall(r'href=["\']([^"\']+)["\']', r.text)
            for href in hrefs:
                href = href.strip()
                if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
                    continue
                if href.startswith("http"):
                    full = href
                elif href.startswith("/"):
                    full = f"{base_domain}{href}"
                else:
                    full = f"{base_domain}/{href}"
                if base_domain in full and full not in all_urls:
                    all_urls.append(full)
        except Exception:
            pass

    # ── Filter + deduplicate + rank ───────────────────────────────────────
    seen: set[str] = set()
    ranked: list[tuple[int, str]] = []
    for u in all_urls:
        u = u.strip().rstrip("/")
        if u in seen or SKIP.search(u):
            continue
        if not u.startswith(base_domain):
            continue
        seen.add(u)
        ranked.append((score_url(u), u))

    ranked.sort(key=lambda x: x[0], reverse=True)

    # Return: all high-priority URLs + limit individual products to 8
    result: list[str] = []
    product_count = 0
    for s, u in ranked:
        if s <= 30:   # individual product pages
            if product_count >= 8:
                continue
            product_count += 1
        result.append(u)
        if len(result) >= 25:
            break

    logger.info("sitemap_discovery_complete", domain=base_domain,
                total_found=len(ranked), selected=len(result),
                top_urls=[u for _, u in ranked[:3]])
    return result


def _is_js_rendered_url(url: str) -> bool:
    """
    Detect if a URL is likely a JS-rendered (SPA) page that requires a headless browser.
    Returns True for known SPA platforms and URLs with JS-heavy signals.
    """
    SPA_PATTERNS = re.compile(
        r"(view\.qrall\.co|menu\.qrall|qrmenu\.|digitalmenu\.|menulog\.|getmenu\.|"
        r"menufy\.|toasttab\.|squareup\.com/menu|bentobox\.|tripleseat\.|"
        r"bodrumturunc|turunc\.com|"
        r"#/menu|/app/menu|/digital-menu|/online-menu)",
        re.IGNORECASE,
    )
    return bool(SPA_PATTERNS.search(url))


def _detect_spa_from_html(html: str) -> bool:
    """Detect React/Next/Vue/Nuxt SPAs from homepage HTML markers."""
    if not html:
        return False
    markers = (
        "__NEXT_DATA__", "id=\"__nuxt\"", "data-reactroot", "ng-version=",
        "window.__NUXT__", "vite/client", "webpackJsonp", "__remixContext",
    )
    return any(m in html for m in markers)


async def _fetch_homepage_html(url: str, base_domain: str) -> tuple[str, list[str]]:
    """
    Fetch homepage HTML and discover menu/category internal links.
    Returns (html, discovered_urls).
    """
    from app.services.website_intelligence_service import discover_internal_urls

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    }
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=headers) as client:
            r = await client.get(url)
            if r.status_code >= 400:
                return "", []
            html = r.text
            discovered = discover_internal_urls(html, str(r.url), base_domain)
            return html, discovered
    except Exception as exc:
        logger.debug("homepage_prefetch_failed", url=url, error=str(exc))
        return "", []


async def _extract_images_from_url_direct(url: str, base_domain: str) -> list[str]:
    """
    Directly fetch a URL and extract all image URLs from raw HTML.
    Handles lazy-load (data-src, data-lazy, srcset), JSON-LD, og:image, CSS backgrounds.
    """
    from app.crew.brand_analyzer import extract_image_urls_from_html
    import httpx as _httpx

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        "Referer": base_domain + "/",
    }
    try:
        async with _httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers) as client:
            r = await client.get(url)
            # Accept 4xx/5xx only if response contains HTML with images (SPA pattern)
            # Some SPA frameworks return 500 on SSR errors but still include page content
            content_type = r.headers.get("content-type", "")
            if r.status_code >= 400:
                is_html = "html" in content_type or r.text.strip().startswith("<!") or "<html" in r.text[:500].lower()
                # Check entire body for images — some SPAs embed image URLs near the end
                has_images = bool(re.search(r'\.(?:jpg|jpeg|png|webp)', r.text))
                if not (is_html and has_images):
                    return []
                logger.debug("accepting_error_page_with_images", url=url, status=r.status_code)
            imgs = extract_image_urls_from_html(r.text, url)

            # Also extract image URLs from JSON blobs in the page (API responses, SSR data)
            json_img_pattern = re.compile(
                r'"(?:url|src|image|photo|thumbnail|cover|background|imageUrl|imgUrl|photoUrl)"'
                r'\s*:\s*"(https?://[^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"',
                re.IGNORECASE,
            )
            from app.crew.brand_analyzer import _probably_photo_url
            for m in json_img_pattern.finditer(r.text):
                candidate = m.group(1).split("?")[0]
                if _probably_photo_url(candidate) and candidate not in imgs:
                    imgs.append(candidate)

            return imgs
    except Exception:
        return []


async def fetch_website_apify(url: str, api_key: str, timeout: int = 90) -> dict[str, Any]:
    """
    Deep website crawl via Apify Website Content Crawler.

    Strategy:
      1. Detect if URL is JS-rendered (SPA) → use playwright; else cheerio
      2. Fetch sitemap.xml — extract product/category/about URLs directly
      3. Merge with known priority paths (/urunler, /hakkimizda, /shop…)
      4. Crawl up to 20 pages, score by content richness
      5. Parallel direct HTML fetch for maximum image coverage
      6. Combines all text into a brand intelligence blob (up to 20K chars)
    """
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    from urllib.parse import urlparse as _urlparse
    parsed_url = _urlparse(url)
    base_domain = f"{parsed_url.scheme}://{parsed_url.netloc}".rstrip("/")

    result: dict[str, Any] = {
        "url": url,
        "title": "",
        "description": "",
        "keywords": [],
        "text_snippet": "",
        "links": [],
        "image_urls": [],
        "raw_fetch_ok": False,
        "source": "apify",
    }

    # ── Phase 1: Discover URLs from sitemap ───────────────────────────────
    sitemap_urls = await _fetch_sitemap_urls(base_domain)

    # ── Phase 2: Fallback priority paths (if sitemap empty/blocked) ───────
    PRIORITY_PATHS = [
        "/galeri.html", "/gallery.html", "/galeri", "/gallery", "/photos", "/foto",
        "/urunler", "/products", "/shop", "/magaza",
        "/hakkimizda", "/about", "/about-us",
        "/hizmetler", "/services",
        "/iletisim", "/contact",
        "/menu",
        "/koleksiyon",
        "/urun-kategori",
    ]

    # Build start URLs: homepage + sitemap URLs + fallback priority paths
    seen_urls: set[str] = {url}
    start_urls = [{"url": url}]

    for su in sitemap_urls[:12]:    # sitemap URLs first (more reliable)
        if su not in seen_urls:
            seen_urls.add(su)
            start_urls.append({"url": su})

    if len(start_urls) < 6:         # if sitemap gave few URLs, add fallbacks
        for path in PRIORITY_PATHS:
            candidate = f"{base_domain}{path}"
            if candidate not in seen_urls:
                seen_urls.add(candidate)
                start_urls.append({"url": candidate})
            if len(start_urls) >= 10:
                break

    # ── Phase 3: Homepage prefetch — discover menu category URLs ───────────
    homepage_html, discovered_links = await _fetch_homepage_html(url, base_domain)
    menu_heavy = len(discovered_links) >= 3
    for link in discovered_links[:25]:
        if link not in seen_urls:
            seen_urls.add(link)
            start_urls.append({"url": link})

    # Auto-detect JS-rendered / digital menu sites — use playwright
    js_site = (
        _is_js_rendered_url(url)
        or _detect_spa_from_html(homepage_html)
        or menu_heavy
    )
    crawler_type = "playwright:adaptive" if js_site else "cheerio"
    crawl_timeout = timeout + 60 if js_site else timeout
    max_pages = 40 if menu_heavy else 20
    max_depth = 2 if menu_heavy else 1

    logger.info("website_crawl_start", domain=base_domain,
                start_urls=len(start_urls), sitemap_found=bool(sitemap_urls),
                discovered_menu_links=len(discovered_links),
                crawler_type=crawler_type, js_site=js_site, menu_heavy=menu_heavy)

    actor_input: dict = {
        "startUrls": start_urls[:35],
        "maxCrawlPages": max_pages,
        "crawlerType": crawler_type,
        "maxCrawlDepth": max_depth,
        "honourRobotsTxt": True,
        "excludeUrlGlobs": [
            "**/*.pdf", "**/*.zip", "**/*.svg",
            "**/cart*", "**/sepet*", "**/checkout*", "**/odeme*",
            "**/login*", "**/register*", "**/hesabim*", "**/account*",
            "**/wp-admin*", "**/wp-json*", "**/wp-login*",
            "**/?add-to-cart*", "**/wishlist*", "**/compare*",
        ],
    }
    if js_site:
        # Playwright: wait for images to load, return rendered HTML so we can extract images
        actor_input["waitForSelector"] = "img"
        actor_input["saveHtml"] = True  # get full rendered DOM with all lazy-loaded images

    items = await _run_actor(
        "apify~website-content-crawler",
        actor_input,
        api_key=api_key,
        timeout=crawl_timeout,
    )

    if not items:
        return result

    result["raw_fetch_ok"] = True

    # ── HTML entity decoding helper ───────────────────────────────────────
    import html as _html

    def clean_text(raw: str) -> str:
        text = _html.unescape(raw)
        # Remove repeated whitespace/newlines
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        return text.strip()

    # ── Score and rank pages by content richness ──────────────────────────
    PRODUCT_KEYWORDS = re.compile(
        r"(ürün|product|fiyat|price|₺|\$|€|satın|buy|sepet|cart|"
        r"hakkımızda|about|hizmet|service|menü|menu|koleksiyon|collection)",
        re.IGNORECASE,
    )
    NAV_NOISE = re.compile(
        r"^(login|register|wishlist|cart|checkout|skip to|menu \d|"
        r"0 items|₺ 0,00|search \d)",
        re.IGNORECASE | re.MULTILINE,
    )
    # Lines that are minified JS, tracking code, or machine-generated content
    JS_NOISE = re.compile(
        r"(!function\(|function\(\w,\w|var \w=function|module\.exports|"
        r"__webpack_|_sentryDebugIds|gtag\(|dataLayer\.push|"
        r"googletag\.|fbq\(|analytics\.track|"
        r"\\u[0-9a-f]{4}|\\x[0-9a-f]{2}|"  # unicode/hex escapes = minified JS
        r"\.prototype\.|typeof window|typeof global|"
        r"try\{var [a-z]=|catch\([a-z]\)\{)",
        re.IGNORECASE,
    )

    scored_pages: list[tuple[int, str, str]] = []  # (score, title, text)
    crawled_pages: list[dict[str, Any]] = []

    import html as _html

    for page in items:
        page_url = page.get("url", "")
        title = (page.get("title") or "").strip()
        raw = (page.get("text") or page.get("markdown") or "").strip()

        # Extract images from rendered HTML (playwright saveHtml mode)
        rendered_html = page.get("html") or page.get("rawHtml") or ""
        page_imgs: list[str] = []
        if rendered_html:
            try:
                from app.crew.brand_analyzer import extract_image_urls_from_html
                page_imgs = extract_image_urls_from_html(rendered_html, page_url)
                result["image_urls"].extend(page_imgs)
            except Exception:
                pass

        crawled_pages.append({
            "url": page_url,
            "title": title,
            "text": raw,
            "html": rendered_html,
            "image_urls": page_imgs,
        })

        if not raw or len(raw) < 50:
            continue

        # Decode HTML entities (₺ &#8378; → ₺, &amp; → &, etc.)
        decoded = _html.unescape(raw)

        # Remove nav/UI noise AND minified JS/tracking lines
        clean_lines = [
            ln for ln in decoded.split("\n")
            if (
                not NAV_NOISE.match(ln.strip())
                and not JS_NOISE.search(ln)
                and len(ln.strip()) > 10
                and len(ln.strip()) < 2000  # single lines >2000 chars are almost always minified JS
            )
        ]
        page_text = "\n".join(clean_lines)

        # Skip pages that are mostly JS (< 15% real text after cleaning)
        if len(decoded) > 500 and len(page_text) < len(decoded) * 0.15:
            logger.debug("skipping_js_heavy_page", url=page_url, ratio=len(page_text)/len(decoded))
            continue

        if not page_text.strip():
            continue

        # Score: more product/brand content = higher score
        score = len(PRODUCT_KEYWORDS.findall(page_text))
        score += len(page_text) // 200
        for path in PRIORITY_PATHS:
            if path in page_url.lower():
                score += 15
                break

        scored_pages.append((score, title, page_text[:5000]))

        # Collect images from Apify's screenshotUrl (if present)
        for img in page.get("screenshots", []) or []:
            if isinstance(img, str) and img.startswith("http"):
                result["image_urls"].append(img)

    # ── Extract images via direct HTML fetch (always, not just as fallback) ─────
    # Apify crawler returns text — fetch raw HTML ourselves to get ALL image signals:
    # lazy-load (data-src), srcset, JSON-LD blobs, og:image, CSS backgrounds.
    # Run in parallel with a generous URL list (sitemap + priority paths + gallery hints).
    try:
        import asyncio as _ai
        gallery_hint_urls = []
        for hint in ("galeri", "gallery", "photos", "foto", "menu", "yemekler", "drinks", "bar"):
            for suffix in ("", ".html", ".htm", ".php"):
                cand = f"{base_domain}/{hint}{suffix}"
                if cand not in seen_urls:
                    gallery_hint_urls.append(cand)

        all_img_urls_to_fetch = list(
            {su["url"] for su in start_urls[:30]} | set(gallery_hint_urls[:12]) | set(discovered_links[:20])
        )
        img_batches = await _ai.gather(*[
            _extract_images_from_url_direct(pu, base_domain)
            for pu in all_img_urls_to_fetch
        ], return_exceptions=True)

        for batch in img_batches:
            if isinstance(batch, list):
                result["image_urls"].extend(batch)

        logger.info("direct_image_fetch_done", domain=base_domain,
                    pages=len(all_img_urls_to_fetch),
                    total_imgs=len(result["image_urls"]))
    except Exception as exc:
        logger.warning("image_extraction_failed", error=str(exc))

    # Sort by score, highest first
    scored_pages.sort(key=lambda x: x[0], reverse=True)

    if not scored_pages:
        # Visual-heavy sites can have little usable text while still exposing
        # many permanent photos. Preserve those images for brand references.
        seen_imgs: set[str] = set()
        dedup_imgs: list[str] = []
        for u in result["image_urls"]:
            k = u.split("?")[0].lower()
            if k not in seen_imgs:
                seen_imgs.add(k)
                dedup_imgs.append(u.split("?")[0])
        result["image_urls"] = dedup_imgs
        from app.services.website_intelligence_service import build_website_intelligence
        build_website_intelligence(
            url, result,
            homepage_html=homepage_html,
            crawled_pages=crawled_pages,
        )
        result["crawled_pages"] = crawled_pages
        return result

    # Use highest-scored page for title/description
    _, best_title, best_text = scored_pages[0]
    result["title"] = best_title[:160]

    # Extract description from best page
    for line in best_text.split("\n"):
        line = line.strip()
        if len(line) > 80 and not line.startswith("#"):
            result["description"] = line[:500]
            break

    # Combine all page texts — up to 20K chars total
    combined_parts = [text for _, _, text in scored_pages]
    combined = "\n\n---\n\n".join(combined_parts)
    result["text_snippet"] = combined[:20_000]

    # Keyword extraction from full combined text
    words = re.findall(r"\b[a-zA-ZğüşıöçĞÜŞİÖÇ]{4,}\b", combined.lower())
    stop = {
        "this", "that", "with", "from", "have", "için", "olan", "veya",
        "ile", "daha", "olan", "gibi", "kadar", "sonra", "önce", "bize",
        "bizim", "bizde", "sizi", "sizin", "ürün", "ürünler",
    }
    word_counts = Counter(w for w in words if w not in stop)
    result["keywords"] = [w for w, _ in word_counts.most_common(25)]

    # Deduplicate image URLs
    seen_imgs: set[str] = set()
    dedup_imgs: list[str] = []
    for u in result["image_urls"]:
        k = u.split("?")[0].lower()
        if k not in seen_imgs:
            seen_imgs.add(k)
            dedup_imgs.append(u.split("?")[0])
    result["image_urls"] = dedup_imgs

    logger.info(
        "apify_website_deep_crawl",
        url=url,
        pages_crawled=len(items),
        pages_scored=len(scored_pages),
        total_chars=len(combined),
        images=len(dedup_imgs),
        top_keywords=result["keywords"][:5],
    )

    from app.services.website_intelligence_service import build_website_intelligence
    build_website_intelligence(
        url, result,
        homepage_html=homepage_html,
        crawled_pages=crawled_pages,
    )
    result["crawled_pages"] = crawled_pages
    return result


# ── Google Trends ─────────────────────────────────────────────────────────────

async def fetch_google_trends(
    keywords: list[str],
    api_key: str,
    geo: str = "TR",
    timeout: int = 60,
) -> list[dict]:
    """
    Fetch Google Trends interest data for given keywords via Apify.
    Returns list of {keyword, interestOverTime, relatedQueries} dicts.
    """
    if not keywords:
        return []
    items = await _run_actor(
        "apify/google-trends-scraper",
        {
            "searchTerms": keywords[:5],
            "geo": geo,
            "timeRange": "now 30-d",
        },
        api_key=api_key,
        timeout=timeout,
    )
    return items or []


# ── Tripadvisor Reviews ────────────────────────────────────────────────────────

async def fetch_tripadvisor_reviews(
    business_name: str,
    location: str,
    api_key: str,
    timeout: int = 90,
    max_reviews: int = 20,
) -> list[dict]:
    """
    Fetch Tripadvisor reviews for a venue via Apify.
    Returns list of {rating, text, date, language} dicts.
    """
    query = f"{business_name} {location}"
    items = await _run_actor(
        "maxcopell/tripadvisor-reviews",
        {
            "query": query,
            "maxReviews": max_reviews,
            "language": "all",
        },
        api_key=api_key,
        timeout=timeout,
    )
    results = []
    for item in (items or []):
        text = item.get("text") or item.get("reviewText") or item.get("review") or ""
        rating = item.get("rating") or item.get("ratingValue") or item.get("bubbleRating")
        if text:
            results.append({
                "text": text[:300],
                "rating": rating,
                "date": item.get("publishedDate") or item.get("date") or "",
                "language": item.get("language") or "",
            })
    return results


# ── Instagram Location Posts ───────────────────────────────────────────────────

async def fetch_instagram_location_posts(
    location_query: str,
    api_key: str,
    timeout: int = 60,
    max_posts: int = 20,
) -> list[dict]:
    """
    Fetch recent Instagram posts tagged at a location via Apify.
    Returns list of {caption, hashtags, likes, timestamp} dicts.
    """
    items = await _run_actor(
        "patient_discovery/instagram-location-posts",
        {
            "searchString": location_query,
            "maxResults": max_posts,
        },
        api_key=api_key,
        timeout=timeout,
    )
    results = []
    for item in (items or [])[:max_posts]:
        caption = item.get("caption") or item.get("text") or ""
        hashtags = re.findall(r"#\w+", caption.lower())
        results.append({
            "caption": caption[:200],
            "hashtags": hashtags[:10],
            "likes": item.get("likesCount") or item.get("likes") or 0,
            "timestamp": item.get("timestamp") or item.get("takenAt") or "",
        })
    return results


# ── Instagram Hashtag Analytics ────────────────────────────────────────────────

async def fetch_hashtag_analytics(
    hashtags: list[str],
    api_key: str,
    timeout: int = 60,
) -> list[dict]:
    """
    Fetch hashtag analytics (post count, posts/day, related hashtags) via Apify.
    Returns list of {hashtag, postCount, postsPerDay, relatedHashtags} dicts.
    """
    if not hashtags:
        return []
    items = await _run_actor(
        "apify/instagram-hashtag-analytics-scraper",
        {
            "hashtags": [h.lstrip("#") for h in hashtags[:10]],
        },
        api_key=api_key,
        timeout=timeout,
    )
    results = []
    for item in (items or []):
        tag = item.get("hashtag") or item.get("name") or ""
        if tag:
            results.append({
                "hashtag": f"#{tag}",
                "postCount": item.get("postCount") or item.get("mediaCount") or 0,
                "postsPerDay": item.get("postsPerDay") or 0,
                "relatedHashtags": item.get("relatedHashtags") or [],
            })
    return results


# ── Google Maps / Business ────────────────────────────────────────────────────

async def fetch_google_business_apify(url_or_name: str, api_key: str, timeout: int = 60) -> dict[str, Any]:
    """
    Fetch Google Business data via Apify's Google Maps Scraper.
    Returns the same shape as fetch_google_business_info() — but with
    category, description, address, rating, and review_count now populated.
    """
    result: dict[str, Any] = {
        "input": url_or_name,
        "name": "",
        "category": "",
        "description": "",
        "address": "",
        "rating": None,
        "review_count": None,
        "raw_fetch_ok": False,
        "source": "apify",
    }

    if not url_or_name:
        return result

    # Accept both full Maps URLs and plain business names/queries
    if url_or_name.startswith("http"):
        search_input = [{"url": url_or_name}]
    else:
        search_input = [{"searchString": url_or_name}]

    actor_input: dict = {"maxCrawledPlaces": 1, "language": "tr"}
    if url_or_name.startswith("http"):
        actor_input["startUrls"] = [{"url": url_or_name}]
    else:
        actor_input["searchStringsArray"] = [url_or_name]

    items = await _run_actor(
        "compass~crawler-google-places",
        actor_input,
        api_key=api_key,
        timeout=timeout,
    )

    if not items:
        return result

    place = items[0]
    result["name"] = place.get("title") or place.get("name") or ""
    result["category"] = place.get("category") or place.get("categoryName") or ""
    result["description"] = place.get("description") or place.get("editorialSummary") or ""
    result["address"] = place.get("address") or place.get("street") or ""
    result["rating"] = place.get("totalScore") or place.get("rating")
    result["review_count"] = place.get("reviewsCount") or place.get("reviewCount")
    result["raw_fetch_ok"] = bool(result["name"])

    logger.info(
        "apify_google_ok",
        name=result["name"],
        category=result["category"],
        rating=result["rating"],
    )
    return result
