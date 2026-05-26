"""
Graphic Design Intelligence Service — 3 farklı tasarım konsepti paralel üretir.

Ajans yaklaşımı: aynı video için birden fazla layout konsepti sun, kullanıcı seçsin.

3 Tasarım Dili:
  MINIMAL  — tek metin, sıfır overlay, "kendiliğinden lüks"
  EDITORIAL— magazin dili, beklenmedik pozisyon, çizgi + boşluk
  IMPACT   — güçlü kontrast, sert hiyerarşi, sahneleri ele geçiren

Her konsept kendi GPT-4o art director personas'ına sahip → gerçekten farklı çıktılar.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any

import httpx
import structlog

from app.services.creatomate_service import BrandTemplate, VideoPackInput

logger = structlog.get_logger()


# ── Tasarım dilleri ────────────────────────────────────────────────────────────

@dataclass
class DesignStyle:
    key: str           # "minimal" | "editorial" | "impact"
    label: str         # Kullanıcıya gösterilen isim
    description: str   # Ne tür içerikler için
    persona: str       # GPT-4o system prompt
    temperature: float = 0.25


DESIGN_STYLES: list[DesignStyle] = [
    DesignStyle(
        key="minimal",
        label="Minimal",
        description="Lüks, sade, ürün ve mekan içerikleri için",
        temperature=0.15,
        persona="""You are the art director of a luxury Scandinavian design studio.
Your signature: maximum negative space, single typographic statement, zero clutter.

ABSOLUTE RULES for MINIMAL style:
- Elements: video + 1 text ONLY. Never more than 2 elements total.
- No overlay shapes, no gradient rectangles. The video speaks for itself.
- Text sits in the natural empty/dark zone of the footage — find it.
- Font: light weight (300) or bold (700) — never medium.
- font_size: 90-110px for reel/story/event, 36px for feed brand name.
- UPPERCASE, letter_spacing: 6-8px minimum.
- Text color: pure white #ffffff or ivory #f5f0e8 — never brand color on text.
- NO animation on text. Appear instantly at 0s. Stillness = confidence.
- feed format: brand name only, 36px, bottom center, opacity 0.55. Nothing else.
- teaser: video element ONLY. Absolute silence.
- x/y positions: find the empty zone. Usually top-right quarter or bottom third.
  If image is dark at bottom → text_y = 88%. If dark at top → text_y = 14%.

Example reel elements: [video, {text: "TITLE", y:"87%", font_size:100, font_weight:"300"}]
Example story elements: [video, {text: "TITLE", y:"85%", font_size:85, font_weight:"700"}]""",
    ),

    DesignStyle(
        key="editorial",
        label="Editorial",
        description="Kültürel, marka hikayeleri, etkinlik duyuruları için",
        temperature=0.30,
        persona="""You are the creative director of a premium editorial magazine (think Kinfolk, Monocle).
Your signature: asymmetry, unexpected text placement, thin accent lines as punctuation.

ABSOLUTE RULES for EDITORIAL style:
- Elements: video + 1 text + 1 thin accent line shape. Maximum 3 total.
- The accent line: width "25-40%", height "0.18%", placed 12-18px below the text.
  Color: brand accent color. This IS the signature element.
