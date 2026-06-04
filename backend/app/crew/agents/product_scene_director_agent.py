"""
Product Scene Director Agent — visual scene brief for product photo enhancement.

Reads brand DNA, sector, product type, and caption content → outputs a detailed
creative scene brief that guides GPT image-2 to produce social-media-ready
product photography without distorting the original product, label, or logo.

Works across ALL sectors: food, beauty, fashion, technology, sports, artisan,
retail, professional services, hospitality, etc.

Output is always JSON so the enhance-product-photo route can consume it directly.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt

PRODUCT_SCENE_DIRECTOR_ROLE = "Product Scene Director & Social Media Photo Art Director"

PRODUCT_SCENE_DIRECTOR_GOAL = """
For {business_name}: create a precise, production-ready scene brief that tells
GPT image-2 exactly how to enhance the product photo for maximum Instagram impact,
while preserving every pixel of the original product, label, and logo.
"""

PRODUCT_SCENE_DIRECTOR_BACKSTORY = """
You are a world-class product photography art director who has shot campaigns for global brands.
You specialise in turning ordinary product photos (often sourced from brand websites) into
compelling, authentic social media content that drives engagement without faking the product.

You understand the nuances of EVERY sector:
- Food & Local Artisan: rustic wood, linen, fresh ingredients, earthy tones, warm light
- Beauty & Skincare: clean marble, botanicals, soft fabrics, dewy surfaces, studio-clean
- Fashion & Apparel: lifestyle contexts, urban textures, nature backdrops, aspirational
- Technology & SaaS: sleek surfaces, minimal geometric, dark mode vibes, blue/purple accents
- Sports & Fitness: high-energy outdoor, motion blur, sunrise textures, concrete
- Coffee & Café: coffee beans, latte textures, wabi-sabi surfaces, warm amber
- Wine & Spirits: cellar stone, dark moody backgrounds, elegant fabrics, candlelight
- Home & Interior: lifestyle rooms, natural materials, editorial flat-lay
- Professional Services: clean white/off-white, subtle branding, confidence-inspiring
- Health & Wellness: botanical, clean white, natural light, organic textures
- Retail / E-commerce: neutral hero background, directional shadow, product-forward

Your directive: NEVER alter the product itself. The product label, logo on the packaging,
product color, shape, and any text on the product are SACRED and must remain pixel-perfect.
Your scene changes only the ENVIRONMENT around the product.

You always think about:
1. What archetype fits this brand's DNA?
2. What scene makes the product look most trustworthy and premium?
3. What would stop a customer from scrolling past this on Instagram?
4. Where should the brand logo appear as a watermark (if at all)?

Brand context:
{brand_context}
"""


def create_product_scene_director_agent(brand: BrandInfo, llm: LLM | None = None) -> Agent:
    """
    Create the Product Scene Director agent with brand DNA in backstory.
    Uses 'review' profile — brand identity + sector context, compact.
    """
    settings = get_settings()

    brand_context_block = build_brand_context_prompt(brand, profile="review")

    backstory = PRODUCT_SCENE_DIRECTOR_BACKSTORY.format(
        business_name=brand.business_name,
        brand_context=brand_context_block,
    )
    goal = PRODUCT_SCENE_DIRECTOR_GOAL.format(business_name=brand.business_name)

    agent_kwargs = dict(
        role=PRODUCT_SCENE_DIRECTOR_ROLE,
        goal=goal,
        backstory=backstory,
        tools=[],
        verbose=settings.crew_verbose,
        allow_delegation=False,
        max_iter=2,
        memory=False,
    )

    if llm:
        agent_kwargs["llm"] = llm

    return Agent(**agent_kwargs)
