'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock3,
  DollarSign,
  Edit3,
  Eye,
  FileText,
  Hash,
  Heart,
  Bookmark,
  ImageIcon,
  Instagram,
  MessageCircle,
  MoreHorizontal,
  MessageSquareReply,
  Mic2,
  Music2,
  Play,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompanyProfile } from '@/types';
import { GlassPanel, RiskBadge, SectionHeader, StatusPill, type Risk, type Tone } from '@/tailadmin/components/application/PageElements';
import { Card, CardFooter } from '@/components/tailadmin/Card';

// ──────────────────────────────────────────────────────────────────────────────
// Unified Artifact Signal — every AI output gets normalized into this shape.
// ──────────────────────────────────────────────────────────────────────────────

export type ArtifactKind =
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

export type ArtifactStatus =
  | 'draft'
  | 'needs_approval'
  | 'approved'
  | 'executed'
  | 'rejected';

export interface ArtifactMetric {
  label: string;
  value: string | number;
  tone?: Tone;
  helper?: string;
  trend?: 'up' | 'down' | 'flat';
}

export interface ArtifactBudgetChange {
  name: string;
  current: number;
  recommended: number;
  reason?: string;
}

export interface ArtifactReview {
  reviewer: string;
  rating: number;
  date?: string;
  original: string;
  reply: string;
  tone?: string;
}

export interface ArtifactIdea {
  contentType?: string;
  contentKind?: ArtifactKind;
  templateUseCase?: string;
  headline?: string;
  title?: string;
  caption?: string;
  captionAlt?: string;
  hashtags?: string[];
  postingTime?: string;
  eventDate?: string;
  location?: string;
  cta?: string;
  assetIntent?: string;
  visualDirection?: string;
  /** Resolved preview / Brand Hub reference when backend attaches one per slot */
  imageUrl?: string | null;
  engagement?: string;
  purpose?: string;
  missingQuestions?: string[];
  /** Şablon katman metinleri — caption'dan ayrı; backend `canva_field_copy` ile doldurulabilir */
  canvaFieldCopy?: Record<string, string>;
  /** Media Specialist production brief — treatment + gallery selection + image edit prompt */
  visualProductionSpec?: {
    treatment: 'pure_photo' | 'story_event' | 'feed_text_overlay' | 'event_announcement';
    selectedGalleryUrl?: string;
    imageEditPrompt?: string;
    textLayers?: Record<string, string>;
  };
}

/** Normalized ad copy lines for approvals / Ads Agent preview. */
export interface AdCreativeVariant {
  index?: number;
  headline?: string;
  body?: string;
  description?: string;
  cta?: string;
}

export interface ArtifactInsight {
  title: string;
  description?: string;
  metric?: string;
  tone?: Tone;
}

export interface ArtifactTimelineStep {
  title: string;
  description?: string;
  time?: string;
  tone?: Tone;
  status?: 'completed' | 'active' | 'pending';
}

export interface ArtifactCanvaDesign {
  rendererProvider?: string;
  designId?: string;
  editUrl?: string;
  thumbnailUrl?: string;
  exportUrl?: string;
  permanentPreviewUrl?: string;
  templateTitle?: string;
  templateId?: string;
  score?: number;
  jobId?: string;
  status?: string;
  exportStatus?: string;
  eligibility?: string;
  riskTier?: string;
  approvalRequired?: boolean;
  selectedBy?: string;
  lineage?: Record<string, unknown>;
}

export interface ArtifactSignal {
  id?: string;
  kind: ArtifactKind;
  title: string;
  summary?: string;
  /** Why this matters to the business — short, executive sentence. */
  businessImpact?: string;
  /** Where the artifact will be used (e.g. "Instagram feed", "Google Ads — Search"). */
  usageContext?: string;
  /** AI confidence 0-100. */
  confidence?: number;
  risk?: Risk;
  status?: ArtifactStatus;

  // Media
  imageUrl?: string | null;
  videoUrl?: string | null;

  // Social content
  caption?: string;
  hashtags?: string[];
  cta?: string;
  templateUseCase?: string;
  headline?: string;
  eventDate?: string;
  location?: string;
  assetIntent?: string;
  brand?: { name: string; handle?: string; avatarUrl?: string };

  // Lists
  ideas?: ArtifactIdea[];

  // Ads / metrics
  metrics?: ArtifactMetric[];
  budgetChanges?: ArtifactBudgetChange[];

  // Review
  review?: ArtifactReview;

  // Analytics
  insights?: ArtifactInsight[];
  recommendations?: string[];

  // Strategy / generic body
  bullets?: string[];

  // Metadata
  agentSource?: string;
  provider?: string;
  timestamp?: string;
  executionId?: string;

  // Work evidence
  workSteps?: ArtifactTimelineStep[];
  canvaDesign?: ArtifactCanvaDesign;

  // Raw fallback (kept hidden behind disclosure)
  rawPayload?: unknown;
  /**
   * Şablon tasarım katmanları için kısa metinler (Instagram caption'dan bağımsız).
   * API / Gram `canvaFieldCopy` | `canva_fields` | `canvaLayerCopy` ile doldurabilir.
   */
  canvaFieldCopy?: Record<string, string>;
  /** Reklam metin varyantları (payload `creatives` / `ads` veya API `renderedPreview.adCreatives`). */
  adCreatives?: AdCreativeVariant[];
}

function isLikelyInternalArtifactLabel(value: string): boolean {
  const t = value.trim().toLowerCase();
  if (!t) return false;
  if (/\b(content_agent|content_idea|orchestration|task_type|suggested_action)\b/.test(t)) return true;
  if (/^[a-z][a-z0-9]*(_[a-z][a-z0-9]*){2,}$/.test(t)) return true;
  return false;
}

function fallbackArtifactTitle(kind: ArtifactKind, ideas: ArtifactIdea[]): string {
  if (ideas.length === 1) {
    const one = ideas[0];
    const ti = pickString(one?.title, one?.headline);
    if (ti && !isLikelyInternalArtifactLabel(ti)) return ti;
  }
  if (kind === 'instagram_plan') {
    return ideas.length > 0 ? `İçerik planı · ${ideas.length} slot` : 'İçerik planı';
  }
  return 'İçerik önerisi';
}

function humanizeArtifactTitle(raw: string | undefined, kind: ArtifactKind, ideas: ArtifactIdea[]): string {
  const t = (raw ?? '').trim();
  if (!t || isLikelyInternalArtifactLabel(t)) return fallbackArtifactTitle(kind, ideas);
  return t;
}

