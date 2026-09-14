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
  templateLayoutReferenceUrl: (
    binding: { matched?: { matchQuality?: string } | null; styleReferenceUrl?: string | null } | null,
  ) => {
    const m = binding?.matched;
    if (!m || (m.matchQuality !== 'hard' && m.matchQuality !== 'soft')) return undefined;
    return binding?.styleReferenceUrl ?? undefined;
  },
  librarySlotShellMissingReason: (
    m: { matchQuality?: string } | null | undefined,
    layoutUrl?: string | null,
  ) => {
    if (!m || (m.matchQuality !== 'hard' && m.matchQuality !== 'soft')) return null;
    if (String(layoutUrl ?? '').trim()) return null;
    return 'library_template_replica_required: saved shell preview missing';
  },
}));

vi.mock('@/lib/premium-editorial', () => ({
  runPremiumEditorialCampaign: (...args: unknown[]) => runCampaign(...args),
  premiumEditorialArtifactMetadata: () => ({ editorial: true }),
}));

vi.mock('@/lib/typography-text-validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/typography-text-validation')>();
  return {
    ...actual,
    validateFalCanvasText: vi.fn(async () => ({
      valid: true,
      headlineValid: true,
      subtitleValid: true,
      confidence: 1,
    })),
  };
});

import { validateFalCanvasText } from '@/lib/typography-text-validation';
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
      styleReferenceUrl: 'https://cdn.example.com/shell.png',
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
    expect(state.artifactMetaPatch).toMatchObject({
      typography_text_valid: true,
      text_validated: true,
    });
    expect(runCampaign).toHaveBeenCalledWith(expect.objectContaining({
      forceNewComposition: false,
      templateLayoutImageUrl: 'https://cdn.example.com/shell.png',
    }));
  });

  it('shop story: fits a long honey sentence before GPT paint', async () => {
    bind.mockResolvedValue({
      matched: {
        id: 'tpl-shop-story',
        templateType: 'campaign_announcement',
        templateName: 'Premium Editorial Story',
        matchQuality: 'hard',
      },
      styleReferenceUrl: 'https://cdn.example.com/shell.png',
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
        headline: 'Kekik ve Çiçek Balı çeşitlerimizle sağlıklı bir tat deneyimi yaşayın',
        catalogSlotKey: 'local_products_shop_premium_editorial_campaign_story',
        slotRole: 'premium_editorial_campaign_story',
        falAspectRatio: '9:16',
      },
      state,
    });
    const painted = runCampaign.mock.calls[0]?.[0] as { headline: string };
    // Story type box is the law (28 chars / 3 words + coordination head):
    // the painted line is a whole noun phrase, never a mid-sentence saw.
    expect(painted.headline.toLocaleLowerCase('tr-TR')).toContain('kekik ve çiçek balı');
    expect(painted.headline.length).toBeLessThanOrEqual(28);
    expect(state.falTextValidated).toBe(true);
  });

  it('beach story: paints the planned sunset sentence', async () => {
    bind.mockResolvedValue({
      matched: {
        id: 'tpl-beach-story',
        templateType: 'campaign_announcement',
        templateName: 'Sunset editorial',
        matchQuality: 'hard',
      },
      styleReferenceUrl: 'https://cdn.example.com/shell.png',
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
        headline: 'Taste the refreshing flavors of summer at sunset tonight',
        catalogSlotKey: 'beach_club_premium_editorial_campaign_story',
        slotRole: 'premium_editorial_campaign_story',
        falAspectRatio: '9:16',
      },
      state,
    });
    const painted = runCampaign.mock.calls[0]?.[0] as { headline: string };
    expect(painted.headline.toLowerCase()).toContain('the refreshing flavors');
    expect(painted.headline.toLowerCase()).not.toMatch(/\b(of|the|and)$/);
    expect(painted.headline.length).toBeLessThanOrEqual(28);
  });

  it('shop: withholds when painted type is mashed', async () => {
    bind.mockResolvedValue({
      matched: {
        id: 'tpl-shop',
        templateType: 'campaign_announcement',
        templateName: 'Editorial',
        matchQuality: 'hard',
      },
      styleReferenceUrl: 'https://cdn.example.com/shell.png',
    });
    runCampaign.mockResolvedValue({
      finalImageUrl: 'https://cdn.example.com/out.jpg',
      modelName: 'gpt-image-2',
      costEstimateUsd: 0.05,
    });
    vi.mocked(validateFalCanvasText).mockResolvedValueOnce({
      valid: false,
      headlineValid: false,
      subtitleValid: true,
      confidence: 0.2,
      reason: 'collapsed word spacing',
    });
    const state = emptyState();
    await premiumEditorialHandler.run({ inputs: baseInputs, state });
    expect(state.imageUrl).toBeNull();
    expect(state.falTextValidated).toBe(false);
    expect(state.pipelineFailureReason).toMatch(/metin doğrulanamadı/);
  });

  it('shop: withholds when the locked slot has no saved shell preview', async () => {
    bind.mockResolvedValue({
      matched: {
        id: 'tpl-shop',
        templateType: 'campaign_announcement',
        templateName: 'Editorial',
        matchQuality: 'hard',
      },
      styleReferenceUrl: null,
    });
    const state = emptyState();
    await premiumEditorialHandler.run({ inputs: baseInputs, state });
    expect(state.pipelineFailureReason).toMatch(/library_template_replica_required/);
    expect(runCampaign).not.toHaveBeenCalled();
  });
});
