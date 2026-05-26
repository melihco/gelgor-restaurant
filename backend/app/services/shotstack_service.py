"""
Shotstack Video Production Service

Avantajlar vs Creatomate:
  - Stage (sandbox) API ücretsiz — test maliyeti sıfır
  - POST /templates çalışıyor — template'leri koddan yükleyebiliyoruz
  - Built-in title style'ları (minimal, chunk, vignette, future...) — tasarımcı gerek yok
  - $0.30/dakika production veya $39/mo (200 kredi)
  - Merge fields sistemi: {{videoUrl}}, {{title}}, {{brandName}} → anında değişim

Template sistemi:
  1. Kod içinde 12 template tanımı (Shotstack Edit JSON + merge fields)
  2. seed_templates() ile Shotstack'a bir kez yüklenir → template ID'leri alınır
  3. Template Brain (GPT-4o-mini) brand + içerik → template ID seçer
  4. render_with_template() → merge fields ile render → MP4 URL

Shotstack title styles (built-in profesyonel tasarımlar):
  minimal     — sade beyaz alt yazı
  future      — modern, teknolojik
  revolution  — bold, dinamik
  chunk       — güçlü, büyük
  blockbuster — dramatik, film stili
  vignette    — koyu kenarlıklı, şık
  sketch      — elle çizilmiş his
  crop        — metin fotoğraf üstünde kırpılmış gibi
  dissolve    — yavaş belirme
  subtitle    — altyazı stili
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

_STAGE_URL = "https://api.shotstack.io/edit/stage"
_PROD_URL  = "https://api.shotstack.io/edit/v1"


def _api_url(env: str = "stage") -> str:
    return _STAGE_URL if env == "stage" else _PROD_URL


def get_api_url_and_headers(api_key: str, env: str = "stage") -> tuple[str, dict]:
    return _api_url(env), _headers(api_key)


def _headers(api_key: str) -> dict:
    return {"x-api-key": api_key, "Content-Type": "application/json"}


# ── Template tanımları ─────────────────────────────────────────────────────────

# Her template: Shotstack Edit JSON + merge field placeholder'ları
# {{videoUrl}}, {{title}}, {{brandName}}, {{date}} → render anında doldurulur

SHOTSTACK_TEMPLATES = [

    # ── REEL TEMPLATES ─────────────────────────────────────────────────────

    {
        "key": "reel_minimal",
        "label": "Minimal Reel",
        "format": "reel",
        "tone": "minimal",
        "brand_types": ["beach_club", "hotel", "spa", "restaurant", "olive_oil", "boutique"],
        "content_uses": ["brand_story", "product", "social_proof", "bts"],
        "urgency_fit": ["low", "medium"],
        "description": "Sade lüks. Video nefes alır, tek satır minimal başlık.",
        "thumbnail_color": "#1a1a2e",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{
                        "asset": {"type": "video", "src": "{{videoUrl}}"},
                        "start": 0, "length": 5, "fit": "cover", "position": "center",
                    }]},
                    {"clips": [{
                        "asset": {
                            "type": "title",
                            "text": "{{title}}",
                            "style": "minimal",
                            "color": "#ffffff",
                            "size": "x-large",
                            "position": "bottom",
                        },
                        "start": 0.8, "length": 3.8,
                        "position": "bottom",
                        "transition": {"in": "fade", "out": "fade"},
                    }]},
                    {"clips": [{
                        "asset": {
                            "type": "title",
                            "text": "{{brandName}}",
                            "style": "minimal",
                            "color": "rgba(255,255,255,0.55)",
                            "size": "small",
                            "position": "bottom",
                        },
                        "start": 1.2, "length": 3.4,
                        "position": "bottom",
                    }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "9:16", "fps": 25},
        },
    },

    {
        "key": "reel_vignette_luxury",
        "label": "Vignette Luxury Reel",
        "format": "reel",
        "tone": "luxury",
        "brand_types": ["beach_club", "hotel", "spa", "boutique", "olive_oil"],
        "content_uses": ["brand_story", "product", "social_proof"],
        "urgency_fit": ["low", "medium"],
        "description": "Koyu kenarlıklı vignette efekti. Lüks marka hissi.",
        "thumbnail_color": "#0d0d1a",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {
                            "type": "title", "text": "{{title}}",
                            "style": "blockbuster", "color": "#ffffff", "size": "large",
                        },
                        "start": 0.6, "length": 4,
                        "position": "center",
                        "transition": {"in": "fade", "out": "fade"},
                    }]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{brandName}}",
                                  "style": "minimal", "color": "rgba(255,255,255,0.50)", "size": "x-small"},
                        "start": 1.0, "length": 3.5,
                        "position": "bottom", }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "9:16", "fps": 25},
        },
    },

    {
        "key": "reel_impact_chunk",
        "label": "Impact Chunk Reel",
        "format": "reel",
        "tone": "impact",
        "brand_types": ["beach_club", "corporate_event", "restaurant", "hotel", "retail"],
        "content_uses": ["event", "promotional", "brand_story"],
        "urgency_fit": ["medium", "high"],
        "description": "Güçlü CHUNK stili. Büyük, bold, enerjik. Etkinlik ve kampanyalar.",
        "thumbnail_color": "#0a0a0a",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{title}}",
                                  "style": "chunk", "color": "#ffffff", "size": "xx-large"},
                        "start": 0.4, "length": 4.2,
                        "position": "center",
                        "transition": {"in": "fade", "out": "fade"},
                    }]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{brandName}}",
                                  "style": "minimal", "color": "rgba(255,255,255,0.45)", "size": "small"},
                        "start": 1.0, "length": 3.5,
                        "position": "bottom", }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "9:16", "fps": 25},
        },
    },

    {
        "key": "reel_event_reveal",
        "label": "Event Reveal Reel",
        "format": "reel",
        "tone": "impact",
        "brand_types": ["beach_club", "corporate_event", "restaurant", "hotel"],
        "content_uses": ["event"],
        "urgency_fit": ["medium", "high"],
        "description": "Etkinlik duyurusu için. Tarih öne çıkar, title reveal animasyonu.",
        "thumbnail_color": "#0a0a14",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{date}}",
                                  "style": "future", "color": "#c9a96e", "size": "medium"},
                        "start": 0.5, "length": 4,
                        "position": "center", "transition": {"in": "fade"},
                    }]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{title}}",
                                  "style": "chunk", "color": "#ffffff", "size": "x-large"},
                        "start": 1.0, "length": 3.5,
                        "position": "center",
                        "transition": {"in": "fade", "out": "fade"},
                    }]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{brandName}}",
                                  "style": "minimal", "color": "rgba(255,255,255,0.45)", "size": "small"},
                        "start": 1.5, "length": 3,
                        "position": "bottom", }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "9:16", "fps": 25},
        },
    },

    {
        "key": "reel_dissolve_warm",
        "label": "Dissolve Warm Reel",
        "format": "reel",
        "tone": "warm",
        "brand_types": ["bakery", "olive_oil", "restaurant", "cafe", "food"],
        "content_uses": ["product", "brand_story", "social_proof"],
        "urgency_fit": ["low", "medium"],
        "description": "Yavaş beliren sıcak metin. Gıda ve ürün içerikleri.",
        "thumbnail_color": "#1a0c00",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{title}}",
                                  "style": "subtitle", "color": "#ffffff", "size": "large"},
                        "start": 0.7, "length": 4,
                        "position": "bottom", }]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{brandName}}",
                                  "style": "minimal", "color": "rgba(255,255,255,0.50)", "size": "x-small"},
                        "start": 1.2, "length": 3.3,
                        "position": "bottom", }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "9:16", "fps": 25},
        },
    },

    {
        "key": "reel_corporate_future",
        "label": "Corporate Future Reel",
        "format": "reel",
        "tone": "corporate",
        "brand_types": ["corporate_event", "mental_health", "wellness", "b2b", "professional_services"],
        "content_uses": ["brand_story", "educational", "social_proof", "promotional"],
        "urgency_fit": ["low", "medium", "high"],
        "description": "Kurumsal FUTURE stili. Teknolojik, güvenilir, profesyonel.",
        "thumbnail_color": "#060614",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{brandName}}",
                                  "style": "minimal", "color": "rgba(255,255,255,0.70)", "size": "small"},
                        "start": 0.3, "length": 4.5,
                        "position": "topLeft", }]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{title}}",
                                  "style": "future", "color": "#ffffff", "size": "x-large"},
                        "start": 0.8, "length": 3.8,
                        "position": "bottom", "transition": {"in": "fade", "out": "fade"},
                    }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "9:16", "fps": 25},
        },
    },

    # ── STORY TEMPLATES ─────────────────────────────────────────────────────

    {
        "key": "story_minimal_brand",
        "label": "Minimal Brand Story",
        "format": "story",
        "tone": "minimal",
        "brand_types": ["beach_club", "hotel", "spa", "restaurant", "wellness"],
        "content_uses": ["brand_story", "bts", "social_proof"],
        "urgency_fit": ["low", "medium"],
        "description": "Story minimal. Üst marka, alt başlık, video konuşur.",
        "thumbnail_color": "#0d0d14",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{brandName}}",
                                  "style": "minimal", "color": "rgba(255,255,255,0.80)", "size": "small"},
                        "start": 0.3, "length": 4.5,
                        "position": "top", "transition": {"in": "fade"},
                    }]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{title}}",
                                  "style": "minimal", "color": "#ffffff", "size": "large"},
                        "start": 0.7, "length": 4,
                        "position": "bottom", "transition": {"in": "fade", "out": "fade"},
                    }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "9:16", "fps": 25},
        },
    },

    {
        "key": "story_event_blockbuster",
        "label": "Event Blockbuster Story",
        "format": "story",
        "tone": "impact",
        "brand_types": ["beach_club", "corporate_event", "restaurant", "hotel"],
        "content_uses": ["event", "promotional"],
        "urgency_fit": ["medium", "high"],
        "description": "Story etkinlik. Blockbuster film stili, tarih badge.",
        "thumbnail_color": "#050510",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{date}}",
                                  "style": "minimal", "color": "#c9a96e", "size": "medium"},
                        "start": 0.5, "length": 4.2,
                        "position": "center", "transition": {"in": "fade"},
                    }]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{title}}",
                                  "style": "blockbuster", "color": "#ffffff", "size": "x-large"},
                        "start": 0.8, "length": 3.8,
                        "position": "center",
                        "transition": {"in": "fade", "out": "fade"},
                    }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "9:16", "fps": 25},
        },
    },

    {
        "key": "story_wellness_subtitle",
        "label": "Wellness Subtitle Story",
        "format": "story",
        "tone": "minimal",
        "brand_types": ["mental_health", "wellness", "spa", "yoga"],
        "content_uses": ["brand_story", "educational", "social_proof"],
        "urgency_fit": ["low", "medium"],
        "description": "Wellness sakin. Subtitle stili, altyazı gibi, güven verici.",
        "thumbnail_color": "#0a0a12",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{title}}",
                                  "style": "subtitle", "color": "#ffffff", "size": "medium"},
                        "start": 0.8, "length": 3.8,
                        "position": "bottom", "transition": {"in": "fade", "out": "fade"},
                    }]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{brandName}}",
                                  "style": "minimal", "color": "rgba(255,255,255,0.45)", "size": "x-small"},
                        "start": 1.0, "length": 3.5,
                        "position": "bottom", }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "9:16", "fps": 25},
        },
    },

    # ── FEED (1:1) TEMPLATES ─────────────────────────────────────────────────

    {
        "key": "feed_minimal_square",
        "label": "Minimal Square Feed",
        "format": "feed",
        "tone": "minimal",
        "brand_types": ["beach_club", "hotel", "restaurant", "spa", "olive_oil"],
        "content_uses": ["brand_story", "product", "social_proof"],
        "urgency_fit": ["low", "medium"],
        "description": "Feed sade. Sadece marka adı alt köşede.",
        "thumbnail_color": "#0d0d1a",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{brandName}}",
                                  "style": "minimal", "color": "rgba(255,255,255,0.60)", "size": "x-small"},
                        "start": 0.5, "length": 4.2,
                        "position": "bottomRight", }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "1:1", "fps": 25},
        },
    },

    {
        "key": "feed_product_crop",
        "label": "Product Crop Feed",
        "format": "feed",
        "tone": "warm",
        "brand_types": ["bakery", "olive_oil", "food", "retail", "cafe"],
        "content_uses": ["product", "promotional"],
        "urgency_fit": ["medium", "high"],
        "description": "Ürün feed. CROP stili metin fotoğrafın içinde gibi görünür.",
        "thumbnail_color": "#1a0c00",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{title}}",
                                  "style": "vogue", "color": "#ffffff", "size": "large"},
                        "start": 0.6, "length": 4,
                        "position": "bottom", "transition": {"in": "fade"},
                    }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "1:1", "fps": 25},
        },
    },

    {
        "key": "feed_corporate_clean",
        "label": "Corporate Clean Feed",
        "format": "feed",
        "tone": "corporate",
        "brand_types": ["corporate_event", "mental_health", "b2b", "professional_services"],
        "content_uses": ["brand_story", "educational", "promotional"],
        "urgency_fit": ["low", "medium"],
        "description": "Kurumsal feed. Temiz minimal başlık, üst marka adı.",
        "thumbnail_color": "#060614",
        "edit": {
            "timeline": {
                "background": "#000000",
                "tracks": [
                    {"clips": [{"asset": {"type": "video", "src": "{{videoUrl}}"},
                                "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{brandName}}",
                                  "style": "minimal", "color": "rgba(255,255,255,0.70)", "size": "x-small"},
                        "start": 0.3, "length": 4.5,
                        "position": "topLeft", }]},
                    {"clips": [{
                        "asset": {"type": "title", "text": "{{title}}",
                                  "style": "minimal", "color": "#ffffff", "size": "medium"},
                        "start": 0.7, "length": 4,
                        "position": "bottom", "transition": {"in": "fade"},
                    }]},
                ],
            },
            "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "1:1", "fps": 25},
        },
    },
]


# ── API Functions ──────────────────────────────────────────────────────────────

async def seed_templates(api_key: str, env: str = "stage") -> list[dict]:
    """
    Tüm template'leri Shotstack'a yükle (bir kez).
    Zaten varsa atla (name kontrolü).
    Döndürür: [{key, template_id, label, ...}]
    """
    base = _api_url(env)
    headers = _headers(api_key)

    async with httpx.AsyncClient(timeout=30) as client:
        # Mevcut template'leri kontrol et
        existing: dict[str, str] = {}
        r = await client.get(f"{base}/templates", headers=headers)
        if r.is_success:
            for t in r.json().get("response", {}).get("data", []):
                existing[t.get("name", "")] = t.get("id", "")

        results = []
        for tpl in SHOTSTACK_TEMPLATES:
            name = f"SmartAgency · {tpl['label']}"
            if name in existing:
                logger.info("shotstack_template_exists", name=name, id=existing[name])
                results.append({**tpl, "template_id": existing[name], "name": name})
                continue

            # Template oluştur
            r2 = await client.post(f"{base}/templates",
                headers=headers,
                json={
                    "name": name,
                    "template": {
                        "timeline": tpl["edit"]["timeline"],
                        "output": tpl["edit"]["output"],
                    },
                })

            if r2.is_success:
                tid = r2.json().get("response", {}).get("id", "")
                logger.info("shotstack_template_created", name=name, id=tid)
                results.append({**tpl, "template_id": tid, "name": name})
            else:
                logger.warning("shotstack_template_failed", name=name,
                               status=r2.status_code, body=r2.text[:200])

        return results


async def list_templates(api_key: str, env: str = "stage") -> list[dict]:
    """Hesaptaki SmartAgency template'lerini listele."""
    base = _api_url(env)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{base}/templates", headers=_headers(api_key))
        if not r.is_success:
            return []

        raw = r.json().get("response", {}).get("data", [])
        # key_map
        key_by_label = {f"SmartAgency · {t['label']}": t for t in SHOTSTACK_TEMPLATES}

        return [
            {
                "template_id": t["id"],
                "name": t.get("name", ""),
                "key": key_by_label.get(t.get("name", ""), {}).get("key", "custom"),
                "label": t.get("name", "").replace("SmartAgency · ", ""),
                "format": key_by_label.get(t.get("name", ""), {}).get("format", "reel"),
                "tone": key_by_label.get(t.get("name", ""), {}).get("tone", "minimal"),
                "description": key_by_label.get(t.get("name", ""), {}).get("description", ""),
                "brand_types": key_by_label.get(t.get("name", ""), {}).get("brand_types", []),
                "content_uses": key_by_label.get(t.get("name", ""), {}).get("content_uses", []),
                "urgency_fit": key_by_label.get(t.get("name", ""), {}).get("urgency_fit", []),
                "thumbnail_color": key_by_label.get(t.get("name", ""), {}).get("thumbnail_color", "#1a1a2e"),
            }
            for t in raw
            if t.get("name", "").startswith("SmartAgency")
        ]


