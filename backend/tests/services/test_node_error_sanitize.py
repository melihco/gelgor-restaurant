"""Readable mission node errors — no CrewAI prompt dumps in UI."""

from app.services.task_graph_executor import _sanitize_node_error


def test_sanitize_crewai_task_prompt_dump_for_ideation() -> None:
    raw = "Task '## 🎨 BRAND THEME TOKENS — MANDATORY IMAGE GENERATION RULES\nSources: Brand Hub"
    assert _sanitize_node_error(raw, "content_ideation") == (
        "İçerik fikirleri üretilemedi (LLM görevi tamamlanamadı)."
    )


def test_sanitize_preserves_timeout_message() -> None:
    raw = "Execution timed out after 420.0s"
    assert _sanitize_node_error(raw, "content_ideation") == raw
