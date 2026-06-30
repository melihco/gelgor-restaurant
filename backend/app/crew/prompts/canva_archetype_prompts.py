"""Canva Pro archetype picklist — mirrored from apps/web/src/lib/canva-archetype-catalog.ts"""

CANVA_ARCHETYPE_AGENT_PROMPT_BLOCK = """
CANVA PRO ARCHETYPE PICKLIST (choose ONE id for fal_design_brief.canva_archetype / fal_design_hint):
1. frosted_quote_card — glass panel quote/testimonial
2. magazine_cover_drop — editorial cover line + photo bleed
3. split_feature_panel — photo + brand color panel + CTA pill
4. diagonal_brand_split — angled color wedge + photo hero (nightlife/beach)
5. cinematic_full_bleed — full photo + tiny corner type
6. campaign_hero_block — offer/% slab (ONLY real promos)
7. event_ticket_stub — date/lineup/RSVP ticket layout
8. neon_night_promo — club/DJ neon accent on dark base
9. social_proof_banner — customer joy banner over crowd photo
10. promo_price_stack — stacked offer type + product corner
11. editorial_date_masthead — seasonal date line + serif headline
12. product_hero_card — centered dish/product hero
13. graphic_shape_stack — layered shapes + bold headline
14. before_after_diptych — transformation split panels
15. location_pin_card — map pin + directions CTA
16. polaroid_memory — casual polaroid BTS frame
17. noir_editorial — dark luxury high-contrast
18. gallery_carousel_tease — 2-up grid swipe tease

Sector quick picks:
- beach_club / marina → diagonal_brand_split | cinematic_full_bleed | split_feature_panel
- nightclub / rooftop → neon_night_promo | event_ticket_stub | diagonal_brand_split
- restaurant / fine_dining → magazine_cover_drop | product_hero_card | editorial_date_masthead
- beauty / spa → before_after_diptych | frosted_quote_card | polaroid_memory
- hotel / resort → noir_editorial | cinematic_full_bleed | split_feature_panel
- retail / promo → campaign_hero_block | promo_price_stack (only if real discount copy)

fal_design_hint MUST name the archetype id or pattern (e.g. "diagonal_brand_split — headline on color wedge").

MULTI-TENANT: Route by sector category from brand profile — NEVER hardcode a specific venue or brand name.
""".strip()