async def render_with_template(
    api_key: str,
    template_id: str,
    video_url: str,
    title: str,
    brand_name: str,
    date: str = "",
    wait: bool = True,
    env: str = "stage",
) -> dict:
    """
    Template ID + merge fields ile Shotstack render.
    """
    base = _api_url(env)
    merge = [
        {"find": "videoUrl", "replace": video_url},
        {"find": "title", "replace": title.upper()[:50] if title else ""},
        {"find": "brandName", "replace": brand_name.upper()[:24] if brand_name else ""},
        {"find": "date", "replace": date},
    ]

    async with httpx.AsyncClient(timeout=240) as client:
        r = await client.post(f"{base}/templates/{template_id}/render",
            headers=_headers(api_key),
            json={"merge": merge})

        if not r.is_success:
            raise RuntimeError(f"Shotstack render failed ({r.status_code}): {r.text[:200]}")

        render_id = r.json().get("response", {}).get("id", "")
        if not wait:
            return {"render_id": render_id, "status": "queued"}

        # Poll (endpoint: /render/{id} tekil, /renders çoğul değil)
        for _ in range(60):
            await asyncio.sleep(4)
            r2 = await client.get(f"{base}/render/{render_id}",
                headers=_headers(api_key))
            if not r2.is_success:
                continue
            d = r2.json().get("response", {})
            status = d.get("status", "")
            if status == "done":
                return {"render_id": render_id, "status": "done",
                        "output_url": d.get("url", "")}
            if status in ("failed", "error"):
                return {"render_id": render_id, "status": "failed",
                        "error": d.get("error", "")}

    return {"render_id": render_id, "status": "timeout"}


