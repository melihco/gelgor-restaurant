from app.services.ai_cost_service import (
    ESTIMATED_COST_USD,
    TASK_TYPE_TO_CATEGORY,
    estimate_cost_from_tokens,
)


def test_estimate_cost_from_tokens_uses_known_model_rate() -> None:
    assert estimate_cost_from_tokens(5_000, "gpt-4o") == 0.0375


def test_estimate_cost_from_tokens_falls_back_to_default_rate() -> None:
    assert estimate_cost_from_tokens(2_000, "unknown-model") == 0.012


def test_estimate_cost_from_tokens_ignores_empty_or_negative_usage() -> None:
    assert estimate_cost_from_tokens(0, "gpt-4o") == 0.0
    assert estimate_cost_from_tokens(-10, "gpt-4o") == 0.0


def test_task_type_mapping_covers_feed_art_director_node() -> None:
    assert TASK_TYPE_TO_CATEGORY["feed_cohesion_review"] == "feed_art_director"
    assert ESTIMATED_COST_USD["feed_art_director"] > 0
