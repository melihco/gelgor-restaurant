"""
Google Search Console tool for CrewAI agents.
Provides search query and page-level SEO data for analysis.
"""

from __future__ import annotations

import json

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from app.integrations.search_console_client import get_search_console_client


class SearchConsoleInput(BaseModel):
    limit: int = Field(default=25, description="Number of results to return")


class SearchConsoleQueriesTool(BaseTool):
    name: str = "search_console_queries"
    description: str = (
        "Fetches top search queries from Google Search Console: "
        "query text, impressions, clicks, CTR, and average position."
    )
    args_schema: type[BaseModel] = SearchConsoleInput

    def _run(self, limit: int = 25) -> str:
        client = get_search_console_client()
        queries = client.get_top_queries(limit=limit)
        return json.dumps(
            {"queries": [q.to_dict() for q in queries]},
            ensure_ascii=False, indent=2,
        )


class SearchConsolePagesTool(BaseTool):
    name: str = "search_console_pages"
    description: str = (
        "Fetches page-level search performance from Google Search Console: "
        "which pages rank best and get the most clicks."
    )
    args_schema: type[BaseModel] = SearchConsoleInput

    def _run(self, limit: int = 15) -> str:
        client = get_search_console_client()
        pages = client.get_page_performance(limit=limit)
        return json.dumps(
            {"pages": [p.to_dict() for p in pages]},
            ensure_ascii=False, indent=2,
        )


class SearchConsoleDevicesTool(BaseTool):
    name: str = "search_console_devices"
    description: str = (
        "Fetches device breakdown from Search Console: "
        "mobile vs desktop vs tablet search performance."
    )

    def _run(self) -> str:
        client = get_search_console_client()
        devices = client.get_device_breakdown()
        return json.dumps(
            {"devices": [d.to_dict() for d in devices]},
            ensure_ascii=False, indent=2,
        )
