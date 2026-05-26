import {
  getCanvaFieldDefinition,
  normalizeCanvaFieldName,
  type CanvaStandardFieldName,
} from '@/lib/canva-field-dictionary';

export type CanvaContentKind =
  | 'instagram_post'
  | 'instagram_story'
  | 'instagram_reel'
  | 'instagram_plan'
  | 'ad_campaign'
  | 'ad_creative'
  | 'budget_optimization'
  | 'review_reply'
  | 'review_analysis'
  | 'analytics_report'
  | 'strategy'
  | 'generic';

export type CanvaAspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | 'freeform';

export type CanvaTemplateObjective =
  | 'announcement'
  | 'event_promo'
  | 'menu_launch'
  | 'review_reply'
  | 'campaign_analysis'
  | 'offer'
  | 'storytelling'
  | 'generic';

export type CanvaTemplateTone =
  | 'luxury'
  | 'energetic'
  | 'minimal'
  | 'corporate'
  | 'storytelling'
  | 'generic';

export type CanvaTemplateRiskTier = 'low' | 'medium' | 'high' | 'blocked';
export type CanvaTemplateGovernanceStatus = 'draft' | 'approved' | 'disabled' | 'needs_review';

export interface CanvaTemplateDatasetField {
  type: 'text' | 'image' | 'chart' | string;
  required?: boolean;
  maxLength?: number;
  characterLimit?: number;
  defaultText?: string;
  sampleText?: string;
  placeholder?: string;
  text?: string;
  value?: string;
  default?: string;
  purpose?: string;
}

export interface CanvaTemplateMetadata {
  id: string;
  title: string;
  tenantId?: string;
  contentKinds?: CanvaContentKind[];
  aspectRatio?: CanvaAspectRatio;
  objectives?: CanvaTemplateObjective[];
  tones?: CanvaTemplateTone[];
  industries?: string[];
  useCases?: string[];
  templateFamilyId?: string;
  allowedIntents?: string[];
  allowedChannels?: string[];
  requiredAssetIntents?: string[];
  riskTier?: CanvaTemplateRiskTier;
  status?: CanvaTemplateGovernanceStatus;
  manualApprovalRequired?: boolean;
  locale?: string;
  brandFit?: number;
  dataset?: Record<string, CanvaTemplateDatasetField>;
  enabled?: boolean;
  priority?: number;
  tags?: string[];
  notes?: string;
  previewUrl?: string;
  previewUpdatedAt?: string;
  previewStale?: boolean;
  previewRendererProvider?: string;
  previewDesignId?: string;
  previewJobId?: string;
  previewHash?: string;
  previewFormat?: 'png' | 'mp4';
  previewMimeType?: string;
  registryUpdatedAt?: string;
}

export interface CanvaTemplateDecisionInput {
  kind: CanvaContentKind;
  title: string;
  /** Kısa hook — şablon başlığı sentezi için; yoksa `title` kullanılır (zaman damgası strip edilir). */
  headline?: string;
  summary?: string;
  caption?: string;
  cta?: string;
  templateUseCase?: string;
  assetIntent?: string;
  hashtags?: string[];
  usageContext?: string;
  businessImpact?: string;
  imageAssetId?: string;
  heroImageAssetId?: string;
  productImageAssetId?: string;
  backgroundImageAssetId?: string;
  logoAssetId?: string;
  avatarAssetId?: string;
  qrCodeAssetId?: string;
  brandName?: string;
  offer?: string;
  price?: string;
  date?: string;
  location?: string;
  contact?: string;
  website?: string;
  industry?: string;
  locale?: string;
  preferredAspectRatio?: CanvaAspectRatio;
  riskSignals?: string[];
  /**
   * Gram / orchestration çıktısı — şablona basılacak kısa metinler (Instagram caption'dan ayrı).
   * Anahtarlar Canva dataset adı veya sözlükteki standart ad (headline, body, …) olabilir.
   */
  canvaFieldCopy?: Partial<Record<string, string>>;
}

export type CanvaTemplateEligibility = 'eligible' | 'needs_setup' | 'blocked';

export interface CanvaTemplateDecision {
  template: CanvaTemplateMetadata;
  score: number;
  reasons: string[];
  autofillData: Record<string, CanvaAutofillField>;
  missingFields: string[];
  validationWarnings?: string[];
  eligibility: CanvaTemplateEligibility;
  riskTier: CanvaTemplateRiskTier;
  approvalRequired: boolean;
  blockedReasons: string[];
  policyWarnings: string[];
  requiredAssetIntents: string[];
  missingAssetIntents: string[];
  riskSignals: string[];
}

