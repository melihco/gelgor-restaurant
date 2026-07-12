import { describe, expect, it } from 'vitest';
import {
  deriveContentNeedsFromSectorPack,
  resolveDefaultContentNeeds,
} from '@/lib/slot-content-needs-bridge';

describe('slot-content-needs-bridge', () => {
  it('beach_club sector pack yields event and daily intents', () => {
    const needs = deriveContentNeedsFromSectorPack('beach_club');
    expect(needs).toContain('event_announcement');
    expect(needs).toContain('daily_story');
    expect(needs).toContain('campaign_offer');
  });

  it('pool-disabled facilities exclude pool slot intents from pack weight', () => {
    const full = deriveContentNeedsFromSectorPack('beach_club', { pool: true });
    const noPool = deriveContentNeedsFromSectorPack('beach_club', { pool: false });
    expect(full.length).toBeGreaterThan(0);
    expect(noPool.length).toBeGreaterThan(0);
  });

  it('restaurant_cafe includes menu_share from slot design types', () => {
    const needs = deriveContentNeedsFromSectorPack('restaurant_cafe');
    expect(needs).toContain('menu_share');
  });

  it('resolveDefaultContentNeeds falls back to playbook when sector unknown', () => {
    const needs = resolveDefaultContentNeeds({
      sector: 'unknown_sector_xyz',
      playbookFallback: ['service_intro', 'lead_generation'],
    });
    expect(needs).toEqual(['service_intro', 'lead_generation']);
  });
});
