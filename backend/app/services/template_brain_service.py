"""
Template Brain — Brand + içerik briefini okuyup en uygun template'i seçer.

Giriş:
  - BrandInfo (business_type, brand_tone, location, visual_dna)
  - ContentBrief (title, template_use_case, urgency_level, format)
  - VisualSpec (visual_tone, text_zone — GPT-4o Vision analizi)

Çıkış:
  - selected_template_key
  - field_values: {title, brand_name, date, subtitle, ...}
  - reasoning: neden bu template seçildi
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
import structlog

from app.services.smart_template_library import get_template_catalog, get_template

logger = structlog.get_logger()


async def select_template(
    business_type: str,
    brand_name: str,
    brand_tone: str,
    content_title: str,
    content_use: str,        # "brand_story","event","product","social_proof","promotional","bts","educational"
    format: str,             # "reel_9x16" | "story_9x16" | "feed_1x1"
    urgency_level: str,      # "low" | "medium" | "high"
    visual_tone: str,        # "dark" | "light" | "mixed" (Vision analizi)
    event_date: str,
    openai_api_key: str,
) -> dict:
    """
    GPT-4o ile en uygun template'i seç ve field değerlerini döndür.

    Döndürür:
    {
      "template_key": "reel_luxury_minimal",
      "field_values": {"title": "...", "brand_name": "...", ...},
      "reasoning": "..."
    }
    """
    # Shotstack template'lerini önce dene, yoksa smart_template_library'ye düş
    try:
        from app.services.shotstack_service import SHOTSTACK_TEMPLATES as _SS_TEMPLATES
        catalog = [
            {"key": t["key"], "format": t["format"], "tone": t["tone"],
             "brand_types": t["brand_types"], "content_uses": t["content_uses"],
             "urgency_fit": t["urgency_fit"], "description": t["description"],
             "required_slots": ["title", "brand_name"]}
            for t in _SS_TEMPLATES
        ]
    except Exception:
        catalog = get_template_catalog()

    catalog = [t for t in catalog if t["format"] == format]

    if not catalog:
        return _fallback_selection(format, content_title, brand_name, event_date)

    catalog_text = json.dumps(catalog, ensure_ascii=False, indent=2)

    prompt = f"""You are a creative director selecting the perfect template for a brand's social media video.

Brand:
  name: {brand_name}
  business_type: {business_type}
  tone: {brand_tone}

Content:
  title: {content_title[:80]}
  content_use: {content_use}
  format: {format}
  urgency_level: {urgency_level}
  visual_tone_of_footage: {visual_tone} (dark=footage is dark, light=footage is bright)
  event_date: {event_date or 'none'}

Available templates for format "{format}":
{catalog_text}

Select the SINGLE best template. Consider:
1. brand_types compatibility — does the template list this brand's business_type?
2. content_uses match — does content_use appear in the template's content_uses?
3. urgency_fit — does urgency_level match?
4. tone fit — does brand tone (luxury/casual/corporate/warm) match template tone?
5. If event_date is present → prefer templates with "date" slot
6. If visual_tone is "light" → prefer "minimal" tone templates (less overlay needed)

Return JSON:
{{
  "template_key": "exact key from catalog",
  "field_values": {{
    "title": "optimized title text (max 40 chars, uppercase if short)",
    "brand_name": "brand name (max 20 chars)",
    "subtitle": "optional subtitle if slot exists (max 55 chars)",
    "date": "event date if slot exists and date provided, else empty string"
  }},
  "reasoning": "one sentence: why this template for this brand+content"
}}

