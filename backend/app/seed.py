"""
Database seed data for development.

Creates a complete vertical slice:
- One tenant (demo agency)
- Three packages (Basic, Pro, Enterprise)
- Three agent definitions (Review, Content, Ads)
- One workspace with Pro package
- Brand context for the workspace
- Agent instances provisioned from the package

This seed data lets you test the full pipeline end-to-end
without needing to set up everything through the API.
"""

from __future__ import annotations

import uuid

import structlog
from sqlalchemy import select

from app.database import async_session_factory
from app.models.tenant import Tenant
from app.models.workspace import Workspace
from app.models.package import Package, PackageAgentAllocation
from app.models.agent_config import AgentDefinition, AgentInstance
from app.models.brand_context import BrandContext

logger = structlog.get_logger()

SEED_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
SEED_WORKSPACE_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")
SEED_BASIC_PKG_ID = uuid.UUID("00000000-0000-0000-0000-000000000100")
SEED_PRO_PKG_ID = uuid.UUID("00000000-0000-0000-0000-000000000101")
SEED_ENTERPRISE_PKG_ID = uuid.UUID("00000000-0000-0000-0000-000000000102")


async def run_seed():
    async with async_session_factory() as db:
        result = await db.execute(select(Tenant).where(Tenant.id == SEED_TENANT_ID))
        if result.scalar_one_or_none():
            logger.info("seed_data_exists", msg="Skipping seed — data already present")
            return

        logger.info("seeding_database")

        # ── Tenant ──────────────────────────────────────
        tenant = Tenant(
            id=SEED_TENANT_ID,
            name="Demo Dijital Ajans",
            slug="demo-agency",
            contact_email="admin@demo-agency.com",
        )
        db.add(tenant)

        # ── Agent Definitions (system-wide) ─────────────
        review_def = AgentDefinition(
            id=uuid.UUID("00000000-0000-0000-0000-000000000201"),
            role_key="review_agent",
            display_name="Review Agent",
            description="Monitors and responds to Google Business reviews with brand-appropriate responses",
            category="reputation",
            default_system_prompt="You are a customer review specialist.",
        )
        content_def = AgentDefinition(
            id=uuid.UUID("00000000-0000-0000-0000-000000000202"),
            role_key="content_agent",
            display_name="Content Agent",
            description="Creates Instagram content strategy, concepts, and calendar",
            category="content",
            default_system_prompt="You are a creative content strategist.",
        )
        ads_def = AgentDefinition(
            id=uuid.UUID("00000000-0000-0000-0000-000000000203"),
            role_key="ads_agent",
            display_name="Ads Agent",
            description="Analyzes and optimizes Google Ads and Meta Ads campaigns",
            category="advertising",
            default_system_prompt="You are a performance marketing analyst.",
        )
        db.add_all([review_def, content_def, ads_def])

        # ── Packages ────────────────────────────────────
        basic_pkg = Package(
            id=SEED_BASIC_PKG_ID,
            tenant_id=SEED_TENANT_ID,
            name="Basic",
            slug="basic",
            description="Review management only — monitor and respond to Google reviews",
            is_default=True,
            max_workspaces=1,
            monthly_task_limit=50,
        )
        pro_pkg = Package(
            id=SEED_PRO_PKG_ID,
            tenant_id=SEED_TENANT_ID,
            name="Pro",
            slug="pro",
            description="Review management + Instagram content strategy",
            max_workspaces=3,
            monthly_task_limit=200,
        )
        enterprise_pkg = Package(
            id=SEED_ENTERPRISE_PKG_ID,
            tenant_id=SEED_TENANT_ID,
            name="Enterprise",
            slug="enterprise",
            description="Full suite: reviews, content, advertising, monitoring, automation",
            max_workspaces=10,
            monthly_task_limit=1000,
        )
        db.add_all([basic_pkg, pro_pkg, enterprise_pkg])
        await db.flush()

        # ── Package → Agent Allocations ─────────────────
        allocations = [
            PackageAgentAllocation(package_id=SEED_BASIC_PKG_ID, agent_role="review_agent", daily_execution_limit=10),
            PackageAgentAllocation(package_id=SEED_PRO_PKG_ID, agent_role="review_agent", daily_execution_limit=30),
            PackageAgentAllocation(package_id=SEED_PRO_PKG_ID, agent_role="content_agent", daily_execution_limit=20),
            PackageAgentAllocation(package_id=SEED_ENTERPRISE_PKG_ID, agent_role="review_agent", daily_execution_limit=100),
            PackageAgentAllocation(package_id=SEED_ENTERPRISE_PKG_ID, agent_role="content_agent", daily_execution_limit=50),
            PackageAgentAllocation(package_id=SEED_ENTERPRISE_PKG_ID, agent_role="ads_agent", daily_execution_limit=30),
        ]
        db.add_all(allocations)
        await db.flush()

        # ── Workspace (with Pro package) ────────────────
        workspace = Workspace(
            id=SEED_WORKSPACE_ID,
            tenant_id=SEED_TENANT_ID,
            package_id=SEED_PRO_PKG_ID,
            name="Cafe Bosphorus",
            slug="cafe-bosphorus",
        )
        db.add(workspace)
        await db.flush()

        # ── Agent Instances (provisioned from Pro package) ──
        review_instance = AgentInstance(
            workspace_id=SEED_WORKSPACE_ID,
            definition_id=review_def.id,
            is_enabled=True,
        )
        content_instance = AgentInstance(
            workspace_id=SEED_WORKSPACE_ID,
            definition_id=content_def.id,
            is_enabled=True,
        )
        db.add_all([review_instance, content_instance])

        # ── Brand Context ───────────────────────────────
        brand = BrandContext(
            workspace_id=SEED_WORKSPACE_ID,
            business_name="Cafe Bosphorus",
            business_type="Kafe & Restoran",
            description=(
                "Boğaz manzaralı, modern Türk mutfağı sunan butik bir kafe-restoran. "
                "Kahvaltı, brunch ve akşam yemekleri ile İstanbul'un en popüler mekanlarından biri."
            ),
            brand_tone="Samimi, sıcak ama profesyonel. Genç ve enerjik.",
            visual_style="Modern, minimalist, doğal ışık, sıcak tonlar, boğaz mavisi aksanlar",
            target_audience=(
                "25-45 yaş arası, İstanbul'da yaşayan, sosyal medya aktif, "
                "kaliteli yemek ve atmosfer arayan profesyoneller ve çiftler"
            ),
            location="Bebek, İstanbul",
            languages="tr",
            campaign_goals=(
                "Hafta içi öğle yemeği doluluk oranını artırmak. "
                "Instagram takipçi sayısını 3 ayda %30 büyütmek. "
                "Google yorumlarında 4.5+ ortalama tutmak."
            ),
            competitors="Mangerie Bebek, Lucca, The House Cafe",
            custom_rules=(
                "Yanıtlarda emoji kullanımı minimal olsun. "
                "Olumsuz yorumlara asla savunmacı yaklaşılmasın. "
                "İngilizce yorumlara İngilizce yanıt verilsin. "
                "Alkol promosyonu yapılmasın."
            ),
            keywords="bebek cafe, boğaz manzarası, istanbul brunch, türk kahvaltısı",
        )
        db.add(brand)

        await db.commit()
        logger.info("seed_complete", tenant=tenant.name, workspace=workspace.name)
