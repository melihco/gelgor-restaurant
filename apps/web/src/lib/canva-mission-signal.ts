/**
 * Mission Hub → Canva autofill bridge.
 * Keeps Instagram feed copy (long caption) separate from design-layer field copy
 * with conservative character limits (dictionary + reel caps + optional registry aggregate).
 */
import {
  CANVA_FIELD_DICTIONARY,
  normalizeCanvaFieldName,
  type CanvaStandardFieldName,
} from '@/lib/canva-field-dictionary';
import type { CanvaContentKind, CanvaTemplateDecisionInput } from '@/lib/canva-template-selection';

/** Visual caps for Reel templates (matches extractTemplateFieldContracts) */
export const CANVA_REEL_FIELD_CAPS: Partial<Record<CanvaStandardFieldName, number>> = {
  headline: 28,
  subtitle: 42,
  body: 70,
  caption: 90,
  cta: 18,
  hashtags: 70,
};

export interface MissionIdeaFields {
  headline: string;
  caption: string;
  captionAlt: string;
  cta: string;
  hashtags: string[];
  strategicPurpose: string;
  contentType: string;
  templateUseCase?: string;
  assetIntent?: string;
  tags?: string[];
  canvaFieldCopy?: Partial<Record<string, string>>;
}

export interface CanvaFieldLimitEntry {
  standardName: CanvaStandardFieldName;
  maxChars: number;
  source: 'dictionary' | 'reel_cap' | 'registry_min';
  label: string;
  purpose: string;
}

function getField(idea: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = idea[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function normalizeHashtags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => (typeof t === 'string' ? t.replace(/^#/, '').trim() : ''))
    .filter(Boolean)
    .slice(0, 12);
}

export function missionContentTypeToCanvaKind(contentType: string): CanvaContentKind {
  const fmt = contentType.replace(/^instagram_/, '').toLowerCase();
  if (fmt.includes('reel') || fmt.includes('video')) return 'instagram_reel';
  if (fmt.includes('story')) return 'instagram_story';
  if (fmt.includes('plan') || fmt.includes('calendar')) return 'instagram_plan';
  if (fmt.includes('carousel')) return 'instagram_post';
  return 'instagram_post';
}

export function extractMissionIdeaFields(idea: Record<string, unknown>): MissionIdeaFields {
  const rawCopy = idea.canvaFieldCopy ?? idea.canva_field_copy ?? idea.canva_fields ?? idea.canvaLayerCopy;
  let canvaFieldCopy: Partial<Record<string, string>> | undefined;
  if (rawCopy && typeof rawCopy === 'object' && !Array.isArray(rawCopy)) {
    canvaFieldCopy = Object.fromEntries(
      Object.entries(rawCopy as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'string' && (v as string).trim())
        .map(([k, v]) => [k, (v as string).trim()]),
    );
  }

  const tagsRaw = idea.tags ?? idea.template_tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((t) => String(t).trim()).filter(Boolean)
    : [];

  return {
    headline: getField(idea, 'headline', 'concept_title', 'title'),
    caption: getField(idea, 'caption_draft', 'caption'),
    captionAlt: getField(idea, 'caption_draft_alt', 'caption_alt'),
    cta: getField(idea, 'cta', 'call_to_action'),
    hashtags: normalizeHashtags(idea.hashtags),
    strategicPurpose: getField(idea, 'strategic_purpose', 'hook', 'visual_direction'),
    contentType: getField(idea, 'content_type', 'content_kind') || 'post',
    templateUseCase: getField(idea, 'template_use_case', 'templateUseCase') || undefined,
    assetIntent: getField(idea, 'asset_intent', 'assetIntent') || undefined,
    tags: tags.length ? tags : undefined,
    canvaFieldCopy,
  };
}

function trimToMax(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || maxLength <= 0) return '';
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 1) return normalized.slice(0, maxLength);
  const slice = normalized.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxLength * 0.5)) return slice.slice(0, lastSpace).trimEnd();
  return slice.trimEnd();
}

function limitForStandard(
  standardName: CanvaStandardFieldName,
  kind: CanvaContentKind,
  registryMin?: Partial<Record<CanvaStandardFieldName, number>>,
): number {
  const dict = CANVA_FIELD_DICTIONARY[standardName]?.maxLength ?? 200;
  let max = dict;
  if (kind === 'instagram_reel' && CANVA_REEL_FIELD_CAPS[standardName]) {
    max = Math.min(max, CANVA_REEL_FIELD_CAPS[standardName]!);
  }
  if (registryMin?.[standardName] && registryMin[standardName]! > 0) {
    max = Math.min(max, registryMin[standardName]!);
  }
  return max;
}

/** Dictionary (+ optional registry) limits for agents and Mission Hub UI */
export function getDictionaryFieldLimits(
  kind: CanvaContentKind,
  registryMin?: Partial<Record<CanvaStandardFieldName, number>>,
): CanvaFieldLimitEntry[] {
  const textFields: CanvaStandardFieldName[] = [
    'headline', 'subtitle', 'body', 'caption', 'cta', 'hashtags',
    'brand_name', 'offer', 'price', 'date', 'location',
  ];

  return textFields.map((standardName) => {
    const def = CANVA_FIELD_DICTIONARY[standardName];
    const maxChars = limitForStandard(standardName, kind, registryMin);
    const reelCapped = kind === 'instagram_reel' && CANVA_REEL_FIELD_CAPS[standardName];
    return {
      standardName,
      maxChars,
      source: registryMin?.[standardName]
        ? 'registry_min'
        : reelCapped
          ? 'reel_cap'
          : 'dictionary',
      label: def.label,
      purpose: def.purpose,
    };
  });
}