- Text: LEFT-ALIGNED, not centered. x position: "22%" (flush left with margin).
- Font: mixed — use italic variant if available: font_style: "italic" for editorial feel.
- font_size: 80-95px for reel, 68-78px for story.
- Case: SENTENCE CASE (first letter caps, rest lowercase). NOT all caps.
- letter_spacing: 1-2px (editorial, not billboard).
- Text placement: VERTICAL CENTER or upper third — not bottom (that's amateur).
  text_y for reel: 40-55%. For story: 35-50%.
- Gradient: very subtle, only if text zone is bright. Max opacity 0.25.
- teaser: video + accent line (no text, just the line as brand signature).
- feed: video + left-aligned brand name + accent line. x: "18%", y: "88%".
- event: date as thin text above title (font_size: 36, weight: 300, tracking: 4).

Example reel elements: [video, subtle_gradient?, {text:"Title", x:"22%", y:"45%", text_align:"left"}, {shape:line, x:"22%", y:"52%", width:"30%"}]""",
    ),

    DesignStyle(
        key="impact",
        label="Impact",
        description="Etkinlikler, kampanyalar, yüksek enerji içerikler için",
        temperature=0.20,
        persona="""You are the art director of a bold creative agency (think Wieden+Kennedy, BETC).
Your signature: strong visual hierarchy, deliberate contrast, typography that dominates.

ABSOLUTE RULES for IMPACT style:
- Elements: video + gradient + 1 text. Maximum 3.
- Gradient: strong, half the screen. Direction: bottom or top based on content.
  Gradient fill_color: "linear-gradient(to bottom, transparent, rgba(R,G,B,0.75))"
  Use brand primary color for RGB values. Height: "55%".
- Text: CENTERED, UPPERCASE, full boldness (font_weight: "900" or "800").
- font_size: 95-120px for reel hero. 78-88px for story. GO BIG.
- letter_spacing: 3-5px.
- Text position: CENTERED in the gradient zone. If gradient is bottom → text_y: 80-88%.
- Add a subtle fade-in animation: {"time":0.4,"duration":0.9,"easing":"ease-out","type":"text-slide","direction":"up"}
- teaser: video + small accent rectangle bottom center (width:30%, height:0.3%) + NO text.
- feed: video + full-bottom gradient (height 40%) + text centered y:88%, font_size:52.
- event: date pill (accent color filled shape, border_radius:50) ABOVE title, date font_size:42.
  Title font_size:88. Both centered. Strong gradient behind.

Example reel elements: [video, {gradient shape, y:50%, height:50%}, {text:"TITLE",y:83%,font_size:110,font_weight:"900",animation}]""",
    ),
]


# ── Creatomate şema referansı ───────────────────────────────────────────────────

_SCHEMA = """
CREATOMATE JSON RULES (strict):
- output_format: "mp4"
- width/height: integers
- duration: float
- elements: array — order matters (later = on top)
- Element positions: percentage strings "50%", "20%", "88%" — always strings
- font_size: INTEGER (pixels, not string, not "vh")
- fill_color: "#ffffff" or "rgba(r,g,b,a)" or gradient string
- gradient: "linear-gradient(to bottom, transparent, rgba(10,10,10,0.7))"
- opacity: float 0.0-1.0 (on element, not in fill_color)
- letter_spacing: integer pixels
- font_weight: STRING "300","400","600","700","800","900"
- text_align: "left"|"center"|"right"
- x/y = CENTER point of element
- fit for video: "cover"
- Video element ALWAYS first in elements array
- Replace video source with exactly: "__VIDEO_URL__"
"""


def _sanitize_composition(comp: dict, video_duration: float = 5.0) -> dict:
    """
    AI çıktısını Creatomate API'sinin beklediği formata düzelt.
    Bilinen sorunları giderir:
    - duration → video süresiyle eşleştir (siyah kuyruk yok)
    - video element eksik x/y/width/height → tam ekran default
    - type:"rectangle" → type:"shape", shape:"rectangle"
    - animation (tekil) → animations (dizi)
    - shape:"line" → shape:"rectangle" (line desteklenmiyor)
    - loop eksikse ekle
    """
    import copy
    comp = copy.deepcopy(comp)

    # Kompozisyon süresini video süresiyle senkronize et
    comp["duration"] = video_duration

    fixed_elements = []
    for el in comp.get("elements", []):
        el_type = el.get("type", "")

        # Video element düzeltmeleri
        if el_type == "video":
            el.setdefault("x", "50%")
            el.setdefault("y", "50%")
            el.setdefault("width", "100%")
            el.setdefault("height", "100%")
            el.setdefault("fit", "cover")
            el.setdefault("volume", 0)
            el["loop"] = True  # Her zaman loop — video süresi = kompozisyon süresi ama loop güvenlik

        # type:"rectangle" → type:"shape", shape:"rectangle"
        if el_type == "rectangle":
            el["type"] = "shape"
            el["shape"] = "rectangle"

        # shape element: "line" desteklenmiyor → ince rectangle
        if el_type == "shape" and el.get("shape") == "line":
            el["shape"] = "rectangle"
            if not el.get("height"):
                el["height"] = "0.18%"

        # animation (tekil dict) → animations (dizi)
        if "animation" in el and "animations" not in el:
            anim = el.pop("animation")
            el["animations"] = [anim] if isinstance(anim, dict) else anim

        # font_size string kontrolü — bazı modeller "72px" veya "72 vh" üretiyor
        if "font_size" in el:
            fs = el["font_size"]
            if isinstance(fs, str):
                # "72px" → 72, "72 vh" → 72
                import re
                m = re.match(r"(\d+)", str(fs))
                el["font_size"] = int(m.group(1)) if m else 72

        fixed_elements.append(el)

    comp["elements"] = fixed_elements
    return comp


async def _generate_one_style(
    inp: VideoPackInput,
    style: DesignStyle,
    formats: list[str],
    openai_api_key: str,
) -> dict[str, dict]:
    """Tek bir tasarım stili için tüm formatların kompozisyonlarını üret."""

    b = inp.brand
    spec = inp.visual_spec

    visual_ctx = ""
    if spec:
        visual_ctx = f"""
Source image analysis:
- Text safe zone: {getattr(spec, 'text_zone', 'bottom')}
- Image tone: {getattr(spec, 'visual_tone', 'dark')} (dark=text without overlay, light=need overlay)
- Recommended opacity: {getattr(spec, 'overlay_opacity', 0.30):.0%}
- Dominant colors: {', '.join(getattr(spec, 'dominant_colors', [b.primary_color])[:2])}
- Director note: {getattr(spec, 'analysis_summary', '')}
"""

    dims = {
        "reel": (1080, 1920, 15), "story": (1080, 1920, 8),
        "feed": (1080, 1080, 8), "event": (1080, 1920, 8), "teaser": (1080, 1920, 3),
    }

    formats_str = "\n".join(
        f"  {f}: {dims[f][0]}x{dims[f][1]}, {dims[f][2]}s"
        for f in formats if f in dims
    )

    prompt = f"""Design Creatomate compositions for {style.label.upper()} style.

Brand: {b.tenant_name or 'Brand'}
Primary color: {b.primary_color}
Accent color: {b.accent_color}
Font: {b.font_family}
Logo: {b.logo_url or 'none — do not add image element'}

Content title: {inp.title[:55]}
Event date: {inp.event_date or 'none'}
{visual_ctx}

Formats to design:
{formats_str}

{_SCHEMA}

Return ONLY this JSON structure (no comments, no markdown):
{{
  "reel": {{"output_format":"mp4","width":1080,"height":1920,"duration":15,"elements":[...]}},
  "story": {{"output_format":"mp4","width":1080,"height":1920,"duration":8,"elements":[...]}},
  "feed": {{"output_format":"mp4","width":1080,"height":1080,"duration":8,"elements":[...]}},
  "event": {{"output_format":"mp4","width":1080,"height":1920,"duration":8,"elements":[...]}},
  "teaser": {{"output_format":"mp4","width":1080,"height":1920,"duration":3,"elements":[...]}}
}}

Include only the formats requested: {formats}
Use "__VIDEO_URL__" as video source string."""

    try:
        async with httpx.AsyncClient(timeout=50) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {openai_api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o",
                    "messages": [
                        {"role": "system", "content": style.persona},
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 4000,
                    "temperature": style.temperature,
                    "response_format": {"type": "json_object"},
                },
            )
            r.raise_for_status()

        raw = r.json()["choices"][0]["message"]["content"].strip()
        data = json.loads(raw)

        # Video URL placeholder'ı gerçek URL ile değiştir
        data_str = json.dumps(data).replace("__VIDEO_URL__", inp.video_url)
        compositions: dict[str, dict] = json.loads(data_str)

        result = {f: compositions[f] for f in formats if f in compositions}
        logger.info("design_style_generated", style=style.key, formats=list(result.keys()),
                    tenant=inp.tenant_id)
        return result

    except Exception as exc:
        logger.warning("design_style_failed", style=style.key, error=str(exc))
        return {}


async def generate_all_style_variants(
    inp: VideoPackInput,
    formats: list[str],
    openai_api_key: str,
    styles: list[str] | None = None,
) -> dict[str, dict[str, dict]]:
    """
    3 tasarım stilini paralel üret.

    Döndürür:
    {
      "minimal":  {"reel": {...}, "story": {...}, ...},
      "editorial": {"reel": {...}, "story": {...}, ...},
      "impact":   {"reel": {...}, "story": {...}, ...},
    }
    """
    selected = [s for s in DESIGN_STYLES if (styles is None or s.key in styles)]

    tasks = {
        style.key: asyncio.create_task(
            _generate_one_style(inp, style, formats, openai_api_key)
        )
        for style in selected
    }

    results: dict[str, dict[str, dict]] = {}
    for style_key, task in tasks.items():
        try:
            results[style_key] = await task
        except Exception as exc:
            logger.warning("style_variant_failed", style=style_key, error=str(exc))
            results[style_key] = {}

    return results


async def render_style_variants(
    inp: VideoPackInput,
    creatomate_api_key: str,
    openai_api_key: str,
    formats: list[str],
    styles: list[str] | None = None,
    wait_for_completion: bool = True,
) -> dict[str, list]:
    """
    3 stili paralel tasarla ve Creatomate'e gönder.

    Döndürür: {style_key: [VideoPackResult, ...]}
    """
    from app.services.creatomate_service import (
        _FORMAT_BUILDERS, _FORMAT_DIMS, VideoPackResult,
        _submit_render, _poll_render, _apply_audio,
    )

    # ── 1. Tüm stil variantlarını paralel üret
    all_variants = await generate_all_style_variants(inp, formats, openai_api_key, styles)

    # Video süresi: Runway gen4_turbo her zaman 5s üretir
    video_duration = 5.0

    # ── 2. Her stil + format için Creatomate'e gönder (hepsi paralel)
    async with httpx.AsyncClient() as client:
        submit_map: dict[tuple[str, str], asyncio.Task] = {}

        for style_key, compositions in all_variants.items():
            for fmt, comp in compositions.items():
                if not comp:
                    builder = _FORMAT_BUILDERS.get(fmt)
                    comp = builder(inp) if builder else None
                if comp:
                    # AI çıktısını sanitize et, ardından müzik ekle
                    comp = _sanitize_composition(comp, video_duration)
                    comp = _apply_audio(comp, inp)
                    task = asyncio.create_task(_submit_render(creatomate_api_key, comp, client))
                    submit_map[(style_key, fmt)] = task

        # Render ID'leri topla
        render_id_map: dict[tuple[str, str], str] = {}
        for (style_key, fmt), task in submit_map.items():
            try:
                obj = await task
                rid = obj.get("id", "")
                render_id_map[(style_key, fmt)] = rid
                logger.info("variant_submitted", style=style_key, format=fmt, render_id=rid)
            except Exception as exc:
                logger.warning("variant_submit_failed", style=style_key, format=fmt, error=str(exc))

        if not wait_for_completion:
            result: dict[str, list] = {s.key: [] for s in DESIGN_STYLES if styles is None or s.key in styles}
            for (style_key, fmt), rid in render_id_map.items():
                w, h = _FORMAT_DIMS.get(fmt, (1080, 1920))
                result.setdefault(style_key, []).append(VideoPackResult(
                    format=fmt, status="pending", render_id=rid, width=w, height=h,
                ))
            return result

        # ── 3. Poll hepsi paralel
        poll_map: dict[tuple[str, str], asyncio.Task] = {
            (sk, fmt): asyncio.create_task(_poll_render(creatomate_api_key, rid, client))
            for (sk, fmt), rid in render_id_map.items() if rid
        }

        style_results: dict[str, list] = {}
        for (style_key, fmt), poll_task in poll_map.items():
            try:
                data = await poll_task
                w, h = _FORMAT_DIMS.get(fmt, (1080, 1920))
                r = VideoPackResult(
                    format=fmt,
                    status=data.get("status", "unknown"),
                    render_id=data.get("id", ""),
                    output_url=data.get("url", ""),
                    width=w, height=h,
                    duration=data.get("duration", 0.0),
                    error=data.get("error_message", "") if data.get("status") == "failed" else "",
                )
                style_results.setdefault(style_key, []).append(r)
                logger.info("variant_rendered", style=style_key, format=fmt,
                            status=data.get("status"), tenant=inp.tenant_id)
            except Exception as exc:
                w, h = _FORMAT_DIMS.get(fmt, (1080, 1920))
                style_results.setdefault(style_key, []).append(VideoPackResult(
                    format=fmt, status="failed", width=w, height=h, error=str(exc),
                ))

        return style_results


# Geriye dönük uyumluluk — eski endpoint bunu kullanıyordu
async def render_with_design_ai(
    inp: VideoPackInput,
    api_key: str,
    openai_api_key: str,
    formats: list[str],
    wait_for_completion: bool = True,
) -> list:
    """Eski endpoint için: sadece 'minimal' stili döndür."""
    results = await render_style_variants(
        inp, api_key, openai_api_key, formats,
        styles=["minimal"],
        wait_for_completion=wait_for_completion,
    )
    return results.get("minimal", [])