export type CanvaAutofillField =
  | { type: 'text'; text: string }
  | { type: 'image'; asset_id: string };

export function inferAspectRatio(kind: CanvaContentKind): CanvaAspectRatio {
  if (kind === 'instagram_story' || kind === 'instagram_reel') return '9:16';
  if (kind === 'ad_campaign' || kind === 'analytics_report' || kind === 'strategy') return '16:9';
  return '1:1';
}

export function inferObjective(input: CanvaTemplateDecisionInput): CanvaTemplateObjective {
  const blob = `${input.title} ${input.summary ?? ''} ${input.caption ?? ''} ${input.usageContext ?? ''}`.toLowerCase();
  if (input.templateUseCase === 'event_announcement') return 'event_promo';
  if (input.templateUseCase === 'product_showcase' || input.templateUseCase === 'product_highlight' || input.templateUseCase === 'menu_share') return 'menu_launch';
  if (input.templateUseCase === 'offer_campaign' || input.templateUseCase === 'campaign_offer') return 'offer';
  if (input.templateUseCase === 'social_proof') return 'review_reply';
  if (input.kind === 'review_reply' || blob.includes('review') || blob.includes('yorum')) return 'review_reply';
  if (input.kind === 'ad_campaign' || input.kind === 'budget_optimization') return 'campaign_analysis';
  if (/menu|menü|food|dinner|restaurant/.test(blob)) return 'menu_launch';
  if (/event|show|concert|dinner show|etkinlik/.test(blob)) return 'event_promo';
  if (/offer|discount|kampanya|indirim/.test(blob)) return 'offer';
  if (input.kind === 'instagram_reel' || input.kind === 'instagram_story') return 'storytelling';
  return 'announcement';
}

export function inferTone(input: CanvaTemplateDecisionInput): CanvaTemplateTone {
  const blob = `${input.title} ${input.summary ?? ''} ${input.caption ?? ''} ${input.businessImpact ?? ''}`.toLowerCase();
  if (/premium|luxury|luxe|şık|elegant|zarif/.test(blob)) return 'luxury';
  if (/urgent|limited|now|energetic|dynamic|canlı/.test(blob)) return 'energetic';
  if (/report|analysis|analytics|strategy|executive/.test(blob)) return 'corporate';
  if (/story|behind|journey|hikaye/.test(blob)) return 'storytelling';
  return 'minimal';
}

