"""
V1 API router – aggregates all route modules.

Tenant safety: workspace-scoped routers below use `verify_workspace_access` as a
global dependency. The dep auto-no-ops for endpoints without {workspace_id} in
the path, so global utility endpoints (e.g. /brand-context/shotstack/...) remain
accessible. In production, mismatched X-Tenant-Id → 403.
"""

from fastapi import APIRouter, Depends

from app.api.deps import verify_workspace_access
from app.api.v1 import tenants, workspaces, packages, agents, tasks, reviews, brand_context, ads, analytics, provider_actions, intelligence, social, missions, brand_rules, usage_cost, cost_ledger, product_visual, scheduled_templates, design_templates, special_days, slot_catalog

api_router = APIRouter()

# Workspace-scoped routers — global tenant verification (no-op for non-{workspace_id} routes)
_ws_dep = [Depends(verify_workspace_access())]

api_router.include_router(tenants.router, prefix="/tenants", tags=["Tenants"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["Workspaces"])
api_router.include_router(packages.router, prefix="/packages", tags=["Packages"])
api_router.include_router(agents.router, prefix="/agents", tags=["Agents"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["Reviews"])
api_router.include_router(brand_context.router, prefix="/brand-context", tags=["Brand Context"], dependencies=_ws_dep)
api_router.include_router(ads.router, prefix="/ads", tags=["Ads"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
api_router.include_router(provider_actions.router, prefix="/provider-actions", tags=["Provider Actions"])
api_router.include_router(intelligence.router, prefix="/intelligence", tags=["Intelligence"])
api_router.include_router(social.router, prefix="/social", tags=["Social Connections"], dependencies=_ws_dep)
api_router.include_router(missions.router, prefix="/missions", tags=["Missions"], dependencies=_ws_dep)
api_router.include_router(brand_rules.router, prefix="/brand-rules", tags=["Brand Rules"], dependencies=_ws_dep)
api_router.include_router(usage_cost.router, prefix="/usage-cost", tags=["Usage Cost"], dependencies=_ws_dep)
api_router.include_router(cost_ledger.router, prefix="/cost-ledger", tags=["Cost Ledger"], dependencies=_ws_dep)
api_router.include_router(product_visual.router, prefix="/product-visual", tags=["Product Visual Studio"])
api_router.include_router(scheduled_templates.router, prefix="/scheduled-templates", tags=["Scheduled Templates"], dependencies=_ws_dep)
api_router.include_router(design_templates.router, prefix="/design-templates", tags=["Design Templates"], dependencies=_ws_dep)
api_router.include_router(special_days.router, prefix="/special-days", tags=["Special Days"])
api_router.include_router(slot_catalog.router, prefix="/slot-catalog", tags=["Slot Catalog"], dependencies=_ws_dep)
