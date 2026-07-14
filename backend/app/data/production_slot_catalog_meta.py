"""Seed helpers — infer pipeline / Fal template type from slot_key."""

from __future__ import annotations

import re


def infer_format(slot_key: str) -> str:
    if slot_key.endswith("_carousel"):
        return "carousel"
    if slot_key.endswith("_reel"):
        return "reel"
    if slot_key.endswith("_story"):
        return "story"
    return "post"


def infer_pipeline(fmt: str) -> str:
    if fmt == "carousel":
        return "carousel_gallery"
    if fmt == "reel":
        return "fal_reel"
    if fmt == "story":
        return "fal_story"
    return "fal_design"


def infer_slot_role(fmt: str) -> str:
    if fmt == "carousel":
        return "organic_carousel"
    if fmt == "reel":
        return "fal_reel_motion"
    if fmt == "story":
        return "campaign_story_motion"
    return "fal_designed_post"


def infer_design_template_type(slot_key: str) -> str:
    key = slot_key.lower()
    if "typography_poster" in key:
        return "campaign_announcement"
    if "event_announcement" in key:
        return "event_special"
    if any(x in key for x in ("social_proof", "testimonial", "review", "ugc", "guest_social")):
        return "social_proof"
    if any(x in key for x in ("event", "dj", "live_music", "private_event", "aftermovie")):
        return "event_special"
    if any(x in key for x in ("offer", "sale", "promo", "flash", "happy_hour", "membership", "daybed", "day_pass", "trial")):
        return "campaign_announcement"
    if any(x in key for x in ("menu", "dish", "product", "cocktail", "retail", "arrival", "collection", "unboxing")):
        return "menu_highlight"
    if any(x in key for x in ("ambiance", "venue", "facility", "aerial", "tour", "atmosphere", "lifestyle", "pool")):
        return "venue_showcase"
    if any(x in key for x in ("seasonal", "summer", "opening", "ingredient", "farm_to_table")):
        return "seasonal_promo"
    if any(x in key for x in ("brand_story", "brand_identity", "stylist_intro", "trainer_spotlight")):
        return "brand_identity"
    if key.endswith("_reel"):
        return "reel_cover"
    if any(x in key for x in ("appointment", "reminder", "schedule", "class_reminder")):
        return "announcement_formal"
    if any(x in key for x in ("bts", "kitchen", "behind", "morning", "self_care", "nutrition", "tip")):
        return "daily_story"
    return "campaign_announcement"


def infer_library_slot_key(slot_key: str, design_template_type: str) -> str | None:
    if design_template_type in ("event_special",):
        return "event_story"
    if design_template_type in ("campaign_announcement", "seasonal_promo"):
        return "campaign_post"
    if design_template_type == "social_proof":
        return "social_proof_post"
    if design_template_type in ("venue_showcase", "brand_identity", "daily_story"):
        return "daily_story"
    if design_template_type == "menu_highlight":
        return "editorial_story"
    if "social" in slot_key:
        return "social_proof"
    return "campaign_post"


