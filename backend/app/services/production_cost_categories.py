"""Taxonomy for production cost events — shared by writers and admin read APIs."""

from __future__ import annotations

# Event scope (where in the pipeline the charge occurred)
SCOPE_MISSION_GRAPH = "mission_graph"
SCOPE_FEED_SLOT = "feed_slot"
SCOPE_INTEGRATION = "integration"
SCOPE_GALLERY = "gallery"
SCOPE_OTHER = "other"

VALID_SCOPES = frozenset({
    SCOPE_MISSION_GRAPH,
    SCOPE_FEED_SLOT,
    SCOPE_INTEGRATION,
    SCOPE_GALLERY,
    SCOPE_OTHER,
})

# How the USD amount was derived
PRICING_MEASURED_TOKENS = "measured_tokens"
PRICING_PROVIDER_METERED = "provider_metered"
PRICING_CATALOG_ESTIMATE = "catalog_estimate"
PRICING_MANUAL = "manual"

VALID_PRICING_BASES = frozenset({
    PRICING_MEASURED_TOKENS,
    PRICING_PROVIDER_METERED,
    PRICING_CATALOG_ESTIMATE,
    PRICING_MANUAL,
})

MEASURED_PRICING_BASES = frozenset({PRICING_MEASURED_TOKENS, PRICING_PROVIDER_METERED})

SCOPE_AMOUNT_FIELD: dict[str, str] = {
    SCOPE_MISSION_GRAPH: "mission_graph_usd",
    SCOPE_FEED_SLOT: "feed_slot_usd",
    SCOPE_INTEGRATION: "integration_usd",
    SCOPE_GALLERY: "gallery_usd",
    SCOPE_OTHER: "other_usd",
}
