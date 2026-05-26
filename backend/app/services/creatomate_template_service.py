"""
Creatomate Template Service — marka template'lerini yönetir.

4 temel template tipi:
  reel_minimal   — Tek metin, sıfır overlay, lüks sadelik
  reel_editorial — Sol hizalı italic, ince accent çizgi
  reel_impact    — Güçlü gradient, bold, animasyon
  story_clean    — Logo üst + tek satır alt

Template'ler bir kez API'ye kaydedilir, sonra sadece modifications ile çağrılır.
Her element adı bir modification key'i:
  Background-Video.source → video URL
  Main-Title.text         → başlık
  Brand-Name.text         → marka adı
  Date-Badge.text         → etkinlik tarihi
"""

from __future__ import annotations
import asyncio
from typing import Any
import httpx
import structlog

logger = structlog.get_logger()
_API = "https://api.creatomate.com/v1"


# ── Template tanımları ─────────────────────────────────────────────────────────

TEMPLATE_DEFINITIONS = [
    {
        "key": "reel_minimal",
        "name": "SmartAgency · Reel Minimal",
        "description": "Tek metin, sıfır overlay. Lüks markalar için.",
        "format": "reel",
        "preview_label": "MINIMAL",
        "source": {
            "output_format": "mp4",
            "width": 1080, "height": 1920, "duration": 5,
            "elements": [
                {
                    "name": "Background-Video",
                    "type": "video",
                    "source": "https://creatomate.com/files/assets/f2476b87-b4e6-4f2f-9e4e-fde37fda2ea5",
                    "x": "50%", "y": "50%",
                    "width": "100%", "height": "100%",
                    "fit": "cover", "volume": 0, "loop": True,
                },
                {
                    "name": "Bottom-Fade",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "65%",
                    "width": "100%", "height": "35%",
                    "fill_color": "linear-gradient(to bottom, transparent, rgba(0,0,0,0.55))",
                },
                {
                    "name": "Main-Title",
                    "type": "text",
                    "text": "BAŞLIK",
                    "x": "50%", "y": "84%",
                    "width": "82%",
                    "font_family": "Montserrat",
                    "font_weight": "700",
                    "font_size": 72,
                    "fill_color": "#ffffff",
                    "text_align": "center",
                    "letter_spacing": 5,
                },
                {
                    "name": "Accent-Line",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "90%",
                    "width": "16%", "height": "0.22%",
                    "fill_color": "#c9a96e",
                },
                {
                    "name": "Brand-Name",
                    "type": "text",
                    "text": "MARKA",
                    "x": "50%", "y": "94%",
                    "font_family": "Montserrat",
                    "font_weight": "300",
                    "font_size": 28,
                    "fill_color": "rgba(255,255,255,0.60)",
                    "text_align": "center",
                    "letter_spacing": 6,
                },
            ],
        },
    },
    {
        "key": "reel_editorial",
        "name": "SmartAgency · Reel Editorial",
        "description": "Sol hizalı, italic, ince çizgi. Kültürel ve hikaye içerikleri.",
        "format": "reel",
        "preview_label": "EDITORIAL",
        "source": {
            "output_format": "mp4",
            "width": 1080, "height": 1920, "duration": 5,
            "elements": [
                {
                    "name": "Background-Video",
                    "type": "video",
                    "source": "https://creatomate.com/files/assets/f2476b87-b4e6-4f2f-9e4e-fde37fda2ea5",
                    "x": "50%", "y": "50%",
                    "width": "100%", "height": "100%",
                    "fit": "cover", "volume": 0, "loop": True,
                },
                {
                    "name": "Left-Fade",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "30%",
                    "width": "60%", "height": "45%",
                    "fill_color": "linear-gradient(to right, rgba(0,0,0,0.45), transparent)",
                },
                {
                    "name": "Main-Title",
                    "type": "text",
                    "text": "Başlık",
                    "x": "22%", "y": "48%",
                    "width": "40%",
                    "font_family": "Cormorant Garamond",
                    "font_style": "italic",
                    "font_weight": "600",
                    "font_size": 80,
                    "fill_color": "#ffffff",
                    "text_align": "left",
                    "letter_spacing": 1,
                    "line_height": 1.15,
                },
                {
                    "name": "Accent-Line",
                    "type": "shape", "shape": "rectangle",
                    "x": "22%", "y": "57%",
                    "width": "28%", "height": "0.18%",
                    "fill_color": "#c9a96e",
                },
                {
                    "name": "Brand-Name",
                    "type": "text",
                    "text": "MARKA",
                    "x": "22%", "y": "61%",
                    "font_family": "Montserrat",
                    "font_weight": "300",
                    "font_size": 24,
                    "fill_color": "rgba(255,255,255,0.55)",
                    "text_align": "left",
                    "letter_spacing": 5,
                },
            ],
        },
    },
    {
        "key": "reel_impact",
        "name": "SmartAgency · Reel Impact",
        "description": "Güçlü gradient, 900 weight, animasyon. Etkinlik ve kampanyalar.",
        "format": "reel",
        "preview_label": "IMPACT",
        "source": {
            "output_format": "mp4",
            "width": 1080, "height": 1920, "duration": 5,
            "elements": [
                {
                    "name": "Background-Video",
                    "type": "video",
                    "source": "https://creatomate.com/files/assets/f2476b87-b4e6-4f2f-9e4e-fde37fda2ea5",
                    "x": "50%", "y": "50%",
                    "width": "100%", "height": "100%",
                    "fit": "cover", "volume": 0, "loop": True,
                },
                {
                    "name": "Gradient-Overlay",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "48%",
                    "width": "100%", "height": "52%",
                    "fill_color": "linear-gradient(to bottom, transparent, rgba(0,0,0,0.72))",
                },
                {
                    "name": "Main-Title",
                    "type": "text",
                    "text": "BAŞLIK",
                    "x": "50%", "y": "78%",
                    "width": "85%",
                    "font_family": "Montserrat",
                    "font_weight": "900",
                    "font_size": 96,
                    "fill_color": "#ffffff",
                    "text_align": "center",
                    "letter_spacing": 3,
                    "animations": [{"time": 0.3, "duration": 0.8, "easing": "ease-out",
                                    "type": "text-slide", "direction": "up"}],
                },
                {
                    "name": "Date-Badge",
                    "type": "text",
                    "text": "",
                    "x": "50%", "y": "89%",
                    "font_family": "Montserrat",
                    "font_weight": "600",
                    "font_size": 36,
                    "fill_color": "#c9a96e",
                    "text_align": "center",
                    "letter_spacing": 4,
                },
                {
                    "name": "Brand-Name",
                    "type": "text",
                    "text": "MARKA",
                    "x": "50%", "y": "95%",
                    "font_family": "Montserrat",
                    "font_weight": "300",
                    "font_size": 26,
                    "fill_color": "rgba(255,255,255,0.45)",
                    "text_align": "center",
                    "letter_spacing": 7,
                },
            ],
        },
    },
    {
        "key": "story_clean",
        "name": "SmartAgency · Story Clean",
        "description": "Logo üst ortada, tek satır başlık alt. Her marka için.",
        "format": "story",
        "preview_label": "STORY",
        "source": {
            "output_format": "mp4",
            "width": 1080, "height": 1920, "duration": 5,
            "elements": [
                {
                    "name": "Background-Video",
                    "type": "video",
                    "source": "https://creatomate.com/files/assets/f2476b87-b4e6-4f2f-9e4e-fde37fda2ea5",
                    "x": "50%", "y": "50%",
                    "width": "100%", "height": "100%",
                    "fit": "cover", "volume": 0, "loop": True,
                },
                {
                    "name": "Top-Bar",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "0%",
                    "width": "100%", "height": "16%",
                    "fill_color": "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)",
                },
                {
                    "name": "Brand-Name",
                    "type": "text",
                    "text": "MARKA",
                    "x": "50%", "y": "8%",
                    "font_family": "Montserrat",
                    "font_weight": "700",
                    "font_size": 38,
                    "fill_color": "#ffffff",
                    "text_align": "center",
                    "letter_spacing": 7,
                    "opacity": 0.90,
                },
                {
                    "name": "Bottom-Fade",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "72%",
                    "width": "100%", "height": "28%",
                    "fill_color": "linear-gradient(to bottom, transparent, rgba(0,0,0,0.60))",
                },
                {
                    "name": "Main-Title",
                    "type": "text",
                    "text": "BAŞLIK",
                    "x": "50%", "y": "89%",
                    "width": "80%",
                    "font_family": "Montserrat",
                    "font_weight": "700",
                    "font_size": 62,
                    "fill_color": "#ffffff",
                    "text_align": "center",
                    "letter_spacing": 3,
                    "animations": [{"time": 0.5, "duration": 0.6, "easing": "ease-out",
                                    "type": "text-slide", "direction": "up"}],
                },
                {
                    "name": "Accent-Line",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "95%",
                    "width": "10%", "height": "0.20%",
                    "fill_color": "#c9a96e",
                },
            ],
        },
    },
]


