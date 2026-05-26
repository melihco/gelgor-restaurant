"""
Review Crew – orchestrates the full review management workflow.

This crew composes the Review Agent with its tasks into an executable
pipeline. The crew handles:
1. Fetching unanswered reviews
2. Analyzing each review for sentiment/urgency
3. Generating brand-appropriate response drafts

The crew returns structured JSON results that the application service
layer persists as Suggestions for the approval workflow.
"""

from __future__ import annotations

import json
from typing import Any

from crewai import Crew, Process, LLM

from app.config import get_settings
from app.crew.agents.review_agent import create_review_agent
from app.crew.context import BrandInfo
from app.crew.token_usage import total_tokens_from_crew
from app.crew.tasks.review_tasks import (
    create_analyze_review_task,
    create_draft_response_task,
    create_fetch_reviews_task,
)


def build_review_crew(brand: BrandInfo, llm: LLM | None = None) -> Crew:
    """
    Build a Crew for processing reviews for a single brand.

    The crew runs sequentially: fetch → analyze → draft response.
    Sequential processing is chosen because each step depends on the
    previous step's output (you can't draft a response without analysis).
    """
    review_agent = create_review_agent(brand, llm=llm)

    fetch_task = create_fetch_reviews_task(review_agent, brand)
    analyze_task = create_analyze_review_task(
        review_agent,
        brand,
        reviewer_name="{reviewer_name}",
        rating=0,
        review_text="{review_text}",
        review_date="{review_date}",
    )
    draft_task = create_draft_response_task(
        review_agent,
        brand,
        language=brand.languages or "tr",
    )

    return Crew(
        agents=[review_agent],
        tasks=[fetch_task, analyze_task, draft_task],
        process=Process.sequential,
        verbose=True,
    )


def run_review_analysis(brand: BrandInfo, llm: LLM | None = None) -> dict[str, Any]:
    """
    Execute the review crew for a specific brand.

    Returns a structured result dict that the service layer can
    persist as Task + Suggestion records.
    """
    review_agent = create_review_agent(brand, llm=llm)

    fetch_task = create_fetch_reviews_task(review_agent, brand)

    crew = Crew(
        agents=[review_agent],
        tasks=[fetch_task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "review_crew",
        "task_type": "review_analysis",
        "status": "completed",
        "raw_output": str(result),
        "agent_role": "review_agent",
        "tokens_used": total_tokens_from_crew(crew),
    }


def run_single_review_response(
    brand: BrandInfo,
    reviewer_name: str,
    rating: int,
    review_text: str,
    review_date: str,
    language: str = "tr",
    llm: LLM | None = None,
) -> dict[str, Any]:
    """
    Analyze a single review and generate response drafts.

    This is the most common operation: a specific review needs a response.
    Returns structured analysis + draft response for the approval workflow.
    """
    review_agent = create_review_agent(brand, llm=llm)

    analyze_task = create_analyze_review_task(
        review_agent, brand, reviewer_name, rating, review_text, review_date
    )
    draft_task = create_draft_response_task(review_agent, brand, language)

    crew = Crew(
        agents=[review_agent],
        tasks=[analyze_task, draft_task],
        process=Process.sequential,
        verbose=get_settings().crew_verbose,
    )

    result = crew.kickoff()

    return {
        "crew_name": "review_crew",
        "task_type": "single_review_response",
        "status": "completed",
        "raw_output": str(result),
        "review_context": {
            "reviewer_name": reviewer_name,
            "rating": rating,
            "review_text": review_text,
        },
        "agent_role": "review_agent",
        "tokens_used": total_tokens_from_crew(crew),
    }
