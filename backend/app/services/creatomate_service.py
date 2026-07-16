"""
Creatomate Video Production Service — ajans kalitesinde branded video paketi.

Tek AI videosu (ham, overlay yok) alıp 5 format çıktısı üretir:
  1. Reel     9:16 · 15s  — Vision-guided minimal overlay + 1 satır başlık + ince accent çizgi
  2. Story    9:16 · 8s   — Logo top + tek kelime/kısa cümle bottom
  3. Feed     1:1 · 8s    — Square crop + sadece ince bottom accent bar + business name
  4. Event    9:16 · 8s   — Minimal tarih badge + başlık, sade tasarım
  5. Teaser   9:16 · 3s   — Sadece logo, hiçbir metin

Tasarım felsefesi (ajans standardı):
  - MAX 2 text element per composition
  - Overlay opacity: GPT-4o Vision analizine göre adaptif (%20-45)
  - Gradient: ince, yalnızca text okunabilirliği için
  - CTA: caption'a bırak, video üzerine metin doldurmak amatörlüktür
  - Logo: küçük, köşede, opak değil yarı şeffaf
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

_CREATOMATE_API = "https://api.creatomate.com/v1"


# ── Brand template & Input ─────────────────────────────────────────────────────

@dataclass
class BrandTemplate:
    primary_color: str = "#1a1a2e"
    accent_color: str = "#e8c97a"
    font_family: str = "Montserrat"
    overlay_opacity: float = 0.35        # Base opacity — vision analysis overrides this
    logo_url: str = ""
    tenant_name: str = ""


@dataclass
class VideoPackInput:
    video_url: str
    title: str
    cta: str = "Keşfet"
    subtitle: str = ""
    event_date: str = ""
    tenant_id: str = ""
    brand: BrandTemplate = field(default_factory=BrandTemplate)
    # Visual spec from GPT-4o Vision analysis — None means use brand defaults
    visual_spec: "Any | None" = None     # VisualSpec from visual_composition_service
    # Background music — royalty-free track URL (CC0), baked into the video by Creatomate
    music_url: str = ""
    music_volume: float = 0.55           # 0–1; 0.55 sits under dialogue/narration headroom


@dataclass
class VideoPackResult:
    format: str
    status: str
    render_id: str = ""
    output_url: str = ""
    width: int = 0
    height: int = 0
    duration: float = 0.0
    error: str = ""


# ── Helpers ────────────────────────────────────────────────────────────────────

def _rgba(hex_color: str, opacity: float) -> str:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r},{g},{b},{opacity:.2f})"


def _get_opacity(inp: VideoPackInput, fallback: float = 0.35) -> float:
    """Vision spec varsa onun opacity'sini kullan, yoksa brand default."""
    if inp.visual_spec and hasattr(inp.visual_spec, "overlay_opacity"):
        return inp.visual_spec.overlay_opacity
    return inp.brand.overlay_opacity or fallback


def _get_text_y(inp: VideoPackInput, fallback: float = 82.0) -> float:
    if inp.visual_spec and hasattr(inp.visual_spec, "text_y_percent"):
        return inp.visual_spec.text_y_percent
    return fallback


def _get_overlay_start(inp: VideoPackInput, fallback: float = 60.0) -> float:
    if inp.visual_spec and hasattr(inp.visual_spec, "overlay_start_y"):
        return inp.visual_spec.overlay_start_y
    return fallback


def _show_subtitle(inp: VideoPackInput) -> bool:
    """Sadece vision analizi max_text_lines=2 diyorsa ve subtitle varsa göster."""
    if not inp.subtitle:
        return False
    if inp.visual_spec and hasattr(inp.visual_spec, "max_text_lines"):
        return inp.visual_spec.max_text_lines >= 2
    return False  # default: minimal — 1 satır


def _audio_element(inp: VideoPackInput) -> dict | None:
    """Background music element — appended to every composition when music_url is set."""
    if not inp.music_url:
        return None
    return {
        "type": "audio",
        "source": inp.music_url,
        "volume": inp.music_volume,
        # Fade in 0.5s + fade out 0.8s for clean entry/exit
        "audio_fade_in": 0.5,
        "audio_fade_out": 0.8,
    }