export function selectCanvaTemplate(
  input: CanvaTemplateDecisionInput,
  templates: CanvaTemplateMetadata[],
): CanvaTemplateDecision | null {
  if (templates.length === 0) return null;

  const desiredAspect = input.preferredAspectRatio ?? inferAspectRatio(input.kind);
  const desiredObjective = inferObjective(input);
  const desiredTone = inferTone(input);

  const ranked = templates.map((template) => {
    const reasons: string[] = [];
    const blockedReasons: string[] = [];
    const policyWarnings: string[] = [];
    let score = 0;
    let eligibility: CanvaTemplateEligibility = 'eligible';

    if (template.contentKinds?.includes(input.kind)) {
      score += 40;
      reasons.push(`content kind matched: ${input.kind}`);
    } else if (!template.contentKinds?.length) {
      score += 12;
      reasons.push('template has no content kind restriction');
    } else if (
      (input.kind === 'instagram_reel' || input.kind === 'instagram_story' || input.kind === 'instagram_post') &&
      template.contentKinds.some((kind) => kind === 'instagram_reel' || kind === 'instagram_story' || kind === 'instagram_post')
    ) {
      score -= 35;
      eligibility = 'blocked';
      blockedReasons.push(`content kind mismatch: wanted ${input.kind}`);
      reasons.push(`content kind mismatch: wanted ${input.kind}`);
    }

    if (template.enabled === false) {
      eligibility = 'blocked';
      blockedReasons.push('template disabled');
    }

    if (template.status === 'disabled') {
      eligibility = 'blocked';
      blockedReasons.push('template governance status is disabled');
    }

    if (template.riskTier === 'blocked') {
      eligibility = 'blocked';
      blockedReasons.push('template risk tier is blocked');
    }

    if (template.status === 'approved') {
      score += 12;
      reasons.push('template approved for tenant');
    } else if (template.status === 'needs_review') {
      score -= 10;
      if (eligibility !== 'blocked') eligibility = 'needs_setup';
      policyWarnings.push('template needs review');
      reasons.push('template needs review before scale use');
    } else if (template.status === 'draft') {
      score -= 18;
      if (eligibility !== 'blocked') eligibility = 'needs_setup';
      policyWarnings.push('template is draft');
      reasons.push('template is still draft');
    }

    if (template.allowedChannels?.length) {
      if (template.allowedChannels.includes(input.kind)) {
        score += 12;
        reasons.push(`allowed channel matched: ${input.kind}`);
      } else {
        score -= 24;
        eligibility = 'blocked';
        blockedReasons.push(`allowed channel mismatch: ${input.kind}`);
        reasons.push(`allowed channel mismatch: ${input.kind}`);
      }
    }

    if (template.aspectRatio === desiredAspect) {
      score += 25;
      reasons.push(`aspect ratio matched: ${desiredAspect}`);
    } else if (!template.aspectRatio || template.aspectRatio === 'freeform') {
      score += 8;
      reasons.push('template accepts flexible aspect ratio');
    } else {
      score -= 18;
      reasons.push(`aspect ratio mismatch: wanted ${desiredAspect}, template is ${template.aspectRatio}`);
    }

    if (template.objectives?.includes(desiredObjective)) {
      score += 15;
      reasons.push(`objective matched: ${desiredObjective}`);
    }

    if (input.templateUseCase && template.useCases?.some((useCase) => sameToken(useCase, input.templateUseCase!))) {
      score += 18;
      reasons.push(`use case matched: ${input.templateUseCase}`);
    }

    if (input.templateUseCase && template.allowedIntents?.some((intent) => sameToken(intent, input.templateUseCase!))) {
      score += 16;
      reasons.push(`allowed intent matched: ${input.templateUseCase}`);
    } else if (input.templateUseCase && template.allowedIntents?.length) {
      score -= 24;
      eligibility = 'blocked';
      blockedReasons.push(`allowed intent mismatch: ${input.templateUseCase}`);
      reasons.push(`allowed intent mismatch: ${input.templateUseCase}`);
    }

    if (template.tones?.includes(desiredTone)) {
      score += 10;
      reasons.push(`tone matched: ${desiredTone}`);
    }

    const inputIndustry = input.industry;
    if (inputIndustry && template.industries?.some((industry) => sameToken(industry, inputIndustry))) {
      score += 12;
      reasons.push(`industry matched: ${inputIndustry}`);
    }

    const matchedTags = matchingTemplateTags(input, template.tags ?? []);
    if (matchedTags.length > 0) {
      score += Math.min(18, matchedTags.length * 6);
      reasons.push(`tags matched: ${matchedTags.join(', ')}`);
    }

    const { autofillData, missingFields, filledCount, validationWarnings } = buildCanvaAutofillData(input, template.dataset ?? {});
    score += Math.min(20, filledCount * 5);
    score += template.brandFit ?? 0;
    score += template.priority ?? 0;

    if (missingFields.length > 0) {
      score -= Math.min(40, missingFields.length * 10);
      eligibility = 'blocked';
      blockedReasons.push(`missing required autofill fields: ${missingFields.join(', ')}`);
      reasons.push(`missing autofill fields: ${missingFields.join(', ')}`);
    }

    const requiredAssetIntents = template.requiredAssetIntents ?? [];
    const missingAssetIntents = requiredAssetIntents.filter((intent) => !hasAssetForIntent(input, intent));
    if (missingAssetIntents.length > 0) {
      score -= Math.min(40, missingAssetIntents.length * 12);
      eligibility = 'blocked';
      blockedReasons.push(`missing required assets: ${missingAssetIntents.join(', ')}`);
      reasons.push(`missing required assets: ${missingAssetIntents.join(', ')}`);
    }

    if (validationWarnings.length > 0) {
      score -= Math.min(10, validationWarnings.length * 2);
      policyWarnings.push(...validationWarnings);
      reasons.push(`field warnings: ${validationWarnings.length}`);
    }

    const riskTier = resolveDecisionRiskTier(template, input);
    const riskSignals = inferRiskSignals(input);
    const approvalRequired = Boolean(
      template.manualApprovalRequired ||
      riskTier === 'medium' ||
      riskTier === 'high' ||
      riskSignals.some((signal) => ['price', 'discount', 'date', 'health_claim', 'financial_claim', 'legal_claim', 'before_after'].includes(signal))
    );

    if (template.riskTier === 'high') {
      score -= 8;
      policyWarnings.push('high risk template');
      reasons.push('high risk template requires stronger review');
    } else if (template.riskTier === 'medium') {
      score -= 3;
      policyWarnings.push('medium risk template');
      reasons.push('medium risk template');
    }

    if (template.manualApprovalRequired) {
      reasons.push('manual approval required by template policy');
    }

    return {
      template,
      score,
      reasons,
      autofillData,
      missingFields,
      validationWarnings,
      eligibility,
      riskTier,
      approvalRequired,
      blockedReasons,
      policyWarnings,
      requiredAssetIntents,
      missingAssetIntents,
      riskSignals,
    };
  });

  ranked.sort((a, b) => {
    const eligibilityDelta = eligibilityRank(b.eligibility) - eligibilityRank(a.eligibility);
    return eligibilityDelta || b.score - a.score;
  });
  return ranked.find((decision) => decision.eligibility !== 'blocked') ?? null;
}

