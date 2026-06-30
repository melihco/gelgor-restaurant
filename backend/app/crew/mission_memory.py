"""
MissionMemory — the campaign context layer for agent prompts.

When the TaskGraphExecutor fires a task node, it builds a MissionMemory object
and attaches it to BrandInfo.mission_memory. build_brand_context_prompt() then
appends the Mission Context block at the end of the agent backstory.

Result: agents within the same campaign know:
  - What campaign they are part of
  - What the shared creative brief is
  - What other agents have already produced
  - Which specific role they play in the campaign

When mission_memory is None (standard single-task execution), no Mission Context
block is added and the prompt is identical to before Task 7 — fully backward compatible.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class MissionMemory:
    """
    Carries campaign context across task executions within the same mission.

    Built by TaskGraphExecutor._execute_node() before calling engine.execute().
    Attached to BrandInfo.mission_memory so it flows through engine → crew →
    agent factory → build_brand_context_prompt() without changing any signatures.

    Fields
    ------
    mission_id          Unique mission UUID (string)
    mission_title       Human-readable title ("Yaz Sezonu Reel Kampanyası")
    mission_type        Type string: seasonal|opportunity|competitive|recovery|manual
    creative_brief      Shared narrative brief for ALL agents in this campaign
    trigger_evidence    What caused this mission (e.g. "Industry phase: Yaz Yüksek Sezonu")
    phase_name          Current phase name ("İçerik Üretimi")
    phase_index         0-based phase index
    total_phases        Total number of phases
    current_node_key    node_key of the task being executed ("post_ideation")
    current_node_title  Human-readable node title ("Post Fikirleri (5 konsept)")
    completed_outputs   Work already done in this campaign:
                        [{node_key, title, task_type, output_summary}]
    narrative_thread    Key visual/tone keywords for cross-node consistency
                        (e.g. "yaz, sahil, altın saat, casual luxury, rezervasyon")
                        Derived from creative_brief by the executor.
    """
    mission_id:         str
    mission_title:      str
    mission_type:       str
    creative_brief:     str
    trigger_evidence:   str
    phase_name:         str
    phase_index:        int
    total_phases:       int
    current_node_key:   str
    current_node_title: str
    completed_outputs:  list[dict[str, Any]] = field(default_factory=list)
    narrative_thread:   str = ""


# ── Prompt block builder ─────────────────────────────────────────────────────

_MISSION_TYPE_LABELS: dict[str, str] = {
    "seasonal":    "Sezonsal Kampanya",
    "opportunity": "Fırsat Atağı",
    "competitive": "Rekabetçi Yanıt",
    "recovery":    "Kalite Toparlanması",
    "manual":      "Manuel Kampanya",
}


def build_mission_context_block(memory: MissionMemory) -> str:
    """
    Build the Mission Context prompt layer from a MissionMemory object.

    Injected at the END of the agent backstory (highest LLM recency priority).
    Tells the agent exactly where it sits in the campaign and what's already done.
    """
    type_label = _MISSION_TYPE_LABELS.get(memory.mission_type, memory.mission_type.title())
    phase_label = f"Faz {memory.phase_index + 1}/{memory.total_phases}: {memory.phase_name}"

    lines: list[str] = [
        "---",
        "## 🎯 Aktif Kampanya — Bu Görev Bir Kampanyanın Parçası",
        "",
        f"**Kampanya**: {memory.mission_title} · {type_label}",
        f"**Faz**: {phase_label}",
    ]

    if memory.trigger_evidence:
        lines.append(f"**Tetikleyici**: {memory.trigger_evidence}")

    lines += ["", "### Kampanya Ortak Brief (tüm ajanlar için geçerli)"]
    lines.append(memory.creative_brief.strip())

    if memory.narrative_thread:
        lines += [
            "",
            f"**Görsel & ton ipliği**: {memory.narrative_thread}",
            "→ Bu kampanyadaki tüm çalışmalar bu temayı sürdürmeli.",
        ]

    if memory.completed_outputs:
        lines += ["", "### Bu Kampanyada Tamamlanan Çalışmalar"]
        for out in memory.completed_outputs:
            title    = out.get("title", out.get("node_key", "?"))
            task     = out.get("task_type", "")
            raw_summary = (out.get("output_summary") or "").strip()
            if task == "content_strategy" and raw_summary:
                from app.services.content_strategy_brief import (
                    STRATEGY_MEMORY_PREVIEW_MAX_CHARS,
                    build_strategy_brief_for_downstream,
                )

                summary = build_strategy_brief_for_downstream(
                    raw_summary,
                    max_chars=STRATEGY_MEMORY_PREVIEW_MAX_CHARS,
                )
            else:
                summary = raw_summary[:200]
            entry    = f"- **{title}** ({task})"
            if summary:
                entry += f": {summary}"
            lines.append(entry)
    else:
        lines += ["", "### Tamamlanan Çalışmalar", "- Henüz yok — bu ilk görev."]

    lines += [
        "",
        f"### Şu Anki Görev: {memory.current_node_title}",
        "",
        "**KAMPANYA TUTARLILIK KURALI**: Yukarıdaki tamamlanmış çalışmalarla görsel ve "
        "anlatı bütünlüğünü koru. Aynı ton, aynı marka sesi, aynı kampanya açısı. "
        "Bu görev izole değil — bir kampanyanın parçası.",
        "---",
    ]

    return "\n".join(lines)