def _logo_element(inp: VideoPackInput, position: str = "top_right") -> dict | None:
    """Logo elementini döndür, yoksa None."""
    # Vision spec logo_position="none" diyorsa ekleme
    if inp.visual_spec and getattr(inp.visual_spec, "logo_position", "") == "none":
        return None
    logo_url = inp.brand.logo_url
    if not logo_url:
        return None
    pos_map = {
        "top_right":    ("88%", "7%"),
        "top_left":     ("12%", "7%"),
        "bottom_right": ("88%", "93%"),
    }
    x, y = pos_map.get(position, ("88%", "7%"))
    return {
        "type": "image",
        "source": logo_url,
        "x": x, "y": y,
        "width": "14%", "height": "auto",
        "fit": "contain",
        "opacity": 0.80,
    }


# ── Composition Builders ───────────────────────────────────────────────────────

def _build_reel_composition(inp: VideoPackInput) -> dict[str, Any]:
    """
    Reel: 9:16 · 15s
    Ajans minimalizmi:
    - Tam ekran video (loop)
    - Vision-guided gradient: sadece okunabilirlik için, %30-45 opacity
    - 1 satır başlık — kısa, büyük, temiz
    - 3px ince accent çizgi (CTA butonu değil)
    - Küçük logo (opsiyonel)
    """
    b = inp.brand
    opacity = _get_opacity(inp, 0.38)
    text_y = _get_text_y(inp, 83.0)
    grad_start = _get_overlay_start(inp, 62.0)

    # Başlık: max 40 karakter, daha uzunsa kırp + "…"
    title = inp.title[:40].strip()
    if len(inp.title) > 40:
        title = inp.title[:37].strip() + "…"

    elements: list[dict] = [
        # ── Video
        {
            "type": "video",
            "source": inp.video_url,
            "x": "50%", "y": "50%",
            "width": "100%", "height": "100%",
            "volume": 0, "loop": True, "fit": "cover",
        },
        # ── Gradient (ince, sadece okunabilirlik)
        {
            "type": "shape", "shape": "rectangle",
            "x": "0%", "y": f"{grad_start}%",
            "width": "100%", "height": f"{100 - grad_start}%",
            "fill_color": f"linear-gradient(to bottom, transparent, {_rgba(b.primary_color, opacity)})",
        },
        # ── Ana başlık (tek satır, büyük harf, tracking)
        {
            "type": "text",
            "text": title.upper(),
            "x": "50%", "y": f"{text_y}%",
            "width": "82%",
            "font_family": b.font_family,
            "font_weight": "700",
            "font_size": "68",
            "fill_color": "#ffffff",
            "text_align": "center",
            "letter_spacing": "3",
            "line_height": "1.1",
            "animations": [{"time": 0.8, "duration": 0.7, "easing": "ease-out",
                            "type": "text-slide", "direction": "up"}],
        },
        # ── Accent çizgi (CTA yerine ince bant — ajans imzası)
        {
            "type": "shape", "shape": "rectangle",
            "x": "50%", "y": f"{text_y + 7}%",
            "width": "18%", "height": "0.25%",
            "fill_color": b.accent_color,
            "animations": [{"time": 1.2, "duration": 0.5, "easing": "ease-out",
                            "type": "fade"}],
        },
    ]

    # Alt başlık (yalnızca vision spec max_text_lines=2 diyorsa)
    if _show_subtitle(inp):
        sub = inp.subtitle[:55].strip()
        elements.append({
            "type": "text",
            "text": sub,
            "x": "50%", "y": f"{text_y + 4.5}%",
            "width": "75%",
            "font_family": b.font_family,
            "font_weight": "300",
            "font_size": "38",
            "fill_color": "rgba(255,255,255,0.75)",
            "text_align": "center",
            "letter_spacing": "1",
            "animations": [{"time": 1.0, "duration": 0.6, "easing": "ease-out",
                            "type": "fade"}],
        })

    logo = _logo_element(inp, getattr(inp.visual_spec, "logo_position", "top_right") if inp.visual_spec else "top_right")
    if logo:
        elements.append(logo)

    return {
        "output_format": "mp4",
        "width": 1080, "height": 1920, "duration": 15,
        "elements": elements,
    }