async def auto_render(
    api_key: str,
    openai_api_key: str,
    business_type: str,
    brand_name: str,
    brand_tone: str,
    video_url: str,
    title: str,
    content_use: str,
    format: str,
    urgency_level: str,
    event_date: str = "",
    wait: bool = True,
    env: str = "stage",
) -> dict:
    """
    Tam otomatik pipeline — seed gerektirmez:
    1. Template Brain: brand + içerik → en uygun template key
    2. Lokal SHOTSTACK_TEMPLATES'den JSON'u al
    3. Merge fields (videoUrl, title, brandName, date) yerleştir
    4. Shotstack'a direkt submit et
    """
    # 1. Template seç
    from app.services.template_brain_service import select_template
    selection = await select_template(
        business_type=business_type,
        brand_name=brand_name,
        brand_tone=brand_tone,
        content_title=title,
        content_use=content_use,
        format=format,
        urgency_level=urgency_level,
        visual_tone="dark",
        event_date=event_date,
        openai_api_key=openai_api_key,
    )
    key = selection.get("template_key", "")

    # 2. Lokal template JSON'u bul
    tpl = next((t for t in SHOTSTACK_TEMPLATES if t["key"] == key), None)
    if not tpl:
        # Fallback: format'a göre ilk uygun template
        tpl = next((t for t in SHOTSTACK_TEMPLATES if t["format"] == format), SHOTSTACK_TEMPLATES[0])
        key = tpl["key"]

    # 3. Merge fields yerleştir — JSON string replace
    import json as _json
    edit_str = _json.dumps(tpl["edit"])
    edit_str = (
        edit_str
        .replace("{{videoUrl}}", video_url)
        .replace("{{title}}", title.upper()[:50] if title else "")
        .replace("{{brandName}}", brand_name.upper()[:24] if brand_name else "")
        .replace("{{date}}", event_date or "")
    )
    edit = _json.loads(edit_str)

    # 4. Shotstack render
    base = _api_url(env)
    async with httpx.AsyncClient(timeout=240) as client:
        r = await client.post(
            f"{base}/render",
            headers=_headers(api_key),
            json=edit,
        )
        if not r.is_success:
            logger.warning("shotstack_render_submit_failed",
                           status=r.status_code, body=r.text[:200])
            raise RuntimeError(f"Shotstack submit failed ({r.status_code}): {r.text[:200]}")

        render_id = r.json()["response"]["id"]
        logger.info("shotstack_render_submitted",
                    render_id=render_id, template=key, brand=brand_name)

        if not wait:
            return {
                "render_id": render_id, "status": "queued",
                "template_key": key, "template_label": tpl["label"],
                "template_tone": tpl["tone"], "reasoning": selection.get("reasoning", ""),
            }

        for _ in range(60):
            await asyncio.sleep(4)
            r2 = await client.get(f"{base}/render/{render_id}", headers=_headers(api_key))
            if r2.is_success:
                d = r2.json().get("response", {})
                status = d.get("status", "")
                if status == "done":
                    logger.info("shotstack_render_done",
                                render_id=render_id, template=key, url=d.get("url", "")[:60])
                    return {
                        "render_id": render_id, "status": "done",
                        "output_url": d.get("url", ""),
                        "template_key": key, "template_label": tpl["label"],
                        "template_tone": tpl["tone"], "reasoning": selection.get("reasoning", ""),
                    }
                if status in ("failed", "error"):
                    return {"render_id": render_id, "status": "failed",
                            "error": d.get("error", ""), "template_key": key}

    return {"render_id": render_id, "status": "timeout", "template_key": key}


