'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Calendar, CheckCircle2, ExternalLink, Instagram, ListFilter, Loader2, PenTool, Send, Sparkles, X } from 'lucide-react';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { apiClient } from '@/lib/api-client';
import type { CompanyProfile, OutputArtifact, SuggestedActionDto, TenantMediaAsset } from '@/types';
import Button from '@/components/tailadmin/Button';
import { Card } from '@/components/tailadmin/Card';
import { cn } from '@/lib/utils';
import TextArea from '@/tailadmin/components/form/input/TextArea';
import Input from '@/tailadmin/components/form/input/InputField';
import {
  EmptyState,
  GlassPanel,
  LoadingSkeleton,
  MetricsGrid,
  MetricCard,
  SectionHeader,
  StatusPill,
} from '@/tailadmin/components/application/PageElements';
import {
  ArtifactPreviewModal,
  PremiumArtifactCard,
  type ArtifactIdea,
  type ArtifactKind,
  type ArtifactSignal,
  signalFromAction,
  signalFromArtifact,
} from '@/components/artifacts/artifact-preview';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { CanvaTemplateDecisionInput } from '@/lib/canva-template-selection';

const CONTENT_FILTER_SELECT_CLASS =
  'h-10 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90';

const CONTENT_FILTER_KIND_BASE: { value: string; label: string }[] = [
  { value: 'instagram_post', label: 'Instagram post' },
  { value: 'instagram_story', label: 'Instagram story' },
  { value: 'instagram_reel', label: 'Instagram reel' },
  { value: 'instagram_plan', label: 'İçerik planı' },
  { value: 'generic', label: 'Blog / genel' },
];

const CONTENT_FILTER_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tüm durumlar' },
  { value: 'draft', label: 'Taslak' },
  { value: 'needs_approval', label: 'Onay bekliyor' },
  { value: 'approved', label: 'Onaylı' },
  { value: 'executed', label: 'Yayında' },
  { value: 'rejected', label: 'Reddedildi' },
];

const CONTENT_FILTER_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tüm kaynaklar' },
  { value: 'ai', label: 'AI artifact' },
  { value: 'action', label: 'Önerilen aksiyon' },
];

const CONTENT_FILTER_RISK_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tüm riskler' },
  { value: 'low', label: 'Düşük' },
  { value: 'medium', label: 'Orta' },
  { value: 'high', label: 'Yüksek' },
];

interface ContentItem {
  key: string;
  signal: ArtifactSignal;
  artifact?: OutputArtifact;
  action?: SuggestedActionDto;
  idea?: ArtifactIdea;
  parentTitle?: string;
  parentArtifactId?: string;
  parentActionId?: string;
  visualPrompt?: string;
  campaignContext?: string;
  publishSlot?: string;
  source: 'ai' | 'action';
}

interface CanvaDesignResult {
  designId?: string;
  jobId?: string;
  status?: string;
  templateTitle?: string;
  score?: number;
  eligibility?: CanvaTemplateMatch['eligibility'];
  riskTier?: CanvaTemplateMatch['riskTier'];
  approvalRequired?: boolean;
  editUrl?: string;
  thumbnailUrl?: string;
  exportUrl?: string;
  permanentPreviewUrl?: string;
  exportStatus?: string;
}

interface CanvaApiDesign {
  id?: string;
  url?: string;
  urls?: { edit_url?: string; view_url?: string };
  thumbnail?: { url?: string };
}

interface CanvaAutofillApiResult {
  decision?: {
    template?: { id?: string; title?: string };
    score?: number;
    eligibility?: CanvaTemplateMatch['eligibility'];
    riskTier?: CanvaTemplateMatch['riskTier'];
    approvalRequired?: boolean;
    blockedReasons?: string[];
    policyWarnings?: string[];
    missingFields?: string[];
    missingAssetIntents?: string[];
    riskSignals?: string[];
  };
  job?: {
    id?: string;
    status?: string;
    result?: { design?: CanvaApiDesign };
  };
  design?: CanvaApiDesign;
}

interface CanvaStatus {
  connected: boolean;
  templateCount: number;
  templates: Array<{ id: string; title: string }>;
  connectUrl?: string;
  error?: string;
}

interface CanvaTemplateMatch {
  template?: {
    id: string;
    title: string;
    contentKinds?: string[];
    objectives?: string[];
    aspectRatio?: string;
    previewUrl?: string;
    previewUpdatedAt?: string;
    previewStale?: boolean;
  };
  score?: number;
  eligibility?: 'eligible' | 'needs_setup' | 'blocked';
  riskTier?: 'low' | 'medium' | 'high' | 'blocked';
  approvalRequired?: boolean;
  reasons?: string[];
  blockedReasons?: string[];
  policyWarnings?: string[];
  missingFields?: string[];
  missingAssetIntents?: string[];
  requiredAssetIntents?: string[];
  riskSignals?: string[];
  filledFields?: string[];
  validationWarnings?: string[];
  /** Şablona gönderilecek autofill — Canva API ile uyumlu */
  autofillData?: Record<string, { type: 'text'; text: string } | { type: 'image'; asset_id: string }>;
  /** Brand template dataset alan adları (boş değerli tanımlar dahil) */
  templateDatasetKeys?: string[];
}

interface CanvaTemplateMatchResponse {
  matches: Record<string, CanvaTemplateMatch | null>;
  templateCount: number;
  error?: string;
}

interface WeeklyContentStrategy {
  weeklyTheme: string;
  missionBrief: string;
  missingQuestion: string;
  readyForGramMaster: boolean;
  recommendedFormats: string[];
  templateUseCases: string[];
  assetIntents: string[];
}

const CONTENT_KINDS = new Set<ArtifactKind>([
  'instagram_post',
  'instagram_story',
  'instagram_reel',
  'instagram_plan',
  'generic',
]);
const AUTO_GRID_VISUAL_LIMIT = 0;

async function fetchCanvaStatus(tenantId: string, officeId: string): Promise<CanvaStatus> {
  const response = await fetch(`/api/canva/status?${new URLSearchParams({ tenantId, officeId })}`);
  const result = await response.json() as CanvaStatus;
  if (!response.ok) {
    return {
      connected: false,
      templateCount: 0,
      templates: [],
      connectUrl: result.connectUrl ?? '/api/canva/oauth/login',
      error: result.error ?? 'Canva bağlantı durumu alınamadı.',
    };
  }
  return result;
}

async function fetchCanvaTemplateMatches(
  items: ContentItem[],
  brandContext: string | undefined,
  tenantId: string,
  officeId: string,
): Promise<CanvaTemplateMatchResponse> {
  const response = await fetch('/api/canva/template-matches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      officeId,
      items: items
        .filter((item) => canUseCanvaTemplate(item.signal))
        .map((item) => ({
          key: item.key,
          signal: signalToCanvaInput(item.signal, item, brandContext),
        })),
    }),
  });
  const result = await response.json() as CanvaTemplateMatchResponse;
  if (!response.ok) {
    return { matches: {}, templateCount: 0, error: result.error ?? 'Canva template eşleşmeleri alınamadı.' };
  }
  return result;
}

function designUrl(design?: CanvaApiDesign) {
  return design?.url ?? design?.urls?.edit_url;
}

function designThumbnailUrl(design?: CanvaApiDesign) {
  return design?.thumbnail?.url;
}

function isContentArtifact(artifact: OutputArtifact): boolean {
  const signal = signalFromArtifact(artifact);
  if (!CONTENT_KINDS.has(signal.kind)) return false;
  const blob = [
    signal.kind,
    signal.title,
    signal.summary,
    signal.caption,
    signal.usageContext,
    artifact.artifactType,
    artifact.type,
    artifact.content,
  ]
    .join(' ')
    .toLowerCase();
  return /instagram|content|caption|post|story|reel|calendar|blog|social|creative/.test(blob);
}

function isContentAction(action: SuggestedActionDto): boolean {
  const signal = signalFromAction(action);
  if (!CONTENT_KINDS.has(signal.kind)) return false;
  const blob = [
    signal.kind,
    signal.title,
    signal.summary,
    signal.caption,
    signal.usageContext,
    action.artifactTitle,
    action.actionType,
    action.provider,
    action.payload,
  ]
    .join(' ')
    .toLowerCase();
  return /instagram|content|caption|post|story|reel|calendar|blog|social|creative/.test(blob);
}

function canGenerateVisual(signal: ArtifactSignal): boolean {
  if (signal.kind === 'instagram_post' || signal.kind === 'instagram_story' || signal.kind === 'instagram_plan') return true;
  if (signal.kind !== 'generic') return false;
  const t = `${signal.title ?? ''} ${signal.summary ?? ''} ${signal.usageContext ?? ''}`.toLowerCase();
  return /\bvisual\s+design\b/.test(t) || /\bvisual\s+card\b/.test(t);
}

function canGenerateReel(signal: ArtifactSignal): boolean {
  return signal.kind === 'instagram_reel';
}

function canUseCanvaTemplate(signal: ArtifactSignal): boolean {
  return signal.kind === 'instagram_post' ||
    signal.kind === 'instagram_story' ||
    signal.kind === 'instagram_reel' ||
    signal.kind === 'ad_campaign' ||
    signal.kind === 'ad_creative' ||
    signal.kind === 'generic';
}

function kindFromContentType(value?: string): ArtifactKind {
  const normalized = value?.toLowerCase() ?? '';
  if (normalized.includes('story')) return 'instagram_story';
  if (normalized.includes('reel') || normalized.includes('video')) return 'instagram_reel';
  if (normalized.includes('plan') || normalized.includes('calendar')) return 'instagram_plan';
  return 'instagram_post';
}

function labelFromContentType(value?: string) {
  const kind = kindFromContentType(value);
  if (kind === 'instagram_story') return 'Story';
  if (kind === 'instagram_reel') return 'Reel';
  if (kind === 'instagram_plan') return 'Plan';
  return 'Post';
}

function stripHashTag(tag: string) {
  return tag.replace(/#/g, '').trim();
}

function signalToCanvaInput(signal: ArtifactSignal, item?: ContentItem, brandContext?: string): CanvaTemplateDecisionInput {
  return {
    kind: signal.kind,
    headline: signal.headline ?? item?.idea?.headline,
    title: signal.title,
    summary: signal.summary,
    caption: signal.caption,
    canvaFieldCopy: { ...signal.canvaFieldCopy, ...item?.idea?.canvaFieldCopy },
    cta: signal.cta ?? item?.idea?.cta,
    templateUseCase: signal.templateUseCase ?? item?.idea?.templateUseCase,
    assetIntent: signal.assetIntent ?? item?.idea?.assetIntent,
    hashtags: signal.hashtags,
    usageContext: [
      brandContext,
      signal.templateUseCase ?? item?.idea?.templateUseCase ? `Template use-case: ${signal.templateUseCase ?? item?.idea?.templateUseCase}` : undefined,
      signal.assetIntent ?? item?.idea?.assetIntent ? `Asset intent: ${signal.assetIntent ?? item?.idea?.assetIntent}` : undefined,
      item?.campaignContext ?? signal.usageContext,
    ].filter(Boolean).join('\n\n'),
    businessImpact: signal.businessImpact,
    date: signal.eventDate ?? item?.idea?.eventDate,
    location: signal.location ?? item?.idea?.location,
    preferredAspectRatio: signal.kind === 'instagram_story' || signal.kind === 'instagram_reel' ? '9:16' : '1:1',
  };
}

function normalizeVisualKey(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[·•–—-]/g, '-')
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ:.\s-]/gi, '')
    .trim();
}

function ideaDisplayTitle(idea: ArtifactIdea, index: number) {
  const contentType = labelFromContentType(idea.contentType);
  const publishSlot = idea.postingTime || `Gün ${index + 1}`;
  const title = idea.title?.trim() || `${contentType} fikri ${index + 1}`;
  return `${publishSlot} · ${title}`;
}

function describeIdea(idea: ArtifactIdea, index: number) {
  return [
    `${index + 1}. ${idea.postingTime ? `${idea.postingTime} - ` : ''}${idea.title ?? 'Untitled idea'}`,
    idea.templateUseCase ? `use-case: ${idea.templateUseCase}` : undefined,
    idea.contentType ? `format: ${labelFromContentType(idea.contentType)}` : undefined,
    idea.eventDate ? `date: ${idea.eventDate}` : undefined,
    idea.location ? `location: ${idea.location}` : undefined,
    idea.cta ? `cta: ${idea.cta}` : undefined,
    idea.assetIntent ? `asset: ${idea.assetIntent}` : undefined,
    idea.caption ? `story: ${idea.caption}` : undefined,
    idea.visualDirection ? `visual: ${idea.visualDirection}` : undefined,
    idea.purpose ? `purpose: ${idea.purpose}` : undefined,
    idea.engagement ? `engagement: ${idea.engagement}` : undefined,
    idea.hashtags?.length ? `themes: ${idea.hashtags.map(stripHashTag).join(', ')}` : undefined,
  ].filter(Boolean).join(' | ');
}

function campaignContextFor(parent: ArtifactSignal, selectedIndex?: number) {
  if (!parent.ideas?.length) return undefined;
  const ideas = parent.ideas
    .map((idea, index) => `${index === selectedIndex ? 'SELECTED -> ' : ''}${describeIdea(idea, index)}`)
    .join('\n');

  return [
    `Parent content plan: ${parent.title}`,
    parent.summary ? `Plan summary: ${parent.summary}` : undefined,
    parent.businessImpact ? `Plan business goal: ${parent.businessImpact}` : undefined,
    'Full campaign/story sequence. Use this context for consistency, but generate only the SELECTED item as one raw photograph:',
    ideas,
  ].filter(Boolean).join('\n');
}

function tenantBrandContextFor(profile?: CompanyProfile): string | undefined {
  if (!profile) return undefined;
  const parts = [
    profile.brandName ? `Brand: ${profile.brandName}` : undefined,
    profile.industry ? `Industry: ${profile.industry}` : undefined,
    profile.location ? `Market/location: ${profile.location}` : undefined,
    profile.brandTone ? `Voice/tone: ${profile.brandTone}` : undefined,
    profile.targetAudience ? `Target audience: ${profile.targetAudience}` : undefined,
    profile.visualStyle ? `Visual style: ${profile.visualStyle}` : undefined,
    profile.primaryFont ? `Primary font: ${profile.primaryFont}` : undefined,
    profile.secondaryFont ? `Secondary font: ${profile.secondaryFont}` : undefined,
    profile.brandColors ? `Brand colors: ${profile.brandColors}` : undefined,
    profile.accentColors ? `Accent colors: ${profile.accentColors}` : undefined,
    profile.socialTemplateStyle ? `Social template style: ${profile.socialTemplateStyle}` : undefined,
    profile.logoUsageRules ? `Logo usage rules: ${profile.logoUsageRules}` : undefined,
    profile.campaignGoals ? `Campaign goals: ${profile.campaignGoals}` : undefined,
    profile.customRules ? `Brand rules: ${profile.customRules}` : undefined,
    profile.brandAnalysis ? `Learned brand analysis: ${profile.brandAnalysis}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? `Tenant brand memory:\n${parts.join('\n')}` : undefined;
}

function contentPillarsFor(profile?: CompanyProfile): string[] {
  const analysis = profile?.brandAnalysis ?? '';
  const pillarLine = analysis
    .split(/\n/)
    .find((line) => /content pillars?|içerik pillar|içerik sütun/i.test(line));
  const fromAnalysis = pillarLine
    ?.replace(/^[^:：-]+[:：-]\s*/, '')
    .split(/[,;|]/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

  if (fromAnalysis?.length) return fromAnalysis.slice(0, 6);

  const goals = profile?.campaignGoals
    ?.split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3) ?? [];

  return [
    ...goals,
    'brand story',
    'product/service showcase',
    'social proof',
    'conversion CTA',
  ].slice(0, 6);
}

function buildAutonomousWeeklyBrief(profile?: CompanyProfile) {
  const pillars = contentPillarsFor(profile);
  return [
    'Haftalık Instagram planını tenant content pillarlarına göre otomatik üret.',
    `Content pillars: ${pillars.join(', ')}`,
    profile?.campaignGoals ? `Business goals: ${profile.campaignGoals}` : undefined,
    profile?.location ? `Location fallback: ${profile.location}` : undefined,
    'Eksik bilgi yoksa post/story/reel fikirlerini Canva autofill için eksiksiz alanlarla hazırla.',
    'Eksik kritik bilgi varsa sadece tek bir missing_questions sorusu döndür.',
  ].filter(Boolean).join('\n');
}

function firstAutonomyQuestion(item: ContentItem, match?: CanvaTemplateMatch | null) {
  const ideaQuestion = item.idea?.missingQuestions?.[0];
  if (ideaQuestion) return ideaQuestion;

  const blockedReason = match?.blockedReasons?.[0];
  if (blockedReason) return `Canva üretimi policy tarafından durduruldu: ${blockedReason}`;

  const missingField = match?.missingFields?.[0];
  if (missingField) {
    if (missingField.includes('date')) return 'Bu duyuru için hangi tarih kullanılmalı?';
    if (missingField.includes('location')) return 'Bu içerikte hangi mekan/lokasyon gösterilmeli?';
    if (missingField.includes('image')) return 'Bu içerik için hangi onaylı görsel kullanılmalı veya AI görsel üretimine izin var mı?';
    if (missingField.includes('cta')) return 'Bu içerik için kullanılacak kısa CTA ne olmalı?';
    return `Canva tasarımı için "${missingField}" alanı gerekiyor. Ne kullanmalıyız?`;
  }

  const missingAssetIntent = match?.missingAssetIntents?.[0];
  if (missingAssetIntent) {
    return `Canva tasarımı için "${missingAssetIntent}" asset'i gerekiyor. Hangi onaylı asset kullanılmalı?`;
  }

  return undefined;
}

