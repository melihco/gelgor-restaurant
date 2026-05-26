"""
Smart Template Library — brand + içerik tipine göre otomatik template seçimi.

Yaklaşım:
  1. Kod içinde 16 composition template tanımlı (JSON)
  2. Her template metadata ile etiketli: hangi marka tipi, hangi içerik, hangi ton
  3. Template Brain (GPT-4o) brand + content brief → en uygun template'i seçer
  4. Field Mapper → seçilen template'in değişken slotlarına agent çıktılarını yazar
  5. Creatomate source API'ye gönderilir (template_id gerekmez)

Template seçim kriterleri:
  - brand_types: hangi sektörler için uygun
  - content_uses: hangi içerik tipinde kullan
  - tone: minimal / editorial / impact / warm / corporate
  - urgency: low / medium / high
  - format: reel_9x16 / story_9x16 / feed_1x1
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class TemplateSlot:
    """Composition içindeki değiştirilebilir element."""
    element_name: str   # "Main-Title", "Brand-Name" vs.
    field_type: str     # "title" | "brand_name" | "subtitle" | "date" | "cta" | "video" | "image"
    required: bool = True


@dataclass
class SmartTemplate:
    key: str
    label: str
    format: str           # "reel_9x16" | "story_9x16" | "feed_1x1"
    tone: str             # "minimal" | "editorial" | "impact" | "warm" | "luxury" | "corporate"
    brand_types: list[str]       # ["beach_club","hotel","restaurant","wellness","corporate_event","bakery","olive_oil","mental_health"]
    content_uses: list[str]      # ["brand_story","event","product","social_proof","promotional","bts","educational"]
    urgency_fit: list[str]       # ["low","medium","high"]
    description: str             # AI'nın okuyacağı açıklama
    slots: list[TemplateSlot]    # Değişken slotlar
    composition: dict            # Creatomate JSON


# ── Yardımcılar ───────────────────────────────────────────────────────────────

def _rgba(hex_color: str, opacity: float) -> str:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r},{g},{b},{opacity:.2f})"

def _video_el(name: str = "Background-Video") -> dict:
    return {
        "name": name, "type": "video",
        "source": "__VIDEO__",
        "x": "50%", "y": "50%", "width": "100%", "height": "100%",
        "fit": "cover", "volume": 0, "loop": True,
    }

def _fade(y_start: float, height: float, color_hex: str, opacity: float, direction: str = "bottom") -> dict:
    start = "transparent"
    end = _rgba(color_hex, opacity)
    grad = f"linear-gradient(to {direction}, {start}, {end})"
    return {"name": f"Fade-{y_start}", "type": "shape", "shape": "rectangle",
            "x": "0%", "y": f"{y_start}%", "width": "100%", "height": f"{height}%",
            "fill_color": grad}

def _text(name: str, text: str, x: str, y: str, size: int, weight: str,
          color: str = "#ffffff", align: str = "center", tracking: int = 3,
          width: str = "82%", font: str = "Montserrat", italic: bool = False,
          line_height: float = 1.15, anim: dict | None = None) -> dict:
    el: dict = {
        "name": name, "type": "text", "text": text,
        "x": x, "y": y, "width": width,
        "font_family": font, "font_weight": weight, "font_size": size,
        "fill_color": color, "text_align": align,
        "letter_spacing": tracking, "line_height": line_height,
    }
    if italic:
        el["font_style"] = "italic"
    if anim:
        el["animations"] = [anim]
    return el

def _line(name: str, x: str, y: str, width: str, color: str, height: str = "0.22%") -> dict:
    return {"name": name, "type": "shape", "shape": "rectangle",
            "x": x, "y": y, "width": width, "height": height, "fill_color": color}

def _rect(name: str, x: str, y: str, w: str, h: str, color: str,
          radius: str | None = None, opacity: float | None = None) -> dict:
    el = {"name": name, "type": "shape", "shape": "rectangle",
          "x": x, "y": y, "width": w, "height": h, "fill_color": color}
    if radius:
        el["border_radius"] = radius
    if opacity is not None:
        el["opacity"] = opacity
    return el

_SLIDE_UP = {"time": 0.4, "duration": 0.7, "easing": "ease-out", "type": "text-slide", "direction": "up"}
_FADE_IN  = {"time": 0.5, "duration": 0.6, "easing": "ease-out", "type": "fade"}


# ── REEL 9:16 TEMPLATES ────────────────────────────────────────────────────────

def _reel_base(elements: list, duration: float = 5.0) -> dict:
    return {"output_format": "mp4", "width": 1080, "height": 1920,
            "duration": duration, "elements": elements}

def _story_base(elements: list, duration: float = 5.0) -> dict:
    return {"output_format": "mp4", "width": 1080, "height": 1920,
            "duration": duration, "elements": elements}

def _feed_base(elements: list, duration: float = 5.0) -> dict:
    return {"output_format": "mp4", "width": 1080, "height": 1080,
            "duration": duration, "elements": elements}


# ── 16 Template Tanımı ────────────────────────────────────────────────────────

TEMPLATES: list[SmartTemplate] = [

    # ── REEL: Luxury Minimal ──────────────────────────────────────────────────
    SmartTemplate(
        key="reel_luxury_minimal",
        label="Luxury Minimal Reel",
        format="reel_9x16",
        tone="luxury",
        brand_types=["beach_club","hotel","spa","restaurant","olive_oil","boutique"],
        content_uses=["brand_story","product","social_proof","bts"],
        urgency_fit=["low","medium"],
        description="Ultra sade lüks. Video nefes alır. Tek satır başlık, ince altın çizgi. Hiperminimalizm.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_reel_base([
            _video_el(),
            _fade(60, 40, "#000000", 0.55),
            _text("Main-Title","__TITLE__","50%","83%",72,"700",tracking=5,anim=_SLIDE_UP),
            _line("Accent-Line","50%","89.5%","14%","__ACCENT__"),
            _text("Brand-Name","__BRAND__","50%","93%",24,"300",color="rgba(255,255,255,0.50)",tracking=8),
        ]),
    ),

    # ── REEL: Editorial Left ──────────────────────────────────────────────────
    SmartTemplate(
        key="reel_editorial_left",
        label="Editorial Left Reel",
        format="reel_9x16",
        tone="editorial",
        brand_types=["restaurant","cafe","mental_health","wellness","olive_oil","bakery","hotel"],
        content_uses=["brand_story","educational","social_proof","bts"],
        urgency_fit=["low","medium"],
        description="Magazin estetiği. Sol hizalı italic başlık, accent çizgi, marka adı. Kültürel ve hikaye içerikleri.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_reel_base([
            _video_el(),
            {"name":"Left-Fade","type":"shape","shape":"rectangle",
             "x":"0%","y":"30%","width":"58%","height":"45%",
             "fill_color":"linear-gradient(to right, rgba(0,0,0,0.50), transparent)"},
            _text("Main-Title","__TITLE__","22%","48%",78,"600",
                  align="left",tracking=1,width="40%",font="Cormorant Garamond",italic=True),
            _line("Accent-Line","22%","57.5%","26%","__ACCENT__"),
            _text("Brand-Name","__BRAND__","22%","62%",22,"300",
                  color="rgba(255,255,255,0.45)",align="left",tracking=6),
        ]),
    ),

    # ── REEL: Impact Center ───────────────────────────────────────────────────
    SmartTemplate(
        key="reel_impact_center",
        label="Impact Center Reel",
        format="reel_9x16",
        tone="impact",
        brand_types=["beach_club","corporate_event","restaurant","hotel","retail"],
        content_uses=["event","promotional","brand_story"],
        urgency_fit=["medium","high"],
        description="Güçlü gradient, 900 bold, merkezi. Yüksek enerji etkinlik ve kampanya içerikleri.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_reel_base([
            _video_el(),
            _fade(48, 52, "#000000", 0.75),
            _text("Main-Title","__TITLE__","50%","76%",96,"900",tracking=3,anim=_SLIDE_UP),
            _line("Accent-Line","50%","84%","20%","__ACCENT__"),
            _text("Brand-Name","__BRAND__","50%","90%",26,"300",
                  color="rgba(255,255,255,0.45)",tracking=7),
        ]),
    ),

    # ── REEL: Event Badge ─────────────────────────────────────────────────────
    SmartTemplate(
        key="reel_event_badge",
        label="Event Badge Reel",
        format="reel_9x16",
        tone="impact",
        brand_types=["beach_club","corporate_event","restaurant","hotel","retail"],
        content_uses=["event"],
        urgency_fit=["medium","high"],
        description="Etkinlik duyurusu için. Accent renkli tarih badge, başlık, marka adı. Tarih/etkinlik içerikleri.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Date-Badge","date"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_reel_base([
            _video_el(),
            {"name":"Full-Overlay","type":"shape","shape":"rectangle",
             "x":"0%","y":"0%","width":"100%","height":"100%",
             "fill_color":"rgba(0,0,0,0.35)"},
            _rect("Date-Pill","50%","33%","50%","7.5%","__ACCENT__",radius="40"),
            _text("Date-Badge","__DATE__","50%","33%",40,"700",color="#000000",tracking=1),
            _text("Main-Title","__TITLE__","50%","50%",78,"700",tracking=2,anim=_SLIDE_UP),
            _line("Accent-Line","50%","58.5%","18%","rgba(255,255,255,0.40)"),
            _text("Brand-Name","__BRAND__","50%","64%",24,"300",
                  color="rgba(255,255,255,0.45)",tracking=7),
        ]),
    ),

    # ── REEL: Warm Product ────────────────────────────────────────────────────
    SmartTemplate(
        key="reel_warm_product",
        label="Warm Product Reel",
        format="reel_9x16",
        tone="warm",
        brand_types=["bakery","olive_oil","restaurant","cafe","food"],
        content_uses=["product","brand_story","social_proof"],
        urgency_fit=["low","medium"],
        description="Ürün ve yemek içerikleri. Sıcak alt gradient, serif başlık, yumuşak. Gıda markaları için.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_reel_base([
            _video_el(),
            _fade(62, 38, "#1a0c00", 0.65),
            _text("Main-Title","__TITLE__","50%","82%",70,"600",
                  font="Cormorant Garamond",tracking=2,anim=_SLIDE_UP),
            _line("Accent-Line","50%","89%","16%","__ACCENT__"),
            _text("Brand-Name","__BRAND__","50%","93%",24,"300",
                  color="rgba(255,255,255,0.50)",tracking=6),
        ]),
    ),

    # ── REEL: Corporate Clean ─────────────────────────────────────────────────
    SmartTemplate(
        key="reel_corporate_clean",
        label="Corporate Clean Reel",
        format="reel_9x16",
        tone="corporate",
        brand_types=["corporate_event","mental_health","wellness","b2b","professional_services"],
        content_uses=["brand_story","educational","social_proof","promotional"],
        urgency_fit=["low","medium","high"],
        description="B2B ve kurumsal markalar. Sade, güvenilir, profesyonel. Sol üst marka logosu alanı.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Subtitle","subtitle",required=False),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_reel_base([
            _video_el(),
            {"name":"Top-Bar","type":"shape","shape":"rectangle",
             "x":"0%","y":"0%","width":"100%","height":"15%",
             "fill_color":"linear-gradient(to bottom, rgba(0,0,0,0.60), transparent)"},
            _text("Brand-Name","__BRAND__","12%","7.5%",28,"700",
                  align="left",tracking=5,width="50%"),
            _fade(58, 42, "#000000", 0.68),
            _text("Main-Title","__TITLE__","50%","78%",68,"700",tracking=2,anim=_SLIDE_UP),
            _text("Subtitle","__SUBTITLE__","50%","87%",34,"300",
                  color="rgba(255,255,255,0.65)",tracking=1,
                  anim={"time":0.7,"duration":0.6,"easing":"ease-out","type":"fade"}),
        ]),
    ),

    # ── STORY: Minimal Logo ───────────────────────────────────────────────────
    SmartTemplate(
        key="story_minimal_logo",
        label="Minimal Logo Story",
        format="story_9x16",
        tone="minimal",
        brand_types=["beach_club","hotel","spa","restaurant","wellness","boutique"],
        content_uses=["brand_story","bts","social_proof"],
        urgency_fit=["low","medium"],
        description="Story için ultra minimal. Üstte marka adı, altta tek cümle. Video ön planda.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_story_base([
            _video_el(),
            {"name":"Top-Fade","type":"shape","shape":"rectangle",
             "x":"0%","y":"0%","width":"100%","height":"18%",
             "fill_color":"linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)"},
            _text("Brand-Name","__BRAND__","50%","9%",32,"700",tracking=7,
                  width="70%",anim=_FADE_IN),
            _fade(72, 28, "#000000", 0.60),
            _text("Main-Title","__TITLE__","50%","88%",60,"700",tracking=3,
                  width="80%",anim=_SLIDE_UP),
            _line("Accent-Line","50%","94.5%","10%","__ACCENT__"),
        ]),
    ),

    # ── STORY: Event Story ────────────────────────────────────────────────────
    SmartTemplate(
        key="story_event",
        label="Event Story",
        format="story_9x16",
        tone="impact",
        brand_types=["beach_club","corporate_event","restaurant","hotel"],
        content_uses=["event","promotional"],
        urgency_fit=["medium","high"],
        description="Story etkinlik duyurusu. Tarih pill, başlık, marka. Yüksek enerji.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Date-Badge","date"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_story_base([
            _video_el(),
            {"name":"Dark-Overlay","type":"shape","shape":"rectangle",
             "x":"0%","y":"0%","width":"100%","height":"100%",
             "fill_color":"rgba(0,0,0,0.38)"},
            _text("Brand-Name","__BRAND__","50%","8%",30,"700",tracking=8,anim=_FADE_IN),
            _rect("Date-Pill","50%","42%","58%","7.5%","__ACCENT__",radius="40"),
            _text("Date-Badge","__DATE__","50%","42%",38,"700",color="#000000",tracking=0),
            _text("Main-Title","__TITLE__","50%","58%",66,"700",tracking=2,
                  width="80%",anim=_SLIDE_UP),
        ]),
    ),

    # ── STORY: Wellness Calm ──────────────────────────────────────────────────
    SmartTemplate(
        key="story_wellness_calm",
        label="Wellness Calm Story",
        format="story_9x16",
        tone="minimal",
        brand_types=["mental_health","wellness","spa","yoga","fitness"],
        content_uses=["brand_story","educational","social_proof"],
        urgency_fit=["low","medium"],
        description="Ruh sağlığı ve wellness. Sakin, temiz, güven veren. Serif italic başlık.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_story_base([
            _video_el(),
            _fade(65, 35, "#0a0a14", 0.58),
            _text("Main-Title","__TITLE__","50%","85%",58,"600",
                  font="Cormorant Garamond",italic=True,tracking=1,
                  width="78%",anim=_SLIDE_UP),
            _line("Accent-Line","50%","91.5%","12%","__ACCENT__"),
            _text("Brand-Name","__BRAND__","50%","95%",22,"300",
                  color="rgba(255,255,255,0.45)",tracking=6),
        ]),
    ),

    # ── FEED: Clean Square ────────────────────────────────────────────────────
    SmartTemplate(
        key="feed_clean_square",
        label="Clean Square Feed",
        format="feed_1x1",
        tone="minimal",
        brand_types=["beach_club","hotel","restaurant","spa","olive_oil","boutique"],
        content_uses=["brand_story","product","social_proof","bts"],
        urgency_fit=["low","medium"],
        description="Feed için sade kare. Alt minimal bar, sadece marka adı. Video konuşur.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_feed_base([
            _video_el(),
            _fade(78, 22, "#000000", 0.45),
            _text("Brand-Name","__BRAND__","50%","93%",28,"600",
                  tracking=6,color="rgba(255,255,255,0.65)",width="70%"),
            _rect("Accent-Dot","8%","93%","1.5%","1.5%","__ACCENT__"),
        ]),
    ),

    # ── FEED: Product Bold ────────────────────────────────────────────────────
    SmartTemplate(
        key="feed_product_bold",
        label="Product Bold Feed",
        format="feed_1x1",
        tone="impact",
        brand_types=["bakery","olive_oil","food","retail","cafe"],
        content_uses=["product","promotional"],
        urgency_fit=["medium","high"],
        description="Ürün feed postu. Bottom bar ile ürün adı öne çıkar.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_feed_base([
            _video_el(),
            _rect("Bottom-Bar","0%","78%","100%","22%","__PRIMARY__"),
            _rect("Accent-Line-Feed","0%","78%","0.8%","22%","__ACCENT__"),
            _text("Main-Title","__TITLE__","53%","87%",42,"700",
                  align="left",tracking=1,width="80%"),
            _text("Brand-Name","__BRAND__","53%","95%",22,"300",
                  color="rgba(255,255,255,0.55)",align="left",tracking=4),
        ]),
    ),

    # ── FEED: Editorial Square ────────────────────────────────────────────────
    SmartTemplate(
        key="feed_editorial_square",
        label="Editorial Square Feed",
        format="feed_1x1",
        tone="editorial",
        brand_types=["mental_health","wellness","olive_oil","hotel","restaurant"],
        content_uses=["brand_story","educational","social_proof"],
        urgency_fit=["low","medium"],
        description="Feed editorial. Üst sol başlık, alt marka. Asimetrik kompozisyon.",
        slots=[
            TemplateSlot("Background-Video","video"),
            TemplateSlot("Main-Title","title"),
            TemplateSlot("Brand-Name","brand_name"),
        ],
        composition=_feed_base([
            _video_el(),
            {"name":"Top-Grad","type":"shape","shape":"rectangle",
             "x":"0%","y":"0%","width":"65%","height":"40%",
             "fill_color":"linear-gradient(to right, rgba(0,0,0,0.48), transparent)"},
            _text("Main-Title","__TITLE__","20%","20%",46,"600",
                  align="left",tracking=1,width="36%",
                  font="Cormorant Garamond",italic=True),
            _line("Accent-Line","20%","30%","22%","__ACCENT__"),
            _fade(80, 20, "#000000", 0.45),
            _text("Brand-Name","__BRAND__","50%","92%",24,"300",
                  tracking=6,color="rgba(255,255,255,0.55)"),
        ]),
    ),
]

# ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

def get_template(key: str) -> SmartTemplate | None:
    return next((t for t in TEMPLATES if t.key == key), None)


def get_templates_for_format(fmt: str) -> list[SmartTemplate]:
    """Format'a göre template listesi: reel_9x16 | story_9x16 | feed_1x1"""
    return [t for t in TEMPLATES if t.format == fmt]


