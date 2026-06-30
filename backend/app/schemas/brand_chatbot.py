"""Brand chatbot profile — Instagram DM bot + future agent/voice identity."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ChatbotFaqItem(BaseModel):
    question: str
    answer: str


class ChatbotProductCategory(BaseModel):
    name: str
    description: str = ""
    highlights: list[str] = Field(default_factory=list)


class ChatbotConversationRules(BaseModel):
    language: str = "tr"
    tone: str = ""
    greeting_style: str = ""
    do_list: list[str] = Field(default_factory=list)
    dont_list: list[str] = Field(default_factory=list)
    escalation_triggers: list[str] = Field(default_factory=list)


class BrandChatbotProfile(BaseModel):
    """Persisted on brand_contexts.chatbot_profile (JSONB)."""

    version: int = 1
    analyzed_at: datetime | None = None
    source: Literal["auto_analysis", "manual", "seed"] = "auto_analysis"

    business_display_name: str = ""
    business_hours: str = "Pazartesi–Cumartesi 09:00–18:00"
    address: str = ""
    phone: str = ""
    price_range: str = "₺₺"
    website_url: str = ""
    instagram_handle: str = ""

    menu_summary: str = ""
    product_categories: list[ChatbotProductCategory] = Field(default_factory=list)
    shipping_policy: str = ""
    payment_methods: str = ""
    order_process: str = ""

    faqs: list[ChatbotFaqItem] = Field(default_factory=list)
    conversation_rules: ChatbotConversationRules = Field(default_factory=ChatbotConversationRules)

    # Markdown block injected into agent prompts / Mertcafe notes
    agent_context_markdown: str = ""

    # Operator notes (synced to Mertcafe setup notes field)
    operator_notes: str = ""

    mertcafe_synced_at: datetime | None = None
    analysis_confidence: int = Field(0, ge=0, le=100)


class BrandChatbotProfileRead(BaseModel):
    profile: BrandChatbotProfile | None = None
    updated_at: datetime | None = None


class BrandChatbotProfilePatch(BaseModel):
    """Partial update — merged into existing profile."""

    business_display_name: str | None = None
    business_hours: str | None = None
    address: str | None = None
    phone: str | None = None
    price_range: str | None = None
    website_url: str | None = None
    instagram_handle: str | None = None
    menu_summary: str | None = None
    product_categories: list[ChatbotProductCategory] | None = None
    shipping_policy: str | None = None
    payment_methods: str | None = None
    order_process: str | None = None
    faqs: list[ChatbotFaqItem] | None = None
    conversation_rules: ChatbotConversationRules | None = None
    agent_context_markdown: str | None = None
    operator_notes: str | None = None