function extractBrandFieldsFromSources(
  data: Record<string, unknown>,
  meta: Record<string, unknown>,
  rendered: Record<string, unknown>,
): ArtifactSignal['brand'] | undefined {
  const brandObj = data.brand ?? meta.brand ?? rendered.brand;
  const nestedName =
    brandObj && typeof brandObj === 'object' && !Array.isArray(brandObj)
      ? pickString(
          (brandObj as Record<string, unknown>).name as string,
          (brandObj as Record<string, unknown>).display_name as string,
        )
      : undefined;
  const name = pickString(
    nestedName,
    data.brand_name as string,
    data.brandName as string,
    data.company_name as string,
    data.tenant_name as string,
    meta.brand_name as string,
    meta.brandName as string,
    rendered.brand_name as string,
    rendered.brandName as string,
  );
  let handle = pickString(
    data.instagram_handle as string,
    data.instagramHandle as string,
    data.ig_handle as string,
    meta.instagram_handle as string,
    meta.instagramHandle as string,
    rendered.instagram_handle as string,
  );
  if (handle && !handle.startsWith('@')) handle = `@${handle}`;
  const avatarUrl = stableImageUrl(
    pickString(
      data.logo_url as string,
      data.logoUrl as string,
      data.brand_logo_url as string,
      meta.logo_url as string,
      meta.logoUrl as string,
      rendered.logoUrl as string,
      rendered.avatar_url as string,
    ),
  );
  if (!name && !handle && !avatarUrl) return undefined;
  return {
    name: name ?? '',
    ...(handle ? { handle } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function mergeBrandFields(
  a?: ArtifactSignal['brand'],
  b?: ArtifactSignal['brand'],
): ArtifactSignal['brand'] | undefined {
  const name = pickString(a?.name, b?.name);
  let handle = pickString(a?.handle, b?.handle);
  if (handle && !handle.startsWith('@')) handle = `@${handle}`;
  const avatarUrl = stableImageUrl(pickString(a?.avatarUrl, b?.avatarUrl) ?? null);
  if (!name && !handle && !avatarUrl) return undefined;
  return {
    name: name ?? '',
    ...(handle ? { handle } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

/** Tenant Setup / Brand Hub ile artifact sinyalindeki marka bilgisini birleştirir (logo + @handle). */
export function enrichArtifactSignalWithCompanyProfile(
  signal: ArtifactSignal,
  profile: CompanyProfile | null | undefined,
  opts?: { logoUrl?: string | null },
): ArtifactSignal {
  if (!profile && !opts?.logoUrl) return signal;
  const name = profile?.brandName?.trim() || '';
  let ig = profile?.instagramHandle?.trim();
  if (ig && !ig.startsWith('@')) ig = `@${ig}`;
  const logoRaw = (opts?.logoUrl ?? profile?.logoUrl ?? '').trim();
  const tenantLogo = logoRaw.startsWith('http') ? stableImageUrl(logoRaw) : null;

  const nextName = name || signal.brand?.name?.trim() || '';
  const nextHandle = ig || signal.brand?.handle;
  const nextAvatar = tenantLogo || stableImageUrl(signal.brand?.avatarUrl ?? null);

  if (!nextName && !nextHandle && !nextAvatar) return signal;

  return {
    ...signal,
    brand: {
      name: (nextName || 'Markanız').trim(),
      ...(nextHandle ? { handle: nextHandle } : {}),
      ...(nextAvatar ? { avatarUrl: nextAvatar } : {}),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Signal builder — turns SuggestedActionDto / OutputArtifact into ArtifactSignal.
// ──────────────────────────────────────────────────────────────────────────────

/** First fenced ```json ... ``` block in prose (LLM often prefixes text before the fence). */
function extractFencedJsonSegment(text: string): string | null {
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const inner = m?.[1]?.trim();
  return inner || null;
}

function safeJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const attempts: string[] = [];
  if (trimmed.startsWith('```')) {
    attempts.push(
      trimmed.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim(),
    );
  }
  const fenced = extractFencedJsonSegment(trimmed);
  if (fenced) attempts.push(fenced);
  attempts.push(trimmed);

  const seen = new Set<string>();
  for (const candidate of attempts) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') {
        const inner = parsed.trim();
        if (
          (inner.startsWith('{') && inner.endsWith('}')) ||
          (inner.startsWith('[') && inner.endsWith(']'))
        ) {
          try {
            return JSON.parse(inner);
          } catch {
            return parsed;
          }
        }
      }
      return parsed;
    } catch {
      /* try next candidate */
    }
  }
  return trimmed;
}

function isUrl(value: unknown): value is string {
  return typeof value === 'string' && (/^https?:\/\//i.test(value) || value.startsWith('data:'));
}

function looksVideo(value: string) {
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(value);
}

function looksImage(value: string) {
  return /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(value) || value.startsWith('data:image/');
}

function isExpiredSignedImageUrl(value?: string | null) {
  if (!value || value.startsWith('data:image/')) return false;
  if (!/blob\.core\.windows\.net/i.test(value)) return false;
  try {
    const expiresAt = new URL(value).searchParams.get('se');
    if (!expiresAt) return false;
    return Date.parse(expiresAt) <= Date.now();
  } catch {
    return false;
  }
}

function stableImageUrl(value?: string | null) {
  return isExpiredSignedImageUrl(value) ? null : value ?? null;
}

function previewImageUrl(signal: ArtifactSignal) {
  return stableImageUrl(signal.canvaDesign?.thumbnailUrl ?? signal.imageUrl);
}

function collectMedia(value: unknown, depth = 0): { imageUrl?: string | null; videoUrl?: string | null } {
  if (!value || depth > 4) return {};

  if (typeof value === 'string') {
    if (!isUrl(value)) return {};
    if (looksVideo(value)) return { videoUrl: value };
    if (looksImage(value)) return { imageUrl: stableImageUrl(value) };
    return {};
  }

  if (Array.isArray(value)) {
    return value.reduce<{ imageUrl?: string | null; videoUrl?: string | null }>((acc, item) => {
      if (acc.imageUrl && acc.videoUrl) return acc;
      const next = collectMedia(item, depth + 1);
      return {
        imageUrl: acc.imageUrl ?? next.imageUrl ?? null,
        videoUrl: acc.videoUrl ?? next.videoUrl ?? null,
      };
    }, {});
  }

  if (typeof value !== 'object') return {};

  const entries = Object.entries(value as Record<string, unknown>);
  const direct = entries.reduce<{ imageUrl?: string | null; videoUrl?: string | null }>((acc, [key, item]) => {
    if (acc.imageUrl && acc.videoUrl) return acc;
    if (typeof item !== 'string' || !isUrl(item)) return acc;
    const k = key.toLowerCase();
    const isVideo = k.includes('video') || k.includes('reel') || looksVideo(item);
    const isImage =
      k.includes('image') ||
      k.includes('visual') ||
      k.includes('thumbnail') ||
      k.includes('contenturl') ||
      k.includes('mediaurl') ||
      looksImage(item);
    return {
      imageUrl: acc.imageUrl ?? (isImage && !isVideo ? stableImageUrl(item) : null),
      videoUrl: acc.videoUrl ?? (isVideo ? item : null),
    };
  }, {});

  if (direct.imageUrl || direct.videoUrl) return direct;
  return entries.reduce<{ imageUrl?: string | null; videoUrl?: string | null }>((acc, [, item]) => {
    if (acc.imageUrl && acc.videoUrl) return acc;
    const next = collectMedia(item, depth + 1);
    return {
      imageUrl: acc.imageUrl ?? next.imageUrl ?? null,
      videoUrl: acc.videoUrl ?? next.videoUrl ?? null,
    };
  }, {});
}

function extractCanvaFieldCopy(data: Record<string, unknown>, rendered: Record<string, unknown>): Record<string, string> | undefined {
  const raw =
    data.canvaFieldCopy ??
    data.canva_field_copy ??
    data.canva_fields ??
    data.canvaLayerCopy ??
    rendered.canvaFieldCopy ??
    rendered.canva_fields;
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

function pickString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function arr<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Payload may be a bare JSON array of calendar slots from the LLM. */
function normalizePayloadRoot(parsed: unknown): Record<string, unknown> {
  if (parsed === null || parsed === undefined) return {};
  if (Array.isArray(parsed)) return { posts: parsed };
  if (typeof parsed === 'object') return parsed as Record<string, unknown>;
  if (typeof parsed === 'string') {
    const again = safeJson(parsed);
    if (again !== null && again !== parsed) {
      return normalizePayloadRoot(again);
    }
  }
  return {};
}

function stringifyDaySlot(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return `Gün ${value}`;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return `Gün ${value.trim()}`;
  return undefined;
}

function parseHashtagList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const tags = value.map((t) => (typeof t === 'string' ? t.trim() : String(t))).filter(Boolean);
    return tags.length
      ? tags.map((t) => (t.startsWith('#') ? t : `#${t.replace(/^#+/, '')}`))
      : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
  }
  return undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean);
    return items.length ? items : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return undefined;
}

/** Maps API / LLM slots (ideas, posts, calendar entries) to ArtifactIdea. */
function normalizeIdeaFromApi(raw: unknown): ArtifactIdea | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const contentType = pickString(
    o.content_type as string,
    o.contentType as string,
    o.type as string,
    o.format as string,
    o.slot_type as string,
  );
  const contentKind = pickString(o.content_kind as string, o.contentKind as string);
  const templateUseCase = pickString(o.template_use_case as string, o.templateUseCase as string, o.use_case as string);
  const headline = pickString(
    o.headline as string,
    o.hook as string,
    o.concept_title as string,
    o.conceptTitle as string,
    o.idea_title as string,
    o.ideaTitle as string,
    o.title as string,
  );
  const title = pickString(
    o.concept_title as string,
    o.conceptTitle as string,
    o.idea_title as string,
    o.ideaTitle as string,
    o.title as string,
    o.theme as string,
    o.headline as string,
    o.hook as string,
    o.subject as string,
    o.topic as string,
    o.name as string,
  );
  const caption = pickString(
    o.caption_draft as string,
    o.captionDraft as string,
    o.caption as string,
    o.brief as string,
    o.body as string,
    o.copy as string,
    o.text as string,
    o.description as string,
    o.script as string,
    o.message as string,
    typeof o.content === 'string' ? o.content : undefined,
  );
  const captionAlt = pickString(
    o.caption_draft_alt as string,
    o.captionDraftAlt as string,
    o.caption_alt as string,
  );
  const postingTime = pickString(
    o.posting_time_suggestion as string,
    o.postingTime as string,
    o.date_suggestion as string,
    o.dateSuggestion as string,
    o.scheduled_at as string,
    o.scheduledAt as string,
    o.time_slot as string,
    o.best_time as string,
    stringifyDaySlot(o.day),
  );
  const eventDate = pickString(o.event_date as string, o.eventDate as string, o.date as string, o.date_suggestion as string);
  const location = pickString(o.location as string, o.venue_name as string, o.venue as string);
  const cta = pickString(o.cta as string, o.call_to_action as string, o.callToAction as string);
  const assetIntent = pickString(o.asset_intent as string, o.assetIntent as string, o.asset_recommendation as string);
  const hashtags = parseHashtagList(o.hashtags ?? o.tags);
  const visualDirection = pickString(
    o.visual_direction as string,
    o.visualDirection as string,
    o.image_prompt as string,
    o.imagePrompt as string,
  );
  const ideaImageUrl = pickString(
    o.image_url as string,
    o.imageUrl as string,
    o.preview_image_url as string,
    o.previewImageUrl as string,
    o.thumbnail_url as string,
    o.thumbnailUrl as string,
    o.hero_image_url as string,
    o.content_image_url as string,
    o.reference_image_url as string,
    o.referenceImageUrl as string,
    o.media_url as string,
    o.mediaUrl as string,
    Array.isArray(o.reference_images) && typeof (o.reference_images as unknown[])[0] === 'string'
      ? String((o.reference_images as string[])[0])
      : undefined,
    Array.isArray(o.reference_image_urls) && typeof (o.reference_image_urls as unknown[])[0] === 'string'
      ? String((o.reference_image_urls as string[])[0])
      : undefined,
  );
  const ep = o.engagement_prediction;
  let engagement = pickString(
    o.estimated_engagement as string,
    o.engagement as string,
    typeof ep === 'string' ? ep : undefined,
  );
  if (!engagement && ep && typeof ep === 'object') {
    const er = ep as Record<string, unknown>;
    engagement = pickString(er.reasoning as string, er.summary as string, er.rationale as string);
    if (!engagement) {
      try {
        engagement = JSON.stringify(ep).slice(0, 360);
      } catch {
        engagement = undefined;
      }
    }
  }
  const purpose = pickString(o.strategic_purpose as string, o.purpose as string, o.priority as string);
  const missingQuestions = parseStringList(o.missing_questions ?? o.missingQuestions ?? o.missing_question);
  const canvaFieldCopy = extractCanvaFieldCopy(o, {});

  // Parse visual_production_spec from Media Specialist output
  let visualProductionSpec: ArtifactIdea['visualProductionSpec'] | undefined;
  const vps = o.visual_production_spec ?? o.visualProductionSpec;
  if (vps && typeof vps === 'object' && !Array.isArray(vps)) {
    const v = vps as Record<string, unknown>;
    const treatment = (v.treatment as string) ?? '';
    if (['pure_photo', 'story_event', 'feed_text_overlay', 'event_announcement'].includes(treatment)) {
      visualProductionSpec = {
        treatment: treatment as NonNullable<ArtifactIdea['visualProductionSpec']>['treatment'],
        selectedGalleryUrl: (v.selected_gallery_url as string) || (v.selectedGalleryUrl as string) || undefined,
        imageEditPrompt: (v.image_edit_prompt as string) || (v.imageEditPrompt as string) || undefined,
        textLayers: (v.text_layers && typeof v.text_layers === 'object' ? v.text_layers : undefined) as Record<string, string> | undefined,
      };
    }
  }

  return {
    contentType: contentType ?? 'post',
    contentKind: contentKind as ArtifactKind | undefined,
    templateUseCase: templateUseCase ?? undefined,
    headline: headline ?? undefined,
    title: title ?? undefined,
    caption: caption ?? undefined,
    captionAlt: captionAlt ?? undefined,
    postingTime: postingTime ?? undefined,
    eventDate: eventDate ?? undefined,
    location: location ?? undefined,
    cta: cta ?? undefined,
    assetIntent: assetIntent ?? undefined,
    hashtags,
    visualDirection: visualDirection ?? undefined,
    imageUrl: stableImageUrl(ideaImageUrl),
    engagement: engagement ?? undefined,
    purpose: purpose ?? undefined,
    missingQuestions,
    ...(canvaFieldCopy ? { canvaFieldCopy } : {}),
    ...(visualProductionSpec ? { visualProductionSpec } : {}),
  };
}

/** Walk payload + common wrappers (`result`, `output`, …) so calendar/plan slots are found */
function collectIdeaSources(data: Record<string, unknown>): ArtifactIdea[] {
  const tryExtract = (obj: Record<string, unknown>) => extractStructuredIdeas(obj);
  const direct = tryExtract(data);
  if (direct.length > 0) return direct;

  const nestedPayload = data.payload ?? data.action_payload ?? data.actionPayload;
  if (nestedPayload && typeof nestedPayload === 'object' && !Array.isArray(nestedPayload)) {
    const fromNested = tryExtract(nestedPayload as Record<string, unknown>);
    if (fromNested.length > 0) return fromNested;
  }

  for (const key of ['result', 'output', 'content', 'body', 'raw', 'raw_output', 'rawOutput'] as const) {
    const raw = data[key];
    if (typeof raw === 'string' && raw.trim()) {
      const nested = normalizePayloadRoot(safeJson(raw));
      const fromNested = tryExtract(nested);
      if (fromNested.length > 0) return fromNested;
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const fromObj = tryExtract(raw as Record<string, unknown>);
      if (fromObj.length > 0) return fromObj;
    }
  }
  return [];
}

const STRUCTURED_IDEA_LIST_KEYS = [
  'ideas',
  'content_ideas',
  'posts',
  'schedule',
  'calendar',
  'entries',
  'content_plan',
  'items',
  'slots',
  'proposals',
  'concepts',
  'generated_ideas',
  'content_slots',
] as const;

function ideaLooksMeaningful(idea: ArtifactIdea): boolean {
  return Boolean(
    (idea.caption && idea.caption.trim()) ||
      (idea.title && idea.title.trim()) ||
      (idea.headline && idea.headline.trim()) ||
      (idea.visualDirection && idea.visualDirection.trim()) ||
      (idea.cta && idea.cta.trim()) ||
      (idea.hashtags && idea.hashtags.length > 0) ||
      (idea.templateUseCase && idea.templateUseCase.trim()) ||
      (idea.canvaFieldCopy && Object.keys(idea.canvaFieldCopy).length > 0),
  );
}

function extractStructuredIdeas(data: Record<string, unknown>): ArtifactIdea[] {
  for (const key of STRUCTURED_IDEA_LIST_KEYS) {
    const v = data[key];
    if (Array.isArray(v) && v.length > 0) {
      return v.map(normalizeIdeaFromApi).filter((x): x is ArtifactIdea => x !== null);
    }
  }
  const single = normalizeIdeaFromApi(data);
  if (single && ideaLooksMeaningful(single)) return [single];
  return [];
}

function mergeArtifactIdeas(fromPayload: ArtifactIdea[], fromRendered: ArtifactIdea[]): ArtifactIdea[] {
  if (fromPayload.length === 0 && fromRendered.length === 0) return [];
  const seen = new Set<string>();
  const out: ArtifactIdea[] = [];
  for (const idea of [...fromPayload, ...fromRendered]) {
    const key = `${idea.title ?? ''}|${idea.caption ?? ''}|${idea.headline ?? ''}|${idea.contentType ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(idea);
  }
  return out;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

const PLACEHOLDER_AD_SUMMARY_TR = "JSON'dan üretilmiş reklam kreatif önizlemesi";

function humanizeAdsPlatform(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const v = value.trim().toLowerCase().replace(/-/g, '_');
  const map: Record<string, string> = {
    google_ads: 'Google Ads',
    googleads: 'Google Ads',
    meta: 'Meta Ads',
    facebook: 'Meta Ads',
    fb: 'Meta Ads',
    instagram: 'Instagram / Meta',
    linkedin: 'LinkedIn Ads',
    tiktok: 'TikTok Ads',
    all_channels: 'Çoklu kanal',
  };
  return map[v] ?? value.trim().replace(/_/g, ' ');
}

function humanizeAdsObjective(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const v = value.trim().toLowerCase().replace(/-/g, '_');
  const map: Record<string, string> = {
    weekly_plan: 'Haftalık ticari / kampanya planı',
    priority_alignment: 'Öncelik sıralaması ve hizalama',
    conversions: 'Dönüşüm',
    traffic: 'Trafik',
    awareness: 'Bilinirlik',
    reach: 'Erişim',
  };
  return map[v] ?? value.trim().replace(/_/g, ' ');
}

function adPlanningContextLines(data: Record<string, unknown>): string[] | undefined {
  const platform = humanizeAdsPlatform(pickString(data.platform, data.channel));
  const objective = humanizeAdsObjective(pickString(data.objective, data.goal));
  const lines: string[] = [];
  if (platform) lines.push(`Platform: ${platform}`);
  if (objective) lines.push(`Kampanya odağı: ${objective}`);
  return lines.length > 0 ? lines : undefined;
}

function normalizeAdCreativeItem(raw: unknown, fallbackIndex: number): AdCreativeVariant | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const headlineParts: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const v = o[`headline${i}`];
    if (typeof v === 'string' && v.trim()) headlineParts.push(v.trim());
  }
  const headline =
    headlineParts.length > 0
      ? headlineParts.join(' · ')
      : pickString(o.headline, o.title, o.hook, o.primary_text, o.long_headline, o.short_headline, o.name);

  const body = pickString(o.body, o.description, o.copy, o.text, o.message, o.primary_text);

  const extraDesc = pickString(o.long_description, o.secondary_text, o.description_line_2);
  const description = extraDesc && extraDesc !== body ? extraDesc : undefined;

  const cta = pickString(o.cta, o.call_to_action, o.callToAction);
  const idx = asNumber(o.index) ?? fallbackIndex;
  if (!headline?.trim() && !body?.trim() && !description?.trim() && !cta?.trim()) return null;
  return {
    index: idx,
    headline: headline || undefined,
    body: body || undefined,
    description,
    cta: cta || undefined,
  };
}

function extractAdCreatives(data: Record<string, unknown>, rendered: Record<string, unknown>): AdCreativeVariant[] {
  const rCreatives = rendered.adCreatives ?? rendered.creatives;
  const dCreatives = data.creatives ?? data.ads;
  const source =
    Array.isArray(rCreatives) && rCreatives.length > 0
      ? rCreatives
      : Array.isArray(dCreatives)
        ? dCreatives
        : [];
  return source
    .map((raw, i) => normalizeAdCreativeItem(raw, i + 1))
    .filter((x): x is AdCreativeVariant => x !== null);
}

function deriveAdSummaryFromVariants(variants: AdCreativeVariant[]): string | undefined {
  if (variants.length === 0) return undefined;
  const lines = variants.map((c, idx) => {
    const num = c.index ?? idx + 1;
    const h = c.headline || `Varyant ${num}`;
    const snippet = [c.body, c.description].filter(Boolean).join(' — ');
    if (!snippet) return `${num}. ${h}`;
    const cut = snippet.length > 100 ? `${snippet.slice(0, 100)}…` : snippet;
    return `${num}. ${h} — ${cut}`;
  });
  return `${variants.length} reklam metni önizlemesi:\n${lines.join('\n')}`;
}

function isPlaceholderAdSummary(s?: string): boolean {
  if (!s?.trim()) return true;
  return s.trim() === PLACEHOLDER_AD_SUMMARY_TR;
}

function inferRiskFromActionType(actionType?: string): Risk {
  if (!actionType) return 'medium';
  if (actionType.includes('budget')) return 'critical';
  if (actionType.includes('reply') || actionType.includes('schedule') || actionType.includes('publish')) return 'high';
  if (actionType.includes('log') || actionType.includes('analytics') || actionType.includes('analysis')) return 'low';
  return 'medium';
}

function inferKind(input: {
  actionType?: string;
  artifactType?: string;
  payload?: any;
  contentType?: string;
  hint?: string;
}): ArtifactKind {
  const at = input.actionType?.toLowerCase() ?? '';
  const art = input.artifactType?.toLowerCase() ?? '';
  const ct = input.contentType?.toLowerCase() ?? '';
  const hint = input.hint?.toLowerCase() ?? '';
  const blob = `${at} ${art} ${ct} ${hint}`;

  // Prefer concrete action types over title/hint text (e.g. "Ads Agent: Content Ideation" on campaign output).
  if (at === 'apply_campaign_recommendations' || at === 'apply_budget_optimization') return 'ad_campaign';
  if (at === 'create_ad_creatives') return 'ad_creative';
  if (at === 'create_instagram_content_plan' || at === 'schedule_instagram_posts') return 'instagram_plan';

  if (
    art.includes('instagram_plan') ||
    art.includes('content_ideation') ||
    ct.includes('instagram_plan') ||
    /\bcontent\s+ideation\b/i.test(hint) ||
    /\bcontent\s+plan\b/i.test(hint)
  ) {
    return 'instagram_plan';
  }

  if (blob.includes('story')) return 'instagram_story';
  if (blob.includes('reel') || blob.includes('video')) return 'instagram_reel';
  if (
    blob.includes('content_plan') ||
    blob.includes('content-plan') ||
    blob.includes('content_calendar') ||
    /\bcontent\s+calendar\b/i.test(blob) ||
    blob.includes('ideation')
  ) {
    return 'instagram_plan';
  }
  if (blob.includes('schedule_instagram')) return 'instagram_plan';
  if (/\bvisual\s+design\b/i.test(hint) || /\bvisual\s+card\b/i.test(hint)) return 'instagram_post';
  if (blob.includes('instagram') || blob.includes('post') || blob.includes('caption')) return 'instagram_post';
  if (blob.includes('budget')) return 'budget_optimization';
  if (blob.includes('ad_creative') || blob.includes('creative')) return 'ad_creative';
  if (blob.includes('campaign') || blob.includes('ads')) return 'ad_campaign';
  if (blob.includes('review') && (blob.includes('analysis') || blob.includes('insights') || blob.includes('sentiment')))
    return 'review_analysis';
  if (blob.includes('review')) return 'review_reply';
  if (blob.includes('strategy')) return 'strategy';
  if (blob.includes('analytics') || blob.includes('report') || blob.includes('traffic') || blob.includes('conversion') || blob.includes('weekly')) return 'analytics_report';
  return 'generic';
}

const STATUS_MAP: Record<string, ArtifactStatus> = {
  pending: 'needs_approval',
  pending_review: 'needs_approval',
  needs_approval: 'needs_approval',
  approved: 'approved',
  executed: 'executed',
  published: 'executed',
  rejected: 'rejected',
  draft: 'draft',
  archived: 'rejected',
};

function normalizeStatus(value?: string): ArtifactStatus {
  if (!value) return 'draft';
  return STATUS_MAP[value.toLowerCase()] ?? 'draft';
}

export function statusTone(status: ArtifactStatus): Tone {
  switch (status) {
    case 'approved':
    case 'executed':
      return 'emerald';
    case 'needs_approval':
      return 'amber';
    case 'rejected':
      return 'rose';
    default:
      return 'neutral';
  }
}

export function statusLabel(status: ArtifactStatus): string {
  switch (status) {
    case 'approved': return 'Approved';
    case 'executed': return 'Executed';
    case 'needs_approval': return 'Needs approval';
    case 'rejected': return 'Rejected';
    default: return 'Draft';
  }
}

// ── Specialized signal builders ──────────────────────────────────────────────

export function signalFromAction(action: {
  id?: string;
  artifactTitle?: string;
  actionType?: string;
  provider?: string;
  status?: string;
  payload?: string | Record<string, any>;
  renderedPreview?: any;
  createdAt?: string;
  integrationName?: string;
}): ArtifactSignal {
  const payloadRaw = (typeof action.payload === 'string' ? safeJson(action.payload) : action.payload) ?? null;
  const data = normalizePayloadRoot(payloadRaw);
  const rendered = action.renderedPreview ?? {};
  const media = collectMedia({ rendered, payload: payloadRaw });

  const kind = inferKind({
    actionType: action.actionType,
    contentType: data.contentType ?? data.content_type ?? rendered.kind,
    hint: pickString(action.artifactTitle, rendered.title, data.title, data.platform),
  });

  const isAdCreativesAction = action.actionType?.toLowerCase() === 'create_ad_creatives';
  const adCreatives = extractAdCreatives(data, rendered as Record<string, unknown>);

  const hashtags = arr<string>(rendered.hashtags ?? data.hashtags).filter((x) => typeof x === 'string');
  const ideas = mergeArtifactIdeas(collectIdeaSources(data), arr(rendered.ideas).map(normalizeIdeaFromApi).filter((x): x is ArtifactIdea => x !== null));

  const baseTitleRaw =
    pickString(rendered.title, data.title, action.artifactTitle, action.actionType, 'AI recommendation') ?? 'AI recommendation';
  const baseTitle = humanizeArtifactTitle(baseTitleRaw, kind, ideas);
  const payloadBrand = extractBrandFieldsFromSources(data, {}, rendered as Record<string, unknown>);

  let summary = pickString(rendered.summary, data.summary, data.reason, data.message, data.caption);
  if (isAdCreativesAction && isPlaceholderAdSummary(summary)) {
    summary = deriveAdSummaryFromVariants(adCreatives) ?? summary;
  }

  const status = normalizeStatus(action.status);
  const risk: Risk = inferRiskFromActionType(action.actionType);
  const confidence = asNumber(data.confidence ?? rendered.confidence) ?? 86;

  const usageContext = isAdCreativesAction
    ? pickString(
        humanizeAdsPlatform(typeof data.platform === 'string' ? data.platform : undefined),
        action.integrationName,
        typeof data.platform === 'string' ? data.platform : undefined,
        action.provider,
      )
    : pickString(
        action.integrationName,
        data.platform ? `${data.platform}` : undefined,
        action.provider,
      );

  return {
    id: action.id,
    kind,
    title: baseTitle,
    summary,
    businessImpact: isAdCreativesAction
      ? pickString(data.businessImpact, data.business_impact, data.impact) ??
        'Onayınızdan sonra bu metinler reklam hesabına veya dışa aktarma adımına iletilmek üzere işlenir.'
      : pickString(data.businessImpact, data.business_impact, data.impact),
    usageContext,
    confidence,
    risk,
    status,
    imageUrl: stableImageUrl(rendered.imageUrl ?? media.imageUrl),
    videoUrl: rendered.videoUrl ?? media.videoUrl ?? null,
    caption: pickString(rendered.caption, data.caption, data.body, data.message),
    hashtags: hashtags.length > 0 ? hashtags.slice(0, 12) : undefined,
    cta: pickString(data.cta, data.callToAction, data.action),
    templateUseCase: pickString(data.template_use_case, data.templateUseCase),
    headline: pickString(data.headline, rendered.headline),
    ...(payloadBrand ? { brand: payloadBrand } : {}),
    eventDate: pickString(data.event_date, data.eventDate, data.date, rendered.eventDate),
    location: pickString(data.location, data.venue, rendered.location),
    assetIntent: pickString(data.asset_intent, data.assetIntent),
    ideas,
    metrics: extractMetrics(data),
    budgetChanges: extractBudgetChanges(data),
    review: extractReview(data),
    insights: extractInsights(data),
    recommendations: arr<string>(data.recommendations ?? data.suggestions).filter((x) => typeof x === 'string'),
    bullets: isAdCreativesAction ? adPlanningContextLines(data) ?? extractBullets(data) : extractBullets(data),
    agentSource: action.provider,
    provider: action.provider,
    timestamp: action.createdAt,
    canvaDesign: rendered.canvaDesign ?? data.canvaDesign,
    rawPayload: payloadRaw,
    canvaFieldCopy: extractCanvaFieldCopy(data, rendered as Record<string, unknown>),
    adCreatives: adCreatives.length > 0 ? adCreatives : undefined,
  };
}

export function signalFromArtifact(artifact: {
  id?: string;
  title?: string;
  type?: string;
  artifactType?: string;
  content?: string;
  contentUrl?: string;
  status?: string;
  createdAt?: string;
  agentName?: string;
  metadata?: Record<string, unknown>;
}): ArtifactSignal {
  const rawContent = typeof artifact.content === 'string' ? artifact.content : undefined;
  const parsedRaw = safeJson(artifact.content) ?? null;
  const meta =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? (artifact.metadata as Record<string, unknown>)
      : {};
  const rootData = normalizePayloadRoot(parsedRaw);
  // Merge: meta values win over empty-string content values
  // This prevents content JSON's `caption: ""` from overwriting metadata.caption
  const mergedRootData = Object.fromEntries(
    Object.entries(rootData).map(([k, v]) => [k, (typeof v === 'string' && v.trim() === '') ? undefined : v])
  );
  const data = { ...meta, ...mergedRootData };
  const rendered = (data.renderedPreview as Record<string, unknown>) ?? {};
  const media = collectMedia({ rendered, data, contentUrl: artifact.contentUrl });

  const kind = inferKind({
    artifactType: artifact.artifactType,
    contentType: pickString(data.contentType as string, data.content_type as string, rendered.kind as string),
    hint: artifact.title,
  });

  const isAdCreativesArtifact = kind === 'ad_creative';
  const adCreatives = extractAdCreatives(data, rendered);

  let summary = pickString(
    rendered.summary as string,
    data.summary as string,
    data.executiveSummary as string,
    data.description as string,
    summarizeReviewsList(data.reviews),
    typeof parsedRaw === 'string' ? parsedRaw : undefined,
  );
  if (isAdCreativesArtifact && isPlaceholderAdSummary(summary)) {
    summary = deriveAdSummaryFromVariants(adCreatives) ?? summary;
  }

  const fromData = collectIdeaSources(data);
  const fromRendered = arr(rendered.ideas).map(normalizeIdeaFromApi).filter((x): x is ArtifactIdea => x !== null);
  const ideas = mergeArtifactIdeas(fromData, fromRendered);

  const baseTitleRaw =
    pickString(rendered.title as string, data.title as string, artifact.title, 'AI artifact') ?? 'AI artifact';
  const baseTitle = humanizeArtifactTitle(baseTitleRaw, kind, ideas);
  const payloadBrand = extractBrandFieldsFromSources(data, meta, rendered);

  if (kind === 'instagram_plan' && (!summary || !summary.trim()) && (!ideas || ideas.length === 0) && rawContent?.trim()) {
    summary = rawContent.trim().slice(0, 4000);
  }

  const fromMetaCaption = pickString(
    data.visual_prompt as string,
    data.visualPrompt as string,
    data.image_prompt as string,
    data.imagePrompt as string,
    data.creative_brief as string,
    data.creativeBrief as string,
    data.generation_prompt as string,
    data.generationPrompt as string,
    data.photo_brief as string,
  );
  let captionOut = pickString(rendered.caption as string, data.caption as string);
  if (!captionOut?.trim() && fromMetaCaption) captionOut = fromMetaCaption;
  if ((!summary || !summary.trim()) && fromMetaCaption) summary = fromMetaCaption.slice(0, 4000);

  const usageContext = isAdCreativesArtifact
    ? pickString(
        humanizeAdsPlatform(typeof data.platform === 'string' ? data.platform : undefined),
        typeof data.platform === 'string' ? data.platform : undefined,
        typeof data.channel === 'string' ? data.channel : undefined,
        artifact.agentName,
      )
    : pickString(data.platform, data.channel, artifact.agentName);

  return {
    id: artifact.id,
    kind,
    title: baseTitle,
    summary,
    businessImpact: isAdCreativesArtifact
      ? pickString(data.businessImpact, data.business_impact, data.impact) ??
        'Onayınızdan sonra bu metinler reklam hesabına veya dışa aktarma adımına iletilmek üzere işlenir.'
      : pickString(data.businessImpact, data.business_impact, data.impact),
    usageContext,
    confidence: asNumber(data.confidence) ?? 88,
    risk: 'medium',
    status: normalizeStatus(artifact.status),
    imageUrl: stableImageUrl((rendered.imageUrl as string | undefined) ?? media.imageUrl ?? (typeof artifact.contentUrl === 'string' ? artifact.contentUrl : undefined)),
    videoUrl: (rendered.videoUrl as string | undefined) ?? media.videoUrl ?? null,
    caption: captionOut,
    hashtags: arr<string>(rendered.hashtags ?? data.hashtags).filter((x) => typeof x === 'string').slice(0, 12),
    ...(payloadBrand ? { brand: payloadBrand } : {}),
    ideas,
    metrics: extractMetrics(data),
    budgetChanges: extractBudgetChanges(data),
    review: extractReview(data),
    insights: extractInsights(data),
    recommendations: arr<string>(data.recommendations).filter((x) => typeof x === 'string'),
    bullets: isAdCreativesArtifact ? adPlanningContextLines(data) ?? extractBullets(data) : extractBullets(data),
    agentSource: artifact.agentName,
    timestamp: artifact.createdAt,
    canvaDesign: (rendered.canvaDesign ?? data.canvaDesign) as ArtifactSignal['canvaDesign'],
    rawPayload: parsedRaw ?? rawContent ?? null,
    canvaFieldCopy: extractCanvaFieldCopy(data, rendered as Record<string, unknown>),
    adCreatives: adCreatives.length > 0 ? adCreatives : undefined,
  };
}

function extractMetrics(data: Record<string, any>): ArtifactMetric[] | undefined {
  const list: ArtifactMetric[] = [];
  if (typeof data.predicted_roas !== 'undefined') list.push({ label: 'Predicted ROAS', value: `${data.predicted_roas}x`, tone: 'emerald' });
  if (typeof data.expected_lift !== 'undefined') list.push({ label: 'Expected lift', value: `${data.expected_lift}`, tone: 'cyan' });
  if (typeof data.budget !== 'undefined') list.push({ label: 'Budget', value: `${data.budget}₺`, tone: 'amber' });
  if (typeof data.reach !== 'undefined') list.push({ label: 'Reach', value: data.reach, tone: 'cyan' });
  if (Array.isArray(data.metrics)) {
    for (const m of data.metrics.slice(0, 6)) {
      if (m && typeof m === 'object' && m.label) {
        list.push({ label: String(m.label), value: m.value, tone: m.tone, helper: m.helper });
      }
    }
  }
  return list.length > 0 ? list : undefined;
}

function extractBudgetChanges(data: Record<string, any>): ArtifactBudgetChange[] | undefined {
  const candidates = data.budget_changes ?? data.budgetChanges;
  if (Array.isArray(candidates)) {
  const list = candidates
    .map((change: any) => {
      if (!change || typeof change !== 'object') return null;
      const name = pickString(change.campaign_name, change.name, change.campaign);
      const current = asNumber(change.current_budget ?? change.current);
      const recommended = asNumber(change.recommended_budget ?? change.recommended ?? change.target);
      if (!name || current === undefined || recommended === undefined) return null;
      return {
        name,
        current,
        recommended,
        reason: pickString(change.reason, change.rationale, change.notes),
      } as ArtifactBudgetChange;
    })
    .filter(Boolean) as ArtifactBudgetChange[];
  if (list.length > 0) return list;
  }

  const cur = asNumber(data.current_total_daily ?? data.currentTotalDaily ?? data.current_daily);
  const rec = asNumber(data.recommended_total_daily ?? data.recommendedTotalDaily ?? data.recommended_daily);
  if (cur !== undefined || rec !== undefined) {
    return [
      {
        name: pickString(data.campaign_name, data.scope, data.label) ?? 'Kampanya bütçesi',
        current: cur ?? rec ?? 0,
        recommended: rec ?? cur ?? 0,
        reason: pickString(data.rationale, data.reason, data.notes, data.summary),
      },
    ];
  }
  return undefined;
}

function summarizeReviewsList(reviews: unknown): string | undefined {
  if (!Array.isArray(reviews) || reviews.length === 0) return undefined;
  const first = reviews[0];
  if (!first || typeof first !== 'object') return `${reviews.length} yorum içeren analiz.`;
  const r = first as Record<string, unknown>;
  const name = pickString(r.reviewer_name, r.reviewer, r.author, r.name) ?? 'Müşteri';
  const rating = asNumber(r.rating);
  const star = rating !== undefined ? `${rating}★` : 'puanlı';
  return `${reviews.length} yorum · örnek: ${name} (${star})`;
}

function extractReview(data: Record<string, any>): ArtifactReview | undefined {
  const review = data.review ?? data.reviewContext ?? data.review_context;
  if (review && typeof review === 'object') {
    const reviewer = pickString(review.reviewer, review.author, review.name);
    const original = pickString(review.review_text, review.text, review.body);
    const reply = pickString(data.reply_text, data.reply, data.response, review.reply);
    if (reviewer && original) {
      return {
        reviewer,
        rating: asNumber(review.rating) ?? 5,
        date: pickString(review.review_date, review.date),
        original,
        reply: reply ?? '',
        tone: pickString(data.tone, review.tone),
      };
    }
  }
  if (data.reply_text || data.reply) {
    return {
      reviewer: pickString(data.reviewer, data.customer) ?? 'Customer',
      rating: asNumber(data.rating) ?? 5,
      original: pickString(data.review_text, data.original_review) ?? '',
      reply: pickString(data.reply_text, data.reply) ?? '',
      tone: pickString(data.tone),
    };
  }
  const reviews = data.reviews;
  if (Array.isArray(reviews) && reviews.length > 0) {
    const first = reviews[0] as Record<string, any>;
    const reviewer = pickString(first.reviewer_name, first.reviewer, first.author, first.name);
    const original = pickString(first.text, first.body, first.review_text, first.comment);
    if (reviewer || original) {
      return {
        reviewer: reviewer ?? 'Müşteri',
        rating: asNumber(first.rating) ?? 5,
        date: pickString(first.date, first.review_date, first.created_at),
        original: original ?? '',
        reply: '',
        tone: pickString(first.sentiment, data.overall_sentiment),
      };
    }
  }
  return undefined;
}

function extractInsights(data: Record<string, any>): ArtifactInsight[] | undefined {
  const items = data.insights ?? data.findings ?? data.highlights;
  if (!Array.isArray(items)) return undefined;
  return items
    .map((item: any) => {
      if (!item || typeof item !== 'object') return null;
      const title = pickString(item.title, item.headline, item.label);
      if (!title) return null;
      return {
        title,
        description: pickString(item.description, item.body, item.text),
        metric: pickString(item.metric, item.value),
        tone: item.tone as Tone | undefined,
      } as ArtifactInsight;
    })
    .filter(Boolean) as ArtifactInsight[];
}

function extractBullets(data: Record<string, any>): string[] | undefined {
  const list: string[] = [];
  for (const key of ['channel', 'targetAudience', 'target_audience', 'contentType', 'content_type', 'platform', 'objective', 'goal', 'cta']) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) list.push(v.trim());
  }
  return list.length > 0 ? Array.from(new Set(list)).slice(0, 5) : undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// Atomic premium primitives
// ──────────────────────────────────────────────────────────────────────────────

export function ConfidenceBadge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  // Düşük yüzdeleri yeşil göstermeyin: yalnızca güçlü skorlar emerald.
  const tone: Tone = v >= 78 ? 'emerald' : v >= 58 ? 'cyan' : v >= 38 ? 'amber' : 'rose';
  return <StatusPill label={`Güven ${v}%`} tone={tone} icon={Sparkles} />;
}

export function ArtifactKindBadge({ kind }: { kind: ArtifactKind }) {
  const map: Record<ArtifactKind, { label: string; icon: LucideIcon; tone: Tone }> = {
    instagram_post: { label: 'Instagram post', icon: Instagram, tone: 'violet' },
    instagram_story: { label: 'Instagram story', icon: Eye, tone: 'violet' },
    instagram_reel: { label: 'Instagram reel', icon: Play, tone: 'violet' },
    instagram_plan: { label: 'Content plan', icon: Calendar, tone: 'violet' },
    ad_campaign: { label: 'Ads campaign', icon: Target, tone: 'amber' },
    ad_creative: { label: 'Ad creative', icon: Sparkles, tone: 'amber' },
    budget_optimization: { label: 'Budget plan', icon: DollarSign, tone: 'amber' },
    review_reply: { label: 'Review reply', icon: MessageSquareReply, tone: 'cyan' },
    review_analysis: { label: 'Review insights', icon: ShieldAlert, tone: 'cyan' },
    analytics_report: { label: 'Analytics report', icon: TrendingUp, tone: 'indigo' },
    strategy: { label: 'AI strategy', icon: Sparkles, tone: 'indigo' },
    generic: { label: 'AI artifact', icon: FileText, tone: 'neutral' },
  };
  const info = map[kind] ?? map['generic'];
  return <StatusPill label={info.label} tone={info.tone} icon={info.icon} />;
}

// ──────────────────────────────────────────────────────────────────────────────
// Native preview renderers
// ──────────────────────────────────────────────────────────────────────────────

function PostFrameHeader({ brand, agent }: { brand?: ArtifactSignal['brand']; agent?: string }) {
  const handle = brand?.handle ?? brand?.name ?? agent ?? 'smartagency.ai';
  const initial = handle.replace('@', '').slice(0, 1).toUpperCase();
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 -m-0.5 rounded-full bg-gradient-to-tr from-amber-300 via-rose-400 to-violet-400 blur-[1px] opacity-90" />
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black text-sm font-semibold text-white">
            {initial}
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{handle.startsWith('@') ? handle : `@${handle}`}</p>
          <p className="text-[11px] text-white/45">Sponsored · AI generated</p>
        </div>
      </div>
      <span className="text-white/55">•••</span>
    </div>
  );
}

function PostFrameCaption({ caption, hashtags, handle }: { caption?: string; hashtags?: string[]; handle?: string }) {
  if (!caption && (!hashtags || hashtags.length === 0)) return null;
  return (
    <div className="space-y-2 px-4 pb-4 pt-3">
      <div className="flex items-center gap-4 text-white/85">
        <Heart className="h-5 w-5" />
        <MessageCircle className="h-5 w-5" />
        <Send className="h-5 w-5" />
      </div>
      {caption && (
        <p className="text-[13px] leading-6 text-white/80">
          <span className="font-semibold text-white">{handle ?? 'smartagency.ai'} </span>
          {caption}
        </p>
      )}
      {hashtags && hashtags.length > 0 && (
        <p className="flex flex-wrap gap-x-1 gap-y-0 text-[12px] leading-5 text-cyan-300/85">
          {hashtags.slice(0, 10).map((tag) => (
            <span key={tag}>{tag.startsWith('#') ? tag : `#${tag}`}</span>
          ))}
        </p>
      )}
    </div>
  );
}

