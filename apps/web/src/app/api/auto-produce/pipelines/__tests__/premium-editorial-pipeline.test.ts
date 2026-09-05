import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SlotProductionInputs, SlotProductionState } from '../pipeline-types';

const bind = vi.fn();
const runCampaign = vi.fn();

vi.mock('@/lib/brand-design-template-production', () => ({
  bindBrandTemplateForFalProduction: (...args: unknown[]) => bind(...args),
  catalogTemplateWithholdReason: (
    catalogSlotKey: string | null | undefined,
    m: { matchQuality?: string } | null | undefined,
  ) => {
    const key = String(catalogSlotKey ?? '').trim();
    if (!key) return null;
    if (m && (m.matchQuality === 'hard' || m.matchQuality === 'soft')) return null;
    return `library_template_required: no renderable template for catalog_slot_key=${key}`;
  },
}));

vi.mock('@/lib/premium-editorial', () => ({
  runPremiumEditorialCampaign: (...args: unknown[]) => runCampaign(...args),
  premiumEditorialArtifactMetadata: () => ({ editorial: true }),
}));

import { premiumEditorialHandler } from '../premium-editorial-pipeline';

function emptyState(): SlotProductionState {
  return {
    imageUrl: null,
    videoUrl: null,
    falGrafikerScore: null,
    falGrafikerPass: true,
    falDesignEngine: null,
    videoProduceMeta: null,
    costDelta: 0,
  };
}

const baseInputs = {
  workspaceId: 'ws-1',
  pipeline: 'premium_editorial',
  slotRole: 'premium_editorial_campaign_post',
  ideaIndex: 0,
  librarySlotKey: 'editorial_story',
  catalogSlotKey: 'local_products_shop_premium_editorial_campaign_post',
  headline: 'Erken hasat',
  caption: 'Parti biter',
  cta: 'Rafta bak',
  resolvedBrandName: 'Shop',
  brandBusinessType: 'local_products_shop',
  brandTone: 'warm',
  brandLocation: 'Datça',
  brandLogoUrl: null,
  brandReferenceImageUrls: [],
  visualDna: '',
  brandDescription: '',
  brandTheme: {},
  templateLibrary: null,
  brandTokens: {},
  referenceUrl: 'https://cdn.example.com/oil.jpg',
  mood: 'editorial',
} as unknown as SlotProductionInputs;

describe('premiumEditorialHandler template lock', () => {
  beforeEach(() => {
    bind.mockReset();
    runCampaign.mockReset();
  });

  it('withholds when catalog is pinned and no renderable template (shop)', async () => {
    bind.mockResolvedValue({ matched: null });
    const state = emptyState();
    await premiumEditorialHandler.run({ inputs: baseInputs, state });
    expect(state.pipelineFailureReason).toMatch(/library_template_required/);
    expect(runCampaign).not.toHaveBeenCalled();
  });

  it('stamps the locked template then produces (beach story)', async () => {
    bind.mockResolvedValue({
      matched: {
        id: 'tpl-beach',
        templateType: 'campaign_announcement',
        templateName: 'Sunset editorial',
        matchQuality: 'hard',
      },
    });
    runCampaign.mockResolvedValue({
      finalImageUrl: 'https://cdn.example.com/out.jpg',
      modelName: 'gpt-image-2',
      costEstimateUsd: 0.05,
    });
    const state = emptyState();
    await premiumEditorialHandler.run({
      inputs: {
        ...baseInputs,
        brandBusinessType: 'beach_club',
        catalogSlotKey: 'beach_club_premium_editorial_campaign_story',
        slotRole: 'premium_editorial_campaign_story',
        falAspectRatio: '9:16',
      },
      state,
    });
    expect(state.brandDesignTemplateId).toBe('tpl-beach');
    expect(state.imageUrl).toBe('https://cdn.example.com/out.jpg');
    expect(runCampaign).toHaveBeenCalledOnce();
  });
});
