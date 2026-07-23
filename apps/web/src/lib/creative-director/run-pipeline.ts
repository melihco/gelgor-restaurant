/**
 * Agency Creative Director pipeline:
 *   Brand kit → Campaign → Template → Layout shell hint → Prompt Builder
 *
 * Prompt feeds GPT Image design-card (vibey craft). Shell id is layout inspiration.
 * Multi-tenant: no brand UUID branches.
 */

import type { TypographyVibe } from '@/types/brand-theme';
import { resolveCampaignConcept, type CampaignConcept, type CampaignConceptId } from './campaign-concepts';
import { resolveAgencyTemplate } from './select-template';
import {
  buildAgencyCreativeDirectorPrompt,
  type AgencyPromptBrandKit,
  type AgencyPromptCopy,
} from './prompt-builder';
import type { AgencyTemplateContract, AgencyTemplateFormat, AgencyTemplateId } from './agency-templates';
import { resolveGeometricShell, type GeometricShellId } from '@/lib/canva-geometric-layouts';
import { resolveSlotLookKind } from '@/lib/slot-look-directive';

export type AgencyCreativePipelineResult = {
  campaign: CampaignConcept;
  template: AgencyTemplateContract;
  prompt: string;
  format: AgencyTemplateFormat;
  geometricShellId: GeometricShellId;
};

export function runAgencyCreativeDirectorPipeline(input: {
  format: AgencyTemplateFormat;
  brandName: string;
  brandColors: { primary: string; accent: string };
  brandPersonality?: string[];
  vibe?: TypographyVibe | string | null;
  location?: string | null;
  logoUrl?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  fontPersonality?: string | null;
  visualDnaTone?: string | null;
  headline: string;
  subheadline?: string | null;
  cta?: string | null;
  caption?: string | null;
  announcementType?: string | null;
  catalogSlotKey?: string | null;
  businessType?: string | null;
  mood?: string | null;
  recentCampaignIds?: CampaignConceptId[];
  recentTemplateIds?: AgencyTemplateId[];
}): AgencyCreativePipelineResult {
  const campaign = resolveCampaignConcept({
    headline: input.headline,
    caption: input.caption,
    announcementType: input.announcementType,
    catalogSlotKey: input.catalogSlotKey,
    businessType: input.businessType,
    mood: input.mood,
    recentCampaignIds: input.recentCampaignIds,
  });

  const template = resolveAgencyTemplate({
    campaign,
    format: input.format,
    headline: input.headline,
    caption: input.caption,
    catalogSlotKey: input.catalogSlotKey,
    announcementType: input.announcementType,
    recentTemplateIds: input.recentTemplateIds,
  });

  const brand: AgencyPromptBrandKit = {
    brandName: input.brandName,
    primary: input.brandColors.primary,
    accent: input.brandColors.accent,
    personality: input.brandPersonality?.length
      ? input.brandPersonality
      : ['premium', 'mediterranean', 'hospitality'],
    vibe: input.vibe ?? null,
    location: input.location,
    logoUrl: input.logoUrl,
    headingFont: input.headingFont,
    bodyFont: input.bodyFont,
    fontPersonality: input.fontPersonality,
    visualDnaTone: input.visualDnaTone,
  };

  const copy: AgencyPromptCopy = {
    headline: input.headline,
    subheadline: input.subheadline,
    cta: input.cta,
    caption: input.caption,
    catalogSlotKey: input.catalogSlotKey,
  };

  const slotLook = resolveSlotLookKind({
    announcementType: input.announcementType,
    catalogSlotKey: input.catalogSlotKey,
    headline: input.headline,
    caption: input.caption,
    sector: input.businessType,
  });
  const geometricShellId = resolveGeometricShell({
    catalogSlotKey: input.catalogSlotKey,
    slotLook,
    format: input.format,
    headline: input.headline,
    announcementType: input.announcementType,
  }).id;

  const prompt = buildAgencyCreativeDirectorPrompt({
    campaign,
    template,
    brand,
    copy,
    format: input.format,
    geometricShellId,
  });

  return { campaign, template, prompt, format: input.format, geometricShellId };
}
