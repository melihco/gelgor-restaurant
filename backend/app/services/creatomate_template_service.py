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

# ── Render approach: Creatomate does NOT expose a template-creation API.
# We use RenderScript (inline JSON) in each render call — no pre-seeding needed.
# `seed_templates` now creates renders as a smoke test and returns local metadata.
# For brand-specific overrides, use `render_with_renderscript` instead of template IDs.


# ── Template tanımları ─────────────────────────────────────────────────────────

TEMPLATE_DEFINITIONS = [
    # ── Photo-based post/story templates (Sprint: Creatomate adapter) ───────────
    {
        "key": "post_bold",
        "name": "SmartAgency · Post Bold",
        "description": "Fotoğraf üzerine güçlü bold başlık. Feed post (1:1).",
        "format": "post",
        "preview_label": "POST BOLD",
        "source": {
            "output_format": "jpg",
            "width": 1080, "height": 1080,
            "elements": [
                {
                    "name": "Background-Photo",
                    "type": "image",
                    "source": "https://creatomate.com/files/assets/f0eeceaa-d46b-4b29-a5e6-1de51eb3ef70",
                    "x": "50%", "y": "50%", "width": "100%", "height": "100%", "fit": "cover",
                },
                {
                    "name": "Bottom-Gradient",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "52%", "width": "100%", "height": "48%",
                    "fill_color": "linear-gradient(to bottom, transparent, rgba(0,0,0,0.72))",
                },
                {
                    "name": "Main-Title",
                    "type": "text", "text": "BAŞLIK",
                    "x": "50%", "y": "82%", "width": "86%",
                    "font_family": "Montserrat", "font_weight": "700", "font_size": 78,
                    "fill_color": "#ffffff", "text_align": "center", "letter_spacing": 3,
                },
                {
                    "name": "Subtitle",
                    "type": "text", "text": "",
                    "x": "50%", "y": "90%", "width": "78%",
                    "font_family": "Montserrat", "font_weight": "400", "font_size": 32,
                    "fill_color": "rgba(255,255,255,0.72)", "text_align": "center", "letter_spacing": 2,
                },
                {
                    "name": "Brand-Name",
                    "type": "text", "text": "MARKA",
                    "x": "50%", "y": "96%",
                    "font_family": "Montserrat", "font_weight": "300", "font_size": 24,
                    "fill_color": "rgba(255,255,255,0.50)", "text_align": "center", "letter_spacing": 6,
                },
                {
                    "name": "Accent-Line",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "93%", "width": "12%", "height": "0.22%",
                    "fill_color": "#c9a96e",
                },
            ],
        },
    },
    {
        "key": "post_editorial",
        "name": "SmartAgency · Post Editorial",
        "description": "Alt orta hizalı italic serif metin. Editoryal estetik. Feed post (1:1).",
        "format": "post",
        "preview_label": "EDITORIAL",
        "source": {
            "output_format": "jpg",
            "width": 1080, "height": 1080,
            "elements": [
                {
                    "name": "Background-Photo",
                    "type": "image",
                    "source": "https://creatomate.com/files/assets/f0eeceaa-d46b-4b29-a5e6-1de51eb3ef70",
                    "x": "50%", "y": "50%", "width": "100%", "height": "100%", "fit": "cover",
                },
                {
                    "name": "Bottom-Gradient",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "68%", "width": "100%", "height": "64%",
                    "fill_color": "linear-gradient(to bottom, transparent, rgba(0,0,0,0.75))",
                },
                {
                    "name": "Accent-Line",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "74%", "width": "14%", "height": "0.5%",
                    "fill_color": "#c9a96e",
                },
                {
                    "name": "Main-Title",
                    "type": "text", "text": "Başlık",
                    "x": "50%", "y": "82%", "width": "82%",
                    "font_family": "Playfair Display", "font_style": "italic",
                    "font_weight": "700", "font_size": 76,
                    "fill_color": "#ffffff", "text_align": "center", "letter_spacing": 1, "line_height": 1.1,
                },
                {
                    "name": "Subtitle",
                    "type": "text", "text": "",
                    "x": "50%", "y": "91%", "width": "72%",
                    "font_family": "Montserrat", "font_weight": "300", "font_size": 26,
                    "fill_color": "rgba(255,255,255,0.68)", "text_align": "center", "letter_spacing": 3,
                },
                {
                    "name": "Brand-Name",
                    "type": "text", "text": "MARKA",
                    "x": "50%", "y": "97%",
                    "font_family": "Montserrat", "font_weight": "300", "font_size": 20,
                    "fill_color": "rgba(255,255,255,0.45)", "text_align": "center", "letter_spacing": 6,
                },
            ],
        },
    },
    {
        # Premium editorial story — photo full bleed with cinematic text treatment.
        # Category label (tracked caps) → ultra-bold headline → light subtitle → brand bar.
        # Competing with AURYX / Sprout Social premium output standard.
        "key": "story_photo_bold",
        "name": "SmartAgency · Story Editorial",
        "description": "Sinematik fotoğraf + kategori etiketi + ultra-bold başlık + marka çubuğu.",
        "format": "story_photo",
        "preview_label": "EDITORIAL",
        "source": {
            "output_format": "mp4",
            "width": 1080, "height": 1920, "duration": 5,
            "elements": [
                # Ken Burns slow zoom — keeps attention on photo
                {
                    "name": "Background-Photo",
                    "type": "image",
                    "source": "https://creatomate.com/files/assets/f0eeceaa-d46b-4b29-a5e6-1de51eb3ef70",
                    "x": "50%", "y": "50%", "width": "100%", "height": "100%", "fit": "cover",
                    "animations": [{"type": "scale", "start_scale": "100%", "end_scale": "107%",
                                    "easing": "linear", "scope": "element"}],
                },
                # Subtle vignette (not heavy — photo must breathe)
                {
                    "name": "Vignette",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "50%", "width": "100%", "height": "100%",
                    "fill_color": "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.30) 100%)",
                },
                # Bottom text zone — deep gradient for legibility
                {
                    "name": "Bottom-Zone",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "60%", "width": "100%", "height": "40%",
                    "fill_color": "linear-gradient(to bottom, transparent, rgba(0,0,0,0.82))",
                },
                # Top safe zone — handle area
                {
                    "name": "Top-Zone",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "0%", "width": "100%", "height": "14%",
                    "fill_color": "linear-gradient(to bottom, rgba(0,0,0,0.42), transparent)",
                },
                # Brand handle top-left
                {
                    "name": "Brand-Name",
                    "type": "text", "text": "MARKA",
                    "x": "50%", "y": "6%", "width": "80%",
                    "font_family": "Montserrat", "font_weight": "300", "font_size": 26,
                    "fill_color": "rgba(255,255,255,0.72)", "text_align": "center", "letter_spacing": 8,
                    "animations": [{"time": 0.0, "duration": 0.6, "type": "fade"}],
                },
                # Category label — small tracked caps above headline
                {
                    "name": "Category-Label",
                    "type": "text", "text": "CATEGORY",
                    "x": "50%", "y": "76%", "width": "80%",
                    "font_family": "Montserrat", "font_weight": "400", "font_size": 22,
                    "fill_color": "#c9a96e",   # accent color (overridden per brand)
                    "text_align": "center", "letter_spacing": 10,
                    "animations": [{"time": 0.2, "duration": 0.6, "type": "fade"}],
                },
                # Ultra-bold headline — the statement
                {
                    "name": "Main-Title",
                    "type": "text", "text": "BAŞLIK",
                    "x": "50%", "y": "85%", "width": "84%",
                    "font_family": "Montserrat", "font_weight": "800", "font_size": 90,
                    "fill_color": "#ffffff", "text_align": "center", "letter_spacing": 1,
                    "line_height": 1.10,
                    "animations": [{"time": 0.35, "duration": 0.75, "easing": "ease-out",
                                    "type": "slide", "direction": "up", "scope": "split-clip"}],
                },
                # Light italic subtitle — context/hook
                {
                    "name": "Subtitle",
                    "type": "text", "text": "",
                    "x": "50%", "y": "93.5%", "width": "70%",
                    "font_family": "Montserrat", "font_weight": "300", "font_style": "italic",
                    "font_size": 28, "fill_color": "rgba(255,255,255,0.72)",
                    "text_align": "center", "letter_spacing": 1.5,
                    "animations": [{"time": 0.7, "duration": 0.5, "type": "fade"}],
                },
                # Brand accent bottom bar
                {
                    "name": "Accent-Bar",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "97.5%", "width": "14%", "height": "0.22%",
                    "fill_color": "#c9a96e",
                    "animations": [{"time": 0.5, "duration": 0.5, "type": "fade"}],
                },
            ],
        },
    },
    {
        # Luxury split-panel story — 60% photo + 40% brand color panel.
        # Text lives on solid panel (max legibility). For premium/luxury brands.
        "key": "story_script",
        "name": "SmartAgency · Story Luxury Split",
        "description": "60% fotoğraf + 40% marka rengi panel. Lüks ve premium markalar.",
        "format": "story_photo",
        "preview_label": "LUXURY SPLIT",
        "source": {
            "output_format": "mp4",
            "width": 1080, "height": 1920, "duration": 5,
            "elements": [
                # Photo — top 60%
                {
                    "name": "Background-Photo",
                    "type": "image",
                    "source": "https://creatomate.com/files/assets/f0eeceaa-d46b-4b29-a5e6-1de51eb3ef70",
                    "x": "50%", "y": "30%", "width": "100%", "height": "60%", "fit": "cover",
                    "animations": [{"type": "scale", "start_scale": "100%", "end_scale": "105%",
                                    "easing": "linear", "scope": "element"}],
                },
                # Brand color panel — bottom 40%
                {
                    "name": "Brand-Panel",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "70%", "width": "100%", "height": "40%",
                    "fill_color": "#1a2b4a",   # primary color (overridden per brand)
                },
                # Thin accent separator line
                {
                    "name": "Separator-Line",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "60%", "width": "100%", "height": "0.20%",
                    "fill_color": "#c9a96e",
                },
                # Brand name on panel — small tracked
                {
                    "name": "Brand-Name",
                    "type": "text", "text": "MARKA",
                    "x": "50%", "y": "66%", "width": "80%",
                    "font_family": "Montserrat", "font_weight": "300", "font_size": 22,
                    "fill_color": "rgba(255,255,255,0.55)", "text_align": "center", "letter_spacing": 10,
                    "animations": [{"time": 0.3, "duration": 0.6, "type": "fade"}],
                },
                # Headline on panel — bold, white
                {
                    "name": "Main-Title",
                    "type": "text", "text": "BAŞLIK",
                    "x": "50%", "y": "76%", "width": "82%",
                    "font_family": "Montserrat", "font_weight": "800", "font_size": 76,
                    "fill_color": "#ffffff", "text_align": "center", "letter_spacing": 2,
                    "line_height": 1.12,
                    "animations": [{"time": 0.4, "duration": 0.7, "easing": "ease-out",
                                    "type": "slide", "direction": "up", "scope": "split-clip"}],
                },
                # Subtitle — accent colored italic
                {
                    "name": "Subtitle",
                    "type": "text", "text": "",
                    "x": "50%", "y": "88%", "width": "72%",
                    "font_family": "Montserrat", "font_weight": "300", "font_style": "italic",
                    "font_size": 30, "fill_color": "#c9a96e",
                    "text_align": "center", "letter_spacing": 1,
                    "animations": [{"time": 0.65, "duration": 0.5, "type": "fade"}],
                },
                # CTA dot row bottom
                {
                    "name": "Accent-Dots",
                    "type": "text", "text": "· · ·",
                    "x": "50%", "y": "95%",
                    "font_family": "Montserrat", "font_weight": "300", "font_size": 28,
                    "fill_color": "rgba(255,255,255,0.35)", "text_align": "center", "letter_spacing": 8,
                    "animations": [{"time": 0.8, "duration": 0.4, "type": "fade"}],
                },
            ],
        },
    },
    {
        # Cinematic minimal — photo full, single centered statement, no heavy overlay.
        # Best for sunset / atmosphere / lifestyle content.
        "key": "story_cinematic",
        "name": "SmartAgency · Story Cinematic",
        "description": "Fotoğraf baskın, tek ifade ortada, vignette minimal. Atmosfer içerikleri.",
        "format": "story_photo",
        "preview_label": "CINEMATIC",
        "source": {
            "output_format": "mp4",
            "width": 1080, "height": 1920, "duration": 5,
            "elements": [
                {
                    "name": "Background-Photo",
                    "type": "image",
                    "source": "https://creatomate.com/files/assets/f0eeceaa-d46b-4b29-a5e6-1de51eb3ef70",
                    "x": "50%", "y": "50%", "width": "100%", "height": "100%", "fit": "cover",
                    "animations": [{"type": "scale", "start_scale": "102%", "end_scale": "100%",
                                    "easing": "linear", "scope": "element"}],
                },
                # Very subtle vignette — photo must breathe
                {
                    "name": "Vignette",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "50%", "width": "100%", "height": "100%",
                    "fill_color": "radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,0.22) 100%)",
                },
                # Top gradient for safe zone
                {
                    "name": "Top-Fade",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "0%", "width": "100%", "height": "18%",
                    "fill_color": "linear-gradient(to bottom, rgba(0,0,0,0.38), transparent)",
                },
                # Bottom fade
                {
                    "name": "Bottom-Fade",
                    "type": "shape", "shape": "rectangle",
                    "x": "0%", "y": "78%", "width": "100%", "height": "22%",
                    "fill_color": "linear-gradient(to bottom, transparent, rgba(0,0,0,0.58))",
                },
                # Brand — very minimal, top
                {
                    "name": "Brand-Name",
                    "type": "text", "text": "MARKA",
                    "x": "50%", "y": "6.5%",
                    "font_family": "Montserrat", "font_weight": "200", "font_size": 24,
                    "fill_color": "rgba(255,255,255,0.60)", "text_align": "center", "letter_spacing": 10,
                    "animations": [{"time": 0.0, "duration": 0.8, "type": "fade"}],
                },
                # Thin accent line above headline (mid)
                {
                    "name": "Mid-Line",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "52%", "width": "6%", "height": "0.16%",
                    "fill_color": "#c9a96e",
                    "animations": [{"time": 0.2, "duration": 0.6, "type": "fade"}],
                },
                # Centered cinematic headline — weight 700, generous letter spacing
                {
                    "name": "Main-Title",
                    "type": "text", "text": "BAŞLIK",
                    "x": "50%", "y": "59%", "width": "78%",
                    "font_family": "Montserrat", "font_weight": "700", "font_size": 80,
                    "fill_color": "#ffffff", "text_align": "center", "letter_spacing": 5,
                    "line_height": 1.15,
                    "animations": [{"time": 0.35, "duration": 0.85, "type": "fade"}],
                },
                # Light italic — mood/tagline
                {
                    "name": "Subtitle",
                    "type": "text", "text": "",
                    "x": "50%", "y": "69%", "width": "60%",
                    "font_family": "Montserrat", "font_weight": "300", "font_style": "italic",
                    "font_size": 28, "fill_color": "rgba(255,255,255,0.65)",
                    "text_align": "center", "letter_spacing": 2,
                    "animations": [{"time": 0.6, "duration": 0.6, "type": "fade"}],
                },
                # Bottom: brand wordmark or location
                {
                    "name": "Location-Tag",
                    "type": "text", "text": "",
                    "x": "50%", "y": "91%",
                    "font_family": "Montserrat", "font_weight": "300", "font_size": 22,
                    "fill_color": "rgba(255,255,255,0.45)", "text_align": "center", "letter_spacing": 7,
                    "animations": [{"time": 0.8, "duration": 0.4, "type": "fade"}],
                },
                # Accent bar bottom
                {
                    "name": "Accent-Bar",
                    "type": "shape", "shape": "rectangle",
                    "x": "50%", "y": "97%", "width": "10%", "height": "0.18%",
                    "fill_color": "#c9a96e",
                },
            ],
        },
    },
    # ── Video Reel templates (mevcut 4 + yeni) ─────────────────────────────────
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
                    "font_family": "Playfair Display",
                    "font_style": "italic",
                    "font_weight": "700",
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
                                    "type": "slide", "direction": "up", "scope": "split-clip"}],
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
                                    "type": "slide", "direction": "up", "scope": "split-clip"}],
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
    Creatomate template-creation API yoktur; template'ler web editörde yapılır.
    Bu fonksiyon artık local metadata'yı döndürür ve API bağlantısını doğrular.
    RenderScript yaklaşımında template ID yerine inline JSON kullanılır.
    """
    # API bağlantı kontrolü
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{_API}/templates",
            headers={"Authorization": f"Bearer {api_key}"})
        api_ok = r.is_success
        account_templates = r.json() if api_ok else []
        logger.info("creatomate_api_verified", ok=api_ok,
                    account_template_count=len(account_templates))

    # Local metadata'yı döndür — template ID "renderscript:{key}" şeklinde
    return [
        {
            "key": tpl["key"],
            "template_id": f"renderscript:{tpl['key']}",
            "name": tpl["name"],
            "preview_label": tpl["preview_label"],
            "format": tpl["format"],
            "description": tpl["description"],
            "renderscript": True,
        }
        for tpl in TEMPLATE_DEFINITIONS
    ]


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


def _get_renderscript(key: str) -> dict | None:
    """Return the source RenderScript for a given template key."""
    for tpl in TEMPLATE_DEFINITIONS:
        if tpl["key"] == key:
            return tpl["source"]
    return None


# ── Brand personality → Creatomate font family ─────────────────────────────────
# Creatomate supports Google Fonts + a subset of system fonts.
_PERSONALITY_TO_FONT: dict[str, str] = {
    "elegant_serif":      "Playfair Display",
    "luxury_serif":       "Playfair Display",
    "editorial_serif":    "Libre Baskerville",
    "bold_display":       "Oswald",
    "impact_display":     "Anton",
    "clean_modern_sans":  "Montserrat",
    "geometric_sans":     "Poppins",
    "minimal_sans":       "DM Sans",
    "humanist_sans":      "Inter",
    "handwritten":        "Pacifico",
    "script":             "Pacifico",
    "sporty":             "Barlow Condensed",
}

_SAFE_CREATOMATE_FONTS = {
    "Playfair Display", "Montserrat", "Oswald", "Anton", "Poppins",
    "Inter", "DM Sans", "Libre Baskerville", "Pacifico", "Barlow Condensed",
    "Raleway", "Lora", "Cormorant Garamond",
}

def resolve_brand_font(heading_personality: str | None, font_family_override: str | None) -> str:
    """Map brand personality or explicit font to a Creatomate-safe font family."""
    # Explicit override first
    if font_family_override:
        candidate = font_family_override.split(",")[0].strip().strip("'\"")
        if candidate in _SAFE_CREATOMATE_FONTS:
            return candidate
    # Personality mapping
    if heading_personality:
        for key, font in _PERSONALITY_TO_FONT.items():
            if key in heading_personality.lower():
                return font
    return "Montserrat"  # safe default


def select_template_for_brand(
    content_type: str,  # 'post' | 'story' | 'reel'
    business_type: str | None,
    heading_personality: str | None,
    mood: str | None = None,
) -> str:
    """
    Select the most appropriate template key for a brand based on its personality.
    Returns one of the 8 template keys.
    """
    bt = (business_type or "").lower()
    hp = (heading_personality or "").lower()
    mood_l = (mood or "").lower()

    is_luxury   = any(w in bt for w in ("hotel", "otel", "resort", "luxury", "gala")) or \
                  any(w in hp for w in ("elegant", "luxury", "serif"))
    is_night    = any(w in bt for w in ("night", "club", "dj", "bar", "kulüp"))
    is_beach    = any(w in bt for w in ("beach", "sahil", "plaj", "pool"))
    is_minimal  = any(w in hp for w in ("minimal", "clean", "modern")) or \
                  any(w in mood_l for w in ("soft", "calm", "airy"))

    if content_type == "reel":
        if is_night:  return "reel_impact"
        if is_luxury: return "reel_editorial"
        return "reel_minimal"

    if content_type == "story":
        # Rotate between 3 premium story templates by mood/personality
        # story_photo_bold = Editorial (default — best all-round)
        # story_script     = Luxury Split (premium/elevated brands)
        # story_cinematic  = Cinematic Minimal (sunset/atmosphere content)
        if is_luxury: return "story_script"         # luxury split panel
        if is_minimal: return "story_cinematic"     # cinematic minimal
        mood_lower = (mood or "").lower()
        if any(x in mood_lower for x in ("sunset", "golden", "beach", "atmosphere", "nature")):
            return "story_cinematic"
        return "story_photo_bold"  # editorial — best for food/event/brand

    # post
    if is_luxury: return "post_editorial"
    return "post_bold"


def apply_brand_tokens(
    source: dict,
    brand_font: str,
    primary_color: str,
    accent_color: str,
    overlay_opacity: float,
    logo_url: str = "",
) -> dict:
    """
    Apply brand tokens (colors, font, logo) onto a RenderScript source.
    Returns a modified copy — does NOT mutate the original.
    """
    import copy, json as _json

    src = copy.deepcopy(source)

    for el in src.get("elements", []):
        el_type = el.get("type", "")
        el_name = el.get("name", "")

        # Font: apply brand font to all text elements (except subtitle/brand-name — keep proportional)
        if el_type == "text" and el_name in ("Main-Title",):
            el["font_family"] = brand_font

        # Accent color: apply to accent shapes and decorative lines
        if el_type == "shape" and el_name in ("Accent-Line", "Date-Badge", "Top-Bar"):
            fill = el.get("fill_color", "")
            if "#c9a96e" in fill or "#e8c97" in fill:
                el["fill_color"] = accent_color

        # Gradient overlays: scale opacity with brand overlay_opacity preference
        if el_type == "shape" and "gradient" in _json.dumps(el.get("fill_color", "")).lower():
            # Scale the rgba opacity values (very basic — multiplies by ratio)
            ratio = overlay_opacity / 0.35  # 0.35 is our base
            fill = el.get("fill_color", "")
            if "rgba(0,0,0," in fill:
                import re
                def scale_alpha(m: re.Match) -> str:
                    alpha = float(m.group(1))
                    return f"rgba(0,0,0,{min(0.90, alpha * ratio):.2f})"
                el["fill_color"] = re.sub(r"rgba\(0,0,0,([\d.]+)\)", scale_alpha, fill)

    # Logo overlay — top-right corner
    if logo_url:
        src["elements"].append({
            "name": "Brand-Logo",
            "type": "image",
            "source": logo_url,
            "x": "88%", "y": "6%",
            "width": "16%", "height": "8%",
            "fit": "contain",
            "opacity": 0.85,
        })

    return src


async def render_for_brand(
    api_key: str,
    content_type: str,
    photo_url: str = "",
    video_url: str = "",
    title: str = "",
    brand_name: str = "",
    subtitle: str = "",
    date_badge: str = "",
    # Brand tokens (from BrandTemplate / brand_vibe_profile)
    accent_color: str = "#c9a96e",
    primary_color: str = "#1a1a2e",
    font_family: str = "",
    heading_personality: str = "",
    overlay_opacity: float = 0.35,
    logo_url: str = "",
    business_type: str = "",
    mood: str = "",
    extra: dict | None = None,
) -> dict:
    """
    Brand-aware Creatomate render: auto-selects template, applies brand tokens.
    This is the primary entry point — callers don't need to specify template_key.
    """
    template_key = select_template_for_brand(
        content_type=content_type,
        business_type=business_type,
        heading_personality=heading_personality,
        mood=mood,
    )
    brand_font = resolve_brand_font(heading_personality, font_family)
    source = _get_renderscript(template_key)
    if not source:
        raise ValueError(f"No renderscript for template key: {template_key}")

    branded_source = apply_brand_tokens(
        source=source,
        brand_font=brand_font,
        primary_color=primary_color,
        accent_color=accent_color,
        overlay_opacity=overlay_opacity,
        logo_url=logo_url,
    )

    # Temporarily register the branded template
    brand_key = f"{template_key}_branded_{id(branded_source)}"
    TEMPLATE_DEFINITIONS.append({
        "key": brand_key, "name": brand_key, "description": "",
        "format": content_type, "preview_label": "", "source": branded_source,
    })
    try:
        result = await render_with_template(
            api_key=api_key,
            template_id=f"renderscript:{brand_key}",
            photo_url=photo_url,
            video_url=video_url,
            title=title,
            brand_name=brand_name,
            subtitle=subtitle,
            date_badge=date_badge,
            accent_color=accent_color,
            extra=extra,
        )
    finally:
        TEMPLATE_DEFINITIONS[:] = [t for t in TEMPLATE_DEFINITIONS if t["key"] != brand_key]

    result["template_key"] = template_key
    result["brand_font"] = brand_font
    return result


async def render_with_template(
    api_key: str,
    template_id: str,
    video_url: str = "",
    photo_url: str = "",
    title: str = "",
    brand_name: str = "",
    date_badge: str = "",
    subtitle: str = "",
    accent_color: str = "#c9a96e",
    extra: dict | None = None,
) -> dict:
    """
    Template ID + modifications ile Creatomate render.
    Element adları bizim tanımlarımızla eşleşiyor.
    """
    modifications: dict[str, Any] = {}

    # Determine media field name based on content type
    media_field = "Background-Photo" if photo_url else "Background-Video"
    media_url = photo_url or video_url
    if media_url:
        modifications[f"{media_field}.source"] = media_url
    if title:
        modifications["Main-Title.text"] = title.upper() if len(title) < 40 else title
    if brand_name:
        modifications["Brand-Name.text"] = brand_name.upper()
    if date_badge:
        modifications["Date-Badge.text"] = date_badge
    if subtitle:
        modifications["Subtitle.text"] = subtitle
    if accent_color and accent_color != "#c9a96e":
        modifications["Accent-Line.fill_color"] = accent_color
        modifications["Accent-Bar.fill_color"] = accent_color
        modifications["Separator-Line.fill_color"] = accent_color
        modifications["Mid-Line.fill_color"] = accent_color
        modifications["Category-Label.fill_color"] = accent_color
        modifications["Date-Badge.fill_color"] = accent_color

    # Category label — infer from title (e.g. "CHEF'S ARTISTRY" → "KITCHEN")
    # Callers can override via extra={"Category-Label.text": "FOOD & DRINK"}
    if title and "Category-Label.text" not in (extra or {}):
        # Default: use template_use_case or first word of title as category hint
        category_hint = extra.pop("category_label", "") if extra else ""
        if category_hint:
            modifications["Category-Label.text"] = category_hint.upper()
        else:
            modifications["Category-Label.text"] = ""  # hide if no hint

    # Location tag for cinematic template
    if brand_name and "Location-Tag.text" not in (extra or {}):
        modifications["Location-Tag.text"] = brand_name.upper()

    if extra:
        modifications.update(extra)

    # RenderScript: use inline template definition (no pre-created template ID needed)
    payload: dict[str, Any] = {}
    if template_id.startswith("renderscript:"):
        key = template_id.removeprefix("renderscript:")
        source = _get_renderscript(key)
        if source is None:
            raise ValueError(f"Unknown RenderScript template key: {key}")
        # Build inline render from RenderScript + modifications as element overrides.
        # Creatomate RenderScript: wrap in { "source": { ...template_source... } }
        import copy as _copy
        source_copy = _copy.deepcopy(source)
        # Apply modifications: "ElementName.property" → walk elements list
        for mod_key, mod_val in modifications.items():
            if "." in mod_key:
                elem_name, prop = mod_key.split(".", 1)
                for el in source_copy.get("elements", []):
                    if el.get("name") == elem_name:
                        el[prop] = mod_val
        payload = {"source": source_copy}
    else:
        payload = {"template_id": template_id, "modifications": modifications}

    async with httpx.AsyncClient(timeout=240) as client:
        r = await client.post(f"{_API}/renders",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload)

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


async def render_story_with_thumbnail(
    api_key: str,
    template_key: str = "story_photo_bold",
    **kwargs,
) -> dict:
    """
    Story için hem animasyonlu MP4 hem statik JPG thumbnail üretir.
    Feed önizlemesi thumbnail_url'yi kullanır; gerçek yayında video_url kullanılır.
    Returns: { render_id, status, output_url (mp4), thumbnail_url (jpg), modifications }
    """
    import copy

    source = _get_renderscript(template_key)
    if not source:
        raise ValueError(f"Unknown template key: {template_key}")

    # JPG thumbnail version — strip animations
    thumb_source = copy.deepcopy(source)
    thumb_source["output_format"] = "jpg"
    for el in thumb_source.get("elements", []):
        el.pop("animations", None)

    # Add thumbnail template temporarily
    thumb_key = f"{template_key}_thumb_{id(thumb_source)}"
    TEMPLATE_DEFINITIONS.append({
        "key": thumb_key, "name": thumb_key, "description": "",
        "format": "story_thumb", "preview_label": "", "source": thumb_source,
    })

    try:
        # Render both in parallel
        mp4_task = asyncio.create_task(
            render_with_template(api_key, f"renderscript:{template_key}", **kwargs)
        )
        jpg_task = asyncio.create_task(
            render_with_template(api_key, f"renderscript:{thumb_key}", **kwargs)
        )
        mp4_res, jpg_res = await asyncio.gather(mp4_task, jpg_task, return_exceptions=True)
    finally:
        TEMPLATE_DEFINITIONS[:] = [t for t in TEMPLATE_DEFINITIONS if t["key"] != thumb_key]

    video_url = mp4_res.get("output_url", "") if not isinstance(mp4_res, Exception) else ""
    thumb_url = jpg_res.get("output_url", "") if not isinstance(jpg_res, Exception) else ""

    return {
        "render_id": mp4_res.get("render_id", "") if not isinstance(mp4_res, Exception) else "",
        "status": "succeeded" if video_url else "failed",
        "output_url": video_url,
        "thumbnail_url": thumb_url,
    }