def get_template_catalog() -> list[dict]:
    """AI seçici için template kataloğu."""
    return [
        {
            "key": t.key,
            "label": t.label,
            "format": t.format,
            "tone": t.tone,
            "brand_types": t.brand_types,
            "content_uses": t.content_uses,
            "urgency_fit": t.urgency_fit,
            "description": t.description,
            "required_slots": [s.field_type for s in t.slots if s.required],
        }
        for t in TEMPLATES
    ]


def apply_fields_to_composition(
    template: SmartTemplate,
    fields: dict,              # {field_type: value}
    primary_color: str = "#1a1a2e",
    accent_color: str = "#c9a96e",
) -> dict:
    """
    Template composition'ına field değerlerini uygula.
    __TITLE__ → fields["title"], __BRAND__ → fields["brand_name"] vs.

    Döndürür: render'a hazır Creatomate composition dict.
    """
    import json, copy
    comp = copy.deepcopy(template.composition)

    replacements = {
        "__VIDEO__":    fields.get("video", ""),
        "__IMAGE__":    fields.get("image", ""),
        "__TITLE__":    (fields.get("title", "") or "").upper()[:50],
        "__BRAND__":    (fields.get("brand_name", "") or "").upper()[:24],
        "__SUBTITLE__": fields.get("subtitle", "")[:60],
        "__DATE__":     fields.get("date", ""),
        "__CTA__":      fields.get("cta", ""),
        "__ACCENT__":   accent_color,
        "__PRIMARY__":  primary_color,
    }

    # JSON string üzerinden toplu replace
    comp_str = json.dumps(comp)
    for placeholder, value in replacements.items():
        comp_str = comp_str.replace(placeholder, value)

    return json.loads(comp_str)