function InstagramPostPreview({ signal, dense }: { signal: ArtifactSignal; dense?: boolean }) {
  const imageUrl = previewImageUrl(signal);
  const feed = (
    <div
      className={cn(
        'w-full overflow-hidden rounded-[1.4rem] border border-white/12 bg-[#0a0c14] shadow-[0_30px_80px_rgba(0,0,0,0.4)]',
        dense ? 'mx-auto max-w-[320px]' : 'max-w-[min(28rem,100%)] shrink-0',
      )}
    >
      <PostFrameHeader brand={signal.brand} agent={signal.agentSource} />
      <div className="relative aspect-square w-full overflow-hidden bg-black">
        {imageUrl ? (
          <img src={imageUrl} alt={signal.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500/25 via-rose-500/15 to-cyan-500/20">
            <ImageIcon className="h-10 w-10 text-white/55" />
          </div>
        )}
        {signal.canvaDesign?.editUrl && <CanvaPreviewBadge editUrl={signal.canvaDesign.editUrl} />}
      </div>
      <PostFrameCaption caption={signal.caption ?? signal.summary} hashtags={signal.hashtags} handle={signal.brand?.handle ?? 'smartagency.ai'} />
    </div>
  );

  if (dense) return feed;

  const extraSummary = signal.summary && signal.summary.trim() !== (signal.caption ?? '').trim();
  if (!extraSummary && !signal.businessImpact) {
    return (
      <div className="mx-auto flex w-fit max-w-full justify-center lg:mx-0 lg:justify-start">
        {feed}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      {feed}
      <div className="min-w-0 flex-1 space-y-5">
        {extraSummary && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Özet</p>
            <p className="mt-2 text-sm leading-relaxed text-white/85">{signal.summary}</p>
          </div>
        )}
        {signal.businessImpact && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">İş etkisi</p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{signal.businessImpact}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function InstagramStoryPreview({ signal, dense }: { signal: ArtifactSignal; dense?: boolean }) {
  const imageUrl = previewImageUrl(signal);
  const story = (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.6rem] border border-white/12 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.45)]',
        dense ? 'mx-auto aspect-[9/16] w-44' : 'aspect-[9/16] w-[min(22rem,100%)] shrink-0',
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={signal.title} className="h-full w-full object-cover opacity-95" referrerPolicy="no-referrer" />
      ) : (
        <div className="h-full w-full bg-gradient-to-b from-violet-500/35 via-rose-500/15 to-cyan-500/25" />
      )}
      {signal.canvaDesign?.editUrl && <CanvaPreviewBadge editUrl={signal.canvaDesign.editUrl} />}
      <div className="absolute inset-x-3 top-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn('h-0.5 flex-1 rounded-full', i === 0 ? 'bg-white/95' : 'bg-white/25')} />
        ))}
      </div>
      <div className="absolute inset-x-3 top-7 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-black/45 text-[11px] font-semibold text-white">
          {(signal.brand?.handle ?? 'S').slice(0, 1).toUpperCase()}
        </div>
        <p className="text-[11px] font-semibold text-white">{signal.brand?.handle ?? '@smartagency.ai'}</p>
        <span className="text-[10px] text-white/65">now</span>
      </div>
      <div className="absolute inset-x-4 bottom-6 space-y-2">
        {signal.caption && <p className="line-clamp-3 text-[13px] font-semibold leading-5 text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)]">{signal.caption}</p>}
        {signal.cta && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/40 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <Sparkles className="h-3 w-3" /> {signal.cta}
          </span>
        )}
      </div>
    </div>
  );

  if (dense) return story;

  const hasSide = Boolean(signal.summary && signal.summary.trim() !== (signal.caption ?? '').trim());
  if (!hasSide) {
    return (
      <div className="mx-auto flex w-fit max-w-full justify-center lg:mx-0 lg:justify-start">
        {story}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      {story}
      <div className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Özet</p>
        <p className="mt-2 text-sm leading-relaxed text-white/85">{signal.summary}</p>
      </div>
    </div>
  );
}