export function createManualCanvaTemplateDecision(
  input: CanvaTemplateDecisionInput,
  template: CanvaTemplateMetadata,
): CanvaTemplateDecision {
  const { autofillData, missingFields, filledCount, validationWarnings } = buildCanvaAutofillData(input, template.dataset ?? {});
  const requiredAssetIntents = template.requiredAssetIntents ?? [];
  const missingAssetIntents = requiredAssetIntents.filter((intent) => !hasAssetForIntent(input, intent));
  const blockedReasons = [
    ...missingFields.map((field) => `missing required autofill field: ${field}`),
    ...missingAssetIntents.map((intent) => `missing required asset: ${intent}`),
    ...(template.enabled === false ? ['template disabled'] : []),
    ...(template.status === 'disabled' ? ['template governance status is disabled'] : []),
    ...(template.riskTier === 'blocked' ? ['template risk tier is blocked'] : []),
  ];
  const riskTier = resolveDecisionRiskTier(template, input);
  const riskSignals = inferRiskSignals(input);
  return {
    template,
    score: 100 + Math.min(20, filledCount * 5),
    reasons: ['manually selected in Content Studio'],
    autofillData,
    missingFields,
    validationWarnings,
    eligibility: blockedReasons.length > 0 ? 'blocked' : template.status === 'draft' || template.status === 'needs_review' ? 'needs_setup' : 'eligible',
    riskTier,
    approvalRequired: true,
    blockedReasons,
    policyWarnings: validationWarnings,
    requiredAssetIntents,
    missingAssetIntents,
    riskSignals,
  };
}

export function buildCanvaAutofillData(
  input: CanvaTemplateDecisionInput,
  dataset: Record<string, CanvaTemplateDatasetField>,
): { autofillData: Record<string, CanvaAutofillField>; missingFields: string[]; filledCount: number; validationWarnings: string[] } {
  const autofillData: Record<string, CanvaAutofillField> = {};
  const missingFields: string[] = [];
  const validationWarnings: string[] = [];

  const synthesized = synthesizeCanvaLayerCopyForDataset(input, dataset);
  const overrideByStandard = normalizeCanvaFieldCopyKeys(input.canvaFieldCopy);
  const mergedLayerByStandard: Record<string, string> = { ...synthesized, ...overrideByStandard };

  for (const [fieldName, field] of Object.entries(dataset)) {
    if (field.type === 'image') {
      const assetId = imageAssetForField(input, fieldName);
      if (assetId) {
        autofillData[fieldName] = { type: 'image', asset_id: assetId };
      } else {
        const definition = getCanvaFieldDefinition(fieldName);
        if (field.required ?? definition?.required) missingFields.push(fieldName);
      }
      continue;
    }

    if (field.type !== 'text') continue;

    const value = valueForTextField(input, fieldName, field.required, mergedLayerByStandard);
    if (value) {
      const definition = getCanvaFieldDefinition(fieldName);
      const maxLength = resolveTextMaxLength(input, fieldName, field, definition?.maxLength ?? 1800);
      const text = trimTextToMaxLength(normalizePlainTextForCanva(value, input.kind), maxLength);
      if (text.length < value.length) validationWarnings.push(`${fieldName} trimmed to ${maxLength} chars`);
      autofillData[fieldName] = { type: 'text', text };
    } else {
      const definition = getCanvaFieldDefinition(fieldName);
      if (field.required ?? definition?.required) missingFields.push(fieldName);
    }
  }

  return {
    autofillData,
    missingFields,
    validationWarnings,
    filledCount: Object.keys(autofillData).length,
  };
}

