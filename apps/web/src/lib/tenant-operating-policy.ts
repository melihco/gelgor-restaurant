/**
 * Tenant operating policy — capability catalog, industry defaults, gallery rules,
 * and runtime policy evaluation.
 *
 * Aligns with TenantCreativeProfile / CompanyProfile (ContentNeeds, RiskRules).
 * When OperatingCapabilities is empty, enabled set is derived from ContentNeeds + playbook.
 */

import {
  CREATIVE_CONTENT_NEEDS,
  STARTER_INDUSTRY_PLAYBOOKS,
  type CreativeAssetIntent,
  type CreativeIntent,
  type CreativeRiskSignal,
  type IndustryPlaybook,
} from '@/lib/creative-production-contracts';

export type PolicyDecision = 'allow' | 'approval_required' | 'blocked';

export type TenantCapabilityKind = 'content_intent' | 'workflow';

/** Workflow capabilities (orchestration / UI flows, not content pillars). */
export type WorkflowCapabilityId =
  | 'workflow_post_service_client_share'
  | 'gallery_manage'
  | 'gallery_client_upload'
  | 'gallery_before_after';

export type TenantCapabilityId = CreativeIntent | WorkflowCapabilityId;

export interface TenantCapabilityDefinition {
  id: TenantCapabilityId;
  kind: TenantCapabilityKind;
  label: string;
  description: string;
  /** Empty = all industries */
  industries: string[];
  defaultEnabled: boolean;
  riskSignals: CreativeRiskSignal[];
  requiredAssetIntents: CreativeAssetIntent[];
  /** Workflow capabilities that must also be enabled */
  requires?: TenantCapabilityId[];
}

export interface TenantGalleryPolicy {
  allowedAssetIntents: CreativeAssetIntent[];
  clientPhotoPolicy: PolicyDecision;
  beforeAfterPolicy: PolicyDecision;
  maxGalleryPhotos: number;
  requireConsentMetadata: boolean;
}

export interface TenantOperatingProfileInput {
  tenantId: string;
  industry: string;
  contentNeedsJson?: string;
  operatingCapabilitiesJson?: string;
  galleryPolicyJson?: string;
  riskRulesJson?: string;
  customRules?: string;
}

export interface ResolvedTenantOperatingProfile {
  tenantId: string;
  industry: string;
  playbookId: string;
  enabledCapabilities: TenantCapabilityId[];
  galleryPolicy: TenantGalleryPolicy;
  riskRules: Partial<Record<CreativeRiskSignal, PolicyDecision>>;
  customRules: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  capabilityId: TenantCapabilityId;
  reasons: string[];
}

export interface GalleryAssetEvaluationResult {
  decision: PolicyDecision;
  assetType: string;
  reasons: string[];
  forceUnapproved?: boolean;
}

const WORKFLOW_CAPABILITIES: TenantCapabilityDefinition[] = [
  {
    id: 'workflow_post_service_client_share',
    kind: 'workflow',
    label: 'İşlem sonrası müşteri paylaşımı',
    description: 'Traş/kesim vb. sonrası müşteriye özel görsel ve paylaşım akışı.',
    industries: ['beauty_wellness', 'barber_salon', 'local_service_business'],
    defaultEnabled: false,
    riskSignals: ['personal_data', 'before_after'],
    requiredAssetIntents: ['expert_photo', 'before_after_image'],
    requires: ['post_service_client_result', 'gallery_client_upload'],
  },
  {
    id: 'gallery_manage',
    kind: 'workflow',
    label: 'Galeri yönetimi',
    description: 'Mekan ve marka görsellerinin galeri kütüphanesinde tutulması.',
    industries: [],
    defaultEnabled: true,
    riskSignals: [],
    requiredAssetIntents: ['venue_photo', 'hero_image', 'product_image', 'brand_background'],
  },
  {
    id: 'gallery_client_upload',
    kind: 'workflow',
    label: 'Müşteri / sonuç fotoğrafı',
    description: 'Müşteri veya hizmet sonucu görsellerinin galeriye eklenmesi.',
    industries: ['beauty_wellness', 'barber_salon', 'healthcare_clinic', 'local_service_business'],
    defaultEnabled: false,
    riskSignals: ['personal_data'],
    requiredAssetIntents: ['expert_photo', 'before_after_image'],
  },
  {
    id: 'gallery_before_after',
    kind: 'workflow',
    label: 'Önce / sonra görselleri',
    description: 'Before/after karşılaştırma görselleri.',
    industries: ['beauty_wellness', 'barber_salon', 'healthcare_clinic'],
    defaultEnabled: false,
    riskSignals: ['before_after', 'health_claim'],
    requiredAssetIntents: ['before_after_image'],
  },
];