function InstagramReelPreview({ signal, dense }: { signal: ArtifactSignal; dense?: boolean }) {
  const imageUrl = previewImageUrl(signal);
  const canvaUrl = signal.canvaDesign?.editUrl;

  const phoneFrame = (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.6rem] border border-white/12 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.45)]',
        dense ? 'mx-auto aspect-[9/16] w-44' : 'aspect-[9/16] w-[min(22rem,100%)] shrink-0',
      )}
    >
      {signal.videoUrl ? (
        <video src={signal.videoUrl} muted playsInline loop controls className="h-full w-full object-cover" />
      ) : imageUrl ? (
        <img src={imageUrl} alt={signal.title} className="h-full w-full object-cover opacity-90" referrerPolicy="no-referrer" />
      ) : (
        <div className="h-full w-full bg-gradient-to-b from-violet-500/30 via-cyan-500/20 to-amber-500/25" />
      )}
      {signal.canvaDesign?.editUrl && <CanvaPreviewBadge editUrl={signal.canvaDesign.editUrl} />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/65" />
      {canvaUrl ? (
        <a
          href={canvaUrl}
          target="_blank"
          rel="noreferrer"
          className="absolute inset-0 z-10 flex items-center justify-center"
          aria-label="Open Canva design"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/45 px-5 py-3 text-sm font-semibold text-white shadow-theme-lg backdrop-blur transition hover:bg-black/65">
            <Play className="h-6 w-6" />
            Canva'da oynat
          </span>
        </a>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-white/25 bg-black/35 p-4 backdrop-blur">
            <Play className="h-7 w-7 text-white" />
          </div>
        </div>
      )}
      <div className="absolute inset-x-3 bottom-3 right-3 space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-white/80">
          <Music2 className="h-3.5 w-3.5" />
          <span className="truncate">Original audio · {signal.brand?.handle ?? 'smartagency.ai'}</span>
        </div>
        {(signal.caption || signal.summary) && (
          <p className="line-clamp-3 text-[12px] leading-5 text-white">{signal.caption ?? signal.summary}</p>
        )}
      </div>
      <div className="absolute right-2 top-1/3 flex flex-col items-center gap-3">
        <ReelSideAction icon={Heart} label="12.4k" />
        <ReelSideAction icon={MessageCircle} label="328" />
        <ReelSideAction icon={Send} label="Share" />
      </div>
    </div>
  );

  if (dense) {
    return phoneFrame;
  }

  const hasSideCopy = Boolean(signal.summary || signal.caption || signal.cta);

  return (
    <div className="flex w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      {phoneFrame}
      <div className="min-w-0 flex-1 space-y-5">
        {hasSideCopy ? (
          <>
            {signal.summary && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Özet</p>
                <p className="mt-2 text-sm leading-relaxed text-white/85">{signal.summary}</p>
              </div>
            )}
            {(signal.caption || signal.cta) && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Gönderi metni</p>
                {signal.caption && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{signal.caption}</p>
                )}
                {signal.cta && (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/90">
                    <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                    {signal.cta}
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] p-6 text-sm leading-relaxed text-white/55">
            Reel önizlemesinin yanında ek metin yok. Sağdaki panelde iş etkisi ve hashtag önerilerine devam edebilirsiniz.
          </div>
        )}
      </div>
    </div>
  );
}

