"""
Visual Composition Service — GPT-4o Vision ile kaynak fotoğrafı analiz eder,
Creatomate için akıllı kompozisyon kılavuzu üretir.

Ajan videonun içeriğini "görerek" şu soruları yanıtlar:
- Metnin gidebileceği boş alan neresi? (üst/alt/sol/sağ)
- Overlay ne kadar opak olmalı? (açık arka plan → az; karanlık → fazla)
- En fazla kaç satır metin sığar?
- Dominant renk paleti ne? (CTA rengini kontrast için ayarla)
- Görsel ağırlık merkezi nerede? (kompozisyon kuralları)
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog

logger = structlog.get_logger()


@dataclass
class VisualSpec:
    """
    Kaynak fotoğrafın analizi sonucu oluşturulan kompozisyon kılavuzu.
    Creatomate composition builder'a bu spec geçilir.
    """
    # Metnin güvenli yerleştirileceği bölge
    text_zone: str = "bottom"           # "top" | "bottom" | "center" | "split"
    # Gradient/overlay yoğunluğu (0.0 = hiç, 0.85 = tam kapalı)
    overlay_opacity: float = 0.45
    # Maksimum metin satırı sayısı
    max_text_lines: int = 1             # 1 = sadece başlık, 2 = başlık + alt
    # Görsel tonu (text rengini belirler)
    visual_tone: str = "dark"           # "dark" | "light" | "mixed"
    # Baskın renk paleti (hex)
    dominant_colors: list[str] = field(default_factory=lambda: ["#1a1a2e"])
    # Önerilen overlay gradient yönü
    gradient_direction: str = "bottom"  # "bottom" | "top" | "none"
    # CTA göster/gizle
    show_cta: bool = True
    # Logo pozisyonu
    logo_position: str = "top_right"    # "top_right" | "top_left" | "bottom_right" | "none"
    # Analiz özeti (debug için)
    analysis_summary: str = ""
    # Metin y pozisyonu (yüzde)
    text_y_percent: float = 85.0
    # Overlay başlangıç y (gradient için)
    overlay_start_y: float = 60.0


async def analyze_image_for_composition(
    image_url: str,
    openai_api_key: str,
    brand_name: str = "",
    content_title: str = "",
) -> VisualSpec:
    """
    GPT-4o Vision ile fotoğrafı analiz et, Creatomate kompozisyon spec'i üret.
    Hata durumunda güvenli default spec döner.
    """
    if not openai_api_key or not image_url:
        return VisualSpec()

    try:
        # URL veya base64 data URI'yi hazırla
        if image_url.startswith("data:image"):
            image_content: dict[str, Any] = {
                "type": "image_url",
                "image_url": {"url": image_url, "detail": "low"},
            }
        elif image_url.startswith("http"):
            image_content = {
                "type": "image_url",
                "image_url": {"url": image_url, "detail": "low"},
            }
        else:
            return VisualSpec()

        prompt = f"""You are a professional art director analyzing a social media video frame.
Brand: {brand_name or "Premium brand"}
Content title: {content_title[:60] if content_title else "N/A"}

Analyze this image and return a JSON object with EXACTLY these fields:

{{
  "text_zone": "bottom",  // where text can be placed: "top" | "bottom" | "center" | "split"
                          // Choose where the image has empty/negative space
  "overlay_opacity": 0.35,  // 0.15-0.75 — how much overlay is needed for text readability
                             // Light/bright image → 0.45+; Dark image → 0.20; Complex/busy → 0.55
  "max_text_lines": 1,    // 1 = title only (preferred for premium brands)
                           // 2 = title + subtitle (only if there is clear space)
  "visual_tone": "dark",  // "dark" | "light" | "mixed" — dominant image brightness
  "dominant_colors": ["#hex"],  // 1-3 dominant colors as hex codes
  "gradient_direction": "bottom",  // "bottom" | "top" | "none"
  "show_cta": true,       // false if image is too busy for a CTA button
  "logo_position": "top_right",  // "top_right" | "top_left" | "bottom_right" | "none"
  "text_y_percent": 82,   // 0-100, Y position for main text (% from top)
  "overlay_start_y": 58,  // where the gradient starts (% from top)
  "analysis_summary": "..."  // 1 sentence: what you see and why you made these choices
}}

CRITICAL RULES:
- Prefer minimal text. If the image is beautiful, let it breathe.
- Premium brands: max 1 text line, subtle overlay
- Never block the subject/hero of the image with text
- If image has dark bottom → no overlay needed, low opacity
- If image has bright/white bottom → need overlay for readability
- Return ONLY the JSON. No prose."""

        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {openai_api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "user", "content": [image_content, {"type": "text", "text": prompt}]},
                    ],
                    "max_tokens": 400,
                    "temperature": 0.1,
                },
            )
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"].strip()

        import json, re
        json_match = re.search(r"\{[\s\S]*\}", content)
        if not json_match:
            return VisualSpec()

        data = json.loads(json_match.group())
        spec = VisualSpec(
            text_zone=data.get("text_zone", "bottom"),
            overlay_opacity=float(data.get("overlay_opacity", 0.35)),
            max_text_lines=int(data.get("max_text_lines", 1)),
            visual_tone=data.get("visual_tone", "dark"),
            dominant_colors=data.get("dominant_colors", ["#1a1a2e"]),
            gradient_direction=data.get("gradient_direction", "bottom"),
            show_cta=bool(data.get("show_cta", True)),
            logo_position=data.get("logo_position", "top_right"),
            text_y_percent=float(data.get("text_y_percent", 82)),
            overlay_start_y=float(data.get("overlay_start_y", 58)),
            analysis_summary=data.get("analysis_summary", ""),
        )
        logger.info(
            "visual_composition_analyzed",
            text_zone=spec.text_zone,
            overlay_opacity=spec.overlay_opacity,
            max_lines=spec.max_text_lines,
            summary=spec.analysis_summary[:80],
        )
        return spec

    except Exception as exc:
        logger.warning("visual_composition_analysis_failed", error=str(exc))
        return VisualSpec()
