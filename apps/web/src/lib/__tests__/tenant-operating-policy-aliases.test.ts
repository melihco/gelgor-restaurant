import { describe, expect, it } from 'vitest';
import { normalizeSectorId } from '@/lib/sector-production-profile';
import {
  getIndustryPlaybook,
  normalizeIndustryId,
} from '@/lib/tenant-operating-policy';

describe('food/drink industry alias parity', () => {
  it.each([
    ['cafe', 'coffee_shop'],
    ['coffee_shop', 'coffee_shop'],
    ['kahve', 'coffee_shop'],
    ['espresso_bar', 'coffee_shop'],
    ['roastery', 'coffee_shop'],
    ['restaurant', 'restaurant_cafe'],
    ['bistro', 'restaurant_cafe'],
    ['restaurant_bar', 'restaurant_cafe'],
    ['brunch', 'restaurant_cafe'],
  ] as const)('normalizeSectorId(%s) → %s', (input, expected) => {
    expect(normalizeSectorId(input)).toBe(expected);
  });

  it('tenant operating policy resolves cafe to coffee_shop playbook', () => {
    expect(normalizeIndustryId('cafe')).toBe('coffee_shop');
    expect(getIndustryPlaybook('cafe').id).toBe('coffee_shop');
    expect(getIndustryPlaybook('cafe').defaultContentNeeds).toContain('product_highlight');
    expect(getIndustryPlaybook('cafe').defaultContentNeeds).not.toContain('menu_share');
  });

  it('tenant operating policy keeps restaurant on restaurant_cafe playbook', () => {
    expect(normalizeIndustryId('restaurant')).toBe('restaurant_cafe');
    expect(getIndustryPlaybook('restaurant').id).toBe('restaurant_cafe');
    expect(getIndustryPlaybook('restaurant').defaultContentNeeds).toContain('menu_share');
  });
});