function canvaRiskTone(riskTier?: string): 'emerald' | 'amber' | 'rose' | 'cyan' {
  if (riskTier === 'high' || riskTier === 'blocked') return 'rose';
  if (riskTier === 'medium') return 'amber';
  if (riskTier === 'low') return 'emerald';
  return 'cyan';
}

function canvaEligibilityTone(eligibility?: string): 'emerald' | 'amber' | 'rose' | 'cyan' {
  if (eligibility === 'blocked') return 'rose';
  if (eligibility === 'needs_info' || eligibility === 'needs_approval') return 'amber';
  if (eligibility === 'eligible') return 'emerald';
  return 'cyan';
}

function formatDecisionLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function latestWeeklyStrategy(actions: SuggestedActionDto[]): SuggestedActionDto | undefined {
  return actions
    .filter((action) => action.actionType === 'create_weekly_content_strategy')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function parseWeeklyStrategy(action?: SuggestedActionDto): WeeklyContentStrategy | null {
  if (!action) return null;
  let payload: Record<string, any> = {};
  try {
    payload = typeof action.payload === 'string' ? JSON.parse(action.payload) : action.payload;
  } catch {
    payload = {};
  }
  const rendered = (action.renderedPreview ?? {}) as Record<string, any>;
  const missionBrief = String(payload.mission_brief ?? rendered.missionBrief ?? rendered.caption ?? '').trim();
  if (!missionBrief) return null;
  return {
    weeklyTheme: String(payload.weekly_theme ?? rendered.weeklyTheme ?? rendered.title ?? 'Haftalık içerik stratejisi'),
    missionBrief,
    missingQuestion: String(payload.missing_question ?? rendered.missingQuestion ?? '').trim(),
    readyForGramMaster: Boolean(payload.ready_for_gram_master ?? rendered.readyForGramMaster ?? true),
    recommendedFormats: Array.isArray(payload.recommended_formats) ? payload.recommended_formats.map(String) : [],
    templateUseCases: Array.isArray(payload.template_use_cases) ? payload.template_use_cases.map(String) : [],
    assetIntents: Array.isArray(payload.asset_intents) ? payload.asset_intents.map(String) : [],
  };
}

// ── Reel Video Player with lightbox ──────────────────────────────────────────
function ReelVideoPlayer({ src }: { src: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Thumbnail player — contained portrait, tappable to expand */}
      <div
        className="relative overflow-hidden rounded-2xl cursor-pointer group"
        style={{ background: '#000', maxWidth: 200, margin: '0 auto' }}
        onClick={() => setOpen(true)}
      >
        <video
          src={src}
          muted
          playsInline
          loop
          autoPlay
          className="w-full"
          style={{ display: 'block', aspectRatio: '9/16', objectFit: 'contain' }}
        />
        {/* Expand hint */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
          style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="rounded-full bg-white/20 p-2 backdrop-blur">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Lightbox — full portrait view */}
      {open && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Portrait container — max height 90vh */}
            <div
              className="overflow-hidden rounded-2xl shadow-2xl"
              style={{ maxHeight: '88vh', aspectRatio: '9/16', background: '#000' }}
            >
              <video
                src={src}
                controls
                playsInline
                loop
                autoPlay
                style={{ height: '88vh', width: 'auto', display: 'block', objectFit: 'contain' }}
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-2 text-[12px] font-semibold text-white/60 hover:text-white transition"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              ✕ Kapat
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Tokenise text into meaningful words (3+ chars, no stopwords). */
function tokenise(text: string): string[] {
  const stopwords = new Set(['the','and','for','are','was','with','this','that','from','have','bir','bu','ve','için','ile','de','da','den','dan','bir','çok','daha','olan','olan','post','story','reel','içerik','content']);
  return text.toLowerCase().split(/\W+/).filter((w) => w.length >= 3 && !stopwords.has(w));
}

/** Count overlapping tokens between two token sets. */
function tokenOverlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((t) => setB.has(t)).length;
}

// TR↔EN product synonym pairs — bidirectional expansion
// Ensures "zeytinyağı" in content matches "olive oil" in gallery tags and vice versa
const PRODUCT_SYNONYMS: Array<[string, string[]]> = [
  ['zeytinyağı', ['olive oil', 'oliveoil', 'zeytin']],
  ['bal',        ['honey', 'bees']],
  ['badem',      ['almond', 'almonds']],
  ['incir',      ['fig', 'figs']],
  ['peynir',     ['cheese']],
  ['reçel',      ['jam', 'preserve', 'marmalade']],
  ['pekmez',     ['molasses', 'grape molasses']],
  ['turşu',      ['pickle', 'pickled']],
  ['lokum',      ['turkish delight', 'delight']],
  ['lavanta',    ['lavender']],
  ['çikolata',   ['chocolate']],
  ['kahve',      ['coffee']],
  ['çay',        ['tea']],
  ['şarap',      ['wine']],
  ['rakı',       ['raki']],
  ['tereyağı',   ['butter']],
  ['yoğurt',     ['yogurt', 'yoghurt']],
];

function expandWithSynonyms(tokens: string[]): string[] {
  const expanded = [...tokens];
  for (const [tr, en] of PRODUCT_SYNONYMS) {
    if (tokens.includes(tr)) { expanded.push(...en.flatMap(e => e.split(' '))); }
    if (en.some(e => tokens.some(t => e.split(' ').includes(t)))) { expanded.push(tr); }
  }
  return expanded;
}

/** Stable URL identity for matching Brand Hub assets to gallery lists. */
function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    let p = u.pathname.replace(/\/$/, '');
    if (p === '') p = '/';
    return `${u.origin}${p}`.toLowerCase();
  } catch {
    const s = (url.trim().split('?')[0] ?? '').replace(/\/$/, '');
    return s.toLowerCase();
  }
}

function findTenantAssetByUrl(assets: TenantMediaAsset[], url: string): TenantMediaAsset | undefined {
  const key = normalizeUrlKey(url);
  return assets.find((a) => a.url && normalizeUrlKey(a.url) === key);
}

/** Deterministic index for tie-breaking so each content card can prefer a different gallery photo. */
function stableIndexFromSeed(seed: string, mod: number): number {
  if (mod <= 0) return 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % mod;
}

/** Approved Brand Hub asset roles that may be used as real-photo references (excludes logo). */
const BRAND_HUB_GALLERY_ASSET_TYPES = new Set([
  'venue_reference',
  'hero_image',
  'brand_background',
  'product_image',
  'venue_photo',
  'artist_photo',
  'team_photo',
]);

/**
 * Score a gallery photo against a content item.
 * Uses full semantic text matching: content caption/title/tags vs photo description/tags.
 * Works for ANY industry — no hardcoded keywords.
 */
type GalleryCache = Record<string, { contentTags: string[]; description: string; usageContext: string; suggestedAssetType: string; bestFor: string[] }>;

function scorePhotoForContent(
  url: string,
  asset: TenantMediaAsset | undefined,
  item: ContentItem,
  galleryCache?: GalleryCache,
): number {
  let score = asset?.priority ?? 0;
  const filename = url.split('/').pop()?.toLowerCase() ?? '';
  const assetType = asset?.assetType ?? '';

  // ── Hard penalties first ────────────────────────────────────────────────
  if (/logo/.test(filename) || assetType === 'logo') return -100;

  // ── Merge .NET asset data with Python gallery analysis cache ─────────────
  // Python cache has REAL semantic tags; .NET has only "source:discovery"
  const cached = galleryCache?.[url];
  const mergedTags = [asset?.tags, cached?.contentTags?.join(', ')].filter(Boolean).join(', ');
  const mergedDescription = cached?.description || asset?.description || '';
  const mergedUsageContext = cached?.usageContext || asset?.usageContext || '';
  const mergedAssetType = cached?.suggestedAssetType || assetType;

  const hasAnalysis = !!(mergedTags.replace('source:discovery', '').replace('auto_import', '').trim() || mergedDescription || mergedUsageContext);
  if (!hasAnalysis) score -= 200;

  // ── Build content signal (everything Gram Master produced) ──────────────
  const contentText = [
    item.idea?.title,
    item.signal.title,
    item.signal.caption,
    item.signal.summary,
    item.idea?.visualDirection,
    item.idea?.templateUseCase?.replace(/_/g, ' '),
    item.idea?.assetIntent?.replace(/_/g, ' '),
    ...(item.signal.hashtags ?? []),
  ].filter(Boolean).join(' ');
  const contentTokensRaw = tokenise(contentText);
  const contentTokens = expandWithSynonyms(contentTokensRaw);

  // ── Photo metadata — merged .NET + Python gallery cache ──────────────────
  const photoText = [mergedDescription, mergedTags, mergedUsageContext].filter(Boolean).join(' ');
  const photoTokensRaw = tokenise(photoText);
  const photoTokens = expandWithSynonyms(photoTokensRaw);

  const bestFor = cached?.bestFor ?? [];

  if (hasAnalysis && photoTokens.length > 0) {
    // ── Primary: semantic text overlap with synonym expansion ─────────────
    const overlap = tokenOverlap(contentTokens, photoTokens);
    score += overlap * 25;

    // ── bestFor exact match — strongest signal ───────────────────────────
    const useCase = (item.idea?.templateUseCase ?? '').replace(/_/g, ' ').toLowerCase();
    const assetIntent = (item.idea?.assetIntent ?? '').replace(/_/g, ' ').toLowerCase();
    if (bestFor.some((bf) => bf.toLowerCase().includes(useCase))) score += 80;
    if (bestFor.some((bf) => bf.toLowerCase().includes(assetIntent))) score += 60;

    // ── Use-case in usageContext ─────────────────────────────────────────
    if (useCase && mergedUsageContext.toLowerCase().includes(useCase)) score += 50;

    // ── Asset type match ─────────────────────────────────────────────────
    if (assetIntent && mergedAssetType === assetIntent) score += 80;
    if (assetIntent && mergedTags.toLowerCase().includes(assetIntent)) score += 40;

    // ── Story: prefer portrait/vertical ─────────────────────────────────
    if (item.signal.kind === 'instagram_story') {
      if (mergedTags.toLowerCase().includes('portrait') || mergedTags.toLowerCase().includes('vertical')) score += 20;
    }

  } else {
    // ── Fallback: filename + assetType heuristics (no analysis data yet) ──
    // Still use content token overlap against filename
    const filenameTokens = tokenise(filename.replace(/[-_.]/g, ' '));
    const filenameOverlap = tokenOverlap(contentTokens, filenameTokens);
    score += filenameOverlap * 10;

    // AssetType matching
    const assetIntent = (item.idea?.assetIntent ?? '').toLowerCase();
    if (assetIntent && assetType === assetIntent) score += 80;

    const useCase = (item.idea?.templateUseCase ?? '').toLowerCase();
    const isFood = ['menu_share','product_highlight'].includes(useCase) || assetIntent === 'product_image';
    const isEvent = useCase === 'event_announcement';
    const isVenue = ['behind_the_scenes','daily_story','campaign_offer'].includes(useCase) || assetIntent === 'venue_photo';

    if (isFood && assetType === 'product_image') score += 60;
    if (isFood && /res|food|menu|drink|bar/.test(filename)) score += 40;
    if (isEvent && assetType === 'artist_photo') score += 60;
    if (isVenue && /venue_reference|hero_image|venue_photo/.test(assetType)) score += 50;
    if (isVenue && /slider|outdoor|terrace|beach|pool|exterior/.test(filename)) score += 35;
  }

  return score;
}

/**
 * Pick the best Brand Hub / gallery reference for this card, with spread across ties and rotation on re-click.
 */
function pickGalleryUrlForEnhance(opts: {
  urls: string[];
  tenantMediaAssets: TenantMediaAsset[];
  item: ContentItem;
  isProduct: boolean;
  avoidUrl?: string | null;
  peerUsedUrls: Set<string>;
  galleryCache?: GalleryCache;
  /** URLs already used+approved across ALL cards this session — strong penalty */
  usedPhotoUrls?: Set<string>;
}): string | undefined {
  const { urls, tenantMediaAssets, item, isProduct, avoidUrl, peerUsedUrls, galleryCache, usedPhotoUrls } = opts;
  if (!urls.length) return undefined;

  const avoidKey = avoidUrl ? normalizeUrlKey(avoidUrl) : '';

  if (isProduct) {
    const productAsset = tenantMediaAssets.find(
      (a) =>
        a.assetType === 'product_image' &&
        a.isApproved &&
        a.url &&
        urls.some((u) => normalizeUrlKey(u) === normalizeUrlKey(a.url)),
    );
    if (productAsset?.url) return productAsset.url.trim();
  }

  const scored = urls.map((url) => {
    const asset = findTenantAssetByUrl(tenantMediaAssets, url);
    let score = scorePhotoForContent(url, asset, item, galleryCache);
    const uk = normalizeUrlKey(url);
    if (avoidKey && uk === avoidKey) score -= 260;
    if (peerUsedUrls.has(uk)) score -= 120;   // stronger penalty for cross-card reuse
    if (usedPhotoUrls?.has(uk)) score -= 500; // very strong: already approved elsewhere
    // hasAnalysis check: use merged cache data
    const cached = galleryCache?.[url];
    const hasRealAnalysis = !!(
      cached?.contentTags?.length ||
      cached?.description ||
      (asset?.tags && !asset.tags.includes('source:discovery'))
    );
    return { url: url.trim(), score, hasRealAnalysis };
  });

  scored.sort((a, b) => b.score - a.score);

  // Prefer analyzed photos — but only filter if there are enough to choose from
  const analyzedOnly = scored.filter((s) => s.hasRealAnalysis);
  const candidates = analyzedOnly.length >= 1 ? analyzedOnly : scored;

  if (candidates.length === 0) return undefined;

  const best = candidates[0]?.score ?? 0;
  const tier = candidates.filter((s) => s.score >= best - 28);
  const idx = stableIndexFromSeed(item.key, tier.length);
  const selected = tier[idx]?.url ?? candidates[0]?.url;

  // Always return best available photo — never block the feature
  // Even without analysis, pick the highest scoring gallery photo
  return selected;
}

function visualPromptFor(signal: ArtifactSignal, idea?: ArtifactIdea, campaignContext?: string, brandContext?: string): string {
  const parts = [
    `Creative objective: Produce one raw camera photograph for this content idea. The app will add the social media preview UI later.`,
    brandContext,
    `Scene idea title: ${idea?.title ?? signal.title}`,
    `Crop target for later use: ${labelFromContentType(idea?.contentType ?? signal.kind)}`,
    idea?.postingTime ? `Publishing context for mood only: ${idea.postingTime}` : signal.usageContext ? `Usage context for mood only: ${signal.usageContext}` : undefined,
    idea?.purpose ? `Business purpose: ${idea.purpose}` : signal.businessImpact ? `Business purpose: ${signal.businessImpact}` : undefined,
    idea?.engagement ? `Engagement angle: ${idea.engagement}` : undefined,
    idea?.caption ? `Story meaning to imply visually, not render as text: ${idea.caption}` : signal.caption ? `Story meaning to imply visually, not render as text: ${signal.caption}` : signal.summary ? `Narrative summary for scene choice: ${signal.summary}` : undefined,
    idea?.visualDirection ? `Required photographic scene direction: ${idea.visualDirection}` : undefined,
    campaignContext ? `Campaign context from the full content plan:\n${campaignContext}` : undefined,
    (idea?.hashtags ?? signal.hashtags)?.length ? `Semantic scene cues only: ${(idea?.hashtags ?? signal.hashtags)?.map(stripHashTag).join(', ')}` : undefined,
    `Output expectation: realistic premium editorial photography with natural lighting, authentic human expressions and believable location details.`,
    `Forbidden: typography, hashtags, captions, quote cards, menus, fake UI, phone screens, social media screenshots, collage layouts, posters, app/browser frames or abstract graphics.`,
  ].filter(Boolean);
  return parts.join('\n');
}