const EXTRA_CONTENT_NEEDS: TenantCapabilityDefinition[] = [
  {
    id: 'post_service_client_result',
    kind: 'content_intent',
    label: 'Hizmet sonucu paylaşımı',
    description: 'İşlem sonrası müşteri sonucunu sosyal kanallarda paylaşma niyeti.',
    industries: ['beauty_wellness', 'barber_salon', 'local_service_business'],
    defaultEnabled: false,
    riskSignals: ['personal_data', 'before_after'],
    requiredAssetIntents: ['expert_photo', 'before_after_image'],
  },
];

export const BARBER_SALON_PLAYBOOK: IndustryPlaybook = {
  id: 'barber_salon',
  label: 'Berber / Kuaför',
  defaultContentNeeds: [
    'service_intro',
    'social_proof',
    'post_service_client_result',
    'lead_generation',
    'behind_the_scenes',
  ],
  riskySignals: ['personal_data', 'before_after', 'price'],
  approvalRequiredFor: ['personal_data', 'before_after'],
  preferredChannels: ['instagram_story', 'instagram_reel', 'instagram_post'],
};

export const TENANT_INDUSTRY_PLAYBOOKS: IndustryPlaybook[] = [
  ...STARTER_INDUSTRY_PLAYBOOKS,
  BARBER_SALON_PLAYBOOK,
];

const INDUSTRY_ALIASES: Record<string, string> = {
  restaurant: 'restaurant_cafe',
  coffee_shop: 'restaurant_cafe',
  cafe: 'restaurant_cafe',
  barber: 'barber_salon',
  barbershop: 'barber_salon',
  hairdresser: 'barber_salon',
  kuaför: 'barber_salon',
  kuafor: 'barber_salon',
  berber: 'barber_salon',
  salon: 'beauty_wellness',
  beauty: 'beauty_wellness',
  spa: 'beauty_wellness',
};

const CLIENT_ASSET_TYPES = new Set([
  'client_photo',
  'client_result',
  'service_result',
  'customer_photo',
  'expert_photo',
]);

const BEFORE_AFTER_ASSET_TYPES = new Set([
  'before_after',
  'before_after_image',
]);

export const TENANT_CAPABILITY_CATALOG: TenantCapabilityDefinition[] = [
  ...CREATIVE_CONTENT_NEEDS.map((need) => ({
    id: need.id as TenantCapabilityId,
    kind: 'content_intent' as const,
    label: need.label,
    description: need.description,
    industries: [] as string[],
    defaultEnabled: false,
    riskSignals: [] as CreativeRiskSignal[],
    requiredAssetIntents: need.requiredAssetIntents,
  })),
  ...EXTRA_CONTENT_NEEDS,
  ...WORKFLOW_CAPABILITIES,
];