function CanvaPreviewBadge({ editUrl }: { editUrl: string }) {
  return (
    <a
      href={editUrl}
      target="_blank"
      rel="noreferrer"
      className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white shadow-theme-sm backdrop-blur transition hover:bg-black/70"
    >
      <Sparkles className="h-3 w-3" />
      Canva output
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

function ReelSideAction({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex flex-col items-center text-[10px] font-semibold text-white">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/35 backdrop-blur">
        <Icon className="h-4 w-4" />
      </div>
      <span className="mt-1 drop-shadow">{label}</span>
    </div>
  );
}

function formatPlanSlotLabel(contentType?: string): string {
  const raw = (contentType ?? 'Gönderi').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('carousel')) return 'Carousel';
  if (lower.includes('reel')) return 'Reel';
  if (lower.includes('story')) return 'Story';
  if (lower.includes('post')) return 'Post';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Instagram-ish preview aspect: feed square, story/reel full vertical. */
function inferPlanSlotVisualFormat(idea: ArtifactIdea): 'feed_square' | 'vertical_916' | 'feed_portrait_45' {
  const kind = idea.contentKind;
  if (kind === 'instagram_story' || kind === 'instagram_reel') return 'vertical_916';
  const blob = `${idea.contentType ?? ''} ${idea.templateUseCase ?? ''} ${idea.title ?? ''} ${idea.headline ?? ''}`.toLowerCase();
  if (/\breel\b|shorts?|tiktok|instagram reel|vertical video/i.test(blob)) return 'vertical_916';
  if (/\bstory\b|hikaye|instagram story|story format|9\s*[:×]\s*16/i.test(blob)) return 'vertical_916';
  if (/\bcarousel/i.test(blob)) return 'feed_portrait_45';
  if (/\bgönderi\b|feed|square|kare|1\s*[:×]\s*1/i.test(blob)) return 'feed_square';
  return 'feed_square';
}

/** Local modal: IG-style mockup — blue scrim via portal above artifact modal (z-100). */
type InstagramPlanPreviewState = {
  idea: ArtifactIdea;
  idx: number;
  format: 'feed_square' | 'vertical_916' | 'feed_portrait_45';
  imageUrl: string | null;
  slotLabel: string;
};

function formatPlanHashtag(tag: string): string {
  const t = tag.trim();
  return t.startsWith('#') ? t : `#${t}`;
}

function instagramPersonaFromSignal(signal: ArtifactSignal): { display: string; handle: string } {
  const brand = signal.brand;
  const display = (brand?.name || signal.title || 'Markanız').trim();
  const fromBrand = brand?.handle?.replace(/^@/, '').trim();
  const asciiSlug = display
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 26);
  const handle = (fromBrand || asciiSlug || 'brand').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 30) || 'brand';
  return { display, handle };
}