def _build_story_composition(inp: VideoPackInput) -> dict[str, Any]:
    """
    Story: 9:16 · 8s
    - Logo top (varsa)
    - Başlık bottom (1 kısa cümle)
    - Minimal dark fade
    """
    b = inp.brand
    opacity = _get_opacity(inp, 0.30)
    title = inp.title[:35].strip()
    if len(inp.title) > 35:
        title = inp.title[:32].strip() + "…"

    elements: list[dict] = [
        {"type": "video", "source": inp.video_url,
         "x": "50%", "y": "50%", "width": "100%", "height": "100%",
         "volume": 0, "loop": True, "fit": "cover"},
        # Bottom vignette
        {"type": "shape", "shape": "rectangle",
         "x": "0%", "y": "72%", "width": "100%", "height": "28%",
         "fill_color": f"linear-gradient(to bottom, transparent, {_rgba(b.primary_color, opacity + 0.1)})"},
        # Başlık
        {"type": "text",
         "text": title.upper(),
         "x": "50%", "y": "89%",
         "width": "80%",
         "font_family": b.font_family,
         "font_weight": "700",
         "font_size": "60",
         "fill_color": "#ffffff",
         "text_align": "center",
         "letter_spacing": "2",
         "animations": [{"time": 0.5, "duration": 0.6, "easing": "ease-out",
                         "type": "text-slide", "direction": "up"}]},
        # Accent çizgi
        {"type": "shape", "shape": "rectangle",
         "x": "50%", "y": "94%",
         "width": "12%", "height": "0.2%",
         "fill_color": b.accent_color},
    ]

    # Logo (top)
    if b.logo_url:
        elements.append({
            "type": "image", "source": b.logo_url,
            "x": "50%", "y": "9%",
            "width": "22%", "height": "auto", "fit": "contain",
            "opacity": 0.85,
        })

    return {"output_format": "mp4", "width": 1080, "height": 1920, "duration": 8,
            "elements": elements}


def _build_feed_composition(inp: VideoPackInput) -> dict[str, Any]:
    """
    Feed: 1:1 · 8s
    - Square crop, tam görüntü
    - Yalnızca ince bottom accent çizgi + brand name (küçük)
    - Logo yok (feed'de dikkat dağıtıcı)
    """
    b = inp.brand
    opacity = _get_opacity(inp, 0.25)
    bname = (b.tenant_name or inp.title[:20]).upper()

    elements: list[dict] = [
        {"type": "video", "source": inp.video_url,
         "x": "50%", "y": "50%", "width": "100%", "height": "100%",
         "volume": 0, "loop": True, "fit": "cover"},
        # Çok ince bottom fade
        {"type": "shape", "shape": "rectangle",
         "x": "0%", "y": "80%", "width": "100%", "height": "20%",
         "fill_color": f"linear-gradient(to bottom, transparent, {_rgba(b.primary_color, opacity)})"},
        # Brand name — küçük, köşede
        {"type": "text",
         "text": bname[:24],
         "x": "50%", "y": "95%",
         "font_family": b.font_family,
         "font_weight": "600",
         "font_size": "32",
         "fill_color": "rgba(255,255,255,0.70)",
         "text_align": "center",
         "letter_spacing": "4"},
        # Accent nokta (sol)
        {"type": "shape", "shape": "rectangle",
         "x": "5%", "y": "95%",
         "width": "2%", "height": "0.4%",
         "fill_color": b.accent_color},
    ]

    return {"output_format": "mp4", "width": 1080, "height": 1080, "duration": 8,
            "elements": elements}


