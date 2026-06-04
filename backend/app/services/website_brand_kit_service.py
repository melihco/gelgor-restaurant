"""
Extract typography and color tokens from a brand website homepage HTML.

Used during website crawl (analyze_brand) and on-demand enrichment so
Marka Detayı Tipografi / Renkler fields can be auto-filled.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any
from urllib.parse import unquote

import structlog

from app.services.brand_theme_service import SAFE_FONTS

logger = structlog.get_logger()

# Generic stacks — not brand fonts
_FONT_SKIP = frozenset({
    "inherit", "initial", "unset", "sans-serif", "serif", "monospace",
    "system-ui", "system", "arial", "helvetica", "helvetica neue",
    "times", "times new roman", "georgia", "verdana", "tahoma",
    "apple color emoji", "segoe ui", "blinkmacsystemfont",
    "-apple-system", "ui-sans-serif", "ui-serif",
})

# Noise hex colors on the web
_HEX_SKIP = frozenset({
    "#ffffff", "#fff", "#000000", "#000", "#111111", "#222222",
    "#333333", "#444444", "#555555", "#666666", "#777777", "#888888",
    "#999999", "#aaaaaa", "#bbbbbb", "#cccccc", "#dddddd", "#eeeeee",
    "#f5f5f5", "#fafafa", "#f8f8f8", "#e5e5e5", "#d1d5db",
})

_CSS_VAR_COLOR_KEYS = re.compile(
    r"(?:--|var\()(?:primary|brand|accent|main|theme|color-primary|color-accent|"
    r"heading|body|text|foreground|background-brand)[\w-]*",
    re.IGNORECASE,
)

_GOOGLE_FONTS_RE = re.compile(
    r"fonts\.(?:googleapis|gstatic)\.com[^\"']*family=([^&\"']+)",
    re.IGNORECASE,
)

_FONT_FACE_RE = re.compile(
    r"@font-face\s*\{[^}]*font-family\s*:\s*['\"]?([^;'\"]+)",
    re.IGNORECASE,
)

_FONT_FAMILY_RE = re.compile(
    r"font-family\s*:\s*([^;}{]+)",
    re.IGNORECASE,
)

_HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{3}){1,2}\b")

_THEME_COLOR_META = re.compile(
    r'<meta[^>]+name=["\']theme-color["\'][^>]+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)


def _expand_hex(hex_raw: str) -> str | None:
    h = hex_raw.strip().lower()
    if not h.startswith("#"):
        return None
    if len(h) == 4:
        h = "#" + "".join(c * 2 for c in h[1:])
    if len(h) != 7:
        return None
    if h in _HEX_SKIP:
        return None
    return h


def _luminance(hex7: str) -> float:
    r = int(hex7[1:3], 16) / 255
    g = int(hex7[3:5], 16) / 255
    b = int(hex7[5:7], 16) / 255
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _saturation(hex7: str) -> float:
    r = int(hex7[1:3], 16) / 255
    g = int(hex7[3:5], 16) / 255
    b = int(hex7[5:7], 16) / 255
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == 0:
        return 0.0
    return (mx - mn) / mx


_FONT_NOISE_RE = re.compile(
    r"icon|icons|swiper|material|glyph|fontawesome|w01-|w02-|din-next|"
    r"helvetica-neue|sans-serif|serif$|variable",
    re.IGNORECASE,
)


_FONT_ALIASES: dict[str, str] = {
    "geist": "Inter",
    "geist fallback": "Inter",
    "geist mono": "Inter",
    "geist mono fallback": "Inter",
    "bodoni moda": "Playfair Display",
    "bodoni moda fallback": "Playfair Display",
    "open sans": "Nunito",
    "roboto": "Inter",
    "oxygen": "Inter",
    "ubuntu": "Inter",
    "cantarell": "Inter",
    "font awesome 6 free": "",
    "font awesome 5 brands": "",
    "font awesome 5 free": "",
}


def _normalize_font_candidate(raw: str) -> str | None:
    name = raw.strip().strip('"\'').split(",")[0].strip()
    if not name or name.lower() in _FONT_SKIP:
        return None
    if _FONT_NOISE_RE.search(name):
        return None
    alias = _FONT_ALIASES.get(name.lower())
    if alias is not None:
        return alias or None
    # Title-case common Google Font names
    for safe in SAFE_FONTS:
        if safe.lower() == name.lower():
            return safe
    # Partial: "Playfair" → Playfair Display
    for safe in SAFE_FONTS:
        if name.lower() in safe.lower() or safe.lower().startswith(name.lower()):
            return safe
    # Allow unknown if looks like a real family (2+ chars, letters)
    if re.match(r"^[A-Za-z][A-Za-z0-9\s\-]{1,40}$", name) and len(name) >= 4:
        return name[:64]
    return None


def _parse_google_fonts_families(fragment: str) -> list[str]:
    families: list[str] = []
    for part in unquote(fragment).split("|"):
        part = part.strip()
        if not part:
            continue
        family = part.split(":")[0].replace("+", " ").strip()
        norm = _normalize_font_candidate(family)
        if norm:
            families.append(norm)
    return families


def _collect_fonts(html: str) -> list[str]:
    found: list[str] = []

    for m in _GOOGLE_FONTS_RE.finditer(html):
        found.extend(_parse_google_fonts_families(m.group(1)))

    for m in _FONT_FACE_RE.finditer(html):
        norm = _normalize_font_candidate(m.group(1))
        if norm:
            found.append(norm)

    for m in _FONT_FAMILY_RE.finditer(html):
        for part in m.group(1).split(","):
            norm = _normalize_font_candidate(part)
            if norm:
                found.append(norm)

    # Dedupe preserve order
    seen: set[str] = set()
    ordered: list[str] = []
    for f in found:
        key = f.lower()
        if key not in seen:
            seen.add(key)
            ordered.append(f)
    return ordered


_BRAND_VAR_HEX = re.compile(
    r"(?:primary|brand|accent|main|theme)[\w-]*\s*[:=]\s*['\"]?(#[0-9a-fA-F]{6})",
    re.IGNORECASE,
)


def _collect_hex_colors(html: str) -> list[str]:
    colors: list[str] = []

    for m in _BRAND_VAR_HEX.finditer(html):
        expanded = _expand_hex(m.group(1))
        if expanded:
            colors.insert(0, expanded)

    tm = _THEME_COLOR_META.search(html)
    if tm:
        expanded = _expand_hex(tm.group(1).strip())
        if expanded:
            colors.append(expanded)

    for m in _HEX_RE.finditer(html):
        expanded = _expand_hex(m.group(0))
        if expanded:
            colors.append(expanded)

    # CSS custom properties with hex values nearby
    for block in re.findall(r"--[\w-]+\s*:\s*([^;]+);", html, re.IGNORECASE):
        for hx in _HEX_RE.findall(block):
            expanded = _expand_hex(hx)
            if expanded:
                colors.append(expanded)

    return colors


def _hue(hex7: str) -> float:
    r = int(hex7[1:3], 16) / 255
    g = int(hex7[3:5], 16) / 255
    b = int(hex7[5:7], 16) / 255
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == mn:
        return 0.0
    d = mx - mn
    if mx == r:
        h = (g - b) / d + (6 if g < b else 0)
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return (h / 6) * 360


def _is_cool_primary(hx: str) -> bool:
    lum = _luminance(hx)
    sat = _saturation(hx)
    hue = _hue(hx)
    return 0.08 < lum < 0.55 and sat > 0.15 and 175 <= hue <= 245


def _is_brand_primary(hx: str) -> bool:
    lum = _luminance(hx)
    sat = _saturation(hx)
    hue = _hue(hx)
    if lum > 0.62 and (hue < 35 or sat < 0.45):
        return False
    return 0.08 < lum < 0.72 and sat > 0.2


def _is_warm_accent(hx: str) -> bool:
    lum = _luminance(hx)
    sat = _saturation(hx)
    hue = _hue(hx)
    return lum > 0.35 and sat > 0.35 and (25 <= hue <= 55 or 15 <= hue <= 25)


def _pick_palette(hexes: list[str]) -> tuple[str | None, str | None]:
    if not hexes:
        return None, None
    counts = Counter(hexes)
    ranked = [hx for hx, _ in counts.most_common(16)]

    primary: str | None = None
    accent: str | None = None

    for hx in ranked:
        if _is_cool_primary(hx):
            primary = hx
            break
    if not primary:
        for hx in ranked:
            if _is_brand_primary(hx):
                primary = hx
                break

    for hx in ranked:
        if hx == primary:
            continue
        if hx.lower() in ("#fbbf24", "#f5a623", "#ffc107"):
            accent = hx
            break
    if not accent:
        for hx in ranked:
            if hx == primary:
                continue
            if _is_warm_accent(hx):
                accent = hx
                break

    if not accent:
        for hx in ranked:
            if hx == primary:
                continue
            if _saturation(hx) >= 0.4 and _luminance(hx) > 0.4:
                accent = hx
                break

    if not primary:
        for hx in ranked:
            if _luminance(hx) < 0.75:
                primary = hx
                break
    if not primary and ranked:
        primary = ranked[0]
    if not accent:
        for hx in ranked:
            if hx != primary:
                accent = hx
                break
    if not accent and primary:
        accent = primary

    return primary, accent


def _stylesheet_hrefs(html: str, base_url: str) -> list[str]:
    from urllib.parse import urljoin
    hrefs: list[str] = []
    for m in re.finditer(
        r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    ):
        hrefs.append(urljoin(base_url, m.group(1)))
    for m in re.finditer(
        r'<link[^>]+href=["\']([^"\']+\.css[^"\']*)["\'][^>]+rel=["\']stylesheet["\']',
        html,
        re.IGNORECASE,
    ):
        hrefs.append(urljoin(base_url, m.group(1)))
    return hrefs[:6]


async def fetch_brand_kit_from_website(url: str) -> dict[str, Any]:
    """Fetch homepage + linked CSS for richer font/color detection (SPA / Next.js)."""
    import httpx

    url = (url or "").strip()
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    }
    combined_html = ""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=headers) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return extract_brand_kit_from_html("", url)
            combined_html = resp.text
            for css_url in _stylesheet_hrefs(combined_html, str(resp.url)):
                try:
                    css_resp = await client.get(css_url)
                    if css_resp.status_code < 400 and "text" in css_resp.headers.get("content-type", "text/css"):
                        combined_html += "\n" + css_resp.text[:80_000]
                except Exception:
                    continue
    except Exception as exc:
        logger.warning("fetch_brand_kit_http_failed", url=url, error=str(exc)[:120])
        return extract_brand_kit_from_html("", url)

    return extract_brand_kit_from_html(combined_html, url)


def extract_brand_kit_from_html(html: str, page_url: str = "") -> dict[str, Any]:
    """
    Parse homepage HTML for heading/body fonts and primary/accent hex colors.
    Returns empty strings when nothing reliable is found.
    """
    if not html or len(html) < 200:
        return {
            "heading_font": "",
            "body_font": "",
            "primary_color": "",
            "accent_color": "",
            "source_url": page_url,
            "confidence": 0,
        }

    fonts = _collect_fonts(html)
    hexes = _collect_hex_colors(html)
    primary, accent = _pick_palette(hexes)

    heading = fonts[0] if fonts else ""
    body = fonts[1] if len(fonts) > 1 else (fonts[0] if fonts and fonts[0] != heading else "")

    # If only one font, body defaults to Inter when heading is serif-like
    if heading and not body:
        serif_hints = ("playfair", "cormorant", "libre baskerville", "lora", "fraunces", "dm serif")
        body = "Inter" if any(s in heading.lower() for s in serif_hints) else "DM Sans"

    confidence = 0
    if heading:
        confidence += 35
    if body:
        confidence += 25
    if primary:
        confidence += 25
    if accent and accent != primary:
        confidence += 15

    kit = {
        "heading_font": heading,
        "body_font": body,
        "primary_color": primary or "",
        "accent_color": accent or "",
        "source_url": page_url,
        "confidence": min(100, confidence),
        "fonts_detected": fonts[:6],
        "colors_detected": list(dict.fromkeys(hexes))[:8],
    }

    logger.info(
        "website_brand_kit_extracted",
        url=page_url[:80] if page_url else "",
        heading=heading,
        body=body,
        primary=primary,
        accent=accent,
        confidence=kit["confidence"],
    )
    return kit


def attach_brand_kit_to_website_result(result: dict[str, Any], homepage_html: str) -> None:
    """Mutates website fetch result with brand_kit when HTML is available."""
    if not homepage_html:
        return
    kit = extract_brand_kit_from_html(homepage_html, result.get("url", ""))
    if kit.get("confidence", 0) > 0:
        result["brand_kit"] = kit
