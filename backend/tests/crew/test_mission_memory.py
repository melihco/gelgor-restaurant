from app.crew.mission_memory import MissionMemory, build_mission_context_block


def make_memory(**overrides) -> MissionMemory:
    data = {
        "mission_id": "mission-1",
        "mission_title": "Yaz Sezonu",
        "mission_type": "seasonal",
        "creative_brief": "Local products with premium but warm tone.",
        "trigger_evidence": "Industry phase: summer",
        "phase_name": "Content Production",
        "phase_index": 1,
        "total_phases": 3,
        "current_node_key": "post_ideation",
        "current_node_title": "Post Ideas",
        "completed_outputs": [],
        "narrative_thread": "Datca, local, morning",
    }
    data.update(overrides)
    return MissionMemory(**data)


def test_build_mission_context_block_contains_campaign_and_current_task() -> None:
    block = build_mission_context_block(make_memory())

    assert "Yaz Sezonu" in block
    assert "Sezonsal Kampanya" in block
    assert "Faz 2/3: Content Production" in block
    assert "Post Ideas" in block
    assert "KAMPANYA TUTARLILIK KURALI" in block


def test_build_mission_context_block_lists_completed_outputs() -> None:
    memory = make_memory(
        completed_outputs=[
            {
                "node_key": "strategy",
                "title": "Strategy",
                "task_type": "content_ideation",
                "output_summary": "Use daily morning story and happy-hour reel.",
            }
        ]
    )

    block = build_mission_context_block(memory)

    assert "Bu Kampanyada Tamamlanan Çalışmalar" in block
    assert "**Strategy** (content_ideation)" in block
    assert "daily morning story" in block


def test_build_mission_context_block_handles_empty_completed_outputs() -> None:
    block = build_mission_context_block(make_memory(completed_outputs=[]))

    assert "Henüz yok" in block
