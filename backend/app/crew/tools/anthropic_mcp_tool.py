"""
Agent design consult tool — Claude + optional remote MCP servers.

Visual Production Director skill when AGENT_MCP_ENABLED=true.
Works without any external MCP server (Claude-only fallback).
"""

from __future__ import annotations

from typing import Any

import structlog
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from app.services.anthropic_mcp_client import invoke_agent_design_consult_sync, is_agent_mcp_enabled
from app.services.design_mcp_client import (
    consult_design_via_mcp_sync,
    format_mcp_consult_response,
    is_design_mcp_configured,
)

logger = structlog.get_logger()


class AgentDesignConsultInput(BaseModel):
    brief: str = Field(
        description=(
            "Visual design brief. Include brand name, business model (SaaS vs venue), "
            "headline, caption, format (post/story), and visual goal. Turkish when brand is TR."
        )
    )
    focus: str = Field(
        default="layout_and_visual_hierarchy",
        description=(
            "layout_and_visual_hierarchy | brand_alignment | copy_hierarchy | sector_visual_rules"
        ),
    )


class AgentDesignConsultTool(BaseTool):
    name: str = "agent_design_consult"
    description: str = (
        "Premium visual direction for social content. Returns layout_family, visual_subject, "
        "typography hierarchy, forbidden elements, image_edit_prompt, runway director brief, "
        "and story scene brief. Use for posts, stories, and reels — especially for ambiguous "
        "sectors (SaaS vs venue) or when content type is reel/story. "
        "Does NOT replace your final JSON output."
    )
    args_schema: type[BaseModel] = AgentDesignConsultInput

    _brand_name: str = "Brand"
    _business_type: str = "general"

    def __init__(self, brand_name: str = "Brand", business_type: str = "general"):
        super().__init__()
        object.__setattr__(self, "_brand_name", brand_name)
        object.__setattr__(self, "_business_type", business_type or "general")

    def _run(self, brief: str, focus: str = "layout_and_visual_hierarchy") -> str:
        if not is_agent_mcp_enabled():
            return (
                "Agent design skill disabled. Set AGENT_MCP_ENABLED=true and ANTHROPIC_API_KEY "
                "in backend/.env"
            )

        # Prefer local Smart Agency design MCP (Anthropic connector cannot reach localhost).
        if is_design_mcp_configured():
            try:
                payload = consult_design_via_mcp_sync(
                    brief=brief,
                    business_type=self._business_type,
                    brand_name=self._brand_name,
                    focus=focus,
                )
                if payload.get("ok"):
                    return format_mcp_consult_response(payload)
            except Exception as exc:
                logger.warning("agent_design_consult.local_mcp_failed", error=str(exc)[:200])

        system = (
            f"You are a senior visual director for {self._brand_name} ({self._business_type}). "
            f"Focus: {focus}. "
            "Reply with actionable guidance only:\n"
            "- layout_family_hint\n- visual_subject (venue_ambiance | product_hero | digital_ui)\n"
            "- scene_mood (3-5 words)\n- typography hierarchy\n- forbidden elements\n"
            "- image_edit_prompt (one paragraph)\n"
            "B2B SaaS: digital_ui / app mockup — never physical storefront unless caption requires it."
        )

        result = invoke_agent_design_consult_sync(
            user_prompt=brief,
            system_prompt=system,
            max_tokens=2048,
        )

        if not result.get("ok"):
            err = result.get("error", "consult failed")
            logger.warning("agent_design_consult.failed", error=str(err)[:200])
            return f"Design consult failed: {err}"

        mode = result.get("mode", "claude")
        text = str(result.get("text") or "").strip()
        prefix = f"[{mode}] " if mode else ""
        return prefix + (text or "Empty consult response.")


def build_mcp_tools_for_brand(brand_name: str, business_type: str) -> list[Any]:
    if not is_agent_mcp_enabled():
        return []
    return [
        AgentDesignConsultTool(brand_name=brand_name, business_type=business_type or "general"),
    ]