function matchingTemplateTags(input: CanvaTemplateDecisionInput, tags: string[]): string[] {
  if (tags.length === 0) return [];
  const blob = [
    input.kind,
    input.title,
    input.summary,
    input.caption,
    input.cta,
    input.templateUseCase,
    input.assetIntent,
    input.usageContext,
    input.businessImpact,
    ...(input.hashtags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 1 && blob.includes(tag));
}

function valueForTextField(
  input: CanvaTemplateDecisionInput,
  fieldName: string,
  fieldRequired: boolean | undefined,
  mergedLayerByStandard: Record<string, string>,
): string {
  const standardName = normalizeCanvaFieldName(fieldName);

  if (standardName) {
    const fromLayer = mergedLayerByStandard[standardName];
    if (fromLayer && fromLayer.trim()) return fromLayer;
  }

  const normalized = fieldName.toLowerCase();
  if (normalized.includes('brand')) return shortenForUnknownTextField(input.brandName || 'SmartAgency', 42);
  if (normalized.includes('date')) return new Date().toLocaleDateString('tr-TR');
  // Preserve template typography: do not fill optional unknown text boxes with long copy.
  // Canva keeps font/style when replacing text, but unexpected optional text fields can
  // resize or reflow a Reel template. Required unknown fields get a short safe fallback.
  return fieldRequired ? shortenForUnknownTextField(input.headline ?? stripPublishSlotFromTitle(input.title), 48) : '';
}

function normalizeCanvaFieldCopyKeys(copy?: Partial<Record<string, string>>): Partial<Record<CanvaStandardFieldName, string>> {
  if (!copy) return {};
  const out: Partial<Record<CanvaStandardFieldName, string>> = {};
  for (const [rawKey, rawVal] of Object.entries(copy)) {
    if (typeof rawVal !== 'string' || !rawVal.trim()) continue;
    const std = normalizeCanvaFieldName(rawKey);
    if (std) out[std] = rawVal.trim();
  }
  return out;
}

/** Şablondaki her standart metin alanı için — feed caption kullanılmaz; hedef uzunluk ≈ alan limiti − 1 */
function synthesizeCanvaLayerCopyForDataset(
  input: CanvaTemplateDecisionInput,
  dataset: Record<string, CanvaTemplateDatasetField>,
): Partial<Record<CanvaStandardFieldName, string>> {
  const byStandard: Partial<Record<CanvaStandardFieldName, string>> = {};
  for (const [fieldName, field] of Object.entries(dataset)) {
    if (field.type !== 'text') continue;
    const standardName = normalizeCanvaFieldName(fieldName);
    if (!standardName) continue;
    const def = getCanvaFieldDefinition(fieldName);
    let maxLen = resolveTextMaxLength(input, fieldName, field, def?.maxLength ?? 200);
    if (standardName === 'caption') maxLen = Math.min(maxLen, 280);
    const text = synthesizeStandardDesignText(standardName, input, maxLen);
    if (text) byStandard[standardName] = text;
  }
  return byStandard;
}

function synthesizeStandardDesignText(
  standardName: CanvaStandardFieldName,
  input: CanvaTemplateDecisionInput,
  fieldMaxLength: number,
): string {
  const target = Math.max(1, fieldMaxLength - 1);
  const hook = (input.headline?.trim() || stripPublishSlotFromTitle(input.title.trim())) || 'İçerik';
  const support = (input.summary ?? '').replace(/\s+/g, ' ').trim();

  switch (standardName) {
    case 'headline':
      return shortenOnWordBoundary(hook, target);
    case 'subtitle': {
      const source = support || hook;
      return shortenOnWordBoundary(takeFirstSemanticChunk(source, target + 12), target);
    }
    case 'body': {
      let blob = support;
      if (blob.length < 16) {
        blob = [support, input.businessImpact, input.usageContext].filter(Boolean).join(' — ');
      }
      return shortenOnWordBoundary(takeFirstSemanticChunk(blob, target + 24), target);
    }
    case 'caption': {
      const head = shortenOnWordBoundary(hook, Math.min(40, Math.floor(target * 0.45)));
      const tailSource = support || input.cta || '';
      const tail = tailSource
        ? shortenOnWordBoundary(
            takeFirstSemanticChunk(tailSource, Math.floor(target * 0.55) + 8),
            Math.floor(target * 0.55),
          )
        : '';
      const combined = tail ? `${head} — ${tail}` : head;
      return shortenOnWordBoundary(combined.replace(/\s*—\s*—+/g, ' — '), target);
    }
    case 'cta':
      return shortenOnWordBoundary((input.cta?.trim() || 'Detaylar'), target);
    case 'hashtags': {
      const tags = input.hashtags ?? [];
      const line = tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
      return shortenOnWordBoundary(line, target);
    }
    case 'brand_name':
      return shortenOnWordBoundary((input.brandName || hook).trim(), target);
    case 'offer':
      return shortenOnWordBoundary((input.offer?.trim() || takeFirstSemanticChunk(support, target)).trim(), target);
    case 'price':
      return shortenOnWordBoundary((input.price ?? '').trim(), target);
    case 'date':
      return shortenOnWordBoundary((input.date ?? '').trim(), target);
    case 'location':
      return shortenOnWordBoundary((input.location ?? '').trim(), target);
    case 'contact':
      return shortenOnWordBoundary((input.contact ?? '').trim(), target);
    case 'website':
      return shortenOnWordBoundary((input.website ?? '').trim(), target);
    default:
      return '';
  }
}

function stripPublishSlotFromTitle(title: string) {
  return title
    .replace(/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\s*-\s*/i, '')
    .replace(/^[^·•\n]*[·•]\s*/u, '')
    .trim();
}

function takeFirstSemanticChunk(text: string, softMax: number) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= softMax) return t;
  const slice = t.slice(0, softMax);
  const dot = slice.lastIndexOf('.');
  if (dot > Math.min(24, softMax * 0.35)) return slice.slice(0, dot + 1).trim();
  const semi = slice.lastIndexOf(';');
  if (semi > 20) return slice.slice(0, semi).trim();
  return slice.trim();
}