# ── API functions ──────────────────────────────────────────────────────────────

async def seed_templates(api_key: str) -> list[dict]:
    """
    4 template'i Creatomate hesabına kaydet.
    Zaten varsa atla (name kontrolü).
    Döndürür: [{key, template_id, name, preview_label, format, description}]
    """
    async with httpx.AsyncClient(timeout=30) as client:
        # Mevcut template'leri al
        r = await client.get(f"{_API}/templates",
            headers={"Authorization": f"Bearer {api_key}"})
        existing = {t["name"]: t["id"] for t in r.json()} if r.is_success else {}

        results = []
        for tpl in TEMPLATE_DEFINITIONS:
            name = tpl["name"]
            if name in existing:
                logger.info("template_already_exists", name=name, id=existing[name])
                results.append({
                    "key": tpl["key"],
                    "template_id": existing[name],
                    "name": name,
                    "preview_label": tpl["preview_label"],
                    "format": tpl["format"],
                    "description": tpl["description"],
                })
                continue

            # Yeni template oluştur
            r2 = await client.post(f"{_API}/templates",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"name": name, "source": tpl["source"]})

            if r2.is_success:
                tid = r2.json().get("id", "")
                logger.info("template_created", name=name, id=tid)
                results.append({
                    "key": tpl["key"],
                    "template_id": tid,
                    "name": name,
                    "preview_label": tpl["preview_label"],
                    "format": tpl["format"],
                    "description": tpl["description"],
                })
            else:
                logger.warning("template_create_failed", name=name,
                               status=r2.status_code, body=r2.text[:200])

        return results


