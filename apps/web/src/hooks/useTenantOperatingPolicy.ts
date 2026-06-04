'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { CompanyProfile } from '@/types';
import {
  evaluateCapabilityPolicy,
  evaluateGalleryAssetPolicy,
  resolveTenantOperatingProfile,
  type PolicyDecision,
  type ResolvedTenantOperatingProfile,
  type TenantCapabilityId,
} from '@/lib/tenant-operating-policy';

export function useTenantOperatingProfile(profile?: CompanyProfile | null) {
  const serverQuery = useQuery({
    queryKey: ['operating-profile', profile?.id],
    queryFn: () => apiClient.getOperatingProfile(),
    enabled: !!profile?.id,
    staleTime: 60_000,
  });

  const local = profile
    ? resolveTenantOperatingProfile({
        tenantId: profile.id,
        industry: profile.industry,
        contentNeedsJson: profile.contentNeeds,
        operatingCapabilitiesJson: profile.operatingCapabilities,
        galleryPolicyJson: profile.galleryPolicy,
        riskRulesJson: profile.riskRules,
        customRules: profile.customRules,
      })
    : null;

  return {
    profile: serverQuery.data ?? local,
    isLoading: serverQuery.isLoading,
    error: serverQuery.error,
    refetch: serverQuery.refetch,
  };
}

export function useCapabilityGate(
  resolved: ResolvedTenantOperatingProfile | null | undefined,
  capabilityId: TenantCapabilityId,
): { allowed: boolean; decision: PolicyDecision; reasons: string[] } {
  if (!resolved) {
    return { allowed: false, decision: 'blocked', reasons: ['profile_not_loaded'] };
  }
  const result = evaluateCapabilityPolicy(resolved, capabilityId);
  return {
    allowed: result.decision !== 'blocked',
    decision: result.decision,
    reasons: result.reasons,
  };
}

export function useGalleryAssetGate(
  resolved: ResolvedTenantOperatingProfile | null | undefined,
  assetType: string,
): { allowed: boolean; decision: PolicyDecision; forceUnapproved: boolean; reasons: string[] } {
  if (!resolved) {
    return { allowed: false, decision: 'blocked', forceUnapproved: false, reasons: ['profile_not_loaded'] };
  }
  const result = evaluateGalleryAssetPolicy(resolved, assetType);
  return {
    allowed: result.decision !== 'blocked',
    decision: result.decision,
    forceUnapproved: result.forceUnapproved ?? false,
    reasons: result.reasons,
  };
}
