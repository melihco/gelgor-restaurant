import { describe, expect, it } from 'vitest';
import { resolveTenantOperatingProfile } from '@/lib/tenant-operating-policy';

describe('tenant operating policy risk rules by sector', () => {
  it('restaurant_cafe requires approval for price/discount/date but allows location', () => {
    const profile = resolveTenantOperatingProfile({
      tenantId: 't1',
      industry: 'restaurant_cafe',
    });
    expect(profile.riskRules.price).toBe('approval_required');
    expect(profile.riskRules.discount).toBe('approval_required');
    expect(profile.riskRules.date).toBe('approval_required');
    expect(profile.riskRules.location).toBe('allow');
  });

  it('beach_club flags alcohol and event dates', () => {
    const profile = resolveTenantOperatingProfile({
      tenantId: 't2',
      industry: 'beach_club',
    });
    expect(profile.riskRules.alcohol).toBe('approval_required');
    expect(profile.riskRules.date).toBe('approval_required');
    expect(profile.riskRules.price).toBe('approval_required');
  });

  it('beauty_wellness requires approval for before_after and personal_data', () => {
    const profile = resolveTenantOperatingProfile({
      tenantId: 't3',
      industry: 'beauty_wellness',
    });
    expect(profile.riskRules.before_after).toBe('approval_required');
    expect(profile.riskRules.personal_data).toBe('approval_required');
  });

  it('wedding_event requires date and personal_data approval', () => {
    const profile = resolveTenantOperatingProfile({
      tenantId: 't4',
      industry: 'wedding_event',
    });
    expect(profile.riskRules.date).toBe('approval_required');
    expect(profile.riskRules.personal_data).toBe('approval_required');
    expect(profile.riskRules.location).toBe('allow');
  });

  it('local_products_shop flags origin_claim and health_claim', () => {
    const profile = resolveTenantOperatingProfile({
      tenantId: 't5',
      industry: 'local_products_shop',
    });
    expect(profile.riskRules.origin_claim).toBe('allow');
    expect(profile.riskRules.health_claim).toBe('approval_required');
    expect(profile.riskRules.price).toBe('approval_required');
  });

  it('profile RiskRules JSON overrides playbook defaults', () => {
    const profile = resolveTenantOperatingProfile({
      tenantId: 't6',
      industry: 'restaurant_cafe',
      riskRulesJson: JSON.stringify({ price: 'allow', discount: 'blocked' }),
    });
    expect(profile.riskRules.price).toBe('allow');
    expect(profile.riskRules.discount).toBe('blocked');
  });
});