def _build_event_composition(inp: VideoPackInput) -> dict[str, Any]:
    """
    Event: 9:16 · 8s
    - Tarih badge (pill shape, accent rengi)
    - 1 satır başlık
    - Minimal overlay
    """
    b = inp.brand
    opacity = _get_opacity(inp, 0.40)
    event_date = inp.event_date or datetime.now(timezone.utc).strftime("%-d %B")
    title = inp.title[:38].strip()
    if len(inp.title) > 38:
        title = inp.title[:35].strip() + "…"

    elements: list[dict] = [
        {"type": "video", "source": inp.video_url,
         "x": "50%", "y": "50%", "width": "100%", "height": "100%",
         "volume": 0, "loop": True, "fit": "cover"},
        # Genel hafif overlay (event için biraz daha koyu)
        {"type": "shape", "shape": "rectangle",
         "x": "0%", "y": "0%", "width": "100%", "height": "100%",
         "fill_color": _rgba(b.primary_color, opacity * 0.7)},
        # Tarih pill — compact, accent rengi
        {"type": "shape", "shape": "rectangle",
         "x": "50%", "y": "35%",
         "width": "52%", "height": "7%",
         "fill_color": b.accent_color,
         "border_radius": "40",
         "animations": [{"time": 0.3, "duration": 0.5, "easing": "ease-out", "type": "scale",
                         "start_scale": "90%"}]},
        {"type": "text",
         "text": event_date,
         "x": "50%", "y": "35%",
         "font_family": b.font_family,
         "font_weight": "700",
         "font_size": "44",
         "fill_color": b.primary_color,
         "text_align": "center",
         "letter_spacing": "1"},
        # Başlık
        {"type": "text",
         "text": title.upper(),
         "x": "50%", "y": "52%",
         "width": "78%",
         "font_family": b.font_family,
         "font_weight": "700",
         "font_size": "66",
         "fill_color": "#ffffff",
         "text_align": "center",
         "letter_spacing": "2",
         "line_height": "1.15",
         "animations": [{"time": 0.7, "duration": 0.7, "easing": "ease-out",
                         "type": "text-slide", "direction": "up"}]},
    ]

    logo = _logo_element(inp, "top_right")
    if logo:
        elements.append(logo)

    return {"output_format": "mp4", "width": 1080, "height": 1920, "duration": 8,
            "elements": elements}


def _build_teaser_composition(inp: VideoPackInput) -> dict[str, Any]:
    """
    Teaser: 9:16 · 3s — Sadece logo veya brand name. Hiçbir metin yok.
    Loop-ready, attention grabber.
    """
    b = inp.brand
    elements: list[dict] = [
        {"type": "video", "source": inp.video_url,
         "x": "50%", "y": "50%", "width": "100%", "height": "100%",
         "volume": 0, "loop": True, "fit": "cover"},
    ]

    if b.logo_url:
        elements.append({
            "type": "image", "source": b.logo_url,
            "x": "50%", "y": "50%",
            "width": "28%", "height": "auto", "fit": "contain",
            "opacity": 0.90,
        })
    else:
        # Logo yoksa sadece accent nokta — hiçbir metin
        elements.append({
            "type": "shape", "shape": "rectangle",
            "x": "50%", "y": "92%",
            "width": "8%", "height": "0.25%",
            "fill_color": b.accent_color,
        })

    return {"output_format": "mp4", "width": 1080, "height": 1920, "duration": 3,
            "elements": elements}


# ── Format registry ────────────────────────────────────────────────────────────

_FORMAT_BUILDERS = {
    "reel":   _build_reel_composition,
    "story":  _build_story_composition,
    "feed":   _build_feed_composition,
    "event":  _build_event_composition,
    "teaser": _build_teaser_composition,
}


def _apply_audio(composition: dict[str, Any], inp: VideoPackInput) -> dict[str, Any]:
    """Inject background music element at the end of a composition if music_url is set."""
    audio = _audio_element(inp)
    if audio is None:
        return composition
    elements = list(composition.get("elements", []))
    elements.append(audio)
    return {**composition, "elements": elements}

