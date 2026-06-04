"""
Feed Art Director Agent — reviews the full weekly content batch for cohesion.

Reads all content ideation ideas and evaluates:
- Format distribution (post/story/reel/carousel ratio vs 40/30/20/10 target)
- Theme coherence (all ideas aligned with weekly theme?)
- Visual variety (no consecutive same-format or same-mood posts)
- Overposting risk (same topic/subject more than 2x?)
- Optimal publish order for maximum engagement arc
- Recommended day-slot schedule (Mon–Sun)

Output: feed_art_director_report JSON — saved to mission_task_node output_summary.
"""

from __future__ import annotations

from crewai import Agent, LLM

from app.config import get_settings
from app.crew.context import BrandInfo, build_brand_context_prompt


FEED_ART_DIRECTOR_ROLE = "Feed Art Director & Social Media Content Curator"

FEED_ART_DIRECTOR_GOAL = """
For {business_name}: review the weekly content batch and produce a feed cohesion
report that guarantees the Instagram feed looks like it came from a professional agency —
varied formats, strong opening, correct rhythm, on-brand every single post.
"""

FEED_ART_DIRECTOR_BACKSTORY = """
You are a senior feed art director with 10+ years curating Instagram feeds for
premium brands across hospitality, food, fashion, retail, wellness, and tech sectors.

You have an exceptional eye for:
- Format variety rhythm: a feed that alternates post/story/reel/carousel feels
  alive and dynamic; repetitive same-format feels boring and algorithmic
- Engagement arc: the first post of the week sets the tone; mid-week needs a reel
  or carousel for reach; end of week closes with lifestyle or brand story
- Visual coherence: not all images need the same style, but they need to feel like
  siblings, not strangers
- Topic distribution: too many product posts = sales channel; too many lifestyle = no CTA;
  balance is the brand's voice

Target format mix (agency standard):
- Posts: ~40% (brand announcements, product, educational)
- Stories: ~30% (lifestyle, engagement, pure_photo, event)
- Reels: ~20% (min 1 per 5 ideas — Runway real video)
- Carousels: ~10% (multi-image arcs, behind-the-scenes series)

You work for {business_name}.

Brand context:
{brand_context}
"""


def create_feed_art_director_agent(brand: BrandInfo, llm: LLM | None = None) -> Agent:
    """
    Create the Feed Art Director agent with brand DNA in backstory.
    Uses 'review' profile — brand identity + sector context.
    """
    settings = get_settings()

    brand_context_block = build_brand_context_prompt(brand, profile="review")

    backstory = FEED_ART_DIRECTOR_BACKSTORY.format(
        business_name=brand.business_name,
        brand_context=brand_context_block,
    )
    goal = FEED_ART_DIRECTOR_GOAL.format(business_name=brand.business_name)

    agent_kwargs = dict(
        role=FEED_ART_DIRECTOR_ROLE,
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
