"""
Perplexity Search Tool — real-time web search for CrewAI agents.

Gives agents access to live internet data during task execution, enabling:
  - Market research ("What food trends are driving restaurant bookings in Bodrum this week?")
  - Competitor news ("What events are Macakızı and other Bodrum beach clubs promoting?")
  - Local event discovery ("Upcoming events and festivals in Bodrum this month")
  - Seasonal opportunity research ("Summer 2026 beach club content trends in Turkey")
  - Hashtag trend research ("What are the top Instagram hashtags for Bodrum beach clubs?")

Perplexity's `sonar` model returns grounded, cited answers with real-time web data.
`sonar-pro` gives deeper, longer-form research with more citations.

Graceful degradation:
  - If PERPLEXITY_API_KEY is not set, returns a "not configured" message.
  - Agents are prompted to continue without search results in that case.
  - Never crashes the crew execution.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import structlog
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

logger = structlog.get_logger()

_PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"


class PerplexitySearchInput(BaseModel):
    query: str = Field(
        description=(
            "Search query for real-time web research. "
            "Be specific: include location, industry, and time frame. "
            "Examples: 'Bodrum beach club Instagram trends May 2026', "
            "'Turkish restaurant social media marketing summer 2026', "
            "'top hashtags for beach clubs Turkey'"
        )
    )
    search_focus: str = Field(
        default="general",
        description=(
            "Focus area: 'general' for broad research, "
            "'news' for recent events, "
            "'social' for social media trends"
        ),
    )


class PerplexitySearchTool(BaseTool):
    """
    Real-time web search powered by Perplexity AI.
    Call this when you need current market data, local trends, competitor news,
    or any information that requires live internet access.
    """

    name: str = "perplexity_web_search"
    description: str = (
        "Searches the live internet using Perplexity AI to answer market research questions. "
        "Use for: local trends, competitor activity, seasonal opportunities, hashtag research, "
        "industry news, event discovery, and any question requiring current web data. "
        "Always include location and time context in your query for best results. "
        "Example queries: 'beach club Instagram trends Bodrum May 2026', "
        "'competitor beach clubs Bodrum 2026 events', "
        "'summer food trends Turkish restaurants social media'."
    )
    args_schema: type[BaseModel] = PerplexitySearchInput

    # API key injected by the tool factory
    _api_key: str = ""
    _model: str = "sonar"

    def __init__(self, api_key: str = "", model: str = "sonar"):
        super().__init__()
        object.__setattr__(self, "_api_key", api_key)
        object.__setattr__(self, "_model", model)

    def _run(self, query: str, search_focus: str = "general") -> str:
        """Execute a Perplexity search and return the response."""
        if not self._api_key:
            return json.dumps({
                "status": "not_configured",
                "message": (
                    "PERPLEXITY_API_KEY is not set. "
                    "Add it to backend/.env to enable real-time web search. "
                    "Continue your task using available brand context and trend brief instead."
                ),
            }, ensure_ascii=False)

        # Build system prompt based on search focus
        system_prompts = {
            "general": (
                "You are a market research assistant for digital marketing agencies. "
                "Provide concise, actionable insights with specific data points. "
                "Focus on social media trends, content patterns, and business opportunities. "
                "Be specific about platforms, formats, and engagement patterns."
            ),
            "news": (
                "You are a news analyst focused on local business and tourism events. "
                "Report recent developments, upcoming events, and seasonal opportunities. "
                "Prioritize information from the last 30 days."
            ),
            "social": (
                "You are a social media trends analyst. "
                "Focus on hashtag performance, content formats, posting patterns, "
                "and engagement metrics. Identify what's working on Instagram and TikTok "
                "for the queried industry and location."
            ),
        }
        system_prompt = system_prompts.get(search_focus, system_prompts["general"])

        try:
            response = httpx.post(
                _PERPLEXITY_API_URL,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": query},
                    ],
                    "max_tokens": 800,
                    "temperature": 0.2,
                    "return_citations": True,
                },
                timeout=30,
            )
            response.raise_for_status()

            data = response.json()
            answer = data["choices"][0]["message"]["content"]
            citations = data.get("citations", [])

            logger.info("perplexity_search_ok", query=query[:60], citations=len(citations))

            result: dict[str, Any] = {
                "query": query,
                "answer": answer,
                "source_count": len(citations),
            }
            if citations:
                result["sources"] = citations[:4]  # top 4 sources

            return json.dumps(result, ensure_ascii=False, indent=2)

        except httpx.HTTPStatusError as exc:
            logger.warning("perplexity_http_error", status=exc.response.status_code, query=query[:60])
            return json.dumps({
                "status": "api_error",
                "http_status": exc.response.status_code,
                "message": f"Perplexity API error ({exc.response.status_code}). Continue with available context.",
            }, ensure_ascii=False)
        except Exception as exc:
            logger.warning("perplexity_search_failed", error=str(exc), query=query[:60])
            return json.dumps({
                "status": "error",
                "message": f"Search unavailable: {exc}. Continue with available brand context.",
            }, ensure_ascii=False)