const GALLERY_POLICY_BY_INDUSTRY: Record<string, TenantGalleryPolicy> = {
  restaurant_cafe: {
    allowedAssetIntents: ['venue_photo', 'hero_image', 'product_image', 'brand_background', 'logo', 'team_photo'],
    clientPhotoPolicy: 'blocked',
    beforeAfterPolicy: 'blocked',
    maxGalleryPhotos: 48,
    requireConsentMetadata: false,
  },
  beauty_wellness: {
    allowedAssetIntents: [
      'venue_photo',
      'hero_image',
      'expert_photo',
      'before_after_image',
      'brand_background',
      'logo',
      'team_photo',
    ],
    clientPhotoPolicy: 'approval_required',
    beforeAfterPolicy: 'approval_required',
    maxGalleryPhotos: 64,
    requireConsentMetadata: true,
  },
  barber_salon: {
    allowedAssetIntents: [
      'venue_photo',
      'hero_image',
      'expert_photo',
      'before_after_image',
      'brand_background',
      'logo',
      'team_photo',
    ],
    clientPhotoPolicy: 'approval_required',
    beforeAfterPolicy: 'approval_required',
    maxGalleryPhotos: 72,
    requireConsentMetadata: true,
  },
  healthcare_clinic: {
    allowedAssetIntents: ['venue_photo', 'hero_image', 'expert_photo', 'brand_background', 'logo'],
    clientPhotoPolicy: 'blocked',
    beforeAfterPolicy: 'approval_required',
    maxGalleryPhotos: 40,
    requireConsentMetadata: true,
  },
  local_service_business: {
    allowedAssetIntents: ['venue_photo', 'hero_image', 'expert_photo', 'product_image', 'brand_background', 'logo'],
    clientPhotoPolicy: 'approval_required',
    beforeAfterPolicy: 'approval_required',
    maxGalleryPhotos: 56,
    requireConsentMetadata: false,
  },
};

const DEFAULT_GALLERY_POLICY: TenantGalleryPolicy = {
  allowedAssetIntents: ['venue_photo', 'hero_image', 'product_image', 'brand_background', 'logo', 'team_photo'],
  clientPhotoPolicy: 'approval_required',
  beforeAfterPolicy: 'approval_required',
  maxGalleryPhotos: 48,
  requireConsentMetadata: false,
};

export function normalizeIndustryId(industry: string): string {
  const value = (industry || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_');
  const aliased = INDUSTRY_ALIASES[value] ?? value;
  const known = TENANT_INDUSTRY_PLAYBOOKS.some((p) => p.id === aliased);
  return known ? aliased : 'local_service_business';
}

export function getIndustryPlaybook(industry: string): IndustryPlaybook {
  const id = normalizeIndustryId(industry);
  return TENANT_INDUSTRY_PLAYBOOKS.find((p) => p.id === id) ?? TENANT_INDUSTRY_PLAYBOOKS.find((p) => p.id === 'local_service_business')!;
}

export function getCapabilityDefinition(id: string): TenantCapabilityDefinition | undefined {
  return TENANT_CAPABILITY_CATALOG.find((c) => c.id === id);
}

export function listCapabilitiesForIndustry(industry: string): TenantCapabilityDefinition[] {
  const playbookId = normalizeIndustryId(industry);
  return TENANT_CAPABILITY_CATALOG.filter(
    (cap) => cap.industries.length === 0 || cap.industries.includes(playbookId),
  );
}

function parseJsonArray(raw?: string): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  } catch {
    return [];
  }
}