function ideaToContentItem({
  parentId,
  parentTitle,
  parent,
  idea,
  index,
  imageUrl,
  videoUrl,
  source,
  artifact,
  action,
  brandContext,
}: {
  parentId: string;
  parentTitle: string;
  parent: ArtifactSignal;
  idea: ArtifactIdea;
  index: number;
  imageUrl?: string;
  videoUrl?: string;
  source: 'ai' | 'action';
  artifact?: OutputArtifact;
  action?: SuggestedActionDto;
  brandContext?: string;
}): ContentItem {
  const contentType = labelFromContentType(idea.contentType);
  const kind = idea.contentKind ?? kindFromContentType(idea.contentType);
  const publishSlot = idea.postingTime || `Gün ${index + 1}`;
  const title = ideaDisplayTitle(idea, index);
  const campaignContext = campaignContextFor(parent, index);
  const signal: ArtifactSignal = {
    ...parent,
    id: `${parentId}:idea:${index}`,
    kind,
    title,
    summary: idea.caption ?? parent.summary,
    caption: idea.caption ?? parent.caption,
    hashtags: idea.hashtags?.length ? idea.hashtags : parent.hashtags,
    cta: idea.cta ?? parent.cta,
    templateUseCase: idea.templateUseCase ?? parent.templateUseCase,
    headline: idea.headline ?? parent.headline ?? idea.title,
    eventDate: idea.eventDate ?? parent.eventDate,
    location: idea.location ?? parent.location,
    assetIntent: idea.assetIntent ?? parent.assetIntent,
    imageUrl: imageUrl ?? null,
    videoUrl: videoUrl ?? parent.videoUrl,
    confidence: parent.confidence,
    risk: kind === 'instagram_story' || kind === 'instagram_reel' ? 'medium' : parent.risk,
    status: parent.status,
    usageContext: `Instagram ${contentType} · ${publishSlot}`,
    businessImpact: idea.visualDirection
      ? `Bu ${contentType.toLowerCase()} için görsel yön: ${idea.visualDirection}`
      : parent.businessImpact ?? `Instagram ${contentType.toLowerCase()} paylaşımı için hazır içerik fikri.`,
    agentSource: parent.agentSource ?? 'Content Agent',
    ideas: undefined,
    rawPayload: undefined,
  };

  return {
    key: signal.id!,
    artifact,
    action,
    parentArtifactId: artifact?.id,
    parentActionId: action?.id,
    source,
    signal,
    idea,
    parentTitle,
    publishSlot,
    campaignContext,
    visualPrompt: visualPromptFor(signal, idea, campaignContext, brandContext),
  };
}

