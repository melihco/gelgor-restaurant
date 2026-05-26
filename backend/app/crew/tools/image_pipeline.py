"""
Image pipeline tool for CrewAI agents.

This tool does NOT generate images directly within CrewAI.
Instead, it orchestrates image workflows:
- Selects appropriate existing brand assets
- Prepares image generation prompts for external services
- Packages image requirements for the content pipeline

The actual image generation is handled by external providers
(DALL-E, Stability AI, Replicate) through the application service layer.
This separation keeps CrewAI focused on orchestration, not rendering.
"""

from __future__ import annotations

import json
import re

from crewai.tools import BaseTool
from pydantic import BaseModel, Field


def _coerce_assets_list(raw: str) -> list:
    """
    Crew often passes prose/URLs from brand context, or accidentally "0".
    json.loads("0") → int → used to crash in assets[0]. Normalize to list[dict].
    """
    text = (raw or "").strip()
    if not text:
        return []

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None

    if isinstance(parsed, list):
        out = []
        for item in parsed:
            if isinstance(item, dict):
                out.append(item)
            elif isinstance(item, str) and item.strip():
                out.append({"description": item.strip(), "type": "reference"})
        return out
    if isinstance(parsed, dict):
        return [parsed]
    if isinstance(parsed, (int, float, bool)) or parsed is None:
        return []

    # Plain text: pull https URLs as lightweight asset refs
    urls = re.findall(r"https?://[^\s\"'<>]+", text)
    if urls:
        return [{"image_url": u, "type": "url"} for u in urls[:12]]

    lines = [ln.strip(" •-") for ln in text.splitlines() if ln.strip()]
    if lines:
        return [{"description": ln[:500], "type": "text"} for ln in lines[:12]]
    return []


class AssetSelectionInput(BaseModel):
    content_brief: str = Field(description="Description of the content being created")
    available_assets: str = Field(
        default="",
        description=(
            "Brand assets: either a JSON array of objects, or paste the same plain-text "
            "list the task gave you (URLs and labels). Do not send the number 0."
        ),
    )
    content_type: str = Field(default="instagram_post", description="Target content format")


class AssetSelectorTool(BaseTool):
    """
    Analyzes available brand assets and recommends the best ones
    for a given content piece. Prefers real photos over generated images.
    """

    name: str = "brand_asset_selector"
    description: str = (
        "Analyzes available brand assets (photos, logos, graphics) and recommends "
        "the best ones for a content piece. Always prefers real business photos "
        "over AI-generated imagery."
    )
    args_schema: type[BaseModel] = AssetSelectionInput

    def _run(self, content_brief: str, available_assets: str = "", content_type: str = "instagram_post") -> str:
        if not isinstance(available_assets, str):
            available_assets = str(available_assets) if available_assets is not None else ""
        assets = _coerce_assets_list(available_assets)

        return json.dumps({
            "recommendation": {
                "primary_asset": assets[0] if assets else None,
                "secondary_assets": assets[1:3] if len(assets) > 1 else [],
                "needs_new_photography": len(assets) == 0,
                "needs_ai_generation": False,
                "enhancement_suggestions": [
                    "Crop to 1:1 ratio for feed post",
                    "Apply brand color overlay",
                    "Add logo watermark",
                ],
                "content_type": content_type,
            },
            "note": "Prefer real business assets. Only suggest AI generation as last resort.",
        }, ensure_ascii=False, indent=2)


class ImagePromptPreparerTool(BaseTool):
    """
    When AI image generation is needed, prepares a detailed prompt
    that respects brand guidelines. The actual generation happens
    outside CrewAI through the configured image provider.
    """

    name: str = "image_prompt_preparer"
    description: str = (
        "Prepares detailed image generation prompts that respect brand guidelines. "
        "Returns a structured prompt package — does NOT generate images directly."
    )

    def _run(self, scene_description: str, brand_style: str,
             content_type: str, dimensions: str = "1080x1080") -> str:
        return json.dumps({
            "prompt_package": {
                "positive_prompt": f"Professional {content_type} photo, {scene_description}, "
                                   f"{brand_style} aesthetic, high quality, commercial photography",
                "negative_prompt": "cartoon, anime, illustration, low quality, blurry, "
                                   "watermark, text overlay, stock photo look",
                "dimensions": dimensions,
                "style_reference": brand_style,
                "content_type": content_type,
            },
            "provider_ready": True,
            "note": "Pass this to the image provider service for generation.",
        }, ensure_ascii=False, indent=2)
