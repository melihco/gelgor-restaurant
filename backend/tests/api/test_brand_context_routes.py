"""Characterization test for the brand-context router surface.

Locks the exact set of (HTTP method, path) routes exposed by
``app.api.v1.brand_context.router``. The router was split from a single
3k-line module into a package of focused sub-routers; this test guarantees the
externally observable route surface is byte-for-byte identical before and after
the split (no endpoint dropped, renamed, or re-pathed).
"""

from __future__ import annotations

from app.api.v1.brand_context import router

# Frozen snapshot captured from the pre-split single-file router.
EXPECTED_ROUTES: frozenset[str] = frozenset(
    {
        "DELETE /{workspace_id}/post-templates/{template_id}",
        "GET /shotstack/templates/list",
        "GET /templates/list",
        "GET /{workspace_id}",
        "GET /{workspace_id}/all-briefs",
        "GET /{workspace_id}/announcement-templates",
        "GET /{workspace_id}/brand-gaps",
        "GET /{workspace_id}/brand-template-config",
        "GET /{workspace_id}/chatbot-profile",
        "GET /{workspace_id}/gallery-analysis",
        "GET /{workspace_id}/gallery-match-stats",
        "GET /{workspace_id}/ics-score",
        "GET /{workspace_id}/industry-intelligence",
        "GET /{workspace_id}/llm-config",
        "GET /{workspace_id}/pinterest-inspiration",
        "GET /{workspace_id}/post-templates",
        "GET /{workspace_id}/reviews/pending",
        "GET /{workspace_id}/reviews/stats",
        "GET /{workspace_id}/snapshot",
        "GET /{workspace_id}/tenant-learning",
        "GET /{workspace_id}/theme",
        "GET /{workspace_id}/vibe",
        "PATCH /{workspace_id}",
        "PATCH /{workspace_id}/chatbot-profile",
        "PATCH /{workspace_id}/post-templates/{template_id}",
        "PATCH /{workspace_id}/theme/ai-settings",
        "POST /shotstack/templates/seed",
        "POST /templates/seed",
        "POST /{workspace_id}",
        "POST /{workspace_id}/analyze",
        "POST /{workspace_id}/analyze-competitors",
        "POST /{workspace_id}/analyze-visuals",
        "POST /{workspace_id}/assign-template",
        "POST /{workspace_id}/auto-render",
        "POST /{workspace_id}/brand-dna",
        "POST /{workspace_id}/brand-template-config",
        "POST /{workspace_id}/brand-video-pack",
        "POST /{workspace_id}/chatbot-profile/analyze",
        "POST /{workspace_id}/complete-gaps",
        "POST /{workspace_id}/confirm-constitution",
        "POST /{workspace_id}/creatomate-bundle",
        "POST /{workspace_id}/design-cards",
        "POST /{workspace_id}/design-director",
        "POST /{workspace_id}/enrich-brand-kit-from-website",
        "POST /{workspace_id}/gallery-analysis",
        "POST /{workspace_id}/gallery/append",
        "POST /{workspace_id}/gallery-match-stats",
        "POST /{workspace_id}/industry-intelligence",
        "POST /{workspace_id}/llm-config",
        "POST /{workspace_id}/monthly-brief",
        "POST /{workspace_id}/pinterest-inspiration",
        "POST /{workspace_id}/post-templates",
        "POST /{workspace_id}/production-design-profile/derive",
        "POST /{workspace_id}/refresh-performance",
        "POST /{workspace_id}/refresh-trends",
        "POST /{workspace_id}/reviews/submit",
        "POST /{workspace_id}/service-profile/derive",
        "POST /{workspace_id}/set-language",
        "POST /{workspace_id}/social-listening",
        "POST /{workspace_id}/template-render",
        "POST /{workspace_id}/template-video-pack",
        "POST /{workspace_id}/theme/derive",
        "POST /{workspace_id}/vibe/scrape-refs",
        "POST /{workspace_id}/video-production-spec",
        "POST /{workspace_id}/visual-production-enrich",
        "PUT /{workspace_id}/announcement-templates",
        "PUT /{workspace_id}/theme",
        "PUT /{workspace_id}/vibe",
    }
)


def _actual_routes() -> frozenset[str]:
    out: set[str] = set()
    for route in router.routes:
        methods = getattr(route, "methods", None) or set()
        for method in methods:
            out.add(f"{method} {route.path}")
    return frozenset(out)


def test_brand_context_route_surface_is_stable() -> None:
    actual = _actual_routes()
    missing = EXPECTED_ROUTES - actual
    added = actual - EXPECTED_ROUTES
    assert not missing, f"routes disappeared after refactor: {sorted(missing)}"
    assert not added, f"unexpected new routes after refactor: {sorted(added)}"


def test_brand_context_route_count() -> None:
    assert len(_actual_routes()) == 68
