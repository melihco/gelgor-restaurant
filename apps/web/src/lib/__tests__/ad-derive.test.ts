import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-config', () => ({
  serverConfig: {
    fal: { configured: true },
    autoProduce: { reuseDesignedPostStill: false },
    crewBackend: { baseUrl: 'http://127.0.0.1:8000' },
    internal: { apiKey: 'test-internal-key' },
  },
}));

vi.mock('@/lib/brand-design-template-production', () => ({
  bindBrandTemplateForFalProduction: vi.fn().mockResolvedValue({
    matched: null,
    lockedVibe: null,
    referencePhotoUrl: null,
    styleReferenceUrl: null,
    brandDirectives: [],
    brandColors: null,
    logoUrl: undefined,
    occasion: undefined,
  }),
}));

vi.mock('@/app/api/auto-produce/pipelines/fal-designed-post-pipeline', () => ({
  produceFalDesignedPost: vi.fn(),
}));

import { deriveAdCreativesFromDesignedPost } from '@/app/api/auto-produce/ad-derive';
import { produceFalDesignedPost } from '@/app/api/auto-produce/pipelines/fal-designed-post-pipeline';

const baseSnapshot = {
  imageUrl: 'https://cdn.example/old-remotion.jpg',
  referencePhotoUrl: 'https://cdn.example/gallery-breakfast.jpg',
  headline: 'Cumartesi gece yoğunluğu',
  caption: 'Yeni serpme köy kahvaltımızla güne Gel Gör Restaurant — bahçede kahvaltı.',
  cta: 'Rezervasyon',
  hashtags: ['#kahvalti'],
  missionId: 'mission-1',
  nodeKey: 'ideas',
  ideaId: 'idea-2',
  ideaIndex: 2,
};

const baseCtx = {
  brandBusinessType: 'restaurant',
  brandLocation: 'Datça',
  brandLogoUrl: 'https://cdn.example/logo.png',
  brandTheme: { anti_patterns: ['gece hayatı'] },
  brandTokens: {
    headingFont: 'Inter',
    bodyFont: 'Inter',
    primaryColor: '#2d5016',
    accentColor: '#c9a227',
    textColor: '#ffffff',
    shadowColor: '#000000',
    headlineColor: '#2d5016',
    subtitleColor: '#c9a227',
    overlayColor: '#2d5016',
    overlayOpacity: 0.35,
    announcementKit: { palette: { primary: '#2d5016', accent: '#c9a227' } },
    sources: [],
  },
  routeBaseUrl: 'http://127.0.0.1:3000',
  brandDescription: 'Datça yöresel serpme köy kahvaltısı — bahçede kahvaltı deneyimi.',
  visualDna: 'Sıcak bahçe kahvaltı atmosferi',
};

describe('deriveAdCreativesFromDesignedPost', () => {
  beforeEach(() => {
    vi.mocked(produceFalDesignedPost).mockReset();
  });

  it('uses FAL for Meta and Google ad derivatives', async () => {
    vi.mocked(produceFalDesignedPost).mockResolvedValue({
      imageUrl: 'https://cdn.example/fal-ad.jpg',
      falGrafikerScore: 8,
      falGrafikerPass: true,
      falDesignEngine: 'gpt_image_designed',
      costDelta: 0.04,
    });

    const saveArtifact = vi.fn().mockResolvedValue({ id: 'art-1' });
    const derived = await deriveAdCreativesFromDesignedPost(
      'tenant-1',
      baseSnapshot,
      'weekly_content',
      'Gel Gör Restaurant',
      baseCtx as unknown as import('@/app/api/auto-produce/ad-derive').AdDeriveRenderContext,
      { saveArtifact } as unknown as import('@/app/api/auto-produce/nexus-client').NexusClient,
    );

    expect(derived).toHaveLength(2);
    expect(produceFalDesignedPost).toHaveBeenCalledTimes(2);
    expect(derived[0]?.imageUrl).toBe('https://cdn.example/fal-ad.jpg');
    expect(saveArtifact).toHaveBeenCalledTimes(2);
    const metaMeta = saveArtifact.mock.calls[0]?.[1]?.metadata as Record<string, unknown>;
    expect(metaMeta.ad_render_engine).toBe('fal');
    expect(String(metaMeta.ad_headline)).not.toMatch(/gece/i);
  });
});
