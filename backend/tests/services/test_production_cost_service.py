from app.services.production_cost_categories import (
    PRICING_CATALOG_ESTIMATE,
    PRICING_MEASURED_TOKENS,
    PRICING_PROVIDER_METERED,
    SCOPE_FEED_SLOT,
    SCOPE_GALLERY,
    SCOPE_INTEGRATION,
    SCOPE_MISSION_GRAPH,
)
from app.services.production_cost_service import (
    build_slot_key,
    infer_pricing_basis,
    infer_scope,
)


def test_build_slot_key_matches_ts_convention() -> None:
    assert build_slot_key(2, "campaign_post") == "2::campaign_post"
    assert build_slot_key(None, "campaign_post") is None
    assert build_slot_key(0, "") is None


def test_infer_pricing_basis_from_tokens() -> None:
    assert infer_pricing_basis(tokens_in=100, tokens_out=50) == PRICING_MEASURED_TOKENS


def test_infer_pricing_basis_from_fal_request_id() -> None:
    assert infer_pricing_basis(external_request_id="req-abc") == PRICING_PROVIDER_METERED


def test_infer_pricing_basis_defaults_to_catalog() -> None:
    assert infer_pricing_basis() == PRICING_CATALOG_ESTIMATE


def test_infer_scope_feed_slot_when_artifact_present() -> None:
    import uuid

    assert infer_scope(artifact_id=uuid.uuid4()) == SCOPE_FEED_SLOT


def test_infer_scope_mission_graph_by_default() -> None:
    assert infer_scope() == SCOPE_MISSION_GRAPH


def test_infer_scope_gallery_from_call_type() -> None:
    assert infer_scope(call_type="gallery_match") == SCOPE_GALLERY


def test_infer_scope_integration_from_call_type() -> None:
    assert infer_scope(call_type="apify_instagram_scrape") == SCOPE_INTEGRATION
