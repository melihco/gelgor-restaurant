"""
Anthropic agent skill client — optional remote MCP servers + Claude fallback.

Visual Production Director uses this when AGENT_MCP_ENABLED=true.
No Canva dependency: MCP_SERVERS_JSON is optional; without servers Claude advises directly.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import httpx
import structlog

from app.config import get_settings

logger = structlog.get_logger()

ANTHROPIC_MCP_BETA = "mcp-client-2025-11-20"
DEFAULT_TIMEOUT_SEC = 120.0


@dataclass
class McpServerConfig:
    name: str
    url: str
    authorization_token: str | None = None


def _resolve_server_token(item: dict[str, Any]) -> str | None:
    token = item.get("authorization_token")
    if token:
        return str(token).strip() or None
    env_key = str(item.get("authorization_token_env") or "").strip()
    if env_key:
        return os.getenv(env_key, "").strip() or None
    return None


def parse_mcp_servers_json(raw: str) -> list[McpServerConfig]:
    if not raw.strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("mcp.servers_json_invalid", error=str(exc)[:120])
        return []
    if not isinstance(data, list):
        return []

    servers: list[McpServerConfig] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        url = str(item.get("url") or "").strip()
        if not name or not url:
            continue
        token = _resolve_server_token(item)
        servers.append(McpServerConfig(name=name, url=url, authorization_token=token))
    return servers


def get_configured_mcp_servers() -> list[McpServerConfig]:
    settings = get_settings()
    return parse_mcp_servers_json(settings.mcp_servers_json)


def is_agent_mcp_enabled() -> bool:
    settings = get_settings()
    return bool(settings.agent_mcp_enabled and (settings.anthropic_api_key or "").strip())


def _resolve_model() -> str:
    settings = get_settings()
    return (settings.anthropic_mcp_model or settings.anthropic_model or "claude-sonnet-4-5-20250929").strip()


def extract_text_from_response(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    for block in payload.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
    return "\n\n".join(parts)


async def invoke_anthropic_direct(
    *,
    user_prompt: str,
    system_prompt: str | None = None,
    max_tokens: int = 2048,
) -> dict[str, Any]:
    settings = get_settings()
    api_key = (settings.anthropic_api_key or "").strip()
    if not api_key:
        return {"ok": False, "error": "ANTHROPIC_API_KEY not configured", "mode": "claude"}

    body: dict[str, Any] = {
        "model": _resolve_model(),
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    if system_prompt:
        body["system"] = system_prompt

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SEC) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
                json=body,
            )
        raw_text = response.text
        try:
            payload = response.json()
        except json.JSONDecodeError:
            payload = {"raw": raw_text[:2000]}

        if response.status_code >= 400:
            err = payload.get("error") if isinstance(payload, dict) else raw_text[:500]
            return {"ok": False, "error": f"Claude {response.status_code}: {err}", "mode": "claude"}

        text = extract_text_from_response(payload if isinstance(payload, dict) else {})
        return {
            "ok": True,
            "text": text or raw_text[:4000],
            "mode": "claude",
            "model": body["model"],
        }
    except Exception as exc:
        logger.warning("agent_design_consult.claude_failed", error=str(exc)[:200])
        return {"ok": False, "error": str(exc)[:300], "mode": "claude"}


async def invoke_anthropic_mcp(
    *,
    user_prompt: str,
    system_prompt: str | None = None,
    max_tokens: int = 4096,
    servers: list[McpServerConfig] | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    api_key = (settings.anthropic_api_key or "").strip()
    if not api_key:
        return {"ok": False, "error": "ANTHROPIC_API_KEY not configured", "mode": "mcp"}

    mcp_servers = servers if servers is not None else get_configured_mcp_servers()
    usable = [s for s in mcp_servers if s.authorization_token]
    if not usable:
        return {"ok": False, "error": "No MCP servers with auth token configured", "mode": "mcp"}

    model = _resolve_model()
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": user_prompt}],
        "mcp_servers": [
            {
                "type": "url",
                "url": s.url,
                "name": s.name,
                "authorization_token": s.authorization_token,
            }
            for s in usable
        ],
        "tools": [{"type": "mcp_toolset", "mcp_server_name": s.name} for s in usable],
    }
    if system_prompt:
        body["system"] = system_prompt

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SEC) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "anthropic-beta": ANTHROPIC_MCP_BETA,
                },
                json=body,
            )
        raw_text = response.text
        try:
            payload = response.json()
        except json.JSONDecodeError:
            payload = {"raw": raw_text[:2000]}

        if response.status_code >= 400:
            err = payload.get("error") if isinstance(payload, dict) else raw_text[:500]
            return {"ok": False, "error": f"Anthropic MCP {response.status_code}: {err}", "mode": "mcp"}

        text = extract_text_from_response(payload if isinstance(payload, dict) else {})
        return {
            "ok": True,
            "text": text or raw_text[:4000],
            "mode": "mcp",
            "model": model,
            "servers": [s.name for s in usable],
        }
    except Exception as exc:
        logger.warning("mcp.invoke_failed", error=str(exc)[:200])
        return {"ok": False, "error": str(exc)[:300], "mode": "mcp"}


async def invoke_agent_design_consult(
    *,
    user_prompt: str,
    system_prompt: str | None = None,
    max_tokens: int = 2048,
) -> dict[str, Any]:
    """Use remote MCP when configured; otherwise Claude-only design consult."""
    servers = get_configured_mcp_servers()
    if servers and any(s.authorization_token for s in servers):
        result = await invoke_anthropic_mcp(
            user_prompt=user_prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
        )
        if result.get("ok"):
            return result
        logger.warning("mcp.fallback_to_claude", error=str(result.get("error", ""))[:120])
    return await invoke_anthropic_direct(
        user_prompt=user_prompt,
        system_prompt=system_prompt,
        max_tokens=max_tokens,
    )


def invoke_agent_design_consult_sync(**kwargs: Any) -> dict[str, Any]:
    import asyncio
    import concurrent.futures

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(invoke_agent_design_consult(**kwargs))

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, invoke_agent_design_consult(**kwargs)).result()
