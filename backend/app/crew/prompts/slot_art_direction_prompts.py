"""
Prompts for per-slot template-library art direction.

Produces a brand-unique composition recipe for ONE catalog slot so GPT Image
does not collapse every tenant into the same cream top-left sticker.
"""

from __future__ import annotations

SLOT_TEMPLATE_ART_DIRECTION_TASK = """You are the in-house Art Director for {business_name}.

Design ONE reusable Instagram template composition for a single library slot.
This recipe must feel like it could ONLY belong to {business_name} — never a
generic {business_type} Canva pack reused across brands.

═══ BRAND ═══
- Name: {business_name}
- Sector / type: {business_type}
- Location: {location}
- Tone: {brand_tone}
- Visual DNA: {visual_dna}
- Primary color: {primary_color}
- Accent color: {accent_color}

═══ SLOT ═══
- Key: {catalog_slot_key}
- Name: {slot_name}
- Format: {format}
- Template type: {template_type}
- Purpose / job: {purpose_job}
- Sample punchline (type zone footprint only): "{sample_headline}"
- Diversity salt (invent a DISTINCT variant when non-empty): {diversity_salt}

═══ RULES ═══
1. Compose for THIS slot purpose (venue ≠ DJ ≠ cocktail ≠ campaign).
2. Painted craft fills MUST use brand primary/accent (or tint) — FORBIDDEN: cream, beige, ivory, kraft paper panels with brand letters only.
3. Pick ONE type_zone_anchor — do NOT default to top_left every time. Rotate across the library.
4. Motifs must come from THIS brand's visual DNA, not stock starfish / generic coastal clipart unless DNA asks for it.
5. Reject look: name the hospitality sticker silhouette this slot must NOT become.
6. Output ONLY valid JSON (no markdown fences).

JSON schema:
{{
  "layout_concept": "1-2 sentences: brand-specific composition idea for this slot",
  "type_zone_anchor": "top_left|top_right|bottom_left|bottom_right|left_rail|right_rail|top_band|bottom_band|center_stack|inset_frame|diagonal_split",
  "color_surfaces": "how primary/accent paint the craft zones (no cream fills)",
  "type_hierarchy": "headline/support style + relative scale",
  "motif_from_dna": "one motif pulled from brand visual DNA",
  "reject_look": "forbidden silhouette for this slot",
  "diversity_note": "how this differs from other library slots for the same brand"
}}
"""
