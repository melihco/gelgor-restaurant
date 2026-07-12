"""
SQLAlchemy ORM models.

All models are imported here so that Base.metadata sees every table
when create_all or Alembic autogenerate runs.
"""

from app.models.base import Base  # noqa: F401
from app.models.tenant import Tenant  # noqa: F401
from app.models.workspace import Workspace  # noqa: F401
from app.models.package import Package, PackageAgentAllocation  # noqa: F401
from app.models.agent_config import AgentDefinition, AgentInstance  # noqa: F401
from app.models.brand_context import (  # noqa: F401
    BrandContext,
    BrandAsset,
    BrandPostTemplate,
    BrandScheduledTemplate,
    BrandDesignTemplate,
    SpecialDay,
)
from app.models.integration import IntegrationConnection  # noqa: F401
from app.models.task import Task, Suggestion, Approval, ActionLog  # noqa: F401
from app.models.content import ContentAsset, PromptProfile  # noqa: F401
from app.models.social_connection import SocialConnection  # noqa: F401
from app.models.mission import Mission, MissionTaskNode    # noqa: F401
from app.models.brand_rule import BrandRule                # noqa: F401
from app.models.workspace_usage import WorkspaceUsageDaily  # noqa: F401
from app.models.cost_ledger import MissionCostLedger, ArtifactCostLedger  # noqa: F401
from app.models.production_cost import (  # noqa: F401
    CostEvent,
    MissionCostRollup,
    MissionSlotCostRollup,
)
from app.models.slot_catalog import (  # noqa: F401
    CanonicalSector,
    ProductionSlotDefinition,
    TenantSlotAssignment,
)