Return ONLY JSON."""

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {openai_api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 300,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                },
            )
            r.raise_for_status()
            result = json.loads(r.json()["choices"][0]["message"]["content"])

        key = result.get("template_key", "")
        # Shotstack ve smart_template_library key'lerini kabul et
        try:
            from app.services.shotstack_service import SHOTSTACK_TEMPLATES as _SS
            valid_keys = {t["key"] for t in _SS}
        except Exception:
            valid_keys = set()
        if not get_template(key) and key not in valid_keys:
            logger.warning("template_brain_invalid_key", key=key)
            return _fallback_selection(format, content_title, brand_name, event_date)

        logger.info("template_selected",
                    key=key, brand=brand_name, use=content_use,
                    reasoning=result.get("reasoning", "")[:80])
        return {
            "template_key": key,
            "field_values": result.get("field_values", {}),
            "reasoning": result.get("reasoning", ""),
        }

    except Exception as exc:
        logger.warning("template_brain_failed", error=str(exc))
        return _fallback_selection(format, content_title, brand_name, event_date)


async def select_template_from_list(
    templates: list[dict],
    business_type: str,
    brand_name: str,
    brand_tone: str,
    content_title: str,
    content_use: str,
    format: str,
    urgency_level: str,
    event_date: str,
    openai_api_key: str,
) -> dict:
    """Verilen template listesinden en uygununu seç (Shotstack için)."""
    from app.services.smart_template_library import get_template_catalog
    catalog = [
        {
            "key": t.get("key",""),
            "template_id": t.get("template_id",""),
            "label": t.get("label",""),
            "format": t.get("format",""),
            "tone": t.get("tone",""),
            "brand_types": t.get("brand_types",[]),
            "content_uses": t.get("content_uses",[]),
            "urgency_fit": t.get("urgency_fit",[]),
            "description": t.get("description",""),
        }
        for t in templates if t.get("format","") == format
    ]

    if not catalog:
        # Fallback: ilk template
        t = templates[0] if templates else {}
        return {**t, "reasoning": "fallback — no format match"}

    result = await select_template(
        business_type=business_type,
        brand_name=brand_name,
        brand_tone=brand_tone,
        content_title=content_title,
        content_use=content_use,
        format=format,
        urgency_level=urgency_level,
        visual_tone="dark",
        event_date=event_date,
        openai_api_key=openai_api_key,
    )

    key = result.get("template_key","")
    # key → template_id map
    matched = next((t for t in templates if t.get("key") == key), None)
    if matched:
        return {**matched, "reasoning": result.get("reasoning",""), "field_values": result.get("field_values",{})}

    return {**templates[0], "reasoning": "fallback — key not matched"}


def _fallback_selection(format: str, title: str, brand_name: str, event_date: str) -> dict:
    """AI başarısız olursa format'a göre güvenli default."""
    fallback_map = {
        "reel_9x16": "reel_luxury_minimal",
        "story_9x16": "story_minimal_logo",
        "feed_1x1": "feed_clean_square",
    }
    key = fallback_map.get(format, "reel_luxury_minimal")
    return {
        "template_key": key,
        "field_values": {
            "title": title[:40],
            "brand_name": brand_name[:20],
            "date": event_date,
        },
        "reasoning": "fallback — AI unavailable",
    }


async def auto_render(
    brand_name: str,
    business_type: str,
    brand_tone: str,
    primary_color: str,
    accent_color: str,
    video_url: str,
    title: str,
    content_use: str,
    format: str,
    urgency_level: str,
    event_date: str,
    openai_api_key: str,
    creatomate_api_key: str,
    visual_tone: str = "dark",
    subtitle: str = "",
) -> dict:
    """
    Tek fonksiyon: brand + içerik → template seç → render et → URL döndür.
    Tüm pipeline otomatik.
    """
    from app.services.smart_template_library import apply_fields_to_composition
    import asyncio as _asyncio
    import httpx as _httpx

    # 1. Template seç
    selection = await select_template(
        business_type=business_type,
        brand_name=brand_name,
        brand_tone=brand_tone,
        content_title=title,
        content_use=content_use,
        format=format,
        urgency_level=urgency_level,
        visual_tone=visual_tone,
        event_date=event_date,
        openai_api_key=openai_api_key,
    )

    template = get_template(selection["template_key"])
    if not template:
        return {"status": "error", "error": "Template not found"}

    # 2. Field değerlerini uygula
    fields = selection["field_values"]
    fields["video"] = video_url
    if subtitle and "subtitle" not in fields:
        fields["subtitle"] = subtitle

    composition = apply_fields_to_composition(template, fields, primary_color, accent_color)

    # 3. Creatomate render
    async with _httpx.AsyncClient(timeout=240) as client:
        r = await client.post(
            "https://api.creatomate.com/v1/renders",
            headers={"Authorization": f"Bearer {creatomate_api_key}",
                     "Content-Type": "application/json"},
            json={"source": composition},
        )
        if r.status_code not in (200, 201, 202):
            return {"status": "error", "error": f"Creatomate {r.status_code}: {r.text[:150]}",
                    "template_key": selection["template_key"]}

        data = r.json()
        render = data[0] if isinstance(data, list) else data
        render_id = render.get("id", "")

        # Poll
        for _ in range(60):
            await _asyncio.sleep(4)
            r2 = await client.get(
                f"https://api.creatomate.com/v1/renders/{render_id}",
                headers={"Authorization": f"Bearer {creatomate_api_key}"},
            )
            d = r2.json()
            status = d.get("status", "")
            if status == "succeeded":
                return {
                    "status": "succeeded",
                    "output_url": d.get("url", ""),
                    "render_id": render_id,
                    "template_key": selection["template_key"],
                    "template_label": template.label,
                    "template_tone": template.tone,
                    "reasoning": selection["reasoning"],
                    "fields_applied": fields,
                }
            if status == "failed":
                return {"status": "failed",
                        "error": d.get("error_message", "unknown"),
                        "template_key": selection["template_key"]}

    return {"status": "timeout", "render_id": render_id,
            "template_key": selection["template_key"]}