async def list_account_templates(api_key: str) -> list[dict]:
    """Hesaptaki SmartAgency template'lerini listele."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{_API}/templates",
            headers={"Authorization": f"Bearer {api_key}"})
        if not r.is_success:
            return []

        all_tpls = r.json()
        # Sadece SmartAgency template'lerini döndür (diğer hesap template'lerini karıştırma)
        sa_templates = [t for t in all_tpls if t.get("name", "").startswith("SmartAgency")]

        # Key map
        key_by_name = {tpl["name"]: tpl["key"] for tpl in TEMPLATE_DEFINITIONS}
        desc_by_name = {tpl["name"]: tpl["description"] for tpl in TEMPLATE_DEFINITIONS}
        label_by_name = {tpl["name"]: tpl["preview_label"] for tpl in TEMPLATE_DEFINITIONS}
        fmt_by_name = {tpl["name"]: tpl["format"] for tpl in TEMPLATE_DEFINITIONS}

        return [
            {
                "template_id": t["id"],
                "name": t.get("name", ""),
                "key": key_by_name.get(t.get("name", ""), "custom"),
                "preview_label": label_by_name.get(t.get("name", ""), ""),
                "format": fmt_by_name.get(t.get("name", ""), "reel"),
                "description": desc_by_name.get(t.get("name", ""), ""),
                "thumbnail_url": t.get("thumbnail_url", ""),
            }
            for t in sa_templates
        ]


async def render_with_template(
    api_key: str,
    template_id: str,
    video_url: str = "",
    title: str = "",
    brand_name: str = "",
    date_badge: str = "",
    accent_color: str = "#c9a96e",
    extra: dict | None = None,
) -> dict:
    """
    Template ID + modifications ile Creatomate render.
    Element adları bizim tanımlarımızla eşleşiyor.
    """
    modifications: dict[str, Any] = {}

    if video_url:
        modifications["Background-Video.source"] = video_url
    if title:
        modifications["Main-Title.text"] = title.upper() if len(title) < 40 else title
    if brand_name:
        modifications["Brand-Name.text"] = brand_name.upper()
    if date_badge:
        modifications["Date-Badge.text"] = date_badge
    if accent_color and accent_color != "#c9a96e":
        # Accent çizgi ve date badge rengini brand'e göre ayarla
        modifications["Accent-Line.fill_color"] = accent_color
        modifications["Date-Badge.fill_color"] = accent_color

    if extra:
        modifications.update(extra)

    async with httpx.AsyncClient(timeout=240) as client:
        r = await client.post(f"{_API}/renders",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"template_id": template_id, "modifications": modifications})

        if r.status_code not in (200, 201, 202):
            raise RuntimeError(f"Creatomate render failed ({r.status_code}): {r.text[:200]}")

        data = r.json()
        render = data[0] if isinstance(data, list) else data
        render_id = render.get("id", "")

        # Poll
        for _ in range(60):
            await asyncio.sleep(4)
            r2 = await client.get(f"{_API}/renders/{render_id}",
                headers={"Authorization": f"Bearer {api_key}"})
            d = r2.json()
            status = d.get("status", "")
            if status == "succeeded":
                return {"render_id": render_id, "status": "succeeded",
                        "output_url": d.get("url", ""), "modifications": modifications}
            if status == "failed":
                raise RuntimeError(f"Render failed: {d.get('error_message', 'unknown')}")

        return {"render_id": render_id, "status": "timeout"}
