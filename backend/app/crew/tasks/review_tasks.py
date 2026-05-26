"""
CrewAI Task definitions for the Review Agent crew.

Each function creates a Task that will be executed by the Review Agent.
Tasks are parameterized with brand context and review data so they
produce business-specific outputs.
"""

from __future__ import annotations

from crewai import Agent, Task

from app.crew.context import BrandInfo
from app.crew.prompts.review_prompts import REVIEW_ANALYSIS_TASK, REVIEW_RESPONSE_TASK


def create_fetch_reviews_task(agent: Agent, brand: BrandInfo) -> Task:
    return Task(
        description=(
            f"Fetch all unanswered Google reviews for {brand.business_name}. "
            f"Use the google_reviews_fetcher tool with filter_status='unanswered'. "
            f"Return the raw review data for analysis."
        ),
        expected_output=(
            "A JSON list of unanswered Google reviews with reviewer_name, rating, "
            "date, text, and language for each review."
        ),
        agent=agent,
    )


def create_analyze_review_task(
    agent: Agent,
    brand: BrandInfo,
    reviewer_name: str,
    rating: int,
    review_text: str,
    review_date: str,
) -> Task:
    description = REVIEW_ANALYSIS_TASK.format(
        business_name=brand.business_name,
        reviewer_name=reviewer_name,
        rating=rating,
        review_date=review_date,
        review_text=review_text,
    )

    return Task(
        description=description,
        expected_output=(
            "A JSON object with sentiment, urgency, key_topics, requires_escalation, "
            "recommended_response_time, and customer_intent analysis."
        ),
        agent=agent,
    )


def create_draft_response_task(
    agent: Agent,
    brand: BrandInfo,
    language: str = "tr",
) -> Task:
    description = REVIEW_RESPONSE_TASK.format(
        language=language,
        brand_tone=brand.brand_tone or "professional and warm",
        custom_rules=brand.custom_rules or "No additional rules.",
    )

    return Task(
        description=description,
        expected_output=(
            "A JSON object with draft_response, response_strategy, alternative_response, "
            "suggested_internal_action, and confidence_score."
        ),
        agent=agent,
    )