function shortenOnWordBoundary(text: string, maxLen: number) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (maxLen <= 0) return '';
  if (t.length <= maxLen) return t;
  if (maxLen === 1) return t.slice(0, 1);
  const slice = t.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.45) return slice.slice(0, lastSpace).trimEnd();
  return slice.trimEnd();
}

function shortenForUnknownTextField(text: string, maxLen: number) {
  return shortenOnWordBoundary(text.replace(/\s+/g, ' ').trim(), Math.max(8, maxLen - 1));
}

function imageAssetForField(input: CanvaTemplateDecisionInput, fieldName: string): string | undefined {
  const standardName = normalizeCanvaFieldName(fieldName);
  if (standardName === 'hero_image') return input.heroImageAssetId ?? input.imageAssetId;
  if (standardName === 'product_image') return input.productImageAssetId ?? input.imageAssetId;
  if (standardName === 'background_image') return input.backgroundImageAssetId ?? input.imageAssetId;
  if (standardName === 'logo') return input.logoAssetId;
  if (standardName === 'avatar') return input.avatarAssetId;
  if (standardName === 'qr_code') return input.qrCodeAssetId;
  return input.imageAssetId;
}

function hasAssetForIntent(input: CanvaTemplateDecisionInput, intent: string) {
  const normalized = intent.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'logo') return Boolean(input.logoAssetId);
  if (normalized === 'hero_image' || normalized === 'venue_photo' || normalized === 'artist_photo') {
    return Boolean(input.heroImageAssetId ?? input.imageAssetId);
  }
  if (normalized === 'product_image') return Boolean(input.productImageAssetId ?? input.imageAssetId);
  if (normalized === 'background_image' || normalized === 'brand_background') return Boolean(input.backgroundImageAssetId ?? input.imageAssetId);
  if (normalized === 'avatar' || normalized === 'expert_photo' || normalized === 'team_photo') return Boolean(input.avatarAssetId ?? input.imageAssetId);
  if (normalized === 'qr_code') return Boolean(input.qrCodeAssetId);
  if (normalized === 'generated_visual') return true;
  return Boolean(input.imageAssetId);
}