def humanize_slot_key(slot_key: str) -> tuple[str, str]:
    """Return (label_tr, label_en) from slot_key tail."""
    tail = slot_key.split("_", 2)[-1] if slot_key.count("_") >= 2 else slot_key
    words = [w for w in tail.replace("_post", "").replace("_story", "").replace("_reel", "").replace("_carousel", "").split("_") if w]
    en = " ".join(w.capitalize() for w in words)
    tr_map = {
        "sunset": "Gün batımı",
        "ambiance": "Atmosfer",
        "cocktail": "Kokteyl",
        "menu": "Menü",
        "pool": "Havuz",
        "lifestyle": "Lifestyle",
        "daybed": "Şezlong",
        "offer": "Teklif",
        "dj": "DJ",
        "night": "Gece",
        "teaser": "Teaser",
        "guest": "Misafir",
        "social": "Sosyal",
        "proof": "Kanıt",
        "aerial": "Havadan",
        "venue": "Mekan",
        "summer": "Yaz",
        "opening": "Açılış",
        "live": "Canlı",
        "music": "Müzik",
        "event": "Etkinlik",
        "private": "Özel",
        "golden": "Altın saat",
        "promo": "Promo",
        "party": "Parti",
        "pass": "Giriş",
        "atmosphere": "Atmosfer",
        "craft": "Craft",
        "timelapse": "Timelapse",
        "aftermovie": "Aftermovie",
        "moments": "Anlar",
        "carousel": "Carousel",
        "signature": "İmza",
        "dish": "Tabak",
        "highlight": "Öne çıkan",
        "chef": "Şef",
        "dining": "Yemek",
        "reservation": "Rezervasyon",
        "customer": "Müşteri",
        "review": "Yorum",
        "seasonal": "Mevsimsel",
        "ingredient": "Malzeme",
        "brunch": "Brunch",
        "happy": "Happy",
        "hour": "Hour",
        "kitchen": "Mutfak",
        "bts": "Kulis",
        "table": "Masa",
        "farm": "Çiftlik",
        "weekend": "Hafta sonu",
        "booking": "Rezervasyon",
        "plating": "Plating",
        "process": "Süreç",
        "experience": "Deneyim",
        "tasting": "Tadım",
        "treatment": "Bakım",
        "before": "Önce",
        "after": "Sonra",
        "nail": "Tırnak",
        "art": "Art",
        "spotlight": "Spotlight",
        "skincare": "Cilt bakımı",
        "salon": "Salon",
        "stylist": "Stilist",
        "bridal": "Gelin",
        "package": "Paket",
        "membership": "Üyelik",
        "client": "Müşteri",
        "testimonial": "Yorum",
        "appointment": "Randevu",
        "reminder": "Hatırlatma",
        "new": "Yeni",
        "self": "Self",
        "care": "Care",
        "flash": "Flash",
        "transformation": "Dönüşüm",
        "styling": "Styling",
        "demo": "Demo",
        "portfolio": "Portfolyo",
        "gallery": "Galeri",
        "product": "Ürün",
        "hero": "Hero",
        "arrival": "Yeni gelen",
        "bestseller": "Çok satan",
        "outfit": "Kombin",
        "sale": "İndirim",
        "announcement": "Duyuru",
        "ugc": "UGC",
        "limited": "Limited",
        "drop": "Drop",
        "gift": "Hediye",
        "guide": "Rehber",
        "restock": "Stok",
        "alert": "Uyarı",
        "brand": "Marka",
        "story": "Hikaye",
        "collection": "Koleksiyon",
        "tip": "İpucu",
        "behind": "Perde arkası",
        "detail": "Detay",
        "lookbook": "Lookbook",
        "unboxing": "Unboxing",
        "warehouse": "Depo",
        "multi": "Çoklu",
        "class": "Ders",
        "schedule": "Program",
        "trainer": "Antrenör",
        "facility": "Tesis",
        "nutrition": "Beslenme",
        "group": "Grup",
        "personal": "Kişisel",
        "training": "Antrenman",
        "member": "Üye",
        "equipment": "Ekipman",
        "challenge": "Challenge",
        "launch": "Lansman",
        "morning": "Sabah",
        "motivation": "Motivasyon",
        "trial": "Deneme",
        "pt": "PT",
        "availability": "Müsaitlik",
        "workout": "Antrenman",
        "energy": "Enerji",
        "program": "Program",
        "overview": "Genel bakış",
    }
    tr_words = [tr_map.get(w, w.capitalize()) for w in words]
    tr = " ".join(tr_words)
    return tr, en


def build_match_signals(slot_key: str, design_template_type: str) -> dict:
    signals: dict = {"design_template_type": design_template_type}
    if "typography_poster" in slot_key:
        signals["announcement_types"] = ["campaign_offer", "offer_campaign"]
        signals["typography_forward"] = True
    if "event_announcement" in slot_key:
        signals["announcement_types"] = ["event_teaser", "event_announcement"]
    if "event" in slot_key or "dj" in slot_key:
        signals["announcement_types"] = ["event_teaser", "event_announcement"]
    if "offer" in slot_key or "sale" in slot_key or "promo" in slot_key:
        signals["announcement_types"] = ["offer_campaign"]
    if "social" in slot_key or "testimonial" in slot_key or "review" in slot_key:
        signals["announcement_types"] = ["social_proof"]
    if "product" in slot_key or "menu" in slot_key or "dish" in slot_key:
        signals["announcement_types"] = ["product_reveal", "product_showcase"]
    if "venue" in slot_key or "ambiance" in slot_key or "facility" in slot_key:
        signals["announcement_types"] = ["venue_showcase"]
    if "booking" in slot_key or "reservation" in slot_key:
        signals["announcement_types"] = ["announcement", "campaign_offer"]
    return signals


DEFAULT_DESIGNED_STORY_PREMIUM: dict = {
    "visual_story": "Designed story poster with typography overlay on brand gallery photo",
    "premium_score": 85,
    "layout_strategy": "poster_stack",
    "motion_approach": "static",
    "visual_priority": "typography",
    "composition_type": "poster_design",
    "graphic_elements": ["gradient_wash"],
    "object_treatment": "full_bleed_photo",
    "typography_approach": "bold_display",
    "composition_description": (
        "Full-bleed venue or product photo with bold headline stack and CTA band — "
        "Fal designer story poster."
    ),
}


def build_designed_story_prompt_pack(label_en: str) -> dict:
    return {
        "require_premium_composition": True,
        "visual_treatment": "story_event",
        "premium_composition_defaults": {
            **DEFAULT_DESIGNED_STORY_PREMIUM,
            "visual_story": f"Designed story poster — {label_en}",
        },
        "ideation_hint": (
            f'Story ideas for "{label_en}" MUST include visual_production_spec.premium_composition '
            "(poster_design, typography-forward) — never pure_photo / gallery-only."
        ),
    }


def build_prompt_pack(slot_key: str, label_en: str, inst: dict | None = None) -> dict:
    inst = inst or {}
    base = {"scene_hint_template": f"{{brand_name}} — {label_en} content for {{content_brief}}"}
    if inst.get("requires_premium_composition"):
        return {**build_designed_story_prompt_pack(label_en), **base}
    return base