function firstChunk(text: string, softMax: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= softMax) return t;
  const slice = t.slice(0, softMax);
  const dot = slice.lastIndexOf('.');
  if (dot > 20) return slice.slice(0, dot + 1).trim();
  return slice.trim();
}

/**
 * Design-layer copy for Canva autofill (NOT the Instagram feed caption).
 * Uses headline / strategic purpose / CTA / hashtags with per-field limits.
 */
export function buildMissionCanvaFieldCopy(
  fields: MissionIdeaFields,
  kind: CanvaContentKind,
  options?: {
    brandName?: string;
    location?: string;
    registryMin?: Partial<Record<CanvaStandardFieldName, number>>;
  },
): Partial<Record<string, string>> {
  const hook = fields.headline || firstChunk(fields.caption, 48) || 'İçerik';
  const support = fields.strategicPurpose || firstChunk(fields.caption, 220);
  const limits = (name: CanvaStandardFieldName) =>
    limitForStandard(name, kind, options?.registryMin);

  const copy: Partial<Record<string, string>> = {
    headline: trimToMax(hook, limits('headline')),
    subtitle: trimToMax(
      support ? firstChunk(support, limits('subtitle') + 8) : hook,
      limits('subtitle'),
    ),
    body: trimToMax(firstChunk(support || fields.caption, limits('body') + 16), limits('body')),
    caption: trimToMax(
      support
        ? `${trimToMax(hook, Math.min(40, Math.floor(limits('caption') * 0.45)))} — ${firstChunk(support, Math.floor(limits('caption') * 0.55))}`
        : hook,
      limits('caption'),
    ),
    cta: trimToMax(fields.cta || 'Keşfet', limits('cta')),
    hashtags: trimToMax(
      fields.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' '),
      limits('hashtags'),
    ),
  };

  if (options?.brandName) {
    copy.brand_name = trimToMax(options.brandName, limits('brand_name'));
  }
  if (options?.location) {
    copy.location = trimToMax(options.location, limits('location'));
  }

  // Agent-provided overrides (already field-aware) win
  if (fields.canvaFieldCopy) {
    for (const [rawKey, rawVal] of Object.entries(fields.canvaFieldCopy)) {
      if (typeof rawVal !== 'string' || !rawVal.trim()) continue;
      const std = normalizeCanvaFieldName(rawKey);
      const max = std ? limits(std) : 200;
      copy[rawKey] = trimToMax(rawVal, max);
      if (std) copy[std] = copy[rawKey];
    }
  }

  return Object.fromEntries(
    Object.entries(copy).filter(([, v]) => typeof v === 'string' && v.length > 0),
  );
}

export interface BuildCanvaMissionSignalParams {
  idea: Record<string, unknown>;
  brandName?: string;
  location?: string;
  missionBrief?: string;
  imageUrl?: string;
  registryMin?: Partial<Record<CanvaStandardFieldName, number>>;
  overrides?: Partial<CanvaTemplateDecisionInput>;
}

/** Full autofill payload for POST /api/canva/autofill-design */
export function buildCanvaMissionSignal(params: BuildCanvaMissionSignalParams): {
  title: string;
  signal: CanvaTemplateDecisionInput;
  fields: MissionIdeaFields;
  canvaFieldCopy: Partial<Record<string, string>>;
} {
  const fields = extractMissionIdeaFields(params.idea);
  const kind = missionContentTypeToCanvaKind(fields.contentType);
  const canvaFieldCopy = buildMissionCanvaFieldCopy(fields, kind, {
    brandName: params.brandName,
    location: params.location,
    registryMin: params.registryMin,
  });

  const instagramCaption = fields.caption.trim();
  const summary =
    fields.strategicPurpose.trim() ||
    firstChunk(instagramCaption, 120) ||
    params.missionBrief?.trim().slice(0, 120) ||
    '';

  const title =
    fields.headline.trim() ||
    trimToMax(instagramCaption, 60) ||
    params.brandName ||
    'İçerik';

  const signal: CanvaTemplateDecisionInput = {
    kind,
    title,
    headline: fields.headline.trim() || undefined,
    caption: instagramCaption || undefined,
    summary,
    cta: fields.cta.trim() || undefined,
    hashtags: fields.hashtags.slice(0, 8),
    brandName: params.brandName,
    location: params.location,
    templateUseCase: fields.templateUseCase,
    assetIntent: fields.assetIntent,
    usageContext: [
      params.missionBrief?.trim(),
      fields.strategicPurpose,
      fields.tags?.join(' '),
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 400) || undefined,
    canvaFieldCopy,
    imageAssetId: params.imageUrl,
    heroImageAssetId: params.imageUrl,
    ...params.overrides,
  };

  return { title, signal, fields, canvaFieldCopy };
}

export function buildCanvaAutofillBody(params: BuildCanvaMissionSignalParams & { tenantId: string }) {
  const { title, signal } = buildCanvaMissionSignal(params);
  return {
    tenantId: params.tenantId,
    title,
    signal,
    lineage: {
      source: 'mission_hub',
      ideaIndex: typeof params.idea.idea_index === 'number' ? params.idea.idea_index : undefined,
    },
  };
}