function inferRiskSignals(input: CanvaTemplateDecisionInput): string[] {
  const signals = new Set<string>(input.riskSignals ?? []);
  const blob = `${input.title} ${input.summary ?? ''} ${input.caption ?? ''} ${input.businessImpact ?? ''} ${input.templateUseCase ?? ''} ${input.industry ?? ''}`.toLowerCase();
  if (input.price || /price|fiyat|ücret|tl|₺/.test(blob)) signals.add('price');
  if (input.offer || /discount|indirim|kampanya|offer|fırsat/.test(blob)) signals.add('discount');
  if (input.date || /date|tarih|bugün|yarın|hafta sonu/.test(blob)) signals.add('date');
  if (input.location || /location|lokasyon|adres|venue|şehir/.test(blob)) signals.add('location');
  if (/health|clinic|medical|sağlık|doktor|tedavi/.test(blob)) signals.add('health_claim');
  if (/finance|financial|yatırım|kredi|getiri/.test(blob)) signals.add('financial_claim');
  if (/legal|law|hukuk|avukat/.test(blob)) signals.add('legal_claim');
  if (/before.?after|öncesi|sonrası/.test(blob)) signals.add('before_after');
  return Array.from(signals);
}

function resolveDecisionRiskTier(
  template: CanvaTemplateMetadata,
  input: CanvaTemplateDecisionInput,
): CanvaTemplateRiskTier {
  const riskSignals = inferRiskSignals(input);
  if (template.riskTier === 'blocked') return 'blocked';
  if (template.riskTier === 'high' || riskSignals.some((signal) => ['health_claim', 'financial_claim', 'legal_claim', 'before_after'].includes(signal))) return 'high';
  if (template.riskTier === 'medium' || riskSignals.length > 0 || template.manualApprovalRequired) return 'medium';
  return 'low';
}

function eligibilityRank(eligibility: CanvaTemplateEligibility) {
  if (eligibility === 'eligible') return 2;
  if (eligibility === 'needs_setup') return 1;
  return 0;
}

function trimTextToMaxLength(value: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 1) return normalized.slice(0, maxLength);
  return normalized.slice(0, maxLength - 1).trimEnd();
}

function resolveTextMaxLength(
  input: CanvaTemplateDecisionInput,
  fieldName: string,
  field: CanvaTemplateDatasetField,
  dictionaryMaxLength: number,
) {
  const templateMaxLength = templateFieldCharacterLimit(field) ?? field.maxLength ?? dictionaryMaxLength;
  if (input.kind !== 'instagram_reel') return templateMaxLength;

  const standardName = normalizeCanvaFieldName(fieldName);
  if (standardName === 'headline') return Math.min(templateMaxLength, 28);
  if (standardName === 'subtitle') return Math.min(templateMaxLength, 42);
  if (standardName === 'body') return Math.min(templateMaxLength, 70);
  if (standardName === 'caption') return Math.min(templateMaxLength, 90);
  if (standardName === 'cta') return Math.min(templateMaxLength, 18);
  if (standardName === 'hashtags') return Math.min(templateMaxLength, 70);
  return Math.min(templateMaxLength, 48);
}