function parseRiskRules(raw?: string): Partial<Record<CreativeRiskSignal, PolicyDecision>> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Partial<Record<CreativeRiskSignal, PolicyDecision>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === 'allow' || value === 'approval_required' || value === 'blocked') {
        out[key as CreativeRiskSignal] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function parseGalleryPolicy(raw?: string, industry?: string): TenantGalleryPolicy {
  const base = GALLERY_POLICY_BY_INDUSTRY[normalizeIndustryId(industry ?? '')] ?? DEFAULT_GALLERY_POLICY;
  if (!raw?.trim()) return { ...base };
  try {
    const parsed = JSON.parse(raw) as Partial<TenantGalleryPolicy>;
    return {
      allowedAssetIntents: Array.isArray(parsed.allowedAssetIntents)
        ? (parsed.allowedAssetIntents as CreativeAssetIntent[])
        : base.allowedAssetIntents,
      clientPhotoPolicy: parsed.clientPhotoPolicy ?? base.clientPhotoPolicy,
      beforeAfterPolicy: parsed.beforeAfterPolicy ?? base.beforeAfterPolicy,
      maxGalleryPhotos:
        typeof parsed.maxGalleryPhotos === 'number' && parsed.maxGalleryPhotos > 0
          ? parsed.maxGalleryPhotos
          : base.maxGalleryPhotos,
      requireConsentMetadata: parsed.requireConsentMetadata ?? base.requireConsentMetadata,
    };
  } catch {
    return { ...base };
  }
}

function mergeRiskRules(
  industry: string,
  profileRules: Partial<Record<CreativeRiskSignal, PolicyDecision>>,
): Partial<Record<CreativeRiskSignal, PolicyDecision>> {
  const playbook = getIndustryPlaybook(industry);
  const merged: Partial<Record<CreativeRiskSignal, PolicyDecision>> = {};
  for (const signal of playbook.riskySignals) {
    merged[signal] = 'allow';
  }
  for (const signal of playbook.approvalRequiredFor) {
    merged[signal] = 'approval_required';
  }
  return { ...merged, ...profileRules };
}

export function resolveTenantOperatingProfile(
  input: TenantOperatingProfileInput,
): ResolvedTenantOperatingProfile {
  const industry = normalizeIndustryId(input.industry);
  const playbook = getIndustryPlaybook(industry);
  const explicit = parseJsonArray(input.operatingCapabilitiesJson);
  const fromContentNeeds = parseJsonArray(input.contentNeedsJson);
  const eligible = new Set(listCapabilitiesForIndustry(industry).map((c) => c.id));

  let enabled: TenantCapabilityId[];
  if (explicit.length > 0) {
    enabled = explicit.filter((id): id is TenantCapabilityId => eligible.has(id as TenantCapabilityId));
  } else if (fromContentNeeds.length > 0) {
    enabled = fromContentNeeds.filter((id): id is TenantCapabilityId => eligible.has(id as TenantCapabilityId));
  } else {
    enabled = playbook.defaultContentNeeds.filter((id) => eligible.has(id));
    if (industry === 'barber_salon' || industry === 'beauty_wellness') {
      for (const extra of ['gallery_manage', 'gallery_client_upload'] as WorkflowCapabilityId[]) {
        if (eligible.has(extra) && !enabled.includes(extra)) enabled.push(extra);
      }
    } else if (eligible.has('gallery_manage' as TenantCapabilityId)) {
      enabled.push('gallery_manage');
    }
  }

  return {
    tenantId: input.tenantId,
    industry,
    playbookId: playbook.id,
    enabledCapabilities: [...new Set(enabled)],
    galleryPolicy: parseGalleryPolicy(input.galleryPolicyJson, industry),
    riskRules: mergeRiskRules(industry, parseRiskRules(input.riskRulesJson)),
    customRules: input.customRules?.trim() ?? '',
  };
}

function isCapabilityEnabled(profile: ResolvedTenantOperatingProfile, id: TenantCapabilityId): boolean {
  return profile.enabledCapabilities.includes(id);
}

function checkRequirements(
  profile: ResolvedTenantOperatingProfile,
  cap: TenantCapabilityDefinition,
  reasons: string[],
): boolean {
  for (const req of cap.requires ?? []) {
    if (!isCapabilityEnabled(profile, req)) {
      reasons.push(`requires:${req}`);
      return false;
    }
  }
  return true;
}

export function evaluateCapabilityPolicy(
  profile: ResolvedTenantOperatingProfile,
  capabilityId: TenantCapabilityId,
  context?: { riskSignals?: CreativeRiskSignal[] },
): PolicyEvaluationResult {
  const reasons: string[] = [];
  const cap = getCapabilityDefinition(capabilityId);
  if (!cap) {
    return { decision: 'blocked', capabilityId, reasons: ['unknown_capability'] };
  }
  if (cap.industries.length > 0 && !cap.industries.includes(profile.playbookId)) {
    return { decision: 'blocked', capabilityId, reasons: ['industry_not_eligible'] };
  }
  if (!isCapabilityEnabled(profile, capabilityId)) {
    return { decision: 'blocked', capabilityId, reasons: ['capability_disabled'] };
  }
  if (!checkRequirements(profile, cap, reasons)) {
    return { decision: 'blocked', capabilityId, reasons };
  }

  let decision: PolicyDecision = 'allow';
  const signals = [...cap.riskSignals, ...(context?.riskSignals ?? [])];
  for (const signal of signals) {
    const rule = profile.riskRules[signal];
    if (rule === 'blocked') {
      return { decision: 'blocked', capabilityId, reasons: [`risk_blocked:${signal}`] };
    }
    if (rule === 'approval_required') {
      decision = 'approval_required';
      reasons.push(`risk_approval:${signal}`);
    }
  }

  return { decision, capabilityId, reasons };
}

export function evaluateGalleryAssetPolicy(
  profile: ResolvedTenantOperatingProfile,
  assetType: string,
): GalleryAssetEvaluationResult {
  const reasons: string[] = [];
  const normalized = assetType.trim().toLowerCase();

  if (!isCapabilityEnabled(profile, 'gallery_manage')) {
    return { decision: 'blocked', assetType: normalized, reasons: ['gallery_manage_disabled'] };
  }

  const policy = profile.galleryPolicy;

  if (CLIENT_ASSET_TYPES.has(normalized)) {
    if (!isCapabilityEnabled(profile, 'gallery_client_upload')) {
      return { decision: 'blocked', assetType: normalized, reasons: ['gallery_client_upload_disabled'] };
    }
    const decision = policy.clientPhotoPolicy;
    if (decision === 'blocked') {
      return { decision: 'blocked', assetType: normalized, reasons: ['client_photos_blocked'] };
    }
    return {
      decision,
      assetType: normalized,
      reasons: decision === 'approval_required' ? ['client_photos_need_approval'] : [],
      forceUnapproved: decision === 'approval_required',
    };
  }

  if (BEFORE_AFTER_ASSET_TYPES.has(normalized)) {
    if (!isCapabilityEnabled(profile, 'gallery_before_after')) {
      return { decision: 'blocked', assetType: normalized, reasons: ['gallery_before_after_disabled'] };
    }
    const decision = policy.beforeAfterPolicy;
    if (decision === 'blocked') {
      return { decision: 'blocked', assetType: normalized, reasons: ['before_after_blocked'] };
    }
    return {
      decision,
      assetType: normalized,
      reasons: decision === 'approval_required' ? ['before_after_need_approval'] : [],
      forceUnapproved: decision === 'approval_required',
    };
  }

  const intentMatch = policy.allowedAssetIntents.some(
    (intent) => normalized === intent || normalized.includes(intent.replace(/_/g, '')),
  );
  if (!intentMatch && !['logo', 'venue_reference', 'hero_image', 'product_image', 'venue_photo'].includes(normalized)) {
    reasons.push('asset_type_not_in_allowed_intents');
    return { decision: 'approval_required', assetType: normalized, reasons, forceUnapproved: true };
  }

  return { decision: 'allow', assetType: normalized, reasons };
}

export function buildOperatingPolicyPromptBlock(profile: ResolvedTenantOperatingProfile): string {
  const caps = profile.enabledCapabilities.join(', ') || 'none';
  const gallery = profile.galleryPolicy;
  return (
    `## Tenant Operating Policy\n` +
    `- Industry playbook: ${profile.playbookId}\n` +
    `- Enabled capabilities: ${caps}\n` +
    `- Gallery: client photos ${gallery.clientPhotoPolicy}, before/after ${gallery.beforeAfterPolicy}, max ${gallery.maxGalleryPhotos} photos\n` +
    (profile.customRules ? `- Custom rules: ${profile.customRules.slice(0, 500)}\n` : '')
  );
}