_FORMAT_DIMS = {
    "reel":   (1080, 1920),
    "story":  (1080, 1920),
    "feed":   (1080, 1080),
    "event":  (1080, 1920),
    "teaser": (1080, 1920),
}


# ── API client ─────────────────────────────────────────────────────────────────

async def _submit_render(api_key: str, composition: dict, client: httpx.AsyncClient) -> dict:
    r = await client.post(
        f"{_CREATOMATE_API}/renders",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"source": composition},
        timeout=30,
    )
    if r.status_code not in (200, 201, 202):
        raise RuntimeError(f"Creatomate submit failed ({r.status_code}): {r.text[:300]}")
    renders = r.json()
    return renders[0] if isinstance(renders, list) else renders


async def _poll_render(
    api_key: str, render_id: str, client: httpx.AsyncClient,
    max_wait: int = 240, poll_interval: int = 5,
) -> dict:
    elapsed = 0
    while elapsed < max_wait:
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval
        try:
            r = await client.get(
                f"{_CREATOMATE_API}/renders/{render_id}",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=15,
            )
            if r.is_success:
                data = r.json()
                if data.get("status") in ("succeeded", "failed"):
                    return data
        except Exception:
            pass
    return {"id": render_id, "status": "timeout", "url": ""}


async def render_video_pack(
    inp: VideoPackInput,
    api_key: str,
    formats: list[str] | None = None,
    wait_for_completion: bool = True,
) -> list[VideoPackResult]:
    if formats is None:
        formats = ["reel", "story", "feed"]
        if inp.event_date:
            formats.append("event")
        formats.append("teaser")

    async with httpx.AsyncClient() as client:
        submit_tasks = []
        for fmt in formats:
            builder = _FORMAT_BUILDERS.get(fmt)
            if not builder:
                continue
            composition = _apply_audio(builder(inp), inp)
            submit_tasks.append((fmt, asyncio.create_task(
                _submit_render(api_key, composition, client)
            )))

        render_map: dict[str, str] = {}
        for fmt, task in submit_tasks:
            try:
                obj = await task
                render_map[fmt] = obj.get("id", "")
                logger.info("creatomate_submitted", format=fmt, render_id=render_map[fmt],
                            tenant=inp.tenant_id)
            except Exception as exc:
                logger.warning("creatomate_submit_failed", format=fmt, error=str(exc))

        if not wait_for_completion:
            return [
                VideoPackResult(
                    format=fmt, status="pending",
                    render_id=render_map.get(fmt, ""),
                    width=_FORMAT_DIMS.get(fmt, (1080, 1920))[0],
                    height=_FORMAT_DIMS.get(fmt, (1080, 1920))[1],
                )
                for fmt in formats
            ]

        poll_tasks = {
            fmt: asyncio.create_task(_poll_render(api_key, rid, client))
            for fmt, rid in render_map.items() if rid
        }

        results: list[VideoPackResult] = []
        for fmt, task in poll_tasks.items():
            try:
                data = await task
                w, h = _FORMAT_DIMS.get(fmt, (1080, 1920))
                results.append(VideoPackResult(
                    format=fmt,
                    status=data.get("status", "unknown"),
                    render_id=data.get("id", ""),
                    output_url=data.get("url", ""),
                    width=w, height=h,
                    duration=data.get("duration", 0.0),
                    error=data.get("error_message", "") if data.get("status") == "failed" else "",
                ))
                logger.info("creatomate_rendered", format=fmt, status=data.get("status"),
                            tenant=inp.tenant_id)
            except Exception as exc:
                w, h = _FORMAT_DIMS.get(fmt, (1080, 1920))
                results.append(VideoPackResult(
                    format=fmt, status="failed",
                    render_id=render_map.get(fmt, ""),
                    width=w, height=h, error=str(exc),
                ))
        return results


async def get_render_status(api_key: str, render_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{_CREATOMATE_API}/renders/{render_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        return r.json() if r.is_success else {"id": render_id, "status": "unknown"}


def is_creatomate_configured(api_key: str) -> bool:
    return bool(api_key and api_key.strip())