function templateFieldCharacterLimit(field: CanvaTemplateDatasetField): number | undefined {
  if (Number.isFinite(field.characterLimit) && field.characterLimit! > 0) return field.characterLimit;

  const defaultText = [
    field.defaultText,
    field.sampleText,
    field.placeholder,
    field.text,
    field.value,
    field.default,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  return defaultText ? defaultText.trim().length : undefined;
}

function normalizePlainTextForCanva(value: string, kind: CanvaContentKind) {
  const normalized = value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (kind !== 'instagram_reel') return normalized;

  return normalized
    .replace(/\s*[|•·]\s*/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .trim();
}

function sameToken(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ─────────────────────────────────────────────────────────────
// PUBLIC: Field Contract Extraction
// ─────────────────────────────────────────────────────────────

/** Resolved character contract for a single Canva template text/image field */
export interface CanvaTemplateFieldContract {
  fieldName: string;
  standardName: CanvaStandardFieldName | null;
  type: 'text' | 'image';
  label: string;
  /** Actual visual character limit derived from: api > defaultText.length > dictionary */
  maxLength: number;
  limitSource: 'api_characterLimit' | 'defaultText_length' | 'dictionary' | 'reel_cap';
  required: boolean;
  purpose: string;
  /** Original text in the Canva design — its length IS the real visual limit */
  defaultText?: string;
}

/**
 * Extracts field contracts from a hydrated template dataset.
 * The returned maxLength values are the definitive limits to pass to any LLM generating copy.
 */
export function extractTemplateFieldContracts(
  template: CanvaTemplateMetadata,
  kind?: CanvaContentKind,
): CanvaTemplateFieldContract[] {
  if (!template.dataset) return [];

  const REEL_CAPS: Partial<Record<CanvaStandardFieldName, number>> = {
    headline: 28, subtitle: 42, body: 70, caption: 90, cta: 18, hashtags: 70,
  };

  const contracts: CanvaTemplateFieldContract[] = [];

  for (const [fieldName, field] of Object.entries(template.dataset)) {
    const standardName = normalizeCanvaFieldName(fieldName);
    const definition = standardName ? getCanvaFieldDefinition(fieldName) : null;

    let maxLength: number;
    let limitSource: CanvaTemplateFieldContract['limitSource'];

    if (field.characterLimit && field.characterLimit > 0) {
      maxLength = field.characterLimit;
      limitSource = 'api_characterLimit';
    } else {
      const sample = [field.defaultText, field.sampleText, field.placeholder, field.text, field.value, field.default]
        .find((v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (sample) {
        maxLength = sample.trim().length;
        limitSource = 'defaultText_length';
      } else {
        maxLength = definition?.maxLength ?? (field.type === 'text' ? 200 : 0);
        limitSource = 'dictionary';
      }
    }

    // Reel-specific caps (visual area is smaller in vertical video frames)
    if (kind === 'instagram_reel' && standardName) {
      const cap = REEL_CAPS[standardName];
      if (cap && cap < maxLength) { maxLength = cap; limitSource = 'reel_cap'; }
    }

    const defaultText = [field.defaultText, field.sampleText]
      .find((v): v is string => typeof v === 'string' && v.trim().length > 0);

    contracts.push({
      fieldName,
      standardName,
      type: field.type === 'image' ? 'image' : 'text',
      label: definition?.label ?? fieldName,
      maxLength,
      limitSource,
      required: field.required ?? definition?.required ?? false,
      purpose: definition?.purpose ?? '',
      defaultText,
    });
  }

  return contracts.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'text' ? -1 : 1;
    if (a.required !== b.required) return a.required ? -1 : 1;
    return 0;
  });
}

/**
 * Builds a structured prompt block for an LLM to generate
 * field-specific copy that fits the template's visual limits.
 *
 * Pass to GPT with `response_format: { type: 'json_object' }`.
 * Expected response: { fieldName: "text", ... }
 */
export function buildFieldConstraintPromptBlock(
  template: CanvaTemplateMetadata,
  signal: Pick<CanvaTemplateDecisionInput, 'kind' | 'headline' | 'caption' | 'summary' | 'cta' | 'brandName' | 'location' | 'date' | 'offer' | 'price'>,
): string {
  const contracts = extractTemplateFieldContracts(template, signal.kind);
  const textContracts = contracts.filter(c => c.type === 'text');
  if (textContracts.length === 0) return '';

  const fieldSpecs = textContracts.map(c => {
    const src = c.limitSource === 'api_characterLimit' ? 'Canva API'
      : c.limitSource === 'defaultText_length' ? `tasarım default (${c.defaultText})`
      : 'sözlük';
    const req = c.required ? ' [zorunlu]' : '';
    return `  "${c.fieldName}"${req}: max ${c.maxLength} karakter (limit kaynağı: ${src})\n    → ${c.purpose}`;
  }).join('\n');

  const brief = [
    signal.headline && `headline: ${signal.headline}`,
    signal.summary && `summary: ${signal.summary?.slice(0, 200)}`,
    signal.caption && `caption: ${signal.caption?.slice(0, 200)}`,
    signal.cta && `cta: ${signal.cta}`,
    signal.brandName && `brandName: ${signal.brandName}`,
    signal.location && `location: ${signal.location}`,
    signal.date && `date: ${signal.date}`,
    signal.offer && `offer: ${signal.offer}`,
    signal.price && `price: ${signal.price}`,
  ].filter(Boolean).join('\n');

  return [
    `Canva şablonu: "${template.title}" (${template.aspectRatio ?? '1:1'}, ${signal.kind})`,
    ``,
    `Her alan için KESINLIKLE belirtilen max karakter sınırına sığan metin üret.`,
    `Kırpma, "...", tire yok — doğal dil sınırda bitmeli.`,
    `Türkçe veya İngilizce — içeriğe uygun seç. Yalnızca JSON döndür.`,
    ``,
    `Alanlar ve gerçek görsel limitler:`,
    fieldSpecs,
    ``,
    `Mevcut içerik (bu özetten yeniden yaz):`,
    brief,
  ].join('\n');
}