export default function ContentPage() {
  const queryClient = useQueryClient();
  const tenantId = useWorkspaceStore((s) => s.tenantId);
  const officeId = useWorkspaceStore((s) => s.officeId);

  // Check if Meta (Instagram) is connected for this workspace
  const { data: metaStatus } = useQuery({
    queryKey: ['meta-status', tenantId],
    queryFn: async () => {
      if (!tenantId) return { connected: false };
      const res = await fetch(`/api/meta/analytics?workspaceId=${tenantId}`).catch(() => null);
      if (!res?.ok) return { connected: false };
      return res.json() as Promise<{ connected: boolean; ig_username?: string }>;
    },
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
  });
  const igConnected = Boolean(metaStatus?.connected);
  const { data: snapshot, isLoading } = useDashboardSnapshot();
  const { data: actions = [], isLoading: actionsLoading } = useQuery({
    queryKey: ['suggested-actions'],
    queryFn: () => apiClient.getActions(),
    staleTime: 20_000,
    refetchInterval: 45_000,
  });
  const { data: companyProfile } = useQuery<CompanyProfile>({
    queryKey: ['company-profile'],
    queryFn: () => apiClient.getCompanyProfile(),
    staleTime: 120_000,
  });
  const canvaEnabled = process.env.NEXT_PUBLIC_CANVA_ENABLED === 'true';
  const { data: canvaStatus } = useQuery<CanvaStatus>({
    queryKey: ['canva-status', tenantId, officeId],
    queryFn: () => fetchCanvaStatus(tenantId, officeId),
    staleTime: 60_000,
    enabled: canvaEnabled && Boolean(tenantId),
  });
  const { data: tenantMediaAssets = [] } = useQuery({
    queryKey: ['brand-context-assets', tenantId, officeId],
    queryFn: () => apiClient.getTenantMediaAssets({ officeId: officeId || undefined }),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });

  // Gallery analysis cache from Python DB — semantic tags per photo URL
  // This is the REAL data: "outdoor terrace, sea view" not just "source:discovery"
  const { data: pinterestData } = useQuery<{ visual_themes?: string[]; top_pins?: Array<{ title: string; imageUrl: string; saves: number }> } | null>({
    queryKey: ['pinterest-inspiration', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const res = await fetch(`/api/brand-context/${tenantId}/pinterest-inspiration`);
      return res.ok ? res.json() : null;
    },
    enabled: Boolean(tenantId),
    staleTime: 30 * 60_000,
  });

  const { data: galleryAnalysisCache = {} } = useQuery<Record<string, { contentTags: string[]; description: string; usageContext: string; suggestedAssetType: string; bestFor: string[] }>>({
    queryKey: ['gallery-analysis', tenantId],
    queryFn: async () => {
      if (!tenantId) return {};
      const res = await fetch(`/api/brand-context/${tenantId}/gallery-analysis`);
      if (!res.ok) return {};
      const data = await res.json();
      const raw = data.analysis as Record<string, Record<string, unknown>> | undefined;
      if (!raw) return {};
      // Normalize snake_case → camelCase
      return Object.fromEntries(Object.entries(raw).map(([url, v]) => [url, {
        contentTags: (v.content_tags ?? v.contentTags ?? []) as string[],
        description: String(v.description ?? ''),
        usageContext: String(v.usage_context ?? v.usageContext ?? ''),
        suggestedAssetType: String(v.suggested_asset_type ?? v.suggestedAssetType ?? ''),
        bestFor: (v.best_for ?? v.bestFor ?? []) as string[],
      }]));
    },
    enabled: Boolean(tenantId),
    staleTime: 5 * 60_000,
  });

  // Persist generated images to localStorage so they survive navigation/reload
  const [generatedImages, setGeneratedImagesState] = useState<Record<string, string>>(() => {
    try {
      // tenantId not available yet at init — read all keys and merge, filter by prefix on update
      const stored = localStorage.getItem('sa_generated_images');
      return stored ? (JSON.parse(stored) as Record<string, string>) : {};
    } catch { return {}; }
  });
  const setGeneratedImages = (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
    setGeneratedImagesState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('sa_generated_images', JSON.stringify(next)); } catch { /* storage quota */ }
      return next;
    });
  };
  // When true, AI image generation uses a real venue photo as the base (images.edit mode)
  const [useGalleryAsBase, setUseGalleryAsBase] = useState(true);
  /** Last Brand Hub reference URL used per card — persisted so approve works after reload. */
  const [enhanceReferenceUrlByKey, setEnhanceReferenceUrlByKeyState] = useState<Record<string, string>>(() => {
    try {
      const stored = sessionStorage.getItem('sa_enhance_refs');
      return stored ? (JSON.parse(stored) as Record<string, string>) : {};
    } catch { return {}; }
  });
  const setEnhanceReferenceUrlByKey = (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
    setEnhanceReferenceUrlByKeyState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { sessionStorage.setItem('sa_enhance_refs', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  /** Photos already used — persisted in sessionStorage so page reload doesn't reset. */
  const [usedPhotoUrls, setUsedPhotoUrls] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem('sa_used_photos');
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch { return new Set(); }
  });
  /** Reel outputs — persisted to localStorage so videos survive navigation. */
  const [generatedVideos, setGeneratedVideosState] = useState<
    Record<string, { videoUrl: string; runwayPrompt: string; model: string }>
  >(() => {
    try {
      const stored = localStorage.getItem('sa_generated_videos');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const setGeneratedVideos = (
    updater: Record<string, { videoUrl: string; runwayPrompt: string; model: string }> |
             ((prev: Record<string, { videoUrl: string; runwayPrompt: string; model: string }>) =>
               Record<string, { videoUrl: string; runwayPrompt: string; model: string }>)
  ) => {
    setGeneratedVideosState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('sa_generated_videos', JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [generatingEnhancements, setGeneratingEnhancements] = useState<Record<string, boolean>>({});
  const [generatingProductBg, setGeneratingProductBg] = useState<Record<string, boolean>>({});
  const [productBgResults, setProductBgResults] = useState<Record<string, string>>({});
  // Per-card gallery cycle index — each enhance tap advances to the next photo
  const [enhanceCycleIdx, setEnhanceCycleIdx] = useState<Record<string, number>>({});
  const [generatingReels, setGeneratingReels] = useState<Record<string, boolean>>({});
  // Global reel lock — only ONE video can generate at a time (Runway concurrency + credit protection)
  const anyReelGenerating = Object.values(generatingReels).some(Boolean);
  const [generatingVideoPack, setGeneratingVideoPack] = useState<Record<string, boolean>>({});

  type VideoPackRender = { format: string; status: string; output_url: string; width: number; height: number };
  type VideoPackVariants = Record<string, { label: string; description: string; renders: VideoPackRender[] }>;
  const [videoPackResults, setVideoPackResults] = useState<Record<string, Array<VideoPackRender>>>({});
  const [videoPackVariants, setVideoPackVariants] = useState<Record<string, VideoPackVariants>>({});
  const [generatingCanva, setGeneratingCanva] = useState<Record<string, boolean>>({});
  const [canvaDesigns, setCanvaDesigns] = useState<Record<string, CanvaDesignResult>>({});
  const [selectedCanvaTemplateIds, setSelectedCanvaTemplateIds] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autoGridRequested, setAutoGridRequested] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brief, setBrief] = useState('Bu hafta Instagram için 3 post, 2 story fikri üret. Marka tonu premium, net CTA içersin.');
  const [missionModalOpen, setMissionModalOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterKind, setFilterKind] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRisk, setFilterRisk] = useState('');
  const [autonomyRunning, setAutonomyRunning] = useState(false);
  const [autonomyQuestion, setAutonomyQuestion] = useState('');
  const [autonomyMessage, setAutonomyMessage] = useState('');

  const artifacts = snapshot?.artifacts ?? [];
  const contentAgent = snapshot?.agents.find((agent) =>
    ['InstagramContentGenerator', 'SocialMediaDesigner', 'BlogWriter'].includes(agent.backendAgentType)
  );
  const strategyAgent = snapshot?.agents.find((agent) => agent.backendAgentType === 'ContentStrategy');
  const tenantBrandContext = useMemo(() => tenantBrandContextFor(companyProfile), [companyProfile]);
  // Brand logo URL — from approved logo asset or detected by filename
  const brandLogoUrl = useMemo(() => {
    const logoAsset = tenantMediaAssets.find(
      (a) => a.assetType === 'logo' && a.isApproved && a.url?.startsWith('http'),
    );
    if (logoAsset) return logoAsset.url;
    // Fallback: detect logo from all approved assets by filename
    const anyLogoUrl = tenantMediaAssets
      .filter((a) => a.isApproved && a.url?.startsWith('http'))
      .map((a) => a.url)
      .find((u) => /logo/i.test(u.split('/').pop() ?? ''));
    return anyLogoUrl ?? null;
  }, [tenantMediaAssets]);

  const referenceImageUrlsForGeneration = useMemo(() => {
    const galleryTypes = BRAND_HUB_GALLERY_ASSET_TYPES;
    // Ephemeral CDN patterns — these URLs expire and should never be used
    const EPHEMERAL_CDN = /scontent-|cdninstagram\.com|fbcdn\.net|instagram\.fcdn/i;

    // Priority 1: approved tenant media assets (Brand Hub)
    const fromAssets = tenantMediaAssets
      .filter(
        (a) =>
          a.isApproved &&
          a.url &&
          galleryTypes.has(a.assetType),
      )
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map((a) => a.url.trim())
      .filter((u) => u.startsWith('http') && !EPHEMERAL_CDN.test(u));

    // Priority 2: images from brand profile URL field
    const fromProfile = (companyProfile?.brandImageUrls ?? '')
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((u) => u.startsWith('http'));

    // Priority 3: discovery reference images from Python brand analysis
    // Stored in companyProfile.systemIntelligence as JSON array or newline-separated URLs
    const fromDiscovery: string[] = [];
    const sysIntel = companyProfile?.systemIntelligence ?? '';
    if (sysIntel) {
      try {
        const parsed = JSON.parse(sysIntel);
        if (Array.isArray(parsed)) fromDiscovery.push(...parsed.filter((u: unknown) => typeof u === 'string' && u.startsWith('http') && !EPHEMERAL_CDN.test(u)));
      } catch {
        fromDiscovery.push(...sysIntel.split(/[\n,]/).map((s) => s.trim()).filter((u) => u.startsWith('http') && !EPHEMERAL_CDN.test(u)));
      }
    }

    const merged: string[] = [];
    const seen = new Set<string>();
    for (const u of [...fromAssets, ...fromProfile, ...fromDiscovery]) {
      const k = normalizeUrlKey(u);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      // Skip logos in the gallery list
      if (/logo/i.test(u.split('/').pop() ?? '')) continue;
      merged.push(u);
    }
    return merged.slice(0, 24);
  }, [tenantMediaAssets, companyProfile?.brandImageUrls, companyProfile?.systemIntelligence]);
  const latestStrategyAction = useMemo(() => latestWeeklyStrategy(actions), [actions]);
  const weeklyStrategy = useMemo(() => parseWeeklyStrategy(latestStrategyAction), [latestStrategyAction]);

  const contentItems = useMemo<ContentItem[]>(() => {
    const persistedVisualsByTitle = artifacts.reduce<Record<string, string>>((acc, artifact) => {
      const signal = signalFromArtifact(artifact);
      if (!signal.imageUrl) return acc;
      acc[normalizeVisualKey(signal.title)] = signal.imageUrl;
      return acc;
    }, {});

    const aiItems = artifacts
      .filter(isContentArtifact)
      .flatMap((artifact) => {
        const signal = signalFromArtifact(artifact);
        if (signal.kind === 'instagram_plan' && signal.ideas && signal.ideas.length > 0) {
          return signal.ideas.map((idea, index) => {
            const key = `${artifact.id}:idea:${index}`;
            return ideaToContentItem({
              parentId: artifact.id,
              parentTitle: signal.title,
              parent: signal,
              idea,
              index,
              imageUrl: generatedImages[key] ?? persistedVisualsByTitle[normalizeVisualKey(ideaDisplayTitle(idea, index))],
              videoUrl: generatedVideos[key]?.videoUrl,
              source: 'ai',
              artifact,
              brandContext: tenantBrandContext,
            });
          });
        }

        const key = artifact.id;
        return [{
          key,
          artifact,
          source: 'ai' as const,
          signal: {
            ...signal,
            imageUrl: generatedImages[key] ?? signal.imageUrl ?? persistedVisualsByTitle[normalizeVisualKey(signal.title)],
            videoUrl: generatedVideos[key]?.videoUrl ?? signal.videoUrl,
            agentSource: signal.agentSource ?? 'Content Agent',
          },
          campaignContext: campaignContextFor(signal),
          visualPrompt: visualPromptFor(signal, undefined, campaignContextFor(signal), tenantBrandContext),
        }];
      });

    const actionItems = actions
      .filter(isContentAction)
      .flatMap((action) => {
        const signal = signalFromAction(action);
        if (signal.kind === 'instagram_plan' && signal.ideas && signal.ideas.length > 0) {
          return signal.ideas.map((idea, index) => {
            const key = `${action.id}:idea:${index}`;
            return ideaToContentItem({
              parentId: action.id,
              parentTitle: signal.title,
              parent: signal,
              idea,
              index,
              imageUrl: generatedImages[key] ?? persistedVisualsByTitle[normalizeVisualKey(ideaDisplayTitle(idea, index))],
              videoUrl: generatedVideos[key]?.videoUrl,
              source: 'action',
              action,
              brandContext: tenantBrandContext,
            });
          });
        }

        const key = action.id;
        return [{
          key,
          action,
          source: 'action' as const,
          signal: {
            ...signal,
            imageUrl: generatedImages[key] ?? signal.imageUrl ?? persistedVisualsByTitle[normalizeVisualKey(signal.title)],
            videoUrl: generatedVideos[key]?.videoUrl ?? signal.videoUrl,
            agentSource: signal.agentSource ?? 'Content Agent',
          },
          campaignContext: campaignContextFor(signal),
          visualPrompt: visualPromptFor(signal, undefined, campaignContextFor(signal), tenantBrandContext),
        }];
      });

    return [...aiItems, ...actionItems];
  }, [actions, artifacts, generatedImages, generatedVideos, tenantBrandContext]);

  const filteredContentItems = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return contentItems.filter((item) => {
      if (filterSource && item.source !== filterSource) return false;
      if (filterKind && item.signal.kind !== filterKind) return false;
      if (filterStatus && (item.signal.status ?? 'draft') !== filterStatus) return false;
      if (filterRisk && (item.signal.risk ?? '') !== filterRisk) return false;
      if (q) {
        const haystack = [
          item.signal.title,
          item.signal.summary,
          item.signal.caption,
          item.parentTitle,
          item.idea?.title,
          item.idea?.caption,
          item.signal.usageContext,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [contentItems, filterKind, filterRisk, filterSearch, filterSource, filterStatus]);

  const contentKindFilterOptions = useMemo(() => {
    const known = new Map(CONTENT_FILTER_KIND_BASE.map((o) => [o.value, o.label]));
    const extraKinds = [...new Set(contentItems.map((i) => i.signal.kind))]
      .filter((k) => !known.has(k))
      .sort();
    return [
      { value: '', label: 'Tüm formatlar' },
      ...CONTENT_FILTER_KIND_BASE,
      ...extraKinds.map((k) => ({ value: k, label: String(k).replace(/_/g, ' ') })),
    ];
  }, [contentItems]);

  const contentFiltersActive =
    Boolean(filterSearch.trim()) ||
    Boolean(filterSource) ||
    Boolean(filterKind) ||
    Boolean(filterStatus) ||
    Boolean(filterRisk);

  useEffect(() => {
    setSelectedId((current) => {
      if (!current) return current;
      return filteredContentItems.some((item) => item.key === current) ? current : null;
    });
  }, [filteredContentItems]);

  const { data: canvaTemplateMatches } = useQuery<CanvaTemplateMatchResponse>({
    queryKey: [
      'canva-template-matches',
      tenantId,
      officeId,
      contentItems.map((item) => `${item.key}:${item.signal.kind}:${item.signal.title}`).join('|'),
      tenantBrandContext ?? '',
    ],
    queryFn: () => fetchCanvaTemplateMatches(contentItems, tenantBrandContext, tenantId, officeId),
    enabled: canvaEnabled && contentItems.some((item) => canUseCanvaTemplate(item.signal)),
    staleTime: 45_000,
  });

  const selectedItem = contentItems.find((item) => item.key === selectedId) ?? null;
  const selected = selectedItem?.signal ?? null;
  const selectedGenerating = selectedItem ? Boolean(generating[selectedItem.key]) : false;
  const selectedReelGenerating = selectedItem ? Boolean(generatingReels[selectedItem.key]) : false;
  const selectedCanvaResult = selectedItem ? canvaDesigns[selectedItem.key] : undefined;
  const selectedCanvaMatch = selectedItem ? canvaTemplateMatches?.matches[selectedItem.key] : undefined;
  const canvaTemplateOptions = canvaStatus?.templates ?? [];
  const selectedPreviewSignal = selected && selectedCanvaResult
    ? {
        ...selected,
        imageUrl: selectedCanvaResult.thumbnailUrl ?? selected.imageUrl,
        canvaDesign: {
          editUrl: selectedCanvaResult.editUrl,
          thumbnailUrl: selectedCanvaResult.thumbnailUrl,
          templateTitle: selectedCanvaResult.templateTitle,
          score: selectedCanvaResult.score,
          jobId: selectedCanvaResult.jobId,
          status: selectedCanvaResult.status,
        },
      }
    : selected;
  const canvaHasNoTemplates = canvaStatus?.connected === true && canvaStatus.templateCount === 0;

  function selectedCanvaTemplateIdFor(key: string, match?: CanvaTemplateMatch | null) {
    return selectedCanvaTemplateIds[key] || match?.template?.id || '';
  }

  function updateSelectedCanvaTemplate(key: string, templateId: string) {
    setSelectedCanvaTemplateIds((cur) => ({
      ...cur,
      [key]: templateId,
    }));
  }

  // Publish state
  const [publishing, setPublishing] = useState<Record<string, boolean>>({});
  const [publishResults, setPublishResults] = useState<Record<string, { permalink: string; post_id: string }>>({});
  const [scheduling, setScheduling] = useState<Record<string, boolean>>({});
  const [scheduledAt, setScheduledAt] = useState<Record<string, string>>({});

  async function schedulePost(item: ContentItem, platform: 'instagram' | 'facebook') {
    if (!tenantId) return;
    const key = item.key;
    const at = scheduledAt[key];
    if (!at) { setErrors((cur) => ({ ...cur, [key]: 'Zamanlama tarihi seçin.' })); return; }
    const imageUrl = generatedImages[key] ?? item.signal.imageUrl ?? undefined;
    const videoUrl = generatedVideos[key]?.videoUrl ?? item.signal.videoUrl ?? undefined;
    if (!imageUrl && !videoUrl) { setErrors((cur) => ({ ...cur, [key]: 'Görsel veya video gerekli.' })); return; }
    setScheduling((cur) => ({ ...cur, [key]: true }));
    try {
      const publishType = item.signal.kind === 'instagram_reel' ? 'reel'
        : item.signal.kind === 'instagram_story' ? (videoUrl ? 'story_video' : 'story_image') : 'feed_image';
      const res = await fetch('/api/meta/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: tenantId, platform, publish_type: publishType,
          scheduled_at: new Date(at).toISOString(), image_url: imageUrl, video_url: videoUrl,
          caption: item.signal.caption ?? '', hashtags: item.signal.hashtags ?? [],
          artifact_title: item.signal.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Zamanlama başarısız');
      setErrors((cur) => ({ ...cur, [key]: '' }));
      alert(`✓ ${platform === 'instagram' ? 'Instagram' : 'Facebook'} için zamanlandı: ${new Date(at).toLocaleString('tr-TR')}`);
    } catch (err) {
      setErrors((cur) => ({ ...cur, [key]: err instanceof Error ? err.message : 'Zamanlama başarısız' }));
    } finally {
      setScheduling((cur) => ({ ...cur, [key]: false }));
    }
  }

  async function publishToInstagram(item: ContentItem) {
    if (!tenantId) return;
    const key = item.key;
    const signal = item.signal;
    const imageUrl = generatedImages[key] ?? signal.imageUrl ?? undefined;
    const videoUrl = generatedVideos[key]?.videoUrl ?? signal.videoUrl ?? undefined;

    if (!imageUrl && !videoUrl) {
      setErrors((cur) => ({ ...cur, [key]: 'Yayınlamak için önce görsel veya video üretin.' }));
      return;
    }

    const publishType = signal.kind === 'instagram_reel' ? 'reel'
      : signal.kind === 'instagram_story' ? (videoUrl ? 'story_video' : 'story_image')
      : 'feed_image';

    setPublishing((cur) => ({ ...cur, [key]: true }));
    setErrors((cur) => ({ ...cur, [key]: '' }));

    try {
      // Multi-source caption/hashtag — idea → signal → artifact metadata → summary
      const artifactMeta = (item.artifact?.metadata ?? {}) as Record<string, unknown>;
      const publishCaption =
        item.idea?.caption ||
        signal.caption ||
        (artifactMeta.caption as string) ||
        signal.summary ||
        '';
      const publishHashtags: string[] = (
        (item.idea?.hashtags?.length ? item.idea.hashtags : null) ||
        (signal.hashtags?.length ? signal.hashtags : null) ||
        (Array.isArray(artifactMeta.hashtags) ? artifactMeta.hashtags as string[] : null) ||
        []
      );

      const res = await fetch('/api/meta/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: tenantId,
          publish_type: publishType,
          image_url: imageUrl,
          video_url: videoUrl,
          caption: publishCaption,
          hashtags: publishHashtags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Yayınlama başarısız');
      setPublishResults((cur) => ({ ...cur, [key]: { permalink: data.permalink, post_id: data.post_id } }));
      await queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] });
    } catch (error) {
      setErrors((cur) => ({ ...cur, [key]: error instanceof Error ? error.message : 'Yayınlama başarısız' }));
    } finally {
      setPublishing((cur) => ({ ...cur, [key]: false }));
    }
  }

  const scheduled = contentItems.filter((item) => item.signal.status === 'approved' || item.signal.status === 'executed').length;
  const suggested = contentItems.filter((item) => item.signal.status === 'needs_approval').length;
  const drafts = contentItems.filter((item) => item.signal.status === 'draft').length;
  const realCount = contentItems.length;

  const runContentAgent = useMutation({
    mutationFn: (options?: { autonomous?: boolean }) => {
      const autonomous = options?.autonomous === true;
      const activeBrief = autonomous
        ? weeklyStrategy?.missionBrief ?? buildAutonomousWeeklyBrief(companyProfile)
        : brief;
      return apiClient.executeAgent(contentAgent!.apiId, {
      taskType: 'content_ideation',
      inputData: {
        brief: activeBrief,
        count: autonomous ? 7 : 5,
        time_period: 'next week',
        content_pillars: contentPillarsFor(companyProfile),
        autonomy_mode: autonomous,
        strategy_action_id: autonomous ? latestStrategyAction?.id : undefined,
        strategy_weekly_theme: autonomous ? weeklyStrategy?.weeklyTheme : undefined,
        platform: 'instagram',
        output: 'post_story_reel_calendar',
        includeVisualDirections: true,
      },
    });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['ai-control-center'] }),
      ]);
    },
  });

  // Visual design card generation — produces designed social cards with brand photos
  const runVisualDesignAgent = useMutation({
    mutationFn: (designBrief?: string) =>
      apiClient.executeAgent(contentAgent!.apiId, {
        taskType: 'visual_design_cards',
        inputData: {
          brief: designBrief || brief || 'Marka görselleriyle 3 tasarım kartı üret: 1 story kampanyası, 1 feed duyurusu, 1 feed teklifi.',
          count: 3,
          content_pillars: contentPillarsFor(companyProfile),
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['ai-control-center'] }),
      ]);
    },
  });

  const runStrategyAgent = useMutation({
    mutationFn: () => apiClient.executeAgent(strategyAgent!.apiId, {
      taskType: 'content_strategy',
      inputData: {
        brief,
        time_period: 'next week',
        content_pillars: contentPillarsFor(companyProfile),
        platform: 'instagram',
      },
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['suggested-actions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['ai-control-center'] }),
      ]);
    },
  });

  useEffect(() => {
    if (!weeklyStrategy) return;
    if (weeklyStrategy.missingQuestion) {
      setAutonomyQuestion(weeklyStrategy.missingQuestion);
      setAutonomyMessage('Content Strategy Agent tek kritik eksik bilgiyi belirledi.');
      return;
    }
    setBrief(weeklyStrategy.missionBrief);
    setAutonomyQuestion('');
    setAutonomyMessage('Content Strategy Agent mission brief üretti. Gram Master bu brief ile çalışabilir.');
  }, [weeklyStrategy]);

  const approveMutation = useMutation({
    mutationFn: (artifactId: string) => apiClient.approveArtifact(artifactId, 'Approved from Content Studio'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (artifactId: string) => apiClient.rejectArtifact(artifactId, 'Rejected from Content Studio'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
  });

  const approveActionMutation = useMutation({
    mutationFn: (actionId: string) => apiClient.approveAction(actionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['suggested-actions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['ai-control-center'] }),
      ]);
    },
  });

  const rejectActionMutation = useMutation({
    mutationFn: (actionId: string) => apiClient.rejectAction(actionId, 'Rejected from Content Studio'),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['suggested-actions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['ai-control-center'] }),
      ]);
    },
  });

  function approveItem(item: ContentItem) {
    // Block the gallery URL used for this card — it must never appear on another card
    const usedUrl = enhanceReferenceUrlByKey[item.key];
    if (usedUrl) {
      setUsedPhotoUrls((prev) => {
        const next = new Set([...prev, normalizeUrlKey(usedUrl)]);
        try { sessionStorage.setItem('sa_used_photos', JSON.stringify([...next])); } catch { /* ignore */ }
        return next;
      });
    }

    if (item.parentActionId ?? item.action?.id) {
      approveActionMutation.mutate(item.parentActionId ?? item.action!.id);
      return;
    }
    if (item.parentArtifactId ?? item.artifact?.id) {
      approveMutation.mutate(item.parentArtifactId ?? item.artifact!.id);
    }
  }

  function rejectItem(item: ContentItem) {
    if (item.parentActionId ?? item.action?.id) {
      rejectActionMutation.mutate(item.parentActionId ?? item.action!.id);
      return;
    }
    if (item.parentArtifactId ?? item.artifact?.id) {
      rejectMutation.mutate(item.parentArtifactId ?? item.artifact!.id);
    }
  }

  function isApproving(item: ContentItem) {
    return (
      (approveMutation.isPending && approveMutation.variables === (item.parentArtifactId ?? item.artifact?.id)) ||
      (approveActionMutation.isPending && approveActionMutation.variables === (item.parentActionId ?? item.action?.id))
    );
  }

  function isRejecting(item: ContentItem) {
    return (
      (rejectMutation.isPending && rejectMutation.variables === (item.parentArtifactId ?? item.artifact?.id)) ||
      (rejectActionMutation.isPending && rejectActionMutation.variables === (item.parentActionId ?? item.action?.id))
    );
  }

  function startAutonomousWeeklyPlan() {
    setAutonomyQuestion('');
    setAutonomyMessage('Content Strategy Agent tenant pillarlarına göre haftalık mission brief üretiyor.');
    runStrategyAgent.mutate();
  }

  async function continueAutonomousFlow() {
    if (weeklyStrategy?.missingQuestion) {
      setAutonomyQuestion(weeklyStrategy.missingQuestion);
      setAutonomyMessage('Otonom akış durdu; Strategy Agent sadece bu bilgiyi istiyor.');
      return;
    }

    if (weeklyStrategy?.readyForGramMaster && contentItems.length === 0) {
      setBrief(weeklyStrategy.missionBrief);
      setAutonomyMessage('Strategy brief hazır. Gram Master içerik planını üretiyor.');
      runContentAgent.mutate({ autonomous: true });
      return;
    }

    const candidates = contentItems
      .filter((item) => canUseCanvaTemplate(item.signal))
      .slice(0, 7);
    const blocked = candidates
      .map((item) => firstAutonomyQuestion(item, canvaTemplateMatches?.matches[item.key]))
      .find(Boolean);

    if (blocked) {
      setAutonomyQuestion(blocked);
      setAutonomyMessage('Otonom akış durdu; sadece bu bilgi gerekiyor.');
      return;
    }

    setAutonomyRunning(true);
    setAutonomyQuestion('');
    setAutonomyMessage('Eksik bilgi yok. Canva design üretimi ve approval hazırlığı başlatıldı.');
    try {
      for (const item of candidates) {
        if (!canvaDesigns[item.key]) {
          await generateCanvaDesign(item);
        }
      }

      const reviewableParents = new Set<string>();
      candidates.forEach((item) => {
        const parentId = item.parentActionId ?? item.action?.id ?? item.parentArtifactId ?? item.artifact?.id;
        if (parentId) reviewableParents.add(parentId);
      });

      candidates.forEach((item) => {
        const parentId = item.parentActionId ?? item.action?.id ?? item.parentArtifactId ?? item.artifact?.id;
        if (parentId && reviewableParents.has(parentId)) {
          approveItem(item);
          reviewableParents.delete(parentId);
        }
      });
    } finally {
      setAutonomyRunning(false);
    }
  }

  async function generateVisual(item: ContentItem) {
    const key = item.key;
    const format = item.signal.kind === 'instagram_story' ? 'story' : 'post';
    const prompt = item.visualPrompt ?? visualPromptFor(item.signal, item.idea);
    setGenerating((cur) => ({ ...cur, [key]: true }));
    setErrors((cur) => ({ ...cur, [key]: '' }));

    const galleryUrls = useGalleryAsBase ? referenceImageUrlsForGeneration : [];

    try {
      const response = await fetch('/api/generate-instagram-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.signal.title,
          caption: item.signal.caption ?? item.signal.summary,
          concept: prompt,
          campaignContext: item.campaignContext,
          platform: 'instagram',
          contentType: format,
          workspaceId: tenantId,
          brandName: companyProfile?.brandName,
          industry: companyProfile?.industry,
          location: companyProfile?.location,
          description: companyProfile?.description,
          brandTone: companyProfile?.brandTone || 'premium, modern, trustworthy',
          targetAudience: companyProfile?.targetAudience || 'local restaurant and lifestyle audience',
          campaignGoals: companyProfile?.campaignGoals,
          customRules: companyProfile?.customRules,
          websiteUrl: companyProfile?.websiteUrl,
          instagramHandle: companyProfile?.instagramHandle,
          brandImageUrls: companyProfile?.brandImageUrls,
          logoUrl: brandLogoUrl ?? undefined,
          visualStyle: [
            companyProfile?.visualStyle,
            companyProfile?.brandAnalysis ? `Brand analysis: ${companyProfile.brandAnalysis}` : '',
            companyProfile?.socialTemplateStyle ? `Social media style: ${companyProfile.socialTemplateStyle}` : '',
            item.signal.kind === 'instagram_story'
              ? `vertical 9:16 raw editorial photograph, natural light, no text, no UI, no story layout. ${item.idea?.visualDirection ?? ''}`
              : `square raw editorial photograph, natural light, no text, no UI, no feed layout. ${item.idea?.visualDirection ?? ''}`,
          ].filter(Boolean).join(' '),
          tags: [item.publishSlot ?? '', ...(item.signal.hashtags ?? []).map(stripHashTag)].filter(Boolean),
          referenceImageUrls: galleryUrls.length > 0 ? galleryUrls.slice(0, 8) : undefined,
          pinterestThemes: pinterestData?.visual_themes ?? [],
          pinterestTopPins: (pinterestData?.top_pins ?? []).slice(0, 5).map((p) => p.title).filter(Boolean),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.imageUrl) {
        throw new Error(result.error ?? 'Görsel üretilemedi');
      }
      setGeneratedImages((cur) => ({ ...cur, [key]: result.imageUrl }));
      await queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] });
    } catch (error) {
      setErrors((cur) => ({
        ...cur,
        [key]: error instanceof Error ? error.message : 'Görsel üretilemedi',
      }));
    } finally {
      setGenerating((cur) => ({ ...cur, [key]: false }));
    }
  }

  // Returns gallery URLs sorted by relevance score for a content item (best first)
  function rankedGalleryFor(item: ContentItem): string[] {
    const gallery = referenceImageUrlsForGeneration;
    if (!gallery.length) return [];
    return gallery
      .map(url => ({
        url,
        score: scorePhotoForContent(url, findTenantAssetByUrl(tenantMediaAssets, url), item, galleryAnalysisCache),
      }))
      .sort((a, b) => b.score - a.score)
      .map(s => s.url);
  }

  async function enhancePhoto(item: ContentItem, forceUrl?: string) {
    const key = item.key;
    const format = item.signal.kind === 'instagram_story' ? 'story' : 'post';
    const assetIntent = item.idea?.assetIntent ?? item.signal.assetIntent ?? '';
    const templateUseCase = item.idea?.templateUseCase ?? '';

    // Use score-ranked gallery — most relevant photos first
    const ranked = rankedGalleryFor(item);
    if (!ranked.length) return;

    let selectedUrl: string;

    if (forceUrl) {
      selectedUrl = forceUrl;
      const idx = ranked.indexOf(forceUrl);
      if (idx !== -1) setEnhanceCycleIdx(cur => ({ ...cur, [key]: (idx + 1) % ranked.length }));
    } else {
      // Cycle through score-ranked list — best match first, then progressively less relevant
      const currentIdx = enhanceCycleIdx[key] ?? 0;
      selectedUrl = ranked[currentIdx % ranked.length]!;
      setEnhanceCycleIdx(cur => ({ ...cur, [key]: (currentIdx + 1) % ranked.length }));
    }

    if (!selectedUrl) return;

    setGeneratingEnhancements((cur) => ({ ...cur, [key]: true }));
    setErrors((cur) => ({ ...cur, [key]: '' }));

    const enhanceContext = [
      item.signal.title,
      templateUseCase.replace(/_/g, ' '),
      item.idea?.visualDirection,
    ].filter(Boolean).join('. ');

    try {
      const response = await fetch('/api/generate-instagram-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.signal.title,
          caption: item.signal.caption ?? item.signal.summary,
          contentType: format,
          workspaceId: tenantId,
          brandName: companyProfile?.brandName,
          industry: companyProfile?.industry,
          location: companyProfile?.location,
          enhanceMode: true,
          enhanceContext,
          assetIntent,
          logoUrl: brandLogoUrl ?? undefined,
          // Send top-5 scored candidates so GPT text-selection can pick the best
          referenceImageUrls: (() => {
            const top = ranked
              .filter((u: string) => u !== selectedUrl)
              .slice(0, 4);
            return [selectedUrl, ...top];
          })(),
          photoMetadata: (() => {
            const top = ranked.filter((u: string) => u !== selectedUrl).slice(0, 4);
            return [selectedUrl, ...top].map((u) => {
              const a = findTenantAssetByUrl(tenantMediaAssets, u);
              const c = galleryAnalysisCache[u];
              return {
                tags: c?.contentTags?.join(', ') || a?.tags || undefined,
                description: c?.description || a?.description || undefined,
                assetType: c?.suggestedAssetType || a?.assetType || undefined,
              };
            });
          })(),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.imageUrl) {
        throw new Error(result.detail ?? result.error ?? 'Fotoğraf iyileştirilemedi');
      }
      setGeneratedImages((cur) => ({ ...cur, [key]: result.imageUrl }));
      setEnhanceReferenceUrlByKey((cur) => ({ ...cur, [key]: selectedUrl }));
      // Mark this photo as used so other cards won't pick it — persisted in sessionStorage
      setUsedPhotoUrls((prev) => {
        const next = new Set([...prev, normalizeUrlKey(selectedUrl)]);
        try { sessionStorage.setItem('sa_used_photos', JSON.stringify([...next])); } catch { /* ignore */ }
        return next;
      });
    } catch (error) {
      setErrors((cur) => ({
        ...cur,
        [key]: error instanceof Error ? error.message : 'Fotoğraf iyileştirilemedi',
      }));
    } finally {
      setGeneratingEnhancements((cur) => ({ ...cur, [key]: false }));
    }
  }

  async function generateProductBackground(item: ContentItem) {
    const key = item.key;
    setGeneratingProductBg((cur) => ({ ...cur, [key]: true }));
    setErrors((cur) => { const next = { ...cur }; delete next[key]; return next; });
    try {
      // Pick content-relevant photo using the same scored ranking as enhance
      // Prefers product-tagged assets, falls back to best content match
      const ranked = rankedGalleryFor(item);
      const lastUsedBg = productBgResults[key];
      const candidates = lastUsedBg
        ? ranked.filter(u => u !== lastUsedBg)   // rotate on re-click
        : ranked;
      const selectedPhoto = candidates[0] ?? ranked[0];
      if (!selectedPhoto) return;

      const response = await fetch('/api/generate-instagram-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:              item.signal.title,
          caption:            item.signal.caption ?? item.signal.summary,
          contentType:        'post',
          workspaceId:        tenantId,
          brandName:          companyProfile?.brandName,
          location:           companyProfile?.location,
          businessType:       companyProfile?.industry,
          visualDna:          (companyProfile as any)?.visualDna ?? (companyProfile as any)?.visual_dna,
          brandTone:          (companyProfile as any)?.brandTone ?? (companyProfile as any)?.brand_tone,
          logoUrl:            brandLogoUrl ?? undefined,
          productBgMode:      true,
          referenceImageUrls: [selectedPhoto],
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.imageUrl) {
        throw new Error(result.detail ?? result.error ?? 'Arka plan oluşturulamadı');
      }
      setProductBgResults((cur) => ({ ...cur, [key]: result.imageUrl }));
      setGeneratedImages((cur) => ({ ...cur, [key]: result.imageUrl }));
    } catch (error) {
      setErrors((cur) => ({
        ...cur,
        [key]: error instanceof Error ? error.message : 'Arka plan oluşturulamadı',
      }));
    } finally {
      setGeneratingProductBg((cur) => ({ ...cur, [key]: false }));
    }
  }

  async function generateReel(item: ContentItem) {
    const key = item.key;

    // Global lock: prevent concurrent reel generations (credit protection)
    if (anyReelGenerating) {
      setErrors((cur) => ({ ...cur, [key]: 'Başka bir reel üretimi devam ediyor. Lütfen tamamlanmasını bekleyin.' }));
      return;
    }

    const prompt = 'Animate this photo. Keep everything exactly as it is. Subtle natural movement only.';
    setGeneratingReels((cur) => ({ ...cur, [key]: true }));
    setErrors((cur) => ({ ...cur, [key]: '' }));

    // Prepare gallery photos for the Video Production Agent
    const galleryUrls = referenceImageUrlsForGeneration;
    const galleryPhotosForAgent = galleryUrls
      .filter((u) => !(/logo/i.test(u.split('/').pop() ?? '')))
      .slice(0, 12)
      .map((url) => {
        const asset = findTenantAssetByUrl(tenantMediaAssets, url);
        const cached = galleryAnalysisCache[url] as { contentTags?: string[]; description?: string; suggestedAssetType?: string } | undefined;
        return {
          url,
          tags: cached?.contentTags?.join(', ') || asset?.tags || '',
          description: cached?.description || asset?.description || '',
          assetType: cached?.suggestedAssetType || asset?.assetType || '',
        };
      });

    // Photo selection: heuristic (fast) — agent runs in background for next time
    // This keeps UI responsive; agent improves quality over iterations
    const primaryPhoto = generatedImages[key]
      ?? item.signal.imageUrl
      ?? galleryPhotosForAgent
          .sort((a, b) => {
            // Quick score: analyzed photos first, logos last
            const aScore = (a.tags ? 10 : 0) + (a.description ? 5 : 0) - (/logo/i.test(a.url) ? 100 : 0);
            const bScore = (b.tags ? 10 : 0) + (b.description ? 5 : 0) - (/logo/i.test(b.url) ? 100 : 0);
            return bScore - aScore;
          })[0]?.url;

    // Kick off agent in background (non-blocking) to generate better spec for next run
    if (galleryPhotosForAgent.length > 0 && tenantId) {
      fetch(`/api/brand-context/${tenantId}/video-production-spec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.signal.title,
          caption: item.signal.caption ?? item.signal.summary ?? '',
          visual_direction: item.idea?.visualDirection ?? '',
          gallery_photos: galleryPhotosForAgent,
        }),
      }).catch(() => { /* background, ignore errors */ });
    }

    const agentCameraMotion = 'static';

    try {
      const response = await fetch('/api/generate-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.signal.title,
          concept: prompt,
          promptText: prompt,
          promptImage: primaryPhoto,
          platform: 'instagram',
          contentType: 'reel',
          visualStyle: 'faithful to reference photo, no scene change, subtle animation only',
          brandTone: companyProfile?.brandTone || 'premium, authentic',
          targetAudience: companyProfile?.targetAudience || 'social media audience',
          cta: item.signal.cta,
          duration: 10,
          ratio: '720:1280',
          cameraMotion: agentCameraMotion,  // agent-selected motion
          tags: ['instagram', 'reel', item.publishSlot ?? '', ...(item.signal.hashtags ?? [])].filter(Boolean),
          sceneMetadata: {
            brandName: companyProfile?.brandName,
            industry: companyProfile?.industry,
            location: companyProfile?.location,
            campaignGoals: companyProfile?.campaignGoals,
            customRules: companyProfile?.customRules,
            instagramHandle: companyProfile?.instagramHandle,
            brandImageUrls: companyProfile?.brandImageUrls,
            publishSlot: item.publishSlot,
            parentTitle: item.parentTitle,
          },
        }),
      });
      const result = await response.json();
      const videoUrl = result.outputUrls?.[0] ?? result.videoUrl;
      if (!response.ok || !videoUrl) {
        throw new Error(result.error ?? result.detail ?? 'Reel üretilemedi');
      }
      setGeneratedVideos((cur) => ({
        ...cur,
        [key]: {
          videoUrl,
          runwayPrompt: typeof result.promptText === 'string' ? result.promptText : '',
          model: typeof result.model === 'string' ? result.model : 'gen4.5',
        },
      }));
      await queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] });
    } catch (error) {
      setErrors((cur) => ({
        ...cur,
        [key]: error instanceof Error ? error.message : 'Reel üretilemedi',
      }));
    } finally {
      setGeneratingReels((cur) => ({ ...cur, [key]: false }));
    }
  }

  async function generateVideoPack(item: ContentItem) {
    const key = item.key;
    const videoUrl = generatedVideos[key]?.videoUrl ?? item.signal.videoUrl;
    if (!videoUrl || !tenantId) return;

    // Kaynak fotoğraf — GPT-4o Vision için (reel'e girdi olan görsel)
    const sourceImageUrl = generatedImages[key] ?? item.signal.imageUrl ?? '';

    setGeneratingVideoPack((cur) => ({ ...cur, [key]: true }));
    setErrors((cur) => ({ ...cur, [key]: '' }));
    try {
      // content_use → template_use_case'den map et
      const useMap: Record<string, string> = {
        event_announcement: 'event', menu_share: 'product', product_highlight: 'product',
        campaign_offer: 'promotional', behind_the_scenes: 'bts', social_proof: 'social_proof',
        educational_post: 'educational', daily_story: 'brand_story', lead_generation: 'promotional',
      };
      const rawUse = (item.idea?.templateUseCase ?? '').toLowerCase();
      const contentUse = useMap[rawUse] ?? 'brand_story';
      const signalKind = item.signal.kind ?? '';
      const format = signalKind.includes('story') ? 'story_9x16' : 'reel_9x16';

      // Otomatik pipeline: brand profili → Template Brain → render
      const res = await fetch(`/api/brand-context/${tenantId}/auto-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: videoUrl,
          title: item.signal.title,
          subtitle: (item.signal.caption ?? item.signal.summary ?? '').slice(0, 60),
          content_use: contentUse,
          format,
          urgency_level: 'medium',
          event_date: '',
        }),
      });
      const data = await res.json() as {
        status: string; output_url?: string; error?: string; detail?: string;
        template_key?: string; template_label?: string; template_tone?: string; reasoning?: string;
      };
      if (!res.ok || data.status === 'error') throw new Error(data.detail ?? data.error ?? 'Render başarısız');
      const render: VideoPackRender = {
        format, status: (data.status === 'succeeded' || data.status === 'done') ? 'succeeded' : 'failed',
        output_url: data.output_url ?? '', width: 1080,
        height: 1920,
      };
      const styleKey = data.template_tone ?? 'auto';
      const variants: VideoPackVariants = {
        [styleKey]: {
          label: data.template_label ?? 'Auto',
          description: data.reasoning ?? `Template: ${data.template_key ?? ''}`,
          renders: [render],
        },
      };
      setVideoPackResults((cur) => ({ ...cur, [key]: [render] }));
      setVideoPackVariants((cur) => ({ ...cur, [key]: variants }));
    } catch (err) {
      setErrors((cur) => ({ ...cur, [key]: err instanceof Error ? err.message : 'Video paketi hatası' }));
    } finally {
      setGeneratingVideoPack((cur) => ({ ...cur, [key]: false }));
    }
  }

  async function generateCanvaDesign(item: ContentItem) {
    const key = item.key;
    setGeneratingCanva((cur) => ({ ...cur, [key]: true }));
    setErrors((cur) => ({ ...cur, [key]: '' }));

    try {
      const response = await fetch('/api/canva/autofill-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          officeId,
          title: `${companyProfile?.brandName || 'SmartAgency'} - ${item.signal.title}`,
          signal: signalToCanvaInput(item.signal, item, tenantBrandContext),
          templateId: selectedCanvaTemplateIdFor(key, canvaTemplateMatches?.matches[key]),
          lineage: {
            contentItemKey: key,
            source: item.source,
            artifactId: item.artifact?.id,
            actionId: item.action?.id,
            parentArtifactId: item.parentArtifactId,
            parentActionId: item.parentActionId,
            parentTitle: item.parentTitle,
            selectedTemplateId: selectedCanvaTemplateIdFor(key, canvaTemplateMatches?.matches[key]),
            selectedBy: selectedCanvaTemplateIds[key] ? 'manual_override' : 'ai_match',
          },
        }),
      });

      const result = await response.json() as CanvaAutofillApiResult & { error?: string; action?: string; connectUrl?: string };
      if (!response.ok) {
        if (response.status === 401 && typeof result.connectUrl === 'string') {
          window.location.href = result.connectUrl;
          return;
        }
        if (response.status === 409 && result.action === 'publish_brand_template') {
          throw new Error('Canva bağlı, ancak API henüz Brand Template göremiyor. Brand Hub ekranındaki adımlarla en az 1 Brand Template yayınlayıp tekrar dene.');
        }
        if (response.status === 422 && result.decision) {
          const policyDetails = [
            ...(result.decision.blockedReasons ?? []),
            ...(result.decision.missingFields ?? []).map((field) => `Eksik alan: ${field}`),
            ...(result.decision.missingAssetIntents ?? []).map((asset) => `Eksik asset: ${asset}`),
          ];
          throw new Error(policyDetails.length > 0
            ? `Canva üretimi policy gate tarafından durduruldu: ${policyDetails.join(' · ')}`
            : result.error ?? 'Canva üretimi policy gate tarafından durduruldu.');
        }
        throw new Error(result.error ?? 'Canva tasarımı oluşturulamadı');
      }

      const design = result.design ?? result.job?.result?.design;
      const initialResult: CanvaDesignResult = {
        designId: design?.id,
        jobId: result.job?.id,
        status: result.job?.status,
        templateTitle: result.decision?.template?.title,
        score: result.decision?.score,
        eligibility: result.decision?.eligibility,
        riskTier: result.decision?.riskTier,
        approvalRequired: result.decision?.approvalRequired,
        editUrl: designUrl(design),
        thumbnailUrl: designThumbnailUrl(design),
      };
      setCanvaDesigns((cur) => ({
        ...cur,
        [key]: initialResult,
      }));
      if (initialResult.designId) {
        void exportCanvaPreview(key, initialResult.designId, item.signal.title);
      }

      if (!initialResult.editUrl && initialResult.jobId && initialResult.status !== 'failed') {
        const finalResult = await pollCanvaDesign(initialResult.jobId);
        if (finalResult) {
          setCanvaDesigns((cur) => ({
            ...cur,
            [key]: {
              ...cur[key],
              ...finalResult,
            },
          }));
          if (finalResult.designId) {
            void exportCanvaPreview(key, finalResult.designId, item.signal.title);
          }
        }
      }
    } catch (error) {
      setErrors((cur) => ({
        ...cur,
        [key]: error instanceof Error ? error.message : 'Canva tasarımı oluşturulamadı',
      }));
    } finally {
      setGeneratingCanva((cur) => ({ ...cur, [key]: false }));
    }
  }

  async function pollCanvaDesign(jobId: string): Promise<Partial<CanvaDesignResult> | null> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1250));
      const response = await fetch(
        `/api/canva/autofill-design?${new URLSearchParams({
          jobId,
          tenantId,
          officeId,
        })}`,
      );
      const result = await response.json() as CanvaAutofillApiResult;
      if (!response.ok) continue;

      const design = result.design ?? result.job?.result?.design;
      const next: Partial<CanvaDesignResult> = {
        designId: design?.id,
        jobId: result.job?.id ?? jobId,
        status: result.job?.status,
        editUrl: designUrl(design),
        thumbnailUrl: designThumbnailUrl(design),
      };

      if (next.editUrl || next.status === 'success' || next.status === 'failed') {
        return next;
      }
    }

    return null;
  }

  async function exportCanvaPreview(key: string, designId: string, title: string) {
    try {
      const response = await fetch('/api/canva/export-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          officeId,
          designId,
          title: `${companyProfile?.brandName || 'SmartAgency'} - ${title}`,
          format: 'png',
        }),
      });
      const result = await response.json() as {
        job?: { id?: string; status?: string };
        exportUrl?: string;
        permanentPreviewUrl?: string;
        error?: string;
      };

      if (!response.ok && response.status !== 202) {
        throw new Error(result.error ?? 'Canva export alınamadı');
      }

      setCanvaDesigns((cur) => ({
        ...cur,
        [key]: {
          ...cur[key],
          exportStatus: result.job?.status,
          exportUrl: result.exportUrl,
          permanentPreviewUrl: result.permanentPreviewUrl,
          thumbnailUrl: result.permanentPreviewUrl ?? cur[key]?.thumbnailUrl,
        },
      }));
    } catch (error) {
      setCanvaDesigns((cur) => ({
        ...cur,
        [key]: {
          ...cur[key],
          exportStatus: error instanceof Error ? error.message : 'export_failed',
        },
      }));
    }
  }

  useEffect(() => {
    const remainingAutoSlots = AUTO_GRID_VISUAL_LIMIT - Object.keys(autoGridRequested).length;
    if (remainingAutoSlots <= 0) return;

    const missingVisuals = contentItems
      .filter((item) =>
        canGenerateVisual(item.signal) &&
        !item.signal.imageUrl &&
        !generating[item.key] &&
        !autoGridRequested[item.key] &&
        !errors[item.key]
      )
      .slice(0, remainingAutoSlots);

    if (missingVisuals.length === 0) return;

    setAutoGridRequested((current) => {
      const next = { ...current };
      missingVisuals.forEach((item) => {
        next[item.key] = true;
      });
      return next;
    });

    missingVisuals.forEach((item) => {
      void generateVisual(item);
    });
  }, [contentItems, autoGridRequested, generating, errors]);

  useEffect(() => {
    if (!missionModalOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMissionModalOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [missionModalOpen]);

  if (isLoading || actionsLoading) return (
    <div className="flex h-full items-center justify-center" style={{ background: '#07080f' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-violet-500/20 border-t-violet-500/70" />
        <p className="text-[13px] text-slate-600">Loading Content Studio…</p>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
    <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-1.5 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <PenTool className="h-3 w-3 text-violet-400" />
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-violet-400">Content Studio</span>
          </div>
          <h1 className="text-2xl font-light tracking-[-0.03em] text-white">
            AI <span className="font-semibold" style={{ color: '#a78bfa' }}>Content Pipeline</span>
          </h1>
        </div>

        {/* Right actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Canva status chip */}
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: canvaStatus?.connected ? 'rgba(34,197,94,0.07)' : 'rgba(245,158,11,0.07)',
              border: canvaStatus?.connected ? '1px solid rgba(34,197,94,0.18)' : '1px solid rgba(245,158,11,0.18)',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: canvaStatus?.connected ? '#22c55e' : '#f59e0b' }}
            />
            <span className="text-[11px] font-semibold" style={{ color: canvaStatus?.connected ? '#22c55e' : '#f59e0b' }}>
              {canvaStatus?.connected
                ? `Canva · ${canvaStatus.templateCount} templates`
                : 'Canva not connected'}
            </span>
            {!canvaStatus?.connected && (
              <button
                type="button"
                onClick={() => { window.location.href = canvaStatus?.connectUrl ?? '/api/canva/oauth/login'; }}
                className="ml-1 text-[10px] font-semibold text-amber-400 underline hover:no-underline"
              >
                Connect
              </button>
            )}
          </div>

          {/* Gallery-as-base toggle */}
          {referenceImageUrlsForGeneration.length > 0 && (
            <button
              type="button"
              onClick={() => setUseGalleryAsBase((v) => !v)}
              title={useGalleryAsBase
                ? `Mekan galerisi aktif (${referenceImageUrlsForGeneration.length} görsel) — AI görsel üretirken gerçek mekan fotoğrafı arka plan olarak kullanılıyor`
                : 'Galeriden kullan — mekan fotoğraflarını AI görsel tabanı yap'}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold transition-all"
              style={{
                background: useGalleryAsBase ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                border: useGalleryAsBase ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.08)',
                color: useGalleryAsBase ? '#22c55e' : '#64748b',
              }}
            >
              <span
                className="inline-flex h-3.5 w-3.5 items-center justify-center rounded"
                style={{ background: useGalleryAsBase ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)', border: useGalleryAsBase ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.12)' }}
              >
                {useGalleryAsBase && <span className="text-[8px] text-emerald-400">✓</span>}
              </span>
              Mekan galerisi ({referenceImageUrlsForGeneration.length})
            </button>
          )}

          {/* Visual Design Card CTA */}
          <button
            type="button"
            disabled={!contentAgent || runVisualDesignAgent.isPending}
            onClick={() => runVisualDesignAgent.mutate(undefined)}
            title="Marka görsellerini arka plan olarak kullanan tasarım kartları üret (story + feed)"
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90 disabled:opacity-40"
            style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)', color: '#22d3ee' }}
          >
            {runVisualDesignAgent.isPending
              ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-400" /> Tasarlanıyor…</>
              : <><Sparkles className="h-3.5 w-3.5" /> Tasarım Kartı</>}
          </button>

          {/* Generate CTA */}
          <button
            type="button"
            onClick={() => setMissionModalOpen(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}
          >
            <Send className="h-3.5 w-3.5" />
            Generate Content
          </button>
        </div>
      </div>

      {/* ── METRICS ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Pieces', value: contentItems.length, color: '#a78bfa', icon: PenTool },
          { label: 'Scheduled', value: scheduled, color: '#22c55e', icon: Instagram },
          { label: 'Needs Approval', value: suggested, color: '#f59e0b', icon: Sparkles },
          { label: 'Drafts', value: drafts, color: '#22d3ee', icon: Calendar },
        ].map((m) => (
          <div key={m.label} className="rounded-xl p-4" style={{ background: 'rgba(13,14,22,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{m.label}</p>
            <p className="mt-1.5 text-3xl font-light tracking-[-0.04em] metric-value" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* ── STRATEGY BANNER (only when active) ──────────────────────────── */}
      {(autonomyQuestion || weeklyStrategy?.weeklyTheme) && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}
        >
          <Sparkles className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            {weeklyStrategy?.weeklyTheme && (
              <p className="text-[13px] font-semibold text-white/90">{weeklyStrategy.weeklyTheme}</p>
            )}
            {autonomyQuestion && (
              <p className="text-[12px] text-amber-400 mt-0.5">{autonomyQuestion}</p>
            )}
            {autonomyMessage && !autonomyQuestion && (
              <p className="text-[12px] text-slate-500 mt-0.5">{autonomyMessage}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={!strategyAgent || runStrategyAgent.isPending}
              onClick={startAutonomousWeeklyPlan}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-violet-300 transition hover:text-white disabled:opacity-40"
              style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}
            >
              {runStrategyAgent.isPending ? 'Generating…' : 'Regenerate Plan'}
            </button>
            <button
              type="button"
              disabled={autonomyRunning || runContentAgent.isPending}
              onClick={() => void continueAutonomousFlow()}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-80 disabled:opacity-40"
              style={{ background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.3)' }}
            >
              Continue Flow
            </button>
          </div>
        </div>
      )}

      {/* ── FILTER TOOLBAR ──────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-end gap-3 rounded-xl px-4 py-3"
        style={{ background: 'rgba(13,14,22,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[140px] max-w-xs">
          <Input
            type="search"
            value={filterSearch}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFilterSearch(e.target.value)}
            placeholder="Search content…"
            className="h-8 !rounded-lg !border-white/10 !bg-white/[0.04] !text-white/80 !placeholder-slate-600 !text-[12px]"
          />
        </div>

        {/* Filter selects */}
        {[
          { label: 'Format', value: filterKind, onChange: setFilterKind, options: contentKindFilterOptions },
          { label: 'Status', value: filterStatus, onChange: setFilterStatus, options: CONTENT_FILTER_STATUS_OPTIONS },
          { label: 'Source', value: filterSource, onChange: setFilterSource, options: CONTENT_FILTER_SOURCE_OPTIONS },
        ].map((f) => (
          <div key={f.label} className="flex flex-col gap-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-700">{f.label}</p>
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="h-8 rounded-lg px-2 text-[12px] text-white/80 outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
            >
              {f.options.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value} style={{ background: '#0d0e16' }}>{opt.label}</option>
              ))}
            </select>
          </div>
        ))}

        {/* Count + clear */}
        <div className="ml-auto flex items-center gap-2.5">
          <span className="text-[11px] text-slate-700">
            {filteredContentItems.length} / {contentItems.length}
          </span>
          {contentFiltersActive && (
            <button
              type="button"
              onClick={() => { setFilterSearch(''); setFilterSource(''); setFilterKind(''); setFilterStatus(''); setFilterRisk(''); }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:text-slate-200"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── CONTENT GRID ────────────────────────────────────────────────── */}
      {filteredContentItems.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredContentItems.map((item) => {
            const signal = item.signal;
            const key = item.key;
            const isBusy = Boolean(generating[key]);
            // Disable all reel buttons while ANY reel is generating
            const isReelBusy = Boolean(generatingReels[key]) || anyReelGenerating;
            const isReviewable = Boolean(item.artifact || item.action);
            const canGenerateImage = canGenerateVisual(signal);
            const canGenerateVideo = canGenerateReel(signal);
            const canGenerateCanva = canUseCanvaTemplate(signal);
            const canReview = isReviewable && signal.status === 'needs_approval';
            const canvaResult = canvaDesigns[key];
            const canvaMatch = canvaTemplateMatches?.matches[key];
            const selectedTemplateId = selectedCanvaTemplateIdFor(key, canvaMatch);
            const manualOverride = Boolean(selectedTemplateId && canvaMatch?.template?.id && selectedTemplateId !== canvaMatch.template.id);
            // Allow enhance when at least one photo has REAL analysis (Python cache or .NET tags)
            // Show enhance button whenever gallery photos exist — analysis improves matching but not required
            const canEnhance = referenceImageUrlsForGeneration.length > 0;
            const isEnhancing = Boolean(generatingEnhancements[key]);
            // Product background button — show whenever reference images exist.
            // Prefers product-tagged assets; falls back to first available gallery photo.
            const canProductBg = referenceImageUrlsForGeneration.length > 0;
            const productPhotoUrl = (() => {
              const productAsset = tenantMediaAssets.find(a =>
                ['product_image','product_photo','product_showcase','menu_item'].includes(a.assetType ?? '') ||
                (a.tags ?? '').split(',').some(t => ['product_image','product_photo'].includes(t.trim()))
              );
              return productAsset?.url ?? referenceImageUrlsForGeneration[0] ?? '';
            })();
            const isGeneratingProductBg = Boolean(generatingProductBg[key]);
            const isApproved = signal.status === 'approved' || signal.status === 'executed';
            const hasMedia = !!(generatedImages[key] ?? signal.imageUrl ?? generatedVideos[key]?.videoUrl ?? signal.videoUrl);
            const canPublish = isApproved && hasMedia && igConnected;
            const isPublishing = Boolean(publishing[key]);
            const publishResult = publishResults[key];
            const secondarySection = canGenerateCanva || Boolean(canvaMatch?.template) || Boolean(canvaResult) || Boolean(errors[key]) || canEnhance || canPublish;
            return (
              <Card
                key={`${item.source}-${key}`}
                className={cn(
                  'flex h-full min-h-0 flex-col overflow-hidden',
                  selectedId === item.key && 'border-brand-400 shadow-theme-md ring-1 ring-brand-500/35 dark:border-brand-500',
                )}
              >
                <PremiumArtifactCard
                  embedded
                  signal={signal}
                  actions={{
                    onOpen: () => setSelectedId(item.key),
                    onEdit: canGenerateVideo ? () => generateReel(item) : canGenerateImage ? () => generateVisual(item) : undefined,
                    editLabel: canGenerateVideo ? (signal.videoUrl ? 'Reel yenile' : 'AI reel üret') : signal.imageUrl ? 'Görseli yenile' : 'AI görsel üret',
                    editBusy: canGenerateVideo ? isReelBusy : isBusy,
                    onApprove: canReview ? () => approveItem(item) : undefined,
                    onReject: canReview ? () => rejectItem(item) : undefined,
                    approveBusy: isApproving(item),
                    rejectBusy: isRejecting(item),
                  }}
                />
                {secondarySection ? (
                  <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/80 px-4 py-4 dark:border-gray-800 dark:bg-white/[0.02] sm:px-6">
                    {/* Reel video player — portrait 9:16, contained */}
                    {signal.kind === 'instagram_reel' && signal.videoUrl && (
                      <ReelVideoPlayer src={signal.videoUrl} />
                    )}
                    {canEnhance && (() => {
                      // Photos sorted by relevance score for this specific content item
                      const gallery = rankedGalleryFor(item);
                      const cycleIdx = enhanceCycleIdx[key] ?? 0;
                      const nextPhoto = gallery[cycleIdx % gallery.length] ?? gallery[0]!;
                      const lastUsed  = enhanceReferenceUrlByKey[key] ?? null;
                      return (
                        <div className="flex flex-col gap-1.5">
                          {/* Gallery thumbnail strip — tap any to enhance with that photo */}
                          <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
                            {gallery.slice(0, 10).map((url, idx) => {
                              const isActive = url === lastUsed;
                              const isNext   = url === nextPhoto && !lastUsed;
                              return (
                                <button
                                  key={url}
                                  type="button"
                                  disabled={isEnhancing || isBusy}
                                  onClick={() => enhancePhoto(item, url)}
                                  className="relative flex-shrink-0 overflow-hidden rounded transition"
                                  style={{
                                    width: 36, height: 36,
                                    outline: isActive
                                      ? '2px solid #fbbf24'
                                      : isNext
                                        ? '2px solid rgba(251,191,36,0.4)'
                                        : '1px solid rgba(255,255,255,0.08)',
                                    opacity: isEnhancing ? 0.5 : 1,
                                  }}
                                  title={`Fotoğraf ${idx + 1} ile iyileştir`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  {isActive && (
                                    <div className="absolute inset-0 flex items-center justify-center"
                                      style={{ background: 'rgba(251,191,36,0.3)' }}>
                                      <span style={{ fontSize: 10 }}>✓</span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {/* Enhance button — cycles to next photo on each tap */}
                          <button
                            type="button"
                            disabled={isEnhancing || isBusy}
                            onClick={() => enhancePhoto(item)}
                            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition disabled:opacity-40"
                            style={{
                              background: isEnhancing ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.06)',
                              border: '1px solid rgba(251,191,36,0.2)',
                              color: '#fbbf24',
                            }}
                          >
                            {isEnhancing
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Fotoğraf iyileştiriliyor…</>
                              : <><Sparkles className="h-3.5 w-3.5" />
                                  {lastUsed
                                    ? `↺ Sonraki fotoğraf (${(cycleIdx % gallery.length) + 1}/${gallery.length})`
                                    : 'Mekan fotoğrafını iyileştir'}
                                </>
                            }
                          </button>
                          {/* Product background button */}
                          {canProductBg && productPhotoUrl && (
                            <button
                              type="button"
                              disabled={isGeneratingProductBg || isBusy}
                              onClick={() => generateProductBackground(item)}
                              className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition disabled:opacity-40"
                              style={{
                                background: isGeneratingProductBg ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.07)',
                                border: '1px solid rgba(99,102,241,0.25)',
                                color: '#818cf8',
                              }}
                              title="Ürün fotoğrafını koruyarak marka'ya uygun arka plan oluşturur"
                            >
                              {isGeneratingProductBg
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Arka plan oluşturuluyor…</>
                                : <><Sparkles className="h-3.5 w-3.5" /> Ürün — Marka Arka Planı</>
                              }
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {canGenerateCanva && (
                      <>
                        <CanvaTemplateSelector
                          templates={canvaTemplateOptions}
                          value={selectedTemplateId}
                          matchedTemplateId={canvaMatch?.template?.id}
                          onChange={(templateId) => updateSelectedCanvaTemplate(key, templateId)}
                          compact
                        />
                        {manualOverride && <ManualOverrideNotice compact />}
                        {canvaTemplateMatches && !canvaMatch?.template && <CanvaNoMatchNotice compact />}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={Boolean(generatingCanva[key]) || canvaHasNoTemplates}
                          onClick={() => generateCanvaDesign(item)}
                          className="!w-full"
                          startIcon={generatingCanva[key] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        >
                          {canvaHasNoTemplates ? 'Waiting for Brand Template' : generatingCanva[key] ? 'Selecting template…' : canvaResult ? 'Refresh Canva design' : 'Create with Canva'}
                        </Button>
                      </>
                    )}
                    {canGenerateCanva && canvaMatch?.template && <CanvaMatchCard match={canvaMatch} compact />}
                    {canvaResult && <CanvaOutputCard result={canvaResult} compact />}

                    {/* Publish actions — approved content with media */}
                    {canPublish && (
                      <div className="flex flex-col gap-1.5">
                        {publishResult ? (
                          <a href={publishResult.permalink} target="_blank" rel="noreferrer"
                            className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold"
                            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
                            ✓ Instagram'da görüntüle →
                          </a>
                        ) : (
                          <>
                            {/* Instagram — publish now */}
                            <button type="button" disabled={isPublishing}
                              onClick={() => void publishToInstagram(item)}
                              className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition disabled:opacity-40"
                              style={{ background: 'linear-gradient(135deg,rgba(225,48,108,0.12),rgba(88,81,219,0.12))', border: '1px solid rgba(225,48,108,0.3)', color: '#e1306c' }}>
                              {isPublishing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Yayınlanıyor…</> : <><Instagram className="h-3.5 w-3.5" /> Instagram'da Yayınla</>}
                            </button>

                            {/* Facebook — publish now */}
                            <button type="button" disabled={isPublishing}
                              onClick={async () => {
                                if (!tenantId) return;
                                setPublishing((c) => ({ ...c, [key]: true }));
                                try {
                                  const imageUrl = generatedImages[key] ?? item.signal.imageUrl;
                                  const videoUrl = generatedVideos[key]?.videoUrl ?? item.signal.videoUrl;
                                  const res = await fetch('/api/meta/publish', { method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ workspaceId: tenantId, publish_type: 'feed_image', image_url: imageUrl, video_url: videoUrl, caption: item.signal.caption ?? '', hashtags: item.signal.hashtags ?? [] })
                                  });
                                  const d = await res.json();
                                  if (!res.ok) throw new Error(d.error);
                                  alert('✓ Facebook\'ta yayınlandı!');
                                } catch (e) { setErrors((c) => ({ ...c, [key]: e instanceof Error ? e.message : 'Hata' })); }
                                finally { setPublishing((c) => ({ ...c, [key]: false })); }
                              }}
                              className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition disabled:opacity-40"
                              style={{ background: 'rgba(24,119,242,0.1)', border: '1px solid rgba(24,119,242,0.3)', color: '#1877f2' }}>
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                              Facebook'ta Yayınla
                            </button>

                            {/* Schedule */}
                            <div className="flex gap-1.5">
                              <input type="datetime-local" value={scheduledAt[key] ?? ''}
                                min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
                                onChange={(e) => setScheduledAt((c) => ({ ...c, [key]: e.target.value }))}
                                className="flex-1 rounded-lg px-2 py-1.5 text-[11px] text-white/70 outline-none"
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                              <button type="button" disabled={scheduling[key] || !scheduledAt[key]}
                                onClick={() => void schedulePost(item, 'instagram')}
                                className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-40"
                                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>
                                {scheduling[key] ? '…' : '⏰ Zamanla'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {errors[key] && (
                      <p className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-[11px] leading-5 text-error-600 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-500">
                        {errors[key]}
                      </p>
                    )}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : contentItems.length > 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl py-16" style={{ background: 'rgba(13,14,22,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <PenTool className="mb-3 h-10 w-10 text-slate-800" />
          <p className="text-[14px] font-medium text-slate-600">No content matches these filters</p>
          <button onClick={() => { setFilterSearch(''); setFilterSource(''); setFilterKind(''); setFilterStatus(''); setFilterRisk(''); }}
            className="mt-3 text-[12px] text-violet-500 hover:text-violet-300 transition">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl py-20" style={{ background: 'rgba(13,14,22,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <PenTool className="h-7 w-7 text-violet-400" />
          </div>
          <p className="text-[15px] font-medium text-white/70">No content yet</p>
          <p className="mt-1.5 text-[13px] text-slate-700">Generate your first content piece using the button above.</p>
          <button
            type="button"
            onClick={() => setMissionModalOpen(true)}
            className="mt-5 flex items-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white transition hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            <Send className="h-4 w-4" /> Generate Content
          </button>
        </div>
      )}


      {missionModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setMissionModalOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="content-mission-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 dark:border-gray-800">
              <div className="min-w-0">
                <h2 id="content-mission-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white/90">
                  Yeni içerik üret
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Content Agent&apos;a doğrudan bu ekrandan mission ver.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMissionModalOpen(false)}
                className="shrink-0 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[min(70vh,520px)] overflow-y-auto p-5 scrollbar-thin">
              <div className="grid gap-3">
                <TextArea
                  rows={5}
                  value={brief}
                  onChange={setBrief}
                  className="resize-none !text-gray-700 dark:!text-white/90"
                  placeholder="Örn: Bu hafta yeni menü için Instagram post/story/reel fikirleri üret..."
                />
                <Button
                  type="button"
                  disabled={!contentAgent || runContentAgent.isPending || !brief.trim()}
                  startIcon={runContentAgent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  onClick={() => runContentAgent.mutate(undefined)}
                  className="w-full !px-5 !py-3.5 max-sm:!text-sm"
                >
                  {runContentAgent.isPending ? 'Agent çalışıyor...' : 'Content Agent ile içerik üret'}
                </Button>
                {!contentAgent && (
                  <p className="rounded-2xl border border-warning-200 bg-warning-50 p-3 text-xs leading-5 text-warning-600 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-400">
                    Content Agent bulunamadı. Setup/Agents ekranında Instagram Content Generator veya Social Media Designer agent&apos;ı aktif olmalı.
                  </p>
                )}
                {runContentAgent.isSuccess && (
                  <p className="rounded-2xl border border-success-200 bg-success-50 p-3 text-xs leading-5 text-success-600 dark:border-success-500/20 dark:bg-success-500/15 dark:text-success-500">
                    Mission başladı. Agent çıktısı tamamlandığında bu gridde gerçek artifact kartı olarak görünecek.
                  </p>
                )}
                {runContentAgent.isError && (
                  <p className="rounded-2xl border border-error-200 bg-error-50 p-3 text-xs leading-5 text-error-600 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-500">
                    Mission başlatılamadı. API/agent bağlantısını kontrol et.
                  </p>
                )}
              </div>
              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <p className="text-base font-semibold text-gray-800 dark:text-white/90">Yayın akışı</p>
                <div className="mt-3 space-y-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  <p><CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-success-600 dark:text-success-500" /> Artifact&apos;i onayla veya reddet.</p>
                  <p><Sparkles className="mr-1 inline h-3.5 w-3.5 text-brand-500" /> Post/story için AI görsel üret.</p>
                  <p><Instagram className="mr-1 inline h-3.5 w-3.5 text-error-500" /> Live yayın için Approvals + provider connection gerekir.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ArtifactPreviewModal
        signal={selectedPreviewSignal}
        open={Boolean(selectedPreviewSignal)}
        onClose={() => setSelectedId(null)}
        actions={selected ? {
          onEdit: () => {
            if (selectedItem && canGenerateReel(selected)) {
              generateReel(selectedItem);
            } else if (selectedItem && canGenerateVisual(selected)) {
              generateVisual(selectedItem);
            }
          },
          editLabel: canGenerateReel(selected) ? (selected.videoUrl ? 'Reel yenile' : 'AI reel üret') : selected.imageUrl ? 'Görseli yenile' : 'AI görsel üret',
          editBusy: canGenerateReel(selected) ? selectedReelGenerating : selectedGenerating,
          onApprove: selectedItem && (selectedItem.artifact || selectedItem.action) && selected.status === 'needs_approval'
            ? () => approveItem(selectedItem)
            : undefined,
          onReject: selectedItem && (selectedItem.artifact || selectedItem.action) && selected.status === 'needs_approval'
            ? () => rejectItem(selectedItem)
            : undefined,
          approveBusy: selectedItem ? isApproving(selectedItem) : false,
          rejectBusy: selectedItem ? isRejecting(selectedItem) : false,
        } : undefined}
        extraSidebar={selected && selectedItem ? (
          <GlassPanel tone={selectedItem.source === 'ai' ? 'emerald' : 'amber'} padding="p-5">
            <SectionHeader
              title={selectedItem.source === 'action' ? 'Onay bekleyen AI aksiyonu' : 'AI içerik çıktısı'}
              subtitle={selectedItem.source === 'action' ? 'Approvals kaydından geliyor.' : 'Veritabanı artifact kaydından geliyor.'}
            />
            <div className="grid gap-2 text-xs">
              <InfoRow label="Kaynak" value={selectedItem.source === 'ai' ? 'OutputArtifact' : 'SuggestedAction'} />
              <InfoRow label="Durum" value={selected.status ?? 'draft'} />
              <InfoRow label="Format" value={selected.kind} />
              {companyProfile?.brandName && <InfoRow label="Branding" value={`${companyProfile.brandName}${companyProfile.industry ? ` · ${companyProfile.industry}` : ''}`} />}
              {selectedItem.publishSlot && <InfoRow label="Yayın zamanı" value={selectedItem.publishSlot} />}
              {selectedItem.parentTitle && <InfoRow label="Plan" value={selectedItem.parentTitle} />}
              <InfoRow label="Görsel" value={selected.imageUrl ? 'Var' : 'Eksik'} />
            </div>
            {selectedItem.visualPrompt && (
              <div className="mt-3 rounded-xl border border-violet-300/15 bg-violet-400/[0.08] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100/70">Görsel prompt özeti</p>
                <p className="mt-2 line-clamp-6 whitespace-pre-line text-[11px] leading-5 text-gray-500 dark:text-gray-400">{selectedItem.visualPrompt}</p>
              </div>
            )}
            {(() => {
              const reelMeta = generatedVideos[selectedItem.key];
              return reelMeta?.runwayPrompt ? (
              <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-400/[0.06] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/80">
                  Runway · {reelMeta.model} · video prompt (tam metin)
                </p>
                <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-gray-600 dark:text-gray-300 scrollbar-thin">
                  {reelMeta.runwayPrompt}
                </pre>
              </div>
              ) : null;
            })()}
            {canGenerateVisual(selected) && (
              <button
                type="button"
                onClick={() => generateVisual(selectedItem)}
                disabled={selectedGenerating}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-300/25 bg-violet-400/[0.12] px-4 py-2.5 text-xs font-semibold text-violet-100 transition hover:bg-violet-400/[0.18] disabled:opacity-45"
              >
                {selectedGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {selectedGenerating ? 'Görsel üretiliyor…' : selected.imageUrl ? 'Görseli yenile' : 'AI görsel üret'}
              </button>
            )}
            {(() => {
              if (!selectedItem || referenceImageUrlsForGeneration.length === 0) return null;
              const isEnhancing = Boolean(generatingEnhancements[selectedItem.key]);
              const selProductUrl = (() => {
                const productAsset = tenantMediaAssets.find(a =>
                  ['product_image','product_photo','product_showcase','menu_item'].includes(a.assetType ?? '') ||
                  (a.tags ?? '').split(',').some(t => ['product_image','product_photo'].includes(t.trim()))
                );
                return productAsset?.url ?? referenceImageUrlsForGeneration[0] ?? '';
              })();
              const isGenBg = Boolean(generatingProductBg[selectedItem.key]);
              return (
                <>
                  <button
                    type="button"
                    onClick={() => enhancePhoto(selectedItem)}
                    disabled={isEnhancing || selectedGenerating}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold transition disabled:opacity-45"
                    style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.22)', color: '#fbbf24' }}
                  >
                    {isEnhancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {isEnhancing ? 'İyileştiriliyor…' : 'Mekan fotoğrafını iyileştir'}
                  </button>
                  {selProductUrl && (
                    <button
                      type="button"
                      onClick={() => generateProductBackground(selectedItem)}
                      disabled={isGenBg || selectedGenerating}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold transition disabled:opacity-45"
                      style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)', color: '#818cf8' }}
                      title="Ürün dokunulmaz — sadece arka plan marka görselliğine uygun hale getirilir"
                    >
                      {isGenBg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {isGenBg ? 'Arka plan oluşturuluyor…' : 'Ürün — Marka Arka Planı'}
                    </button>
                  )}
                </>
              );
            })()}
            {/* Reel video player in sidebar */}
            {selected.videoUrl && selected.kind === 'instagram_reel' && (
              <div className="mt-2">
                <ReelVideoPlayer src={selected.videoUrl} />
              </div>
            )}
            {canGenerateReel(selected) && (
              <button
                type="button"
                onClick={() => generateReel(selectedItem)}
                disabled={selectedReelGenerating || anyReelGenerating}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/[0.12] px-4 py-2.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/[0.18] disabled:opacity-45"
              >
                {selectedReelGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {selectedReelGenerating ? 'Reel üretiliyor…' : selected.videoUrl ? 'Reel yenile' : 'AI reel üret'}
              </button>
            )}
            {/* Video Paketi — Creatomate: 1 Runway video → 5 format çıktısı */}
            {(generatedVideos[selectedItem.key]?.videoUrl ?? selected.videoUrl) && (
              <>
                <button
                  type="button"
                  onClick={() => generateVideoPack(selectedItem)}
                  disabled={generatingVideoPack[selectedItem.key]}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold transition disabled:opacity-45"
                  style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc' }}
                >
                  {generatingVideoPack[selectedItem.key]
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Ajans paketi hazırlanıyor…</>
                    : <>🎬 Video Paketi Oluştur (5 format)</>}
                </button>
                {(() => {
                  const variants = videoPackVariants[selectedItem.key];
                  const hasVariants = variants && Object.keys(variants).length > 0;
                  if (!hasVariants) return null;
                  const STYLE_COLORS: Record<string, string> = { minimal: '#94a3b8', editorial: '#818cf8', impact: '#f472b6' };
                  return (
                    <div className="mt-2 space-y-2">
                      {Object.entries(variants).map(([styleKey, variant]) => {
                        const succeeded = variant.renders.filter(r => r.status === 'succeeded');
                        const color = STYLE_COLORS[styleKey] ?? '#a78bfa';
                        return (
                          <div key={styleKey} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${color}25`, background: `${color}06` }}>
                            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${color}15` }}>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
                                  {variant.label}
                                </p>
                                <p className="text-[9px] text-slate-600">{variant.description}</p>
                              </div>
                              <span className="text-[9px] font-semibold" style={{ color: succeeded.length === variant.renders.length ? '#a3e635' : '#94a3b8' }}>
                                {succeeded.length}/{variant.renders.length} hazır
                              </span>
                            </div>
                            <div className="divide-y divide-white/[0.03]">
                              {variant.renders.map((r) => (
                                <div key={r.format} className="flex items-center justify-between px-3 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold" style={{ color: r.status === 'succeeded' ? '#a3e635' : r.status === 'failed' ? '#f87171' : '#94a3b8' }}>
                                      {r.status === 'succeeded' ? '✓' : r.status === 'failed' ? '✕' : '⟳'}
                                    </span>
                                    <span className="text-[10px] font-medium text-white capitalize">{r.format}</span>
                                    <span className="text-[9px] text-slate-700">{r.width}×{r.height}</span>
                                  </div>
                                  {r.output_url && (
                                    <a href={r.output_url} target="_blank" rel="noreferrer"
                                      className="text-[9px] font-semibold hover:opacity-80 transition" style={{ color }}>
                                      ↗ İzle
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
            {selectedCanvaMatch?.template && (
              <CanvaMatchCard match={selectedCanvaMatch} hideTemplatePreview />
            )}
            {canUseCanvaTemplate(selected) && selectedCanvaMatch?.template ? (
              <CanvaAutofillPreviewPanel
                match={selectedCanvaMatch}
                effectiveTemplateId={selectedCanvaTemplateIdFor(selectedItem.key, selectedCanvaMatch)}
                effectiveTemplateTitle={
                  canvaTemplateOptions.find(
                    (t) => t.id === selectedCanvaTemplateIdFor(selectedItem.key, selectedCanvaMatch),
                  )?.title ?? selectedCanvaMatch.template.title
                }
                contentTitle={selected.title}
                signalKind={selected.kind}
              />
            ) : null}
            {canUseCanvaTemplate(selected) && (
              <CanvaTemplateSelector
                templates={canvaTemplateOptions}
                value={selectedCanvaTemplateIdFor(selectedItem.key, selectedCanvaMatch)}
                matchedTemplateId={selectedCanvaMatch?.template?.id}
                onChange={(templateId) => updateSelectedCanvaTemplate(selectedItem.key, templateId)}
              />
            )}
            {canUseCanvaTemplate(selected) && selectedCanvaTemplateIdFor(selectedItem.key, selectedCanvaMatch) && selectedCanvaMatch?.template?.id && selectedCanvaTemplateIdFor(selectedItem.key, selectedCanvaMatch) !== selectedCanvaMatch.template.id && (
              <ManualOverrideNotice />
            )}
            {canUseCanvaTemplate(selected) && canvaTemplateMatches && !selectedCanvaMatch?.template && (
              <CanvaNoMatchNotice />
            )}
            {canUseCanvaTemplate(selected) && (
              <button
                type="button"
                onClick={() => generateCanvaDesign(selectedItem)}
                disabled={Boolean(generatingCanva[selectedItem.key]) || canvaHasNoTemplates}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-xs font-semibold text-white shadow-theme-xs transition hover:bg-brand-600 disabled:opacity-45"
              >
                {generatingCanva[selectedItem.key] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {canvaHasNoTemplates ? 'Canva Brand Template bekleniyor' : generatingCanva[selectedItem.key] ? 'Canva şablonu seçiliyor…' : 'Canva hazır şablonuyla oluştur'}
              </button>
            )}
            {selectedCanvaResult && (
              <CanvaOutputCard result={selectedCanvaResult} />
            )}
            {!selected.imageUrl && canGenerateVisual(selected) && (
              <p className="mt-2 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.07] p-3 text-[11px] leading-5 text-cyan-100/75">
                Bu içerikte görsel yoktu. Modal açıldığında AI görsel üretimi otomatik başlatılır; üretim tamamlanınca önizleme burada görünecek.
              </p>
            )}
            {selected.status === 'needs_approval' && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => approveItem(selectedItem)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.12] px-3 py-2 text-[11px] font-semibold text-emerald-100"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Onayla
                </button>
                <button
                  type="button"
                  onClick={() => rejectItem(selectedItem)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-rose-300/25 bg-rose-500/[0.10] px-3 py-2 text-[11px] font-semibold text-rose-100"
                >
                  <X className="h-3.5 w-3.5" /> Reddet
                </button>
              </div>
            )}
          </GlassPanel>
        ) : undefined}
      />
    </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-[9px] uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-gray-700 dark:text-gray-300">{value}</p>
    </div>
  );
}

const CANVA_AUTOFILL_TEXT_PREVIEW = 220;

type CanvaAutofillField =
  NonNullable<CanvaTemplateMatch['autofillData']> extends Record<string, infer V> ? V : never;

function CanvaAutofillPreviewPanel({
  match,
  effectiveTemplateId,
  effectiveTemplateTitle,
  contentTitle,
  signalKind,
}: {
  match: CanvaTemplateMatch;
  effectiveTemplateId: string;
  effectiveTemplateTitle: string;
  contentTitle: string;
  signalKind: string;
}) {
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  if (!match.template?.id) return null;

  const autofill = match.autofillData ?? {};
  const rows = Object.entries(autofill).sort(([a], [b]) => a.localeCompare(b));
  const datasetKeys = match.templateDatasetKeys ?? [];
  const manualVsAi = Boolean(
    match.template.id && effectiveTemplateId && match.template.id !== effectiveTemplateId,
  );

  const toggleKey = (key: string) => {
    setExpandedKeys((cur) => ({ ...cur, [key]: !cur[key] }));
  };

  function renderFieldValue(name: string, field: CanvaAutofillField): ReactNode {
    if (field.type === 'text') {
      const full = field.text ?? '';
      const long = full.length > CANVA_AUTOFILL_TEXT_PREVIEW;
      const open = expandedKeys[name] === true;
      const shown = long && !open ? `${full.slice(0, CANVA_AUTOFILL_TEXT_PREVIEW)}…` : full;
      return (
        <span className="block">
          <span className="whitespace-pre-wrap break-words">{shown}</span>
          {long ? (
            <button
              type="button"
              onClick={() => toggleKey(name)}
              className="mt-1 block text-[10px] font-semibold text-cyan-200/90 underline-offset-2 hover:underline"
            >
              {open ? 'Daralt' : 'Tam metin'}
            </button>
          ) : null}
        </span>
      );
    }
    if (field.type === 'image') {
      return (
        <span>
          <span className="text-white/50">Görsel · </span>
          <code className="text-[9px] text-emerald-200/90">{field.asset_id}</code>
        </span>
      );
    }
    return <code className="text-[9px] text-white/60">{JSON.stringify(field)}</code>;
  }

  return (
    <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-500/[0.08] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/85">Canva autofill önizlemesi</p>
      <p className="mt-1 text-[11px] leading-relaxed text-cyan-100/70">
        &quot;Canva hazır şablonuyla oluştur&quot;a basmadan önce şablona yazılacak başlık ve dataset alanları.
      </p>
      {manualVsAi ? (
        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-amber-100/90">
          Tablo, <span className="font-semibold">AI eşleşen şablon</span> için hesaplanan autofill&apos;ı gösterir. Açılır listeden{' '}
          <span className="font-semibold">farklı şablon</span> seçtiyseniz, gönderim anında sunucu değerleri o şablona göre yeniden üretir.
        </p>
      ) : null}
      <dl className="mt-3 space-y-2 text-[11px]">
        <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
          <dt className="text-[9px] font-semibold uppercase tracking-wide text-white/45">İçerik başlığı</dt>
          <dd className="mt-1 font-medium leading-snug text-white/90">{contentTitle}</dd>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
          <dt className="text-[9px] font-semibold uppercase tracking-wide text-white/45">Format</dt>
          <dd className="mt-1 text-white/80">{signalKind}</dd>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
          <dt className="text-[9px] font-semibold uppercase tracking-wide text-white/45">Şu an seçili şablon</dt>
          <dd className="mt-1 text-white/85">
            <span className="font-semibold">{effectiveTemplateTitle}</span>
            <span className="mt-0.5 block font-mono text-[10px] text-white/50">{effectiveTemplateId || match.template.id}</span>
          </dd>
        </div>
      </dl>
      {rows.length > 0 ? (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-black/25">
          <table className="w-full table-fixed text-left text-[10px]">
            <thead className="sticky top-0 z-[1] bg-black/90 text-[9px] uppercase tracking-wide text-white/45 backdrop-blur-sm">
              <tr>
                <th className="w-[34%] px-2 py-1.5 font-semibold">Dataset alanı</th>
                <th className="px-2 py-1.5 font-semibold">Gönderilecek değer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, field]) => (
                <tr key={name} className="border-t border-white/5 align-top">
                  <td className="px-2 py-2 font-mono text-cyan-200/90">{name}</td>
                  <td className="px-2 py-2 text-white/75 break-words">{renderFieldValue(name, field)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : datasetKeys.length > 0 ? (
        <p className="mt-2 text-[10px] text-white/55">
          Şablonda tanımlı alanlar: <span className="font-mono text-white/70">{datasetKeys.join(', ')}</span>
          {match.missingFields?.length
            ? ` — bu içerik için eksik: ${match.missingFields.join(', ')}`
            : ' — bu içerik için henüz dolu autofill yok'}.
        </p>
      ) : (
        <p className="mt-2 text-[10px] text-white/50">Bu şablon için dataset alanı yok veya liste henüz yüklenmedi.</p>
      )}
      {match.missingFields && match.missingFields.length > 0 && rows.length > 0 ? (
        <p className="mt-2 text-[10px] text-amber-200/75">Eksik alanlar: {match.missingFields.join(', ')}</p>
      ) : null}
      {match.validationWarnings && match.validationWarnings.length > 0 ? (
        <p className="mt-2 text-[10px] text-amber-200/80">{match.validationWarnings.join(' · ')}</p>
      ) : null}
    </div>
  );
}

function CanvaTemplateSelector({
  templates,
  value,
  matchedTemplateId,
  onChange,
  compact = false,
}: {
  templates: Array<{ id: string; title: string }>;
  value: string;
  matchedTemplateId?: string;
  onChange: (templateId: string) => void;
  compact?: boolean;
}) {
  if (templates.length === 0) return null;

  return (
    <div className={compact ? 'rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]' : 'mt-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3'}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={compact ? 'text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400' : 'text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60'}>
          Canva template
        </p>
        {value && value === matchedTemplateId && (
          <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-300">
            AI match
          </span>
        )}
        {value && matchedTemplateId && value !== matchedTemplateId && (
          <span className="rounded-full border border-warning-200 bg-warning-50 px-2 py-0.5 text-[10px] font-semibold text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-300">
            Manual override
          </span>
        )}
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={compact
          ? 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-theme-xs outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200'
          : 'w-full rounded-xl border border-white/10 bg-gray-950/80 px-3 py-2.5 text-xs font-semibold text-white outline-none focus:border-brand-300'}
      >
        <option value="">Template seç</option>
        {templates.map((template, index) => (
          <option key={template.id} value={template.id}>
            {template.title || `Untitled Brand Template ${index + 1}`}
            {template.id === matchedTemplateId ? ' (AI match)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function ManualOverrideNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p className={compact
      ? 'rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[11px] leading-5 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-300'
      : 'mt-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-[11px] leading-5 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-300'}
    >
      Manual override seçildi. Üretim sırasında aynı policy gate tekrar çalışır; blocked template, eksik alan veya eksik asset varsa tasarım oluşturulmaz.
    </p>
  );
}

function CanvaNoMatchNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p className={compact
      ? 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] leading-5 text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400'
      : 'mt-2 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-[11px] leading-5 text-white/70'}
    >
      Bu içerik için eligible AI template bulunamadı. Brand Hub&apos;da template contract&apos;ını genişlet veya manuel template seçerek policy kontrolünü çalıştır.
    </p>
  );
}

function CanvaMatchCard({
  match,
  compact = false,
  /** Modal gibi yerlerde ana önizleme zaten solda; tekrar küçük görsel gösterme */
  hideTemplatePreview = false,
}: {
  match: CanvaTemplateMatch;
  compact?: boolean;
  hideTemplatePreview?: boolean;
}) {
  const topReason = match.reasons?.find((reason) => !reason.startsWith('missing')) ?? match.reasons?.[0];
  const decisionIssues = [
    ...(match.blockedReasons ?? []),
    ...(match.missingFields ?? []).map((field) => `Eksik alan: ${field}`),
    ...(match.missingAssetIntents ?? []).map((asset) => `Eksik asset: ${asset}`),
  ];
  const warnings = [
    ...(match.policyWarnings ?? []),
    ...(match.riskSignals ?? []).map((signal) => `Risk sinyali: ${signal}`),
  ];
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-brand-700 shadow-theme-xs dark:border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-400">
      {match.template?.previewUrl && !compact && !hideTemplatePreview && (
        <div className="mb-3 overflow-hidden rounded-lg border border-brand-200 bg-white/70 dark:border-brand-500/20 dark:bg-black/20">
          <img src={match.template.previewUrl} alt={`${match.template.title} preview`} className="aspect-video w-full object-cover" />
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">
            AI template seçimi: {match.template?.title || 'Untitled Brand Template'}
          </p>
          <p className="mt-1 text-[11px] leading-5 opacity-80">
            Skor {Math.round(match.score ?? 0)}
            {match.template?.aspectRatio ? ` · ${match.template.aspectRatio}` : ''}
            {match.filledFields?.length ? ` · ${match.filledFields.length} alan dolacak` : ''}
          </p>
        </div>
        <StatusPill label={match.eligibility ? formatDecisionLabel(match.eligibility) : 'matched'} tone={canvaEligibilityTone(match.eligibility)} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {match.riskTier && (
          <StatusPill label={`risk: ${formatDecisionLabel(match.riskTier)}`} tone={canvaRiskTone(match.riskTier)} />
        )}
        {match.approvalRequired && (
          <StatusPill label="manual approval" tone="amber" />
        )}
        {match.requiredAssetIntents?.length ? (
          <StatusPill label={`${match.requiredAssetIntents.length} required asset`} tone="cyan" />
        ) : null}
        {match.template?.previewUrl && (
          <StatusPill label={match.template.previewStale ? 'preview stale' : 'preview'} tone={match.template.previewStale ? 'amber' : 'emerald'} />
        )}
      </div>
      {!compact && topReason && (
        <p className="mt-2 rounded-lg border border-brand-200 bg-white/70 px-3 py-2 text-[11px] leading-5 text-brand-700 dark:border-brand-500/20 dark:bg-white/[0.04] dark:text-brand-300">
          {topReason}
        </p>
      )}
      {decisionIssues.length > 0 && (
        <div className="mt-2 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-[11px] leading-5 text-error-700 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-400">
          <p className="font-semibold">Üretim öncesi çözülmeli</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {decisionIssues.slice(0, compact ? 2 : 5).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[11px] leading-5 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <p className="font-semibold">Policy uyarısı</p>
              <p className={compact ? 'line-clamp-2' : undefined}>{warnings.slice(0, compact ? 2 : 4).join(' · ')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CanvaOutputCard({ result, compact = false }: { result: CanvaDesignResult; compact?: boolean }) {
  const ready = Boolean(result.editUrl);
  const statusLabel = result.status ? result.status.replace(/_/g, ' ') : ready ? 'ready' : 'pending';

  return (
    <div className="overflow-hidden rounded-xl border border-success-200 bg-success-50 text-success-700 shadow-theme-xs dark:border-success-500/20 dark:bg-success-500/15 dark:text-success-500">
      {result.thumbnailUrl && !compact && (
        <div className="aspect-video w-full overflow-hidden bg-white/60 dark:bg-black/20">
          <img src={result.thumbnailUrl} alt="Canva generated design preview" className="h-full w-full object-cover" />
        </div>
      )}
      <div className={compact ? 'space-y-2 px-3 py-2' : 'space-y-3 p-3'}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">
              {result.templateTitle || 'Canva template'} seçildi
            </p>
            <p className="mt-1 text-[11px] leading-5 opacity-80">
              {typeof result.score === 'number' && `Template skoru: ${Math.round(result.score)} · `}
              Job: {statusLabel}
              {result.riskTier ? ` · risk: ${formatDecisionLabel(result.riskTier)}` : ''}
              {result.permanentPreviewUrl ? ' · kalıcı preview hazır' : result.exportStatus ? ` · export: ${result.exportStatus}` : ''}
            </p>
          </div>
          <StatusPill label={ready ? 'Design ready' : statusLabel} tone={ready ? 'emerald' : 'amber'} />
        </div>

        {(result.eligibility || result.approvalRequired) && (
          <div className="flex flex-wrap gap-1.5">
            {result.eligibility && (
              <StatusPill label={formatDecisionLabel(result.eligibility)} tone={canvaEligibilityTone(result.eligibility)} />
            )}
            {result.approvalRequired && (
              <StatusPill label="approval required" tone="amber" />
            )}
          </div>
        )}

        {ready ? (
          <a
            href={result.editUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-success-600 px-3 py-2 text-xs font-semibold text-white shadow-theme-xs transition hover:bg-success-700 dark:bg-success-500 dark:hover:bg-success-600"
          >
            Canva tasarımını aç
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[11px] leading-5 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-300">
            Canva tasarımı hazırlanıyor. Birkaç saniye sonra kartı yenileyerek veya tekrar oluşturarak linki alabilirsin.
          </p>
        )}
      </div>
    </div>
  );
}