function InstagramPlanSlotPreviewModal({
  open,
  onClose,
  signal,
  state,
}: {
  open: boolean;
  onClose: () => void;
  signal: ArtifactSignal;
  state: InstagramPlanPreviewState | null;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (typeof document === 'undefined' || !open || !state) return null;

  const { idea, format, imageUrl, slotLabel } = state;
  const { display, handle } = instagramPersonaFromSignal(signal);
  const caption = idea.caption?.trim() || '';
  const hashtags = (idea.hashtags ?? []).slice(0, 18).map(formatPlanHashtag).join(' ');
  const isVertical = format === 'vertical_916';
  const isReel =
    /reel/i.test(slotLabel) ||
    idea.contentKind === 'instagram_reel' ||
    /\breel\b/i.test(idea.contentType ?? '');
  const isStory =
    !isReel &&
    (/story|hikaye/i.test(slotLabel) ||
      idea.contentKind === 'instagram_story' ||
      /\bstory\b/i.test(idea.contentType ?? ''));

  /** Instagram native stack (iOS / Android system UI fonts). */
  const igSans =
    '[font-family:-apple-system,BlinkMacSystemFont,"Segoe_UI",Roboto,Helvetica,Arial,sans-serif] antialiased';

  const media = imageUrl ? (
    <img src={imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950">
      <ImageIcon className="h-14 w-14 text-white/25" />
    </div>
  );

  const storyTitle = (idea.title || idea.headline || '').trim();

  const feedMock = (
    <div
      className={cn(
        'w-full max-w-[390px] overflow-hidden rounded-none border-0 bg-black text-white shadow-2xl ring-1 ring-white/10',
        igSans,
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] p-[2px]">
          <div className="flex h-full w-full items-center justify-center rounded-full bg-black text-[10px] font-bold">
            {display.slice(0, 2).toUpperCase()}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight tracking-tight">{handle}</p>
        </div>
        <MoreHorizontal className="h-6 w-6 shrink-0 text-white" strokeWidth={1.5} />
      </div>
      <div className={cn('relative w-full bg-black', format === 'feed_portrait_45' ? 'aspect-[4/5]' : 'aspect-square')}>
        {media}
      </div>
      <div className="space-y-2 px-3 pb-4 pt-2">
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-5">
            <Heart className="h-7 w-7" strokeWidth={1.4} />
            <MessageCircle className="h-7 w-7" strokeWidth={1.4} />
            <Send className="h-7 w-7 -rotate-12" strokeWidth={1.4} />
          </div>
          <Bookmark className="h-7 w-7" strokeWidth={1.4} />
        </div>
        <p className="text-[14px] font-semibold leading-tight">1.234 beğeni</p>
        <p className="text-[14px] leading-[1.35]">
          <span className="font-semibold">{handle}</span>{' '}
          <span className="font-normal text-neutral-100">{caption}</span>
          {hashtags ? (
            <span className="mt-1 block text-[14px] leading-snug font-normal text-[#b2dffc]">{hashtags}</span>
          ) : null}
        </p>
        {idea.postingTime ? (
          <p className="text-[12px] font-normal uppercase tracking-wide text-neutral-500">
            {idea.postingTime}
          </p>
        ) : (
          <p className="text-[12px] text-neutral-500">Önizleme — yayınlanmadı</p>
        )}
      </div>
    </div>
  );

  const storyReelMock = (
    <div
      className={cn(
        'relative w-[min(100vw-40px,300px)] overflow-hidden rounded-[2.35rem] border-[2.5px] border-[#3c3c3e] bg-black shadow-[0_25px_80px_rgba(0,0,0,0.65)]',
        igSans,
      )}
    >
      {/* Single full-screen story canvas (media + overlays), 9:16 like IG */}
      <div className="relative aspect-[9/16] w-full bg-black">
        {media}

        {/* Status + progress — IG story top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/55 via-black/12 to-transparent pb-8 pt-[10px]">
          <div className="flex items-center justify-between px-[14px] text-[12px] font-semibold tabular-nums text-white">
            <span>9:41</span>
            <div className="flex items-center gap-1 opacity-95">
              <span className="text-[11px]">●●●●</span>
              <span className="rounded-sm border border-white/40 px-1 py-px text-[10px]">5G</span>
              <span className="pl-0.5 text-[11px]">▮</span>
            </div>
          </div>
          <div className="mt-2 flex gap-[3px] px-2.5">
            <div className="h-[2px] flex-1 rounded-[1px] bg-white" />
            <div className="h-[2px] flex-1 rounded-[1px] bg-white/35" />
            <div className="h-[2px] flex-1 rounded-[1px] bg-white/35" />
          </div>
          <div className="mt-2 flex items-center gap-2 px-2.5">
            <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] p-[2px]">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[#121212] text-[9px] font-bold text-white">
                {display.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white drop-shadow-sm">{handle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pointer-events-auto rounded-full bg-black/45 p-1.5 backdrop-blur-md transition hover:bg-black/65"
              aria-label="Kapat"
            >
              <X className="h-[18px] w-[18px] text-white" strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {isReel && (
          <>
            <div className="pointer-events-none absolute left-3 top-[108px] z-20 flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-white drop-shadow-md">
              <Play className="h-3 w-3 fill-white text-white" />
              Reels
            </div>
            <div className="pointer-events-none absolute bottom-[58px] left-0 right-0 z-20 flex items-end justify-between px-2.5">
              <div className="min-w-0 flex-1 text-white drop-shadow-md">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 shrink-0 rounded-full border-2 border-white bg-black/50" />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold">{handle}</p>
                    <p className="max-w-[170px] truncate text-[11px] text-white/90">
                      {idea.title || idea.headline || caption.slice(0, 48)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-4 pr-0.5 text-white drop-shadow-md">
                <Heart className="h-7 w-7" strokeWidth={1.4} />
                <MessageCircle className="h-7 w-7" strokeWidth={1.4} />
                <Send className="h-7 w-7 -rotate-12" strokeWidth={1.4} />
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/45 bg-black/40">
                  <Music2 className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </>
        )}

        {isStory && !isReel && (
          <div className="pointer-events-none absolute bottom-[52px] left-0 right-0 z-10 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pb-1 pt-24">
            {storyTitle ? (
              <p className="text-left text-[15px] font-semibold leading-snug tracking-tight text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]">
                {storyTitle}
              </p>
            ) : null}
            {caption ? (
              <p
                className={cn(
                  'mt-2 text-left text-[13px] font-normal leading-[1.45] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.75)]',
                  storyTitle ? '' : 'mt-0',
                )}
              >
                {caption}
              </p>
            ) : null}
            {hashtags ? (
              <p className="mt-2.5 text-left text-[12px] font-normal leading-snug text-[#b3e5fc] drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                {hashtags}
              </p>
            ) : null}
          </div>
        )}

        {!isReel && !isStory && (
          <div className="pointer-events-none absolute bottom-[52px] left-0 right-0 z-10 bg-gradient-to-t from-black/92 to-transparent px-4 pb-2 pt-20">
            <p className="text-left text-[13px] font-normal leading-relaxed text-white/95 drop-shadow-md line-clamp-6">
              {caption || idea.visualDirection || ''}
            </p>
          </div>
        )}

        {/* IG story reply bar — blur strip, pill + icons */}
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-black/35 px-2.5 py-2.5 backdrop-blur-[12px] supports-[backdrop-filter]:bg-black/25">
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1 rounded-full border border-white/35 bg-white/[0.14] px-3.5 py-2.5 text-[14px] font-normal text-white/45">
              Mesaj gönder...
            </div>
            <Heart className="h-6 w-6 shrink-0 text-white/75" strokeWidth={1.35} />
            <Send className="h-6 w-6 shrink-0 -rotate-12 text-white/75" strokeWidth={1.35} />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-10"
      style={{
        background: 'linear-gradient(180deg, rgb(15, 52,120) 0%, rgb(8, 32, 78) 42%, rgb(4, 18, 46) 100%)',
      }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative max-h-[94vh] overflow-y-auto pb-2"
        role="dialog"
        aria-modal="true"
        aria-label="Instagram önizlemesi"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-200/90">Instagram önizlemesi</p>
          <p className="mt-1 text-[13px] font-medium text-white/90">{slotLabel}</p>
        </div>
        {isVertical ? storyReelMock : feedMock}
      </div>
    </div>,
    document.body,
  );
}

function ContentPlanPreview({ signal }: { signal: ArtifactSignal }) {
  const ideas = signal.ideas?.slice(0, 8) ?? [];
  const [igPreview, setIgPreview] = useState<InstagramPlanPreviewState | null>(null);

  const openIgPreview = (payload: InstagramPlanPreviewState) => {
    setIgPreview(payload);
  };

  if (ideas.length > 0) {
  return (
    <div className="space-y-5">
      <InstagramPlanSlotPreviewModal
        open={igPreview !== null}
        onClose={() => setIgPreview(null)}
        signal={signal}
        state={igPreview}
      />
      <div className="rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.12] via-black/20 to-cyan-500/[0.06] px-4 py-3.5 sm:px-5">
        <p className="text-sm font-semibold tracking-tight text-white">Metin takvimi</p>
        <p className="mt-1.5 text-xs leading-relaxed text-white/65 sm:text-[13px] sm:leading-6">
          Her slot için metin planı aşağıda. Markanın{' '}
          <span className="font-medium text-violet-200">Brand Hub</span> veya üretim çıktısından gelen referans görsel / AI
          brief varsa üstte önizlenir; yoksa stüdyoda{' '}
          <span className="font-medium text-cyan-200/90">görsel üretimi</span> tamamlanır.
        </p>
      </div>

      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2">
        {ideas.map((idea, idx) => {
          const slot = formatPlanSlotLabel(idea.contentType);
          const visualFormat = inferPlanSlotVisualFormat(idea);
          const galleryRef = idea.visualProductionSpec?.selectedGalleryUrl;
          const previewUrl = stableImageUrl(idea.imageUrl ?? galleryRef ?? null);
          const editBrief = idea.visualProductionSpec?.imageEditPrompt?.trim();
          const previewPayload = (): InstagramPlanPreviewState => ({
            idea,
            idx,
            format: visualFormat,
            imageUrl: previewUrl,
            slotLabel: slot,
          });
          return (
            <article
              key={idx}
              className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/40 shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
            >
              <div className="flex shrink-0 flex-col border-b border-white/10 bg-gradient-to-br from-white/[0.07] via-violet-500/10 to-black/50">
                <div
                  className={cn(
                    'flex items-center justify-center',
                    visualFormat === 'vertical_916'
                      ? 'min-h-[min(52vh,340px)] py-4 sm:min-h-[min(56vh,380px)] sm:py-5'
                      : visualFormat === 'feed_portrait_45'
                        ? 'min-h-[200px] py-3 sm:min-h-[240px]'
                        : 'min-h-[180px] py-3 sm:min-h-[220px]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openIgPreview(previewPayload())}
                    className={cn(
                      'group relative overflow-hidden rounded-2xl border border-white/20 bg-black/40 text-left shadow-[0_8px_32px_rgba(0,0,0,0.4)] outline-none transition hover:border-sky-400/40 hover:shadow-[0_12px_40px_rgba(14,165,233,0.12)] focus-visible:ring-2 focus-visible:ring-sky-400',
                      visualFormat === 'vertical_916' &&
                        'aspect-[9/16] w-[min(200px,78vw)] max-h-[min(72vh,420px)] sm:w-[225px]',
                      visualFormat === 'feed_portrait_45' &&
                        'aspect-[4/5] w-[min(280px,88%)] max-w-[300px]',
                      visualFormat === 'feed_square' && 'aspect-square w-[min(300px,90%)] max-w-[320px]',
                    )}
                    aria-label={`Instagram önizlemesi: ${slot}`}
                  >
                    <span className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex h-7 min-w-[1.75rem] items-center justify-center rounded-full border border-white/20 bg-black/55 px-1.5 text-[11px] font-bold tabular-nums text-white">
                      {idx + 1}
                    </span>
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex h-full min-h-[120px] w-full items-center justify-center bg-black/30">
                        <ImageIcon className="h-10 w-10 text-white/20" aria-hidden />
                      </div>
                    )}
                    <span className="pointer-events-none absolute bottom-2 right-2 z-20 rounded-md border border-white/25 bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white group-hover:bg-sky-600/95">
                      Instagram önizle
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => openIgPreview(previewPayload())}
                  className="flex w-full shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-white/[0.04] px-3 py-2.5 text-[11px] font-semibold text-sky-300 transition hover:bg-sky-500/15 hover:text-sky-200"
                >
                  <Instagram className="h-4 w-4 shrink-0" />
                  Instagram’da tam ekran önizle
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={slot} tone="violet" icon={Instagram} />
                  {idea.postingTime && (
                    <span className="text-[11px] font-medium tabular-nums text-white/45">{idea.postingTime}</span>
                  )}
                  {idea.templateUseCase && (
                    <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/55">
                      {idea.templateUseCase}
                    </span>
                  )}
                </div>
                {(idea.title || idea.headline) && (
                  <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-white">
                    {idea.title || idea.headline}
                  </h3>
                )}
                {idea.caption && (
                  <p className="line-clamp-4 text-[13px] leading-6 text-white/65">{idea.caption}</p>
                )}
                {idea.hashtags && idea.hashtags.length > 0 && (
                  <p className="flex flex-wrap gap-x-1 gap-y-0.5 text-[11px] leading-5 text-cyan-300/80">
                    {idea.hashtags.slice(0, 12).map((tag, hi) => (
                      <span key={`${hi}-${tag}`}>{tag.startsWith('#') ? tag : `#${tag}`}</span>
                    ))}
                  </p>
                )}
                {idea.visualDirection && (
                  <p className="mt-auto inline-flex max-w-full items-start gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[11px] leading-relaxed text-white/55">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200/90" />
                    <span className="min-w-0">{idea.visualDirection}</span>
                  </p>
                )}
                {editBrief && (
                  <p className="inline-flex max-w-full items-start gap-1.5 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-cyan-100/70">
                    <span className="shrink-0 font-semibold uppercase tracking-wide text-[9px] text-cyan-300/80">Görsel üretim</span>
                    <span className="min-w-0">{editBrief}</span>
                  </p>
                )}
                {idea.engagement && (
                  <p className="text-[11px] leading-relaxed text-white/45">
                    <span className="font-semibold text-white/55">Tahmini etkileşim: </span>
                    {idea.engagement}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
  }

  const fallbackText = pickString(signal.summary, signal.caption, typeof signal.rawPayload === 'string' ? signal.rawPayload : undefined);
  if (fallbackText?.trim()) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-300/25 bg-amber-500/[0.08] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100/85">Metin çıktısı</p>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-white/80">{fallbackText.trim()}</p>
        </div>
        <p className="text-[11px] leading-relaxed text-white/45">
          Kartlı plan için model çıktısında <code className="rounded bg-white/10 px-1">ideas</code>,{' '}
          <code className="rounded bg-white/10 px-1">posts</code> veya{' '}
          <code className="rounded bg-white/10 px-1">payload.ideas</code> dizisi beklenir. Sağdaki Canva alanları şablon/export
          izidir; bu ekranda onayladığınız asıl şey metin planıdır.
        </p>
      </div>
    );
  }

  if (signal.rawPayload && typeof signal.rawPayload === 'object') {
    let pretty = '';
    try {
      pretty = JSON.stringify(signal.rawPayload, null, 2);
    } catch {
      pretty = String(signal.rawPayload);
    }
    const clipped = pretty.length > 14000 ? `${pretty.slice(0, 14000)}\n…` : pretty;
    return (
      <div className="space-y-3">
        <p className="text-[11px] leading-relaxed text-white/50">
          Yapılandırılmış slot listesi çıkarılamadı. Ham veri aşağıda; gerekirse içinde <code className="rounded bg-white/10 px-1">ideas</code>{' '}
          arayın.
        </p>
        <pre className="scrollbar-thin max-h-[min(70vh,520px)] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/45 p-4 font-mono text-[11px] leading-relaxed text-white/72">
          {clipped}
        </pre>
      </div>
    );
  }

  return <TextPreview signal={signal} />;
}

/** Parse markdown-style sections from LLM campaign analysis output */
function parseCampaignSections(text: string): Array<{ heading: string; body: string; icon: string }> {
  if (!text) return [];
  const sectionIcons: Record<string, string> = {
    'campaign': '🎯', 'objective': '🎯', 'hedef': '🎯', 'amaç': '🎯',
    'audience': '👥', 'hedef kitle': '👥', 'kitle': '👥', 'targeting': '👥',
    'keyword': '🔍', 'anahtar': '🔍',
    'budget': '💰', 'bütçe': '💰',
    'ad copy': '✍️', 'reklam metin': '✍️', 'creative': '✍️', 'kopya': '✍️',
    'result': '📈', 'sonuç': '📈', 'beklenen': '📈', 'kpi': '📈',
    'recommendation': '💡', 'öneri': '💡', 'tavsiye': '💡',
    'strategy': '🗺️', 'strateji': '🗺️',
    'platform': '📱', 'kanal': '📱',
    'schedule': '📅', 'zamanlama': '📅', 'takvim': '📅',
    'risk': '⚠️',
    'competitor': '🏆', 'rakip': '🏆',
  };

  // Split on markdown headers ## or ###
  const parts = text.split(/\n(?=#{1,3}\s)/);
  const sections: Array<{ heading: string; body: string; icon: string }> = [];

  for (const part of parts) {
    const lines = part.trim().split('\n');
    const firstLine = lines[0] ?? '';
    const heading = firstLine.replace(/^#+\s*/, '').trim();
    const body = lines.slice(1).join('\n').trim();
    if (!heading) continue;

    const iconKey = Object.keys(sectionIcons).find((k) => heading.toLowerCase().includes(k));
    sections.push({ heading, body, icon: sectionIcons[iconKey ?? ''] ?? '📋' });
  }

  // If no ## headers found, treat whole text as one block
  if (sections.length === 0 && text.trim()) {
    sections.push({ heading: 'Kampanya Analizi', body: text.trim(), icon: '🎯' });
  }

  return sections;
}

function AdCampaignPreview({ signal }: { signal: ArtifactSignal }) {
  const metrics = signal.metrics ?? [];
  const variants: AdCreativeVariant[] =
    signal.adCreatives && signal.adCreatives.length > 0 ? signal.adCreatives : [];

  // Full content: try rawPayload first, then summary, then caption
  const rawText = (() => {
    if (signal.rawPayload && typeof signal.rawPayload === 'string') return signal.rawPayload;
    if (signal.rawPayload && typeof signal.rawPayload === 'object') {
      const rp = signal.rawPayload as Record<string, unknown>;
      const raw = rp.raw_output ?? rp.rawOutput ?? rp.content ?? rp.body;
      if (typeof raw === 'string') return raw;
    }
    return signal.summary ?? signal.caption ?? '';
  })();

  const sections = parseCampaignSections(rawText);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-[1.5rem] border border-amber-300/15 bg-gradient-to-br from-amber-500/8 via-black/40 to-cyan-500/8 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300/60">Ads Agent · Campaign Analysis</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">{signal.title}</p>
            {signal.usageContext && <p className="mt-1.5 text-[12px] leading-5 text-white/50">{signal.usageContext}</p>}
          </div>
          <StatusPill label="Google Ads" tone="amber" icon={Target} />
        </div>
        {metrics.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.slice(0, 4).map((metric) => (
              <MetricBlock key={metric.label} metric={metric} />
            ))}
          </div>
        )}
      </div>

      {/* Parsed campaign sections */}
      {sections.length > 0 && (
        <div className="space-y-3">
          {sections.map((s, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/8 bg-black/25 p-4"
            >
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300/80">
                {s.icon} {s.heading}
              </p>
              <div className="text-[13px] leading-6 text-white/75 whitespace-pre-wrap">
                {s.body}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ad creatives if structured */}
      {variants.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">✍️ Reklam Metni Varyantları</p>
          <div className="grid gap-3 md:grid-cols-2">
            {variants.map((v, i) => (
              <div key={i} className="rounded-2xl border border-amber-300/15 bg-black/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">Varyant {v.index ?? i + 1}</p>
                {v.headline && <p className="mt-2 text-sm font-semibold text-white">{v.headline}</p>}
                {v.body && <p className="mt-2 text-[13px] leading-6 text-white/70 whitespace-pre-wrap">{v.body}</p>}
                {v.description && <p className="mt-2 text-[12px] text-white/50">{v.description}</p>}
                {v.cta && (
                  <span className="mt-3 inline-flex rounded-lg border border-amber-300/20 bg-amber-400/[0.08] px-2.5 py-1 text-[11px] font-medium text-amber-100/90">
                    CTA: {v.cta}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {signal.budgetChanges && signal.budgetChanges.length > 0 && <BudgetTable changes={signal.budgetChanges} />}

      {/* Agent action indicator */}
      <div className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3 text-[11px] text-white/40">
        ℹ️ Onayladığınızda bu kampanya analizi Google Ads entegrasyonuna iletilir.
      </div>
    </div>
  );
}

function BudgetTable({ changes }: { changes: ArtifactBudgetChange[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/25">
      <div className="border-b border-white/8 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Budget redistribution</p>
      </div>
      <div className="divide-y divide-white/5">
        {changes.slice(0, 6).map((change) => {
          const delta = change.recommended - change.current;
          const tone: Tone = delta > 0 ? 'emerald' : delta < 0 ? 'rose' : 'neutral';
          const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
          return (
            <div key={change.name} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{change.name}</p>
                {change.reason && <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/45">{change.reason}</p>}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-white/45">{Math.round(change.current).toLocaleString('tr-TR')}₺</span>
                <span className="text-white/30">→</span>
                <span className="font-semibold text-white">{Math.round(change.recommended).toLocaleString('tr-TR')}₺</span>
                <StatusPill label={`${delta > 0 ? '+' : ''}${Math.round(delta).toLocaleString('tr-TR')}₺`} tone={tone} icon={Icon} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MetricBlock({ metric }: { metric: ArtifactMetric }) {
  const tone = metric.tone ?? 'cyan';
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{metric.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-white">{metric.value}</p>
      {metric.helper && <p className="mt-1 text-[11px] text-white/40">{metric.helper}</p>}
      {metric.trend && (
        <span className={cn(
          'mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
          tone === 'rose' ? 'border-rose-300/20 bg-rose-400/10 text-rose-200' : 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200',
        )}>
          {metric.trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} {metric.trend}
        </span>
      )}
    </div>
  );
}

function ReviewReplyPreview({ signal }: { signal: ArtifactSignal }) {
  const review = signal.review;
  if (!review) return <TextPreview signal={signal} />;
  const stars = Math.max(0, Math.min(5, Math.round(review.rating)));
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-sm font-semibold text-white">
            {review.reviewer.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-white">{review.reviewer}</p>
              <div className="flex items-center gap-0.5 text-amber-300">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={cn('h-3.5 w-3.5', i < stars ? 'fill-current' : 'opacity-25')} />
                ))}
              </div>
              {review.date && <span className="text-[11px] text-white/35">{review.date}</span>}
            </div>
            <p className="mt-3 text-sm leading-6 text-white/65">{review.original}</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.06] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquareReply className="h-4 w-4 text-cyan-200" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/85">AI response draft</p>
          </div>
          {review.tone && <StatusPill label={`${review.tone} tone`} tone="cyan" icon={Mic2} />}
        </div>
        <p className="mt-3 text-sm leading-6 text-white/80">{review.reply || signal.summary}</p>
      </div>
    </div>
  );
}

function AnalyticsReportPreview({ signal }: { signal: ArtifactSignal }) {
  const insights = signal.insights ?? [];
  const metrics = signal.metrics ?? [];
  return (
    <div className="space-y-4">
      {signal.summary && (
        <div className="rounded-2xl border border-indigo-300/15 bg-indigo-400/[0.06] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-100/70">Executive summary</p>
          <p className="mt-2 text-sm leading-6 text-white/80">{signal.summary}</p>
        </div>
      )}
      {metrics.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.slice(0, 6).map((metric) => <MetricBlock key={metric.label} metric={metric} />)}
        </div>
      )}
      {insights.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {insights.slice(0, 6).map((insight, idx) => (
            <div key={idx} className="rounded-2xl border border-white/8 bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{insight.title}</p>
                {insight.metric && <StatusPill label={insight.metric} tone={insight.tone ?? 'cyan'} />}
              </div>
              {insight.description && <p className="mt-2 text-xs leading-5 text-white/50">{insight.description}</p>}
            </div>
          ))}
        </div>
      )}
      {signal.recommendations && signal.recommendations.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Recommendations</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-white/70">
            {signal.recommendations.slice(0, 6).map((rec, idx) => (
              <li key={idx} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TextPreview({ signal }: { signal: ArtifactSignal }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 p-5">
      {signal.summary ? (
        <p className="whitespace-pre-wrap text-sm leading-7 text-white/75">{signal.summary}</p>
      ) : (
        <p className="text-sm text-white/45">
          Bu kayıt için özet veya gövde metni yok. Çıktı boş dönmüş veya ayrıştırılamamış olabilir; görevi yeniden çalıştırmayı veya ham yükü kontrol etmeyi deneyin.
        </p>
      )}
      {signal.bullets && signal.bullets.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {signal.bullets.map((b) => (
            <span key={b} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/65">{b}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main preview switch
// ──────────────────────────────────────────────────────────────────────────────

export function ArtifactPreview({ signal, dense = false }: { signal: ArtifactSignal; dense?: boolean }) {
  switch (signal.kind) {
    case 'instagram_post': return <InstagramPostPreview signal={signal} dense={dense} />;
    case 'instagram_story': return <InstagramStoryPreview signal={signal} dense={dense} />;
    case 'instagram_reel': return <InstagramReelPreview signal={signal} dense={dense} />;
    case 'instagram_plan': return <ContentPlanPreview signal={signal} />;
    case 'ad_campaign':
    case 'ad_creative':
    case 'budget_optimization': return <AdCampaignPreview signal={signal} />;
    case 'review_reply':
    case 'review_analysis': return <ReviewReplyPreview signal={signal} />;
    case 'analytics_report':
    case 'strategy': return <AnalyticsReportPreview signal={signal} />;
    case 'generic':
    default:
      if (previewImageUrl(signal) || signal.videoUrl) {
        return <InstagramPostPreview signal={signal} dense={dense} />;
      }
      return <TextPreview signal={signal} />;
  }
}

// Compact thumb — used inside ArtifactCard list views
const ARTIFACT_CARD_THUMB_H = 'h-[200px]';

function ArtifactThumb({ signal }: { signal: ArtifactSignal }) {
  /** Grid kartları: tek “hero” yüzeyi — telefon çerçevesi iç içe kart hissi veriyordu. Detay/mockup ArtifactPreview modalında. */
  if (
    signal.kind === 'instagram_post' ||
    signal.kind === 'instagram_story' ||
    signal.kind === 'instagram_reel' ||
    (signal.kind === 'generic' && previewImageUrl(signal))
  ) {
    const heroUrl = previewImageUrl(signal);
    const showReelPlay = signal.kind === 'instagram_reel' && !signal.videoUrl;
    if (signal.kind === 'instagram_reel' && signal.videoUrl) {
      return (
        <div className={`relative ${ARTIFACT_CARD_THUMB_H} w-full shrink-0 overflow-hidden bg-black`}>
          <video src={signal.videoUrl} muted playsInline loop className="h-full w-full object-cover" />
        </div>
      );
    }
    if (heroUrl) {
      return (
        <div className={`relative ${ARTIFACT_CARD_THUMB_H} w-full shrink-0 overflow-hidden bg-black`}>
          <img src={heroUrl} alt={signal.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          {signal.canvaDesign?.editUrl && (
            <a
              href={signal.canvaDesign.editUrl}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/55 px-2 py-1 text-[10px] font-semibold text-white shadow-theme-sm backdrop-blur transition hover:bg-black/70"
              onClick={(e) => e.stopPropagation()}
              aria-label="Open Canva design"
            >
              <Sparkles className="h-3 w-3" />
              Canva
            </a>
          )}
          {showReelPlay && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15">
              <div className="rounded-full border border-white/25 bg-black/40 p-3 backdrop-blur">
                <Play className="h-6 w-6 text-white" />
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        className={cn(
          `relative flex ${ARTIFACT_CARD_THUMB_H} w-full shrink-0 flex-col justify-end overflow-hidden bg-gradient-to-br px-4 pb-3 pt-10`,
          signal.kind === 'instagram_reel'
            ? 'from-violet-500/25 via-black/35 to-cyan-500/20'
            : signal.kind === 'instagram_story'
              ? 'from-violet-500/25 via-black/35 to-rose-500/20'
              : 'from-violet-500/20 via-black/35 to-rose-500/15',
        )}
      >
        <Instagram className="pointer-events-none absolute left-1/2 top-8 h-9 w-9 -translate-x-1/2 text-white/20" />
        {(signal.caption || signal.summary) && (
          <p className="relative line-clamp-4 text-center text-[11px] leading-5 text-white/75">{signal.caption ?? signal.summary}</p>
        )}
      </div>
    );
  }
  if (signal.imageUrl) {
    return <img src={signal.imageUrl} alt={signal.title} className={`${ARTIFACT_CARD_THUMB_H} w-full shrink-0 object-cover`} referrerPolicy="no-referrer" />;
  }
  if (signal.videoUrl) {
    return (
      <div className={`relative flex ${ARTIFACT_CARD_THUMB_H} shrink-0 items-center justify-center bg-gradient-to-br from-violet-500/30 to-cyan-500/30`}>
        <Play className="h-10 w-10 text-white/85" />
        <span className="absolute bottom-3 right-3 rounded-md border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] font-semibold text-white/80">Video</span>
      </div>
    );
  }
  // Tone-driven gradient hero for non-media artifacts
  const palette: Record<ArtifactKind, string> = {
    ad_campaign: 'from-amber-500/30 via-black/30 to-rose-500/15',
    ad_creative: 'from-amber-500/25 via-black/30 to-violet-500/15',
    budget_optimization: 'from-amber-500/30 via-black/30 to-emerald-500/15',
    review_reply: 'from-cyan-500/25 via-black/30 to-emerald-500/15',
    review_analysis: 'from-cyan-500/25 via-black/30 to-rose-500/15',
    analytics_report: 'from-indigo-500/25 via-black/30 to-cyan-500/20',
    strategy: 'from-indigo-500/30 via-black/30 to-violet-500/15',
    instagram_plan: 'from-violet-500/25 via-black/30 to-amber-500/15',
    instagram_post: 'from-violet-500/15 via-black/30 to-rose-500/10',
    instagram_story: 'from-violet-500/30 via-black/30 to-rose-500/15',
    instagram_reel: 'from-violet-500/30 via-black/30 to-cyan-500/15',
    generic: 'from-white/10 via-black/30 to-white/5',
  };
  const Icon: LucideIcon = signal.kind === 'budget_optimization' ? DollarSign
    : signal.kind === 'analytics_report' || signal.kind === 'strategy' ? TrendingUp
    : signal.kind === 'review_reply' || signal.kind === 'review_analysis' ? MessageSquareReply
    : signal.kind === 'ad_campaign' || signal.kind === 'ad_creative' ? Target
    : signal.kind === 'instagram_plan' ? Calendar
    : Sparkles;
  return (
    <div className={cn(`flex ${ARTIFACT_CARD_THUMB_H} w-full shrink-0 items-center justify-center bg-gradient-to-br`, palette[signal.kind])}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-black/35 backdrop-blur">
        <Icon className="h-5 w-5 text-white/85" />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Premium ArtifactCard (10 mandatory fields)
// ──────────────────────────────────────────────────────────────────────────────

export interface ArtifactCardActions {
  onOpen?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  onExecute?: () => void;
  editLabel?: string;
  editBusy?: boolean;
  approveDisabled?: boolean;
  executeDisabled?: boolean;
  approveBusy?: boolean;
  rejectBusy?: boolean;
  executeBusy?: boolean;
}

export function PremiumArtifactCard({
  signal,
  actions,
  selected,
  embedded = false,
  className,
}: {
  signal: ArtifactSignal;
  actions?: ArtifactCardActions;
  selected?: boolean;
  /** When true, renders without an outer Card shell (for nesting inside a parent Card). */
  embedded?: boolean;
  className?: string;
}) {
  const status = signal.status ?? 'draft';
  const tone = statusTone(status);
  const body = (
    <>
      <button type="button" onClick={actions?.onOpen} className="flex min-h-0 flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950">
        <div className="relative shrink-0">
          <ArtifactThumb signal={signal} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/65 to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
            <ArtifactKindBadge kind={signal.kind} />
            <StatusPill label={statusLabel(status)} tone={tone} />
          </div>
          {typeof signal.confidence === 'number' && (
            <div className="absolute right-3 top-3"><ConfidenceBadge value={signal.confidence} /></div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-5 sm:p-6">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 break-words text-base font-semibold leading-6 tracking-[-0.015em] text-gray-800 dark:text-white/90">{signal.title}</p>
              {signal.usageContext && <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{signal.usageContext}</p>}
            </div>
            {signal.risk && <RiskBadge risk={signal.risk} />}
          </div>
          {signal.summary && <p className="line-clamp-3 min-h-0 text-sm leading-6 text-gray-500 dark:text-gray-400">{signal.summary}</p>}
          {(signal.businessImpact || signal.usageContext) && (
            <div className="grid shrink-0 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-[11px] leading-5 text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
              {signal.businessImpact && (
                <div className="flex gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-light-500" /><span className="line-clamp-2">{signal.businessImpact}</span></div>
              )}
              {signal.usageContext && (
                <div className="flex gap-2"><Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-600 dark:text-orange-400" /><span className="line-clamp-2">{signal.usageContext}</span></div>
              )}
            </div>
          )}
          <div className="mt-auto flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            {signal.agentSource && (
              <span className="inline-flex items-center gap-1"><Bot className="h-3 w-3" />{signal.agentSource}</span>
            )}
            {signal.canvaDesign?.editUrl && (
              <a
                href={signal.canvaDesign.editUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 font-semibold text-brand-500 underline dark:text-brand-400"
              >
                <Sparkles className="h-3 w-3" />
                Canva
              </a>
            )}
            {signal.timestamp && (
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatTimestamp(signal.timestamp)}</span>
            )}
            {signal.executionId != null && String(signal.executionId).length > 0 && (
              <span className="truncate font-mono text-[10px] text-gray-400">
                id:{String(signal.executionId).slice(0, 8)}
              </span>
            )}
          </div>
        </div>
      </button>
      {(actions?.onApprove || actions?.onReject || actions?.onExecute || actions?.onEdit) && (
        <CardFooter className="flex flex-wrap gap-2 bg-gray-50 px-4 py-4 dark:bg-white/[0.02] sm:px-6">
          {actions.onApprove && (
            <ActionButton label={actions.approveBusy ? 'Approving…' : 'Approve'} icon={CheckCircle2} tone="emerald" onClick={actions.onApprove} disabled={actions.approveDisabled || actions.approveBusy} />
          )}
          {actions.onReject && (
            <ActionButton label={actions.rejectBusy ? 'Rejecting…' : 'Reject'} icon={X} tone="rose" onClick={actions.onReject} disabled={actions.rejectBusy} />
          )}
          {actions.onEdit && (
            <ActionButton label={actions.editBusy ? 'Görsel üretiliyor…' : actions.editLabel ?? 'Edit'} icon={Edit3} tone="neutral" onClick={actions.onEdit} disabled={actions.editBusy} />
          )}
          {actions.onExecute && (
            <ActionButton label={actions.executeBusy ? 'Executing…' : 'Execute'} icon={Play} tone="cyan" onClick={actions.onExecute} disabled={actions.executeDisabled || actions.executeBusy} />
          )}
        </CardFooter>
      )}
    </>
  );

  if (embedded) {
    return (
      <div
        className={cn(
          'group relative flex min-h-0 min-w-0 flex-1 flex-col transition-all',
          className,
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <Card
      className={cn(
        'group relative flex h-full min-w-0 flex-col transition-all',
        selected ? 'border-brand-300 shadow-theme-md dark:border-brand-500/40' : 'hover:border-brand-200 hover:shadow-theme-md dark:hover:border-brand-500/30',
        className,
      )}
    >
      {body}
    </Card>
  );
}

function ActionButton({ label, icon: Icon, tone, onClick, disabled }: { label: string; icon: LucideIcon; tone: Tone; onClick?: () => void; disabled?: boolean }) {
  const map: Record<Tone, string> = {
    cyan: 'border-blue-light-200 bg-blue-light-50 text-blue-light-500 hover:bg-blue-light-100 dark:border-blue-light-500/20 dark:bg-blue-light-500/15',
    violet: 'border-brand-200 bg-brand-50 text-brand-500 hover:bg-brand-100 dark:border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-400',
    indigo: 'border-brand-200 bg-brand-50 text-brand-500 hover:bg-brand-100 dark:border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-400',
    emerald: 'border-success-200 bg-success-50 text-success-600 hover:bg-success-100 dark:border-success-500/20 dark:bg-success-500/15 dark:text-success-500',
    amber: 'border-warning-200 bg-warning-50 text-warning-600 hover:bg-warning-100 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-400',
    rose: 'border-error-200 bg-error-50 text-error-600 hover:bg-error-100 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-500',
    neutral: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300',
  };
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={cn('inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold shadow-theme-xs transition disabled:opacity-40', map[tone])}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Work Evidence Timeline
// ──────────────────────────────────────────────────────────────────────────────

export function WorkEvidenceTimeline({ steps }: { steps: ArtifactTimelineStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="space-y-3">
      {steps.map((step, idx) => {
        const tone = step.tone ?? (step.status === 'completed' ? 'emerald' : step.status === 'active' ? 'cyan' : 'neutral');
        const dotMap: Record<Tone, string> = {
          cyan: '#22d3ee',
          violet: '#a78bfa',
          indigo: '#818cf8',
          emerald: '#34d399',
          amber: '#f59e0b',
          rose: '#fb7185',
          neutral: '#a1a1aa',
        };
        const color = dotMap[tone];
        return (
          <div key={`${step.title}-${idx}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 18px ${color}66` }} />
              {idx < steps.length - 1 && <span className="mt-1 h-full min-h-8 w-px bg-white/10" />}
            </div>
            <div className="min-w-0 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-white">{step.title}</p>
                {step.time && <span className="text-[10px] text-white/35">{step.time}</span>}
              </div>
              {step.description && <p className="mt-1 text-xs leading-5 text-white/45">{step.description}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Universal Preview Modal
// ──────────────────────────────────────────────────────────────────────────────

export function ArtifactPreviewModal({
  signal,
  open,
  onClose,
  actions,
  extraSidebar,
}: {
  signal: ArtifactSignal | null;
  open: boolean;
  onClose: () => void;
  actions?: ArtifactCardActions;
  extraSidebar?: ReactNode;
}) {
  if (!open || !signal) return null;

  const status = signal.status ?? 'draft';
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/72 px-3 py-6 backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex max-h-[94vh] w-full max-w-[1520px] flex-col overflow-hidden rounded-[2rem] border border-white/12 bg-[#070912]/96 shadow-[0_60px_180px_rgba(0,0,0,0.6)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ArtifactKindBadge kind={signal.kind} />
              <StatusPill label={statusLabel(status)} tone={statusTone(status)} />
              {signal.risk && <RiskBadge risk={signal.risk} />}
              {signal.confidence !== undefined && <ConfidenceBadge value={signal.confidence} />}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white">{signal.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/40">
              {signal.agentSource && <span className="inline-flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" />{signal.agentSource}</span>}
              {signal.timestamp && <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{formatTimestamp(signal.timestamp)}</span>}
              {signal.executionId != null && String(signal.executionId).length > 0 && (
                <span className="font-mono text-[10px] text-white/35">
                  execution:{String(signal.executionId).slice(0, 10)}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/55 transition hover:bg-white/[0.09] hover:text-white" aria-label="Close preview">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[auto_min(420px,42vw)] lg:justify-center">
          <div className="scrollbar-thin min-w-0 overflow-y-auto bg-black/25 p-6 lg:p-6 xl:p-8">
            <ArtifactPreview signal={signal} />
          </div>

          <aside className="scrollbar-thin space-y-5 overflow-y-auto border-t border-white/8 p-6 lg:border-l lg:border-t-0 lg:pl-5">
            {(signal.businessImpact || signal.usageContext) && (
              <GlassPanel tone="cyan" padding="p-5">
                <SectionHeader title="Neden önemli?" subtitle="Bu çıktının işletmedeki karşılığı." />
                <div className="space-y-3 text-sm leading-6 text-white/72">
                  {signal.businessImpact && (
                    <div className="flex gap-3">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                      <p>{signal.businessImpact}</p>
                    </div>
                  )}
                  {signal.usageContext && (
                    <div className="flex gap-3">
                      <Target className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      <p>{signal.usageContext}</p>
                    </div>
                  )}
                </div>
              </GlassPanel>
            )}

            {signal.bullets && signal.bullets.length > 0 && (
              <GlassPanel tone="violet" padding="p-5">
                <SectionHeader title="Hedef kitle & çerçeve" />
                <div className="flex flex-wrap gap-2">
                  {signal.bullets.map((b) => (
                    <span key={b} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/65">{b}</span>
                  ))}
                </div>
              </GlassPanel>
            )}

            {signal.hashtags && signal.hashtags.length > 0 && (
              <GlassPanel tone="violet" padding="p-5">
                <SectionHeader title="Hashtagler" subtitle="AI tarafından önerilen etiketler." count={signal.hashtags.length} />
                <div className="flex flex-wrap gap-1.5">
                  {signal.hashtags.map((tag, i) => (
                    <span key={`${tag}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/65">
                      <Hash className="h-3 w-3" /> {tag.replace(/^#/, '')}
                    </span>
                  ))}
                </div>
              </GlassPanel>
            )}

            {extraSidebar}

            {(actions?.onApprove || actions?.onReject || actions?.onExecute || actions?.onEdit) && (
              <GlassPanel tone="amber" padding="p-5">
                <SectionHeader title="Sonraki adım" subtitle="Bu çıktıyı onayla, reddet veya görselini yenile." />
                <div className="grid gap-2 sm:grid-cols-2">
                  {actions?.onApprove && (
                    <ActionButton label={actions.approveBusy ? 'Approving…' : 'Approve'} icon={CheckCircle2} tone="emerald" onClick={actions.onApprove} disabled={actions.approveDisabled || actions.approveBusy} />
                  )}
                  {actions?.onReject && (
                    <ActionButton label={actions.rejectBusy ? 'Rejecting…' : 'Reject'} icon={X} tone="rose" onClick={actions.onReject} disabled={actions.rejectBusy} />
                  )}
                  {actions?.onEdit && (
                    <ActionButton label={actions.editBusy ? 'Görsel üretiliyor…' : actions.editLabel ?? 'AI görsel üret'} icon={Edit3} tone="violet" onClick={actions.onEdit} disabled={actions.editBusy} />
                  )}
                  {actions?.onExecute && (
                    <ActionButton label={actions.executeBusy ? 'Executing…' : 'Execute'} icon={Play} tone="cyan" onClick={actions.onExecute} disabled={actions.executeDisabled || actions.executeBusy} />
                  )}
                </div>
              </GlassPanel>
            )}

          </aside>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Quick-look subcomponents (re-exports for ergonomics)
// ──────────────────────────────────────────────────────────────────────────────

export const PreviewIcons = { Volume2 };