async def _render_without_template(
    api_key: str, business_type: str, brand_name: str, brand_tone: str,
    video_url: str, title: str, content_use: str, format: str,
    urgency_level: str, event_date: str, wait: bool, env: str = "stage",
) -> dict:
    """Template yokken doğrudan Edit JSON ile render."""
    fmt_map = {"story": "9:16", "feed": "1:1", "reel": "9:16"}
    aspect = fmt_map.get(format, "9:16")

    style = "chunk" if urgency_level == "high" else "blockbuster" if "luxury" in brand_tone else "minimal"

    edit = {
        "timeline": {
            "background": "#000000",
            "tracks": [
                {"clips": [{"asset": {"type": "video", "src": video_url},
                            "start": 0, "length": 5, "fit": "cover", "position": "center"}]},
                {"clips": [{"asset": {"type": "title", "text": title.upper()[:50],
                                      "style": style, "color": "#ffffff", "size": "x-large"},
                            "start": 0.6, "length": 4, "position": "bottom", "transition": {"in": "fade", "out": "fade"}}]},
                {"clips": [{"asset": {"type": "title", "text": brand_name.upper()[:20],
                                      "style": "minimal", "color": "rgba(255,255,255,0.50)", "size": "small"},
                            "start": 1.0, "length": 3.5, "position": "bottom"}]},
            ],
        },
        "output": {"format": "mp4", "resolution": "hd", "aspectRatio": aspect, "fps": 25},
    }

    base = _api_url(env)
    async with httpx.AsyncClient(timeout=240) as client:
        r = await client.post(f"{base}/render", headers=_headers(api_key),
                               json={"timeline": edit["timeline"], "output": edit["output"]})
        if not r.is_success:
            raise RuntimeError(f"Shotstack render failed: {r.text[:200]}")
        render_id = r.json().get("response", {}).get("id", "")
        if not wait:
            return {"render_id": render_id, "status": "queued",
                    "template_key": f"inline_{style}", "template_label": style.title()}
        for _ in range(60):
            await asyncio.sleep(4)
            r2 = await client.get(f"{base}/render/{render_id}", headers=_headers(api_key))
            if r2.is_success:
                d = r2.json().get("response", {})
                if d.get("status") == "done":
                    return {"render_id": render_id, "status": "done",
                            "output_url": d.get("url", ""),
                            "template_key": f"inline_{style}", "template_label": style.title()}
                if d.get("status") in ("failed", "error"):
                    return {"render_id": render_id, "status": "failed", "error": d.get("error", "")}
    return {"render_id": render_id, "status": "timeout"}


def is_configured(api_key: str) -> bool:
    return bool(api_key and api_key.strip())
