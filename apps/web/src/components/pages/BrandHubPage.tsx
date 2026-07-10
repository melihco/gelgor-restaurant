'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Layers3,
  Link2,
  Loader2,
  Palette,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { apiClient, toUserFriendlyApiError } from '@/lib/api-client';
import {
  analyzeCanvaTemplateContract,
  listCanvaFieldDefinitions,
} from '@/lib/canva-field-dictionary';
import { syncDiscoveryReferenceAssets } from '@/lib/discovery-asset-sync';
import { useNavigationStore } from '@/stores/navigation-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type {
  CanvaTemplateAssignment,
  CompanyProfile,
  OfficeBrandProfile,
  PythonBrandAnalyzeResponse,
  TenantMediaAsset,
  UpsertCanvaTemplateAssignmentRequest,
  UpsertOfficeBrandProfileRequest,
  UpsertTenantMediaAssetRequest,
} from '@/types';
import Label from '@/tailadmin/components/form/Label';
import Input from '@/tailadmin/components/form/input/InputField';
import TextArea from '@/tailadmin/components/form/input/TextArea';
import Button from '@/tailadmin/components/ui/button/Button';
import type {
  CanvaAspectRatio,
  CanvaContentKind,
  CanvaTemplateDatasetField,
  CanvaTemplateGovernanceStatus,
  CanvaTemplateObjective,
  CanvaTemplateRiskTier,
  CanvaTemplateTone,
} from '@/lib/canva-template-selection';
import {
  GlassPanel,
  MetricCard,
  MetricsGrid,
  SectionHeader,
  StatusPill,
} from '@/tailadmin/components/application/PageElements';
import { TenantOperatingCapabilitiesEditor } from '@/components/brand/TenantOperatingCapabilitiesEditor';
import {
  afterPillarsMirroredToPython,
  mirrorPillarsToPythonBrandContext,
  parseContentIntentSlugs,
} from '@/lib/content-pillars-sync';
import {
  evaluateGalleryAssetPolicy,
  resolveTenantOperatingProfile,
} from '@/lib/tenant-operating-policy';
import type { SaveCompanyProfileRequest } from '@/types';

interface CanvaStatus {
  tenantId?: string;
  connected: boolean;
  templateCount: number;
  templates: CanvaTemplateSummary[];
  connectUrl?: string;
  error?: string;
}

interface CanvaTemplateSummary {
  id: string;
  title: string;
  enabled?: boolean;
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
  dataset?: Record<string, CanvaTemplateDatasetField>;
}

type CanvaTemplateSavePayload = Partial<CanvaTemplateSummary> & {
  dataset?: Record<string, CanvaTemplateDatasetField>;
};

type SocialPlatformFilter = 'all' | 'instagram' | 'tiktok' | 'twitter' | 'facebook' | 'linkedin' | 'ads';

const SOCIAL_PLATFORM_TABS: Array<{ id: SocialPlatformFilter; label: string }> = [
  { id: 'all', label: 'Tümü' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'twitter', label: 'Twitter / X' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'ads', label: 'Ads' },
];

interface CanvaTemplatesResponse {
  tenantId?: string;
  count: number;
  templates: CanvaTemplateSummary[];
  error?: string;
  connectUrl?: string;
}

const FIELD_DEFINITIONS = listCanvaFieldDefinitions();
const REQUIRED_FIELDS = FIELD_DEFINITIONS.filter((field) => field.required && field.type === 'text');
const RECOMMENDED_TEXT_FIELDS = FIELD_DEFINITIONS.filter((field) => field.type === 'text');
const CONTENT_KIND_OPTIONS: CanvaContentKind[] = ['instagram_post', 'instagram_story', 'instagram_reel', 'instagram_plan', 'ad_campaign', 'ad_creative', 'generic'];
const ASPECT_RATIO_OPTIONS: CanvaAspectRatio[] = ['1:1', '4:5', '9:16', '16:9', 'freeform'];
const OBJECTIVE_OPTIONS: CanvaTemplateObjective[] = ['announcement', 'event_promo', 'menu_launch', 'review_reply', 'campaign_analysis', 'offer', 'storytelling', 'generic'];
const TONE_OPTIONS: CanvaTemplateTone[] = ['luxury', 'energetic', 'minimal', 'corporate', 'storytelling', 'generic'];
const RISK_TIER_OPTIONS: CanvaTemplateRiskTier[] = ['low', 'medium', 'high', 'blocked'];
const TEMPLATE_STATUS_OPTIONS: CanvaTemplateGovernanceStatus[] = ['draft', 'approved', 'needs_review', 'disabled'];
const ASSET_TYPE_OPTIONS = ['hero_image', 'artist_photo', 'product_image', 'brand_background', 'logo', 'venue_photo'];
const TEMPLATE_USE_CASE_OPTIONS = ['event_announcement', 'product_showcase', 'offer_campaign', 'social_proof', 'weekly_calendar', 'brand_story'];

const TENANT_PIPELINE = [
  {
    title: 'Tenant marka profili',
    description: 'Her tenant kendi marka adı, sektör, ton ve hedef kitlesiyle agent brieflerini besler.',
    icon: Building2,
  },
  {
    title: 'Canva OAuth bağlantısı',
    description: 'Tenant adına alınan token Canva API çağrılarında kullanılır. Dev ortamında bu token lokal dosyada tutuluyor.',
    icon: Link2,
  },
  {
    title: 'Brand Template envanteri',
    description: 'Canva içinde yayınlanan Brand Template listesi çekilir ve agent karar motoruna aday olarak verilir.',
    icon: Layers3,
  },
  {
    title: 'Agent autofill üretimi',
    description: "Agent başlık, caption, CTA ve hashtag üretir; uygun template seçilip Canva'da düzenlenebilir design oluşur.",
    icon: Sparkles,
  },
];

const STARTER_TEMPLATES = [
  {
    family: 'EVENT_PROMO_REEL',
    title: 'Event Promo Reel',
    format: '9:16 Reel',
    objective: 'Live music, party, dinner show, special event',
    tone: 'Energetic / premium',
  },
  {
    family: 'OFFER_STORY',
    title: 'Offer Story',
    format: '9:16 Story',
    objective: 'Limited-time offer, discount, reservation push',
    tone: 'Urgent / clear CTA',
  },
  {
    family: 'MENU_POST',
    title: 'Menu Launch Post',
    format: '1:1 Feed',
    objective: 'New menu, product, food highlight',
    tone: 'Premium / appetizing',
  },
  {
    family: 'REVIEW_TESTIMONIAL',
    title: 'Review/Testimonial',
    format: '1:1 Feed',
    objective: 'Guest review, social proof, reputation',
    tone: 'Trustworthy / warm',
  },
  {
    family: 'WEEKLY_CALENDAR',
    title: 'Weekly Calendar',
    format: '16:9 or carousel cover',
    objective: 'Weekly plan, multiple events, calendar overview',
    tone: 'Organized / editorial',
  },
];

async function fetchCanvaStatus(tenantId: string, officeId?: string): Promise<CanvaStatus> {
  const response = await fetch(`/api/canva/status?${new URLSearchParams({ tenantId, ...(officeId ? { officeId } : {}) })}`);
  const result = await response.json() as CanvaStatus;
  if (!response.ok) {
    return {
      connected: false,
      templateCount: 0,
      templates: [],
      connectUrl: result.connectUrl ?? '/api/canva/oauth/login',
      error: result.error ?? 'Canva durum bilgisi alınamadı.',
    };
  }
  return result;
}

async function fetchCanvaTemplates(tenantId: string, officeId?: string): Promise<CanvaTemplatesResponse> {
  const response = await fetch(`/api/canva/templates?${new URLSearchParams({ tenantId, ...(officeId ? { officeId } : {}) })}`);
  const result = await response.json() as CanvaTemplatesResponse;
  if (!response.ok) {
    return {
      count: 0,
      templates: [],
      connectUrl: result.connectUrl ?? '/api/canva/oauth/login',
      error: result.error ?? 'Canva template listesi alınamadı.',
    };
  }
  return result;
}

async function updateCanvaTemplateRegistry(input: Partial<CanvaTemplateSummary> & { tenantId: string; templateId: string }) {
  const response = await fetch('/api/canva/template-registry', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'Canva template registry güncellenemedi.');
  return result;
}

async function refreshTemplatePreview(input: { tenantId: string; officeId?: string; templateId: string; brandName?: string }) {
  const response = await fetch('/api/canva/template-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = await response.json() as { error?: string; pending?: boolean };
  if (response.status === 202 && result.pending) {
    throw new Error('Canva preview render job hâlâ hazırlanıyor. Birkaç saniye sonra Preview yenile ile tekrar dene.');
  }
  if (!response.ok) throw new Error(result.error ?? 'Template preview üretilemedi.');
  return result;
}

function assignmentRequestFromTemplate(
  template: CanvaTemplateSummary,
  payload: CanvaTemplateSavePayload,
  officeId?: string | null,
): UpsertCanvaTemplateAssignmentRequest {
  return {
    officeId: officeId || null,
    canvaTemplateId: template.id,
    name: payload.title || template.title || 'Untitled Brand Template',
    contentKinds: JSON.stringify(payload.contentKinds?.length ? payload.contentKinds : template.contentKinds ?? ['generic']),
    useCases: JSON.stringify(payload.useCases?.length ? payload.useCases : template.useCases ?? []),
    templateFamilyId: payload.templateFamilyId ?? template.templateFamilyId ?? '',
    allowedIntents: JSON.stringify(payload.allowedIntents?.length ? payload.allowedIntents : template.allowedIntents ?? payload.useCases ?? template.useCases ?? []),
    allowedChannels: JSON.stringify(payload.allowedChannels?.length ? payload.allowedChannels : template.allowedChannels ?? payload.contentKinds ?? template.contentKinds ?? []),
    requiredAssetIntents: JSON.stringify(payload.requiredAssetIntents?.length ? payload.requiredAssetIntents : template.requiredAssetIntents ?? []),
    riskTier: payload.riskTier ?? template.riskTier ?? 'low',
    status: payload.status ?? template.status ?? 'draft',
    manualApprovalRequired: payload.manualApprovalRequired ?? template.manualApprovalRequired ?? false,
    aspectRatio: payload.aspectRatio ?? template.aspectRatio ?? '1:1',
    datasetContract: JSON.stringify(payload.dataset ?? template.dataset ?? {}),
    enabled: payload.enabled ?? template.enabled ?? true,
    priority: payload.priority ?? template.priority ?? 0,
    brandFitScore: payload.brandFit ?? template.brandFit ?? 0,
    notes: payload.notes ?? template.notes ?? '',
  };
}

// ── Gallery Analysis Panel ────────────────────────────────────────────────────

import type { GalleryPhotoAnalysis } from '@/app/api/analyze-gallery/route';
import { BrandTemplateLibraryPanel } from '@/components/brand/BrandTemplateLibraryPanel';
import { normalizeSectorId } from '@/lib/announcement-template-library';
import { parseBrandReferenceUrls } from '@/lib/gallery-upload';

function GalleryAnalysisPanel({
  urls,
  mediaAssets,
  onAnalysisComplete,
  workspaceId,
}: {
  urls: string[];
  mediaAssets: TenantMediaAsset[];
  onAnalysisComplete: (results: GalleryPhotoAnalysis[]) => Promise<void>;
  workspaceId: string;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<GalleryPhotoAnalysis[]>([]);
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  // Filter out ephemeral CDN URLs upfront
  const EPHEMERAL_CDN = /scontent-|cdninstagram\.com|fbcdn\.net/i;
  const validUrls = urls.filter((u) => !EPHEMERAL_CDN.test(u));
  const ephemeralCount = urls.length - validUrls.length;

  // Load persisted analysis from Python DB on mount
  useEffect(() => {
    if (!workspaceId || loadedFromCache) return;
    fetch(`/api/brand-context/${workspaceId}/gallery-analysis`)
      .then((r) => r.json())
      .then((data) => {
        const cache = data.analysis as Record<string, Record<string, unknown>> | undefined;
        if (!cache || Object.keys(cache).length === 0) return;

        // Python stores snake_case — convert to camelCase for the frontend type
        const normalize = (raw: Record<string, unknown>): GalleryPhotoAnalysis => ({
          url: String(raw.url ?? ''),
          description: String(raw.description ?? ''),
          contentTags: (raw.content_tags ?? raw.contentTags ?? []) as string[],
          bestFor: (raw.best_for ?? raw.bestFor ?? []) as string[],
          notGoodFor: (raw.not_good_for ?? raw.notGoodFor ?? []) as string[],
          mood: String(raw.mood ?? ''),
          hasPeople: Boolean(raw.has_people ?? raw.hasPeople),
          hasText: Boolean(raw.has_text ?? raw.hasText),
          isLogo: Boolean(raw.is_logo ?? raw.isLogo),
          suggestedAssetType: String(raw.suggested_asset_type ?? raw.suggestedAssetType ?? 'venue_reference'),
          usageContext: String(raw.usage_context ?? raw.usageContext ?? ''),
        });

        const cached = urls
          .map((url) => cache[url])
          .filter((r): r is Record<string, unknown> => Boolean(r))
          .map(normalize);
        if (cached.length > 0) setResults(cached);
        setLoadedFromCache(true);
      })
      .catch(() => { setLoadedFromCache(true); });
  }, [workspaceId, urls, loadedFromCache]);

  const analyzed = results.length > 0;
  const resultsByUrl = Object.fromEntries(results.map((r) => [r.url, r]));

  // Only analyze valid, accessible, not-yet-cached URLs
  const unanalyzedUrls = validUrls.filter((u) => !resultsByUrl[u] && !brokenUrls.has(u));

  async function runAnalysis() {
    const toAnalyze = (unanalyzedUrls.length > 0 ? unanalyzedUrls : validUrls).filter((u) => !brokenUrls.has(u));
    setAnalyzing(true);
    setError('');
    try {
      const res = await fetch('/api/analyze-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetUrls: toAnalyze.slice(0, 80) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analiz başarısız');
      const newResults: GalleryPhotoAnalysis[] = data.results ?? [];
      const newErrors: { url: string }[] = data.errors ?? [];
      // Track broken URLs so they're excluded from future analysis
      if (newErrors.length > 0) {
        setBrokenUrls((prev) => new Set([...prev, ...newErrors.map((e) => e.url)]));
      }
      const merged = [...results.filter((r) => !newResults.find((n) => n.url === r.url)), ...newResults];
      setResults(merged);

      // Persist to Python DB
      if (workspaceId && newResults.length > 0) {
        fetch(`/api/brand-context/${workspaceId}/gallery-analysis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            results: newResults.map((r) => ({
              url: r.url,
              description: r.description,
              content_tags: r.contentTags,
              best_for: r.bestFor,
              not_good_for: r.notGoodFor,
              mood: r.mood,
              has_people: r.hasPeople,
              has_text: r.hasText,
              is_logo: r.isLogo,
              suggested_asset_type: r.suggestedAssetType,
              usage_context: r.usageContext,
            })),
          }),
        }).catch(() => {});
      }

      await onAnalysisComplete(newResults);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analiz başarısız');
    } finally {
      setAnalyzing(false);
    }
  }

  const alreadyAnalyzed = results.length;

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} className="px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Mekan Galerisi ({urls.length} görsel)
          </p>
          {alreadyAnalyzed > 0 && (
            <p className="mt-0.5 text-[10px] text-emerald-500/70">
              {alreadyAnalyzed}/{urls.length} analiz edildi
              {unanalyzedUrls.length > 0 ? ` · ${unanalyzedUrls.length} eksik` : ' · tümü hazır'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={analyzing}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-50"
          style={{
            background: analyzing ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.25)',
            color: '#818cf8',
          }}
        >
          {analyzing
            ? <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" /> Analiz ediliyor…</>
            : <><span>🔍</span> {unanalyzedUrls.length > 0 ? `${unanalyzedUrls.length} görseli analiz et` : 'Tümünü yeniden analiz et'}</>
          }
        </button>
      </div>

      {ephemeralCount > 0 && (
        <p className="mb-2 text-[10px] text-amber-400/80">
          ⚠ {ephemeralCount} Instagram CDN görseli filtrelendi (geçici URL, süresi dolmuş)
        </p>
      )}
      {brokenUrls.size > 0 && (
        <p className="mb-2 text-[10px] text-red-400/70">
          ✕ {brokenUrls.size} görsel erişilemiyor — analiz ve seçimde kullanılmayacak
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {validUrls.slice(0, 48).map((url, i) => {
          if (brokenUrls.has(url)) return null;
          const r = resultsByUrl[url];
          const asset = mediaAssets.find((a) => a.url === url);
          const hasMeta = r || (asset?.tags && asset.tags.length > 0);
          const tags = r?.contentTags ?? (asset?.tags ? asset.tags.split(',').map((t) => t.trim()).filter((t) => !t.includes('source:discovery')) : []);
          const bestFor = r?.bestFor?.slice(0, 2) ?? [];
          return (
            <div key={i} className="group relative flex flex-col gap-1" style={{ width: 80 }}>
              <a href={url} target="_blank" rel="noreferrer"
                className="relative overflow-hidden rounded-lg transition hover:ring-2 hover:ring-indigo-400/60 block"
                style={{ width: 80, height: 80 }}>
                <img src={url} alt="" className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                {hasMeta && (
                  <div className="absolute top-1 right-1 rounded-full bg-emerald-500 h-2 w-2" title="Analiz edildi" />
                )}
              </a>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                  {tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="rounded px-1 py-0.5 text-[8px] leading-none text-indigo-300/80"
                      style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.18)' }}>
                      {tag}
                    </span>
                  ))}
                  {bestFor.slice(0, 1).map((bf) => (
                    <span key={bf} className="rounded px-1 py-0.5 text-[8px] leading-none text-emerald-300/80"
                      style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                      {bf.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-2 text-[10px] text-red-400">{error}</p>
      )}

      <p className="mt-3 text-[10px] text-slate-700">
        {analyzed
          ? `${results.length} görsel analiz edildi — Content Studio artık doğru görseli seçebilir.`
          : 'AI analizi: her görselin içeriğini, uygun içerik tiplerini ve kullanım bağlamını çıkarır. Content Studio bu bilgiyle doğru görseli otomatik seçer.'}
      </p>
    </div>
  );
}

export default function BrandHubPage() {
  const navigate = useNavigationStore((state) => state.navigate);
  const queryClient = useQueryClient();
  const tenantId = useWorkspaceStore((s) => s.tenantId);
  const officeId = useWorkspaceStore((s) => s.officeId);
  const setOfficeId = useWorkspaceStore((s) => s.setOfficeId);
  const [platformFilter, setPlatformFilter] = useState<SocialPlatformFilter>('all');
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const [previewTemplate, setPreviewTemplate] = useState<CanvaTemplateSummary | null>(null);
  const { data: companyProfile } = useQuery<CompanyProfile>({
    queryKey: ['company-profile'],
    queryFn: () => apiClient.getCompanyProfile(),
    staleTime: 120_000,
  });
  const {
    data: canvaStatus,
    isFetching: statusFetching,
    refetch: refetchStatus,
  } = useQuery<CanvaStatus>({
    queryKey: ['canva-status', tenantId, officeId],
    queryFn: () => fetchCanvaStatus(tenantId, officeId),
    staleTime: 30_000,
    enabled: process.env.NEXT_PUBLIC_CANVA_ENABLED === 'true' && Boolean(tenantId),
  });
  const {
    data: canvaTemplates,
    isFetching: templatesFetching,
    refetch: refetchTemplates,
  } = useQuery<CanvaTemplatesResponse>({
    queryKey: ['canva-templates', tenantId, officeId],
    queryFn: () => fetchCanvaTemplates(tenantId, officeId),
    staleTime: 30_000,
    enabled: process.env.NEXT_PUBLIC_CANVA_ENABLED === 'true' && Boolean(tenantId),
  });
  const { data: mediaAssets = [] } = useQuery<TenantMediaAsset[]>({
    queryKey: ['brand-context-assets', tenantId, officeId],
    queryFn: () => apiClient.getTenantMediaAssets({ officeId }),
    staleTime: 30_000,
  });
  const { data: brandContextRow } = useQuery<Record<string, unknown> | null>({
    queryKey: ['brand-context-data', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const res = await fetch(`/api/brand-context-data/${tenantId}`, {
        headers: { 'X-Tenant-Id': tenantId },
        cache: 'no-store',
      });
      return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
    },
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });
  const { data: officeProfiles = [] } = useQuery<OfficeBrandProfile[]>({
    queryKey: ['brand-context-office-profiles', tenantId],
    queryFn: () => apiClient.getOfficeBrandProfiles(),
    staleTime: 30_000,
  });
  const { data: templateAssignments = [] } = useQuery<CanvaTemplateAssignment[]>({
    queryKey: ['brand-context-canva-assignments', tenantId, officeId],
    queryFn: () => apiClient.getCanvaTemplateAssignments({ officeId, includeDisabled: true }),
    staleTime: 30_000,
  });

  const templates = canvaTemplates?.templates ?? canvaStatus?.templates ?? [];
  const filteredTemplates = useMemo(
    () => templates.filter((template) => templateMatchesSocialFilters(template, platformFilter, contentTypeFilter)),
    [templates, platformFilter, contentTypeFilter],
  );
  const contentTypeTabs = useMemo(
    () => contentTypeOptionsForTemplates(templates, platformFilter),
    [templates, platformFilter],
  );
  const connected = canvaStatus?.connected === true;
  const tenantName = companyProfile?.brandName || "Marka adı (Setup'tan)";
  const tenantIndustry = companyProfile?.industry || 'Hospitality / local growth';
  const templateCount = canvaTemplates?.count ?? canvaStatus?.templateCount ?? 0;
  const healthSummary = summarizeTemplateHealth(templates);
  const currentOfficeProfile = officeProfiles.find((profile) => profile.officeId === officeId);

  /** Python gallery (AI-analyzed) plus discovery-synced media assets. */
  const discoveryImageUrls = useMemo(() => {
    const fromGallery = parseBrandReferenceUrls(brandContextRow?.reference_image_urls);
    const fromAssets = mediaAssets
      .filter((a) => {
        const u = (a.url || '').trim();
        if (!u.startsWith('http')) return false;
        if (a.assetType === 'venue_reference') return true;
        try {
          const parsed = JSON.parse(a.tags || '[]');
          if (Array.isArray(parsed) && parsed.some((x) => String(x).toLowerCase().includes('discovery'))) {
            return true;
          }
        } catch {
          /* ignore */
        }
        return false;
      })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map((a) => a.url.trim());
    return [...new Set([...fromGallery, ...fromAssets])];
  }, [mediaAssets, brandContextRow]);

  useEffect(() => {
    if (contentTypeFilter !== 'all' && !contentTypeTabs.some((option) => option.id === contentTypeFilter)) {
      setContentTypeFilter('all');
    }
  }, [contentTypeFilter, contentTypeTabs]);
  const registryMutation = useMutation({
    mutationFn: async ({ template, payload }: { template: CanvaTemplateSummary; payload: CanvaTemplateSavePayload }) => {
      await updateCanvaTemplateRegistry({ tenantId, templateId: template.id, ...payload });
      return apiClient.upsertCanvaTemplateAssignment(assignmentRequestFromTemplate(template, payload, officeId));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['canva-status', tenantId, officeId] }),
        queryClient.invalidateQueries({ queryKey: ['canva-templates', tenantId, officeId] }),
        queryClient.invalidateQueries({ queryKey: ['brand-context-canva-assignments', tenantId, officeId] }),
        queryClient.invalidateQueries({ queryKey: ['canva-template-matches'] }),
      ]);
    },
  });
  const previewMutation = useMutation({
    mutationFn: (template: CanvaTemplateSummary) => refreshTemplatePreview({
      tenantId,
      officeId,
      templateId: template.id,
      brandName: tenantName,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['canva-status', tenantId, officeId] }),
        queryClient.invalidateQueries({ queryKey: ['canva-templates', tenantId, officeId] }),
        queryClient.invalidateQueries({ queryKey: ['canva-template-matches'] }),
      ]);
    },
  });
  const assetMutation = useMutation({
    mutationFn: (payload: UpsertTenantMediaAssetRequest) => apiClient.createTenantMediaAsset(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-context-assets', tenantId, officeId] }),
  });
  const capabilitiesMutation = useMutation({
    mutationFn: (payload: { operatingCapabilities: string; contentNeeds: string }) => {
      if (!companyProfile) throw new Error('Company profile not loaded');
      return apiClient.saveCompanyProfile({
        ...companyProfile,
        operatingCapabilities: payload.operatingCapabilities,
        contentNeeds: payload.contentNeeds,
      } as SaveCompanyProfileRequest);
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['company-profile'] });
      if (tenantId && variables.contentNeeds !== undefined) {
        const pillars = parseContentIntentSlugs(variables.contentNeeds);
        try {
          await mirrorPillarsToPythonBrandContext(tenantId, pillars);
          await afterPillarsMirroredToPython(queryClient, tenantId);
        } catch {
          /* Nexus saved; Python mirror is best-effort */
        }
      }
    },
  });
  const officeProfileMutation = useMutation({
    mutationFn: (payload: UpsertOfficeBrandProfileRequest) => apiClient.upsertOfficeBrandProfile(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-context-office-profiles', tenantId] }),
  });

  const brandIntelMutation = useMutation({
    mutationFn: async () => {
      const profile = queryClient.getQueryData<CompanyProfile>(['company-profile']);
      const website = (profile?.websiteUrl || currentOfficeProfile?.websiteUrl || '').trim();
      const ig = (profile?.instagramHandle || '').trim();
      const gb = (profile?.googleBusinessUrl || '').trim();
      if (!website && !ig && !gb) {
        throw new Error(
          'Web sitesi veya Instagram / Google Business bilgisi yok. Integrations (Setup) ekranında şirket profilini kaydedin veya aşağıdaki Office profile içinde Website alanını doldurun.',
        );
      }
      const [nexusResult, pythonResult] = await Promise.allSettled([
        apiClient.discoverBrand({
          websiteUrl: website || undefined,
          instagramHandle: ig || undefined,
          googleBusinessUrl: gb || undefined,
          applyToProfile: true,
        }),
        tenantId
          ? apiClient
              .analyzeBrandContext(tenantId, {
                websiteUrl: website,
                instagramHandle: ig,
                googleBusinessUrl: gb,
              })
              .catch((err) => ({ success: false, error: String(err) } as PythonBrandAnalyzeResponse))
          : Promise.resolve(null),
      ]);
      if (nexusResult.status !== 'fulfilled') {
        throw nexusResult.reason instanceof Error ? nexusResult.reason : new Error(String(nexusResult.reason));
      }
      const py =
        pythonResult.status === 'fulfilled' && pythonResult.value && 'success' in pythonResult.value
          ? pythonResult.value
          : null;
      const pyErr = py && !py.success && py.error ? String(py.error) : null;
      const pythonAnalyze = py && py.success ? py : null;
      return { data: nexusResult.value, pythonError: pyErr, pythonAnalyze };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['company-profile'] });
      const urls = result.pythonAnalyze?.reference_image_urls;
      if (urls?.length && tenantId) {
        const { created } = await syncDiscoveryReferenceAssets(apiClient, officeId ?? null, urls);
        if (created > 0) {
          await queryClient.invalidateQueries({ queryKey: ['brand-context-assets', tenantId, officeId] });
        }
      }
    },
  });

  const brandAnalysisError = brandIntelMutation.error
    ? toUserFriendlyApiError(brandIntelMutation.error, 'Marka analizi tamamlanamadı.')
    : null;

  const websiteForAnalysis = (companyProfile?.websiteUrl || currentOfficeProfile?.websiteUrl || '').trim();
  const hasBrandIntelSources =
    !!websiteForAnalysis ||
    !!(companyProfile?.instagramHandle || '').trim() ||
    !!(companyProfile?.googleBusinessUrl || '').trim();

  // ── Sprint 1-3 intelligence mutations ───────────────────────────────────
  const [sprintStatus, setSprintStatus] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({});

  async function runSprintAction(key: string, endpoint: string, params?: string) {
    if (!tenantId) return;
    setSprintStatus((s) => ({ ...s, [key]: 'loading' }));
    try {
      const url = `/api/brand-context/${tenantId}/${endpoint}${params ?? ''}`;

      // Marka Analizi requires website_url + instagram_handle from company profile
      let body: Record<string, string> | null = null;
      if (endpoint === 'analyze') {
        body = {
          website_url: companyProfile?.websiteUrl ?? '',
          instagram_handle: companyProfile?.instagramHandle ?? '',
          google_business_url: '',
        };
        if (!body.website_url && !body.instagram_handle) {
          setSprintStatus((s) => ({ ...s, [key]: 'error' }));
          alert('Marka analizi için Şirket Profili\'nde website URL veya Instagram handle girilmeli.');
          return;
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; detail?: unknown } | null;
      if (!res.ok) {
        let detail = typeof data?.error === 'string' ? data.error : '';
        const d = data?.detail;
        if (!detail && typeof d === 'string') detail = d;
        if (!detail && Array.isArray(d) && d.length > 0) {
          const first = d[0] as { msg?: string };
          if (first && typeof first.msg === 'string') detail = first.msg;
        }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      setSprintStatus((s) => ({ ...s, [key]: 'done' }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['python-brand-ctx-display', tenantId] }),
      ]);
    } catch {
      setSprintStatus((s) => ({ ...s, [key]: 'error' }));
    }
  }

  function refreshAll() {
    void refetchStatus();
    void refetchTemplates();
  }

  // V2 Tab state
  const [activeTab, setActiveTab] = useState<'intelligence' | 'media' | 'templates' | 'publishing'>('intelligence');

  const V2_TABS = [
    { id: 'intelligence' as const, label: 'Brand Zekası', icon: '🧠', desc: 'AI analizler ve sektör sinyalleri' },
    { id: 'media' as const,        label: 'Medya',        icon: '🖼️', desc: 'Görseller, galeriler, yükleme' },
    { id: 'templates' as const,    label: 'Template\'ler', icon: '🎬', desc: 'Shotstack, Creatomate, video paketi' },
    { id: 'publishing' as const,   label: 'Yayın',        icon: '📡', desc: 'Zamanlanmış gönderiler ve analizler' },
  ] as const;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
    <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">

      {/* Header */}
      <div className="flex items-end justify-between gap-5">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <Palette className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-400">Tenant Brand Operations</span>
          </div>
          <h1 className="text-3xl font-light tracking-[-0.035em] text-white">Brand <span className="font-semibold" style={{ color: '#818cf8' }}>Hub</span></h1>
          <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">Canva connection, Brand Template inventory and agent autofill pipeline in one screen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sprint 1-3 AI Intelligence Buttons */}
          {[
            { key: 'visuals',    label: 'Visual DNA',   endpoint: 'analyze-visuals',   color: '#a78bfa', title: 'GPT-4o Vision ile venue fotoğraflarını analiz et → renk paleti + atmosfer' },
            { key: 'competitor', label: 'Rakip Analiz', endpoint: 'analyze-competitors', color: '#f59e0b', title: 'Apify ile rakip Instagram analizi' },
            { key: 'trends',     label: 'Trend Brief',  endpoint: 'refresh-trends',    color: '#22d3ee', title: 'Haftalık mevsimsel + lokal hashtag bağlamı' },
            { key: 'industry',   label: 'Sektör Analizi',  endpoint: 'industry-intelligence', color: '#34d399', title: 'Sektöre özel mevsimsel takvim, trend ve fırsat analizi — tüm agentlara enjekte edilir' },
            { key: 'brand_dna',     label: 'Marka DNA',    endpoint: 'brand-dna',       color: '#f472b6', title: 'Tüm sinyalleri sentezle → agentların okuduğu master marka brifini yenile' },
            { key: 'monthly_brief', label: 'Aylık Brief',  endpoint: 'monthly-brief',   color: '#fb923c', title: 'Aylık stratejik brief — rakip analizi, sezon planı, kampanya önerileri, başarı metrikleri' },
          ].map(({ key, label, endpoint, color, title }) => {
            const st = sprintStatus[key] || 'idle';
            return (
              <button
                key={key}
                type="button"
                title={title}
                disabled={st === 'loading' || !tenantId}
                onClick={() => void runSprintAction(key, endpoint)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition disabled:opacity-40"
                style={{
                  background: st === 'done' ? `${color}18` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${st === 'done' ? color + '30' : 'rgba(255,255,255,0.09)'}`,
                  color: st === 'done' ? color : '#64748b',
                }}
              >
                {st === 'loading'
                  ? <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                  : st === 'done' ? '✓' : st === 'error' ? '✗' : '▶'}
                {label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={refreshAll}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-300 transition hover:text-white"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${statusFetching || templatesFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── V2 Tab Navigation ─────────────────────────────────────────── */}
      <div className="mb-2 flex items-center gap-1 overflow-x-auto rounded-2xl p-1.5"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}>
        {V2_TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
            className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold transition-all"
            style={{
              background: activeTab === tab.id ? 'rgba(99,102,241,0.18)' : 'transparent',
              border: `1px solid ${activeTab === tab.id ? 'rgba(99,102,241,0.35)' : 'transparent'}`,
              color: activeTab === tab.id ? '#a5b4fc' : 'rgba(148,163,184,0.55)',
            }}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
        <div className="ml-auto">
          <button type="button" onClick={refreshAll}
            className="rounded-xl p-2 transition hover:bg-white/5"
            style={{ color: 'rgba(148,163,184,0.5)' }}>
            <RefreshCw className={`h-3.5 w-3.5 ${statusFetching || templatesFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── TAB: Medya ── */}
      {activeTab === 'media' && (
        <div className="space-y-4">
          <MediaUploadPanel workspaceId={tenantId} officeId={officeId} />
          <BrandIntelligencePanel workspaceId={tenantId} mediaOnly={true} />
          <PinterestInspirationPanel workspaceId={tenantId} />
        </div>
      )}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <BrandTemplateLibraryPanel
            workspaceId={tenantId}
            sector={normalizeSectorId(companyProfile?.industry ?? '')}
            variant="desktop"
          />
          <ShotstackTemplateGallery workspaceId={tenantId} />
          <CreatomateTemplateSelectorPanel workspaceId={tenantId} />
          <BrandTemplateConfigPanel workspaceId={tenantId} />
          <LLMConfigPanel workspaceId={tenantId} />
        </div>
      )}
      {activeTab === 'publishing' && (
        <div className="space-y-4">
          <ScheduledPostsPanel workspaceId={tenantId} />
          <InstagramAnalyticsPanel workspaceId={tenantId} />
        </div>
      )}

      {/* ── Intelligence tab: Sprint panel ──────────────────────────── */}
      {activeTab !== 'intelligence' ? null : <>

      <MetricsGrid>
        <MetricCard label="Current Tenant" value={tenantName} helper={tenantIndustry} icon={Building2} tone="violet" />
        <MetricCard label="Canva OAuth" value={connected ? 'Connected' : 'Not connected'} helper={connected ? 'token active' : 'connect required'} icon={Link2} tone={connected ? 'emerald' : 'amber'} />
        <MetricCard label="Brand Templates" value={templateCount} helper="visible via Canva API" icon={Layers3} tone={templateCount > 0 ? 'emerald' : 'amber'} />
        <MetricCard label="Ready Templates" value={healthSummary.ready} helper={`${healthSummary.attention} need attention`} icon={ShieldCheck} tone={healthSummary.ready > 0 ? 'emerald' : 'amber'} />
        <MetricCard label="Blocked/Disabled" value={healthSummary.blocked} helper="not eligible for render" icon={AlertTriangle} tone={healthSummary.blocked > 0 ? 'rose' : 'emerald'} />
      </MetricsGrid>

      <GlassPanel tone="violet">
        <SectionHeader
          title="Tenant yönetimi"
          subtitle="Tenant ID oturumla hizalı; Office ID Brand Hub ve Content Studio'da ortak seçilir (kalıcı)."
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
          <label className="grid gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            Tenant ID
            <Input value={tenantId} disabled className="opacity-90" />
            <span className="font-sans text-[10px] font-normal text-gray-500 dark:text-gray-400">
              Oturumdaki kiracı; değiştirmek için farklı hesapla giriş yapın.
            </span>
          </label>
          <label className="grid gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            Office ID
            <Input
              value={officeId}
              onChange={(event) => setOfficeId(event.target.value.trim())}
            />
          </label>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Registry scope</p>
            <p className="mt-2 break-all font-mono text-xs text-gray-700 dark:text-gray-300">{canvaTemplates?.tenantId ?? canvaStatus?.tenantId ?? tenantId}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-gray-500 dark:text-gray-400">{officeId || 'tenant-wide'}</p>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel tone={healthSummary.attention > 0 ? 'amber' : 'emerald'}>
        <SectionHeader
          title="Brand/template health dashboard"
          subtitle="Operasyon ekibinin tenant'ın neden üretim yapamadığını hızlı görmesi için template contract ve governance özeti."
          count={templates.length}
        />
        <div className="grid gap-3 md:grid-cols-4">
          <HealthSummaryCard label="Ready" value={healthSummary.ready} tone="emerald" />
          <HealthSummaryCard label="Partial fields" value={healthSummary.partial} tone={healthSummary.partial > 0 ? 'amber' : 'emerald'} />
          <HealthSummaryCard label="Missing required" value={healthSummary.missingRequired} tone={healthSummary.missingRequired > 0 ? 'rose' : 'emerald'} />
          <HealthSummaryCard label="Needs review" value={healthSummary.needsReview} tone={healthSummary.needsReview > 0 ? 'amber' : 'emerald'} />
        </div>
        {healthSummary.topIssues.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {healthSummary.topIssues.map((issue) => (
              <p key={issue} className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-xs leading-5 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-300">
                {issue}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-xs leading-5 text-success-700 dark:border-success-500/20 dark:bg-success-500/15 dark:text-success-400">
            Bu tenant için görünen template contract'ları üretime hazır görünüyor.
          </p>
        )}
      </GlassPanel>

      <GlassPanel tone="cyan">
        <SectionHeader
          title="Tenant sosyal medya brand kit"
          subtitle="Şirket profilinden gelen font, renk ve logo kuralları AI kreatifleri ve Canva template eşleşmesini yönlendirir."
        />
        <div className="grid gap-3 md:grid-cols-3">
          <BrandKitItem label="Primary font" value={companyProfile?.primaryFont} fallback="Tanımlanmadı" />
          <BrandKitItem label="Secondary font" value={companyProfile?.secondaryFont} fallback="Tanımlanmadı" />
          <BrandKitItem label="Brand colors" value={companyProfile?.brandColors} fallback="Tanımlanmadı" />
          <BrandKitItem label="Accent colors" value={companyProfile?.accentColors} fallback="Tanımlanmadı" />
          <BrandKitItem label="Template style" value={companyProfile?.socialTemplateStyle} fallback={companyProfile?.visualStyle || 'Tanımlanmadı'} />
          <BrandKitItem label="Logo rules" value={companyProfile?.logoUsageRules} fallback="Tanımlanmadı" />
        </div>
      </GlassPanel>

      <GlassPanel tone="emerald">
        <SectionHeader
          title="AI marka analizi"
          subtitle="Web sitesi ve şirket profilindeki Instagram / Google Business sinyalleriyle tenant analizi çalıştırır; sonuç Nexus CompanyProfile’a ve (Python ayaktaysa) BrandContext’e yazılır. Yeni tenant kaydında otomatik çalışmaz — girişten sonra buradan veya Integrations ekranından tetikleyin."
        />
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs leading-5 text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
            <p className="font-semibold text-gray-800 dark:text-white/90">Kaynak URL’ler</p>
            <ul className="mt-2 list-inside list-disc space-y-1 break-all font-mono text-[11px]">
              <li>Web: {websiteForAnalysis || '— (şirket profili veya office profile Website)'}</li>
              <li>Instagram: {(companyProfile?.instagramHandle || '').trim() || '—'}</li>
              <li>Google Business: {(companyProfile?.googleBusinessUrl || '').trim() || '—'}</li>
            </ul>
          </div>
          {brandAnalysisError && (
            <div className="rounded-xl border border-error-200 bg-error-50 p-3 text-xs text-error-700 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-400">
              <p className="font-semibold">{brandAnalysisError.title}</p>
              <p className="mt-1 opacity-90">{brandAnalysisError.detail}</p>
            </div>
          )}
          {brandIntelMutation.isSuccess && brandIntelMutation.data?.data?.message && (
            <div className="rounded-xl border border-success-200 bg-success-50 p-3 text-xs text-success-800 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">
              {brandIntelMutation.data.data.message}
              {brandIntelMutation.data.pythonError ? (
                <p className="mt-2 text-[11px] text-warning-700 dark:text-orange-300">
                  Python BrandContext uyarısı: {brandIntelMutation.data.pythonError}
                </p>
              ) : null}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="inline-flex min-w-[200px] items-center gap-2"
              disabled={!hasBrandIntelSources || brandIntelMutation.isPending || !tenantId}
              onClick={() => brandIntelMutation.mutate()}
            >
              {brandIntelMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Analiz çalışıyor…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  AI ile markayı analiz et
                </>
              )}
            </Button>
            {companyProfile?.brandAnalyzedAt && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Son analiz: {new Date(companyProfile.brandAnalyzedAt).toLocaleString('tr-TR')}
                {companyProfile.discoveryConfidence != null
                  ? ` · Güven: %${Math.round(companyProfile.discoveryConfidence)}`
                  : ''}
              </span>
            )}
          </div>
          {companyProfile?.customerVisibleSummary && (
            <div className="rounded-xl border border-emerald-200/40 bg-emerald-50/50 p-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Özet</p>
              <p className="mt-1 leading-relaxed">{companyProfile.customerVisibleSummary}</p>
            </div>
          )}
          {companyProfile?.brandAnalysis ? (
            <details className="group rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
              <summary className="cursor-pointer select-none px-4 py-3 text-xs font-semibold text-gray-800 dark:text-white/90">
                Analiz raporu (tam metin)
              </summary>
              <div
                className="max-h-[420px] overflow-y-auto border-t border-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-700 dark:border-gray-800 dark:text-gray-300"
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {companyProfile.brandAnalysis}
              </div>
            </details>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">Henüz kayıtlı marka analizi yok. Yukarıdaki butonla çalıştırın.</p>
          )}

          <div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Analizden gelen görseller
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
              Web sitesi ve Instagram keşfi sonrası otomatik eklenen referans kareler; içerik ve görsel üretimde kullanılır.
            </p>
            {discoveryImageUrls.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {discoveryImageUrls.map((url) => (
                  <DiscoveryImageTile key={url} url={url} />
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                Henüz referans görsel yok. «AI ile markayı analiz et» çalıştığında Python BrandContext ve tenant asset
                kütüphanesine aktarılır; burada önizlenir.
              </p>
            )}
          </div>
        </div>
      </GlassPanel>

      {companyProfile && tenantId && (
        <GlassPanel tone="indigo">
          <SectionHeader
            title="İşletme yetenekleri & galeri politikası"
            subtitle="Sektöre göre içerik niyetleri ve galeri upload kuralları — berber vs cafe ayrımı burada yapılır."
          />
          <TenantOperatingCapabilitiesEditor
            tenantId={tenantId}
            industry={companyProfile.industry}
            contentNeedsJson={companyProfile.contentNeeds}
            operatingCapabilitiesJson={companyProfile.operatingCapabilities}
            galleryPolicyJson={companyProfile.galleryPolicy}
            riskRulesJson={companyProfile.riskRules}
            customRules={companyProfile.customRules}
            saving={capabilitiesMutation.isPending}
            onSave={(payload) => capabilitiesMutation.mutate(payload)}
          />
        </GlassPanel>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <OfficeBrandProfilePanel
          officeId={officeId}
          profile={currentOfficeProfile}
          companyProfile={companyProfile}
          saving={officeProfileMutation.isPending}
          error={officeProfileMutation.error?.message}
          onSave={(payload) => officeProfileMutation.mutate(payload)}
        />
        <TenantAssetsPanel
          tenantId={tenantId}
          officeId={officeId}
          companyProfile={companyProfile}
          assets={mediaAssets}
          saving={assetMutation.isPending}
          error={assetMutation.error?.message}
          onCreate={(payload) => assetMutation.mutate(payload)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <GlassPanel tone="violet">
          <SectionHeader
            title="Tenant → Canva çalışma modeli"
            subtitle="Bu akış her müşteri/tenant için ayrı marka, ayrı Canva bağlantısı ve ayrı template envanteriyle çalışacak şekilde tasarlanır."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {TENANT_PIPELINE.map((step, index) => (
              <div key={step.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Step {index + 1}</p>
                    <h3 className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel tone={connected ? 'emerald' : 'amber'} className="h-fit">
          <SectionHeader title="Canva bağlantı durumu" subtitle="Bu tenant için API erişimi ve template görünürlüğü." />
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">OAuth</p>
                  <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
                    {connected ? 'Canva hesabı bağlı' : 'Canva hesabı bağlı değil'}
                  </p>
                </div>
                <StatusPill label={connected ? 'active' : 'action needed'} tone={connected ? 'emerald' : 'amber'} icon={connected ? CheckCircle2 : Link2} />
              </div>
              {canvaStatus?.error && (
                <p className="mt-3 rounded-xl border border-error-200 bg-error-50 p-3 text-xs leading-5 text-error-600 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-500">
                  {canvaStatus.error}
                </p>
              )}
            </div>

            <Button
              type="button"
              onClick={() => {
                window.location.href = canvaStatus?.connectUrl ?? '/api/canva/oauth/login';
              }}
              className="w-full"
            >
              <Link2 className="h-4 w-4" />
              {connected ? 'Canva bağlantısını yenile' : 'Canva hesabını bağla'}
            </Button>
            <Button
              type="button"
              onClick={() => navigate('content')}
              variant="outline"
              className="w-full"
            >
              Content Studio'ya git
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </GlassPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <GlassPanel tone="cyan">
          <SectionHeader
            title="Autofill field standardı"
            subtitle="Canva Brand Template içindeki Data Autofill alanları bu sözlükteki isimlerle tag'lenmeli."
            count={RECOMMENDED_TEXT_FIELDS.length}
          />
          <div className="grid gap-2">
            {RECOMMENDED_TEXT_FIELDS.map((field) => (
              <div key={field.name} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-semibold text-gray-800 dark:text-white/90">{field.name}</span>
                  <StatusPill label={field.required ? 'required' : `max ${field.maxLength ?? '-'}`} tone={field.required ? 'emerald' : 'cyan'} />
                </div>
                <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{field.purpose}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs leading-5 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-400">
            Canva içinde alan adlarını örneğin headline, subtitle, cta, hero_image ve logo olarak açmalıyız. Image field varsa ayrıca Canva asset upload akışı gerekir.
          </p>
        </GlassPanel>

        <GlassPanel tone="violet">
          <SectionHeader
            title="5 template starter set"
            subtitle="Her müşteri için tek tek değil, bu 5 aileden başlayıp çok sayıda AI içerik varyasyonu üretiriz."
            count={STARTER_TEMPLATES.length}
          />
          <div className="grid gap-3 md:grid-cols-2">
            {STARTER_TEMPLATES.map((template) => (
              <div key={template.family} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-500 dark:text-brand-400">
                      {template.family}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">{template.title}</h3>
                  </div>
                  <StatusPill label={template.format} tone="violet" />
                </div>
                <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">{template.objective}</p>
                <p className="mt-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400">{template.tone}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs leading-5 text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-400">
            CSV dosyası hazır: <span className="font-mono">docs/canva/smartagency-canva-5-template-starter.csv</span>. Canva Data Autofill testinde bu dosyayı kullanabilirsin.
          </p>
        </GlassPanel>
      </div>

      <GlassPanel tone={templateCount > 0 ? 'emerald' : 'amber'}>
        <SectionHeader
          title="Canva Brand Template envanteri"
          subtitle="API'nin bu tenant adına görebildiği yayınlanmış Brand Template listesi."
          count={filteredTemplates.length}
        />
        <div className="mb-4 space-y-3">
          <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
            {SOCIAL_PLATFORM_TABS.map((tab) => {
              const active = platformFilter === tab.id;
              const count = templates.filter((template) => templateMatchesSocialFilters(template, tab.id, 'all')).length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setPlatformFilter(tab.id);
                    setContentTypeFilter('all');
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                    active
                      ? 'border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400'
                  }`}
                >
                  {tab.label} <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
            {contentTypeTabs.map((tab) => {
              const active = contentTypeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setContentTypeFilter(tab.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                    active
                      ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/15 dark:text-cyan-300'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400'
                  }`}
                >
                  {tab.label} <span className="ml-1 opacity-60">{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>
        {templates.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredTemplates.map((template) => (
              <TemplateRegistryCard
                key={template.id}
                template={template}
                assignment={templateAssignments.find((assignment) => assignment.canvaTemplateId === template.id)}
                saving={registryMutation.isPending && registryMutation.variables?.template.id === template.id}
                error={registryMutation.variables?.template.id === template.id ? registryMutation.error?.message : undefined}
                onSave={(payload) => registryMutation.mutate({ template, payload })}
                previewRefreshing={previewMutation.isPending && previewMutation.variables?.id === template.id}
                previewError={previewMutation.variables?.id === template.id ? previewMutation.error?.message : undefined}
                onRefreshPreview={() => previewMutation.mutate(template)}
                onOpenPreview={() => setPreviewTemplate(template)}
              />
            ))}
            {filteredTemplates.length === 0 && (
              <div className="col-span-full rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                Bu platform/content type filtresiyle eşleşen template yok.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-warning-200 bg-warning-50 p-5 dark:border-warning-500/20 dark:bg-warning-500/15">
            <p className="text-sm font-semibold text-warning-700 dark:text-orange-300">Henüz API'nin görebildiği Brand Template yok.</p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-warning-700/80 dark:text-orange-300/80">
              <p>1. Canva'da bir tasarım aç.</p>
              <p>2. Yukarıdaki field isimlerini text placeholder olarak ekle.</p>
              <p>3. Tasarımı Brand Template olarak yayınla.</p>
              <p>4. Bu ekranda "Durumu yenile" butonuna bas.</p>
            </div>
          </div>
        )}
      </GlassPanel>

      <TemplatePreviewModal template={previewTemplate} onClose={() => setPreviewTemplate(null)} />

      </> /* end intelligence tab fragment */}

    </div>
    </div>
  );
}

function OfficeBrandProfilePanel({
  officeId,
  profile,
  companyProfile,
  saving,
  error,
  onSave,
}: {
  officeId: string;
  profile?: OfficeBrandProfile;
  companyProfile?: CompanyProfile;
  saving: boolean;
  error?: string;
  onSave: (payload: UpsertOfficeBrandProfileRequest) => void;
}) {
  const [draft, setDraft] = useState({
    displayName: profile?.displayName || companyProfile?.brandName || '',
    location: profile?.location || companyProfile?.location || '',
    logoUrl: profile?.logoUrl || companyProfile?.logoUrl || '',
    brandColors: profile?.brandColors || companyProfile?.brandColors || '',
    accentColors: profile?.accentColors || companyProfile?.accentColors || '',
    contact: profile?.contact || '',
    websiteUrl: profile?.websiteUrl || companyProfile?.websiteUrl || '',
    reservationUrl: profile?.reservationUrl || '',
    socialTemplateStyle: profile?.socialTemplateStyle || companyProfile?.socialTemplateStyle || companyProfile?.visualStyle || '',
    defaultCta: profile?.defaultCta || '',
  });

  useEffect(() => {
    setDraft({
      displayName: profile?.displayName || companyProfile?.brandName || '',
      location: profile?.location || companyProfile?.location || '',
      logoUrl: profile?.logoUrl || companyProfile?.logoUrl || '',
      brandColors: profile?.brandColors || companyProfile?.brandColors || '',
      accentColors: profile?.accentColors || companyProfile?.accentColors || '',
      contact: profile?.contact || '',
      websiteUrl: profile?.websiteUrl || companyProfile?.websiteUrl || '',
      reservationUrl: profile?.reservationUrl || '',
      socialTemplateStyle: profile?.socialTemplateStyle || companyProfile?.socialTemplateStyle || companyProfile?.visualStyle || '',
      defaultCta: profile?.defaultCta || '',
    });
  }, [profile, companyProfile]);

  return (
    <GlassPanel tone="violet">
      <SectionHeader
        title="Mekan brand override"
        subtitle="Aynı tenant içindeki beach club, restoran veya şube bazlı görsel stil ve CTA farklarını burada sabitliyoruz."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Display name" value={draft.displayName} onChange={(displayName) => setDraft((cur) => ({ ...cur, displayName }))} />
        <TextField label="Location" value={draft.location} onChange={(location) => setDraft((cur) => ({ ...cur, location }))} />
        <TextField label="Logo URL" value={draft.logoUrl} onChange={(logoUrl) => setDraft((cur) => ({ ...cur, logoUrl }))} />
        <TextField label="Website" value={draft.websiteUrl} onChange={(websiteUrl) => setDraft((cur) => ({ ...cur, websiteUrl }))} />
        <TextField label="Reservation URL" value={draft.reservationUrl} onChange={(reservationUrl) => setDraft((cur) => ({ ...cur, reservationUrl }))} />
        <TextField label="Default CTA" value={draft.defaultCta} onChange={(defaultCta) => setDraft((cur) => ({ ...cur, defaultCta }))} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextField label="Brand colors" value={draft.brandColors} onChange={(brandColors) => setDraft((cur) => ({ ...cur, brandColors }))} placeholder="#0B1020, #F4D35E" />
        <TextField label="Accent colors" value={draft.accentColors} onChange={(accentColors) => setDraft((cur) => ({ ...cur, accentColors }))} placeholder="#FFFFFF, #C9A227" />
      </div>
      <div className="mt-3">
        <Label>Social template style</Label>
        <TextArea
          value={draft.socialTemplateStyle}
          onChange={(socialTemplateStyle) => setDraft((cur) => ({ ...cur, socialTemplateStyle }))}
          rows={3}
          placeholder="premium beach club, sunset palette, elegant editorial typography"
        />
      </div>
      {error && <p className="mt-3 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-600 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-500">{error}</p>}
      <Button
        type="button"
        disabled={saving || !officeId}
        onClick={() => onSave({ officeId, ...draft })}
        className="mt-4 w-full"
      >
        {saving ? 'Kaydediliyor...' : 'Office profile kaydet'}
      </Button>
    </GlassPanel>
  );
}

const EXTENDED_ASSET_TYPES = [
  ...ASSET_TYPE_OPTIONS,
  'client_photo',
  'service_result',
  'before_after_image',
  'venue_reference',
];

function TenantAssetsPanel({
  tenantId,
  officeId,
  companyProfile,
  assets,
  saving,
  error,
  onCreate,
}: {
  tenantId: string;
  officeId: string;
  companyProfile?: CompanyProfile;
  assets: TenantMediaAsset[];
  saving: boolean;
  error?: string;
  onCreate: (payload: UpsertTenantMediaAssetRequest) => void;
}) {
  const operatingProfile = useMemo(() => {
    if (!companyProfile) return null;
    return resolveTenantOperatingProfile({
      tenantId,
      industry: companyProfile.industry,
      contentNeedsJson: companyProfile.contentNeeds,
      operatingCapabilitiesJson: companyProfile.operatingCapabilities,
      galleryPolicyJson: companyProfile.galleryPolicy,
      riskRulesJson: companyProfile.riskRules,
      customRules: companyProfile.customRules,
    });
  }, [companyProfile, tenantId]);

  const [draft, setDraft] = useState({
    assetType: 'hero_image',
    url: '',
    storageKey: '',
    displayName: '',
    usageContext: 'instagram',
    tags: '',
    priority: 0,
    isApproved: true,
  });

  const allowedAssetTypes = useMemo(() => {
    if (!operatingProfile) return EXTENDED_ASSET_TYPES;
    return EXTENDED_ASSET_TYPES.filter(
      (type) => evaluateGalleryAssetPolicy(operatingProfile, type).decision !== 'blocked',
    );
  }, [operatingProfile]);

  const assetGate = operatingProfile
    ? evaluateGalleryAssetPolicy(operatingProfile, draft.assetType)
    : null;

  const approvedCount = assets.filter((asset) => asset.isApproved).length;

  return (
    <GlassPanel tone="cyan">
      <SectionHeader
        title="Tenant asset library"
        subtitle="Canva image autofill için kullanılacak onaylı assetleri tenant/office scope içinde tutar."
        count={assets.length}
      />
      <div className="grid gap-3">
        <SelectField label="Asset type" value={draft.assetType} options={allowedAssetTypes} onChange={(assetType) => setDraft((cur) => ({ ...cur, assetType }))} />
        {assetGate?.decision === 'approval_required' && (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Bu asset türü tenant politikanızda onay gerektirir — kayıt otomatik olarak onaysız oluşturulur.
          </p>
        )}
        {assetGate?.decision === 'blocked' && (
          <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Bu asset türü bu işletme için kapalı.
          </p>
        )}
        <TextField label="Canva asset id / storage key" value={draft.storageKey} onChange={(storageKey) => setDraft((cur) => ({ ...cur, storageKey }))} placeholder="Canva image asset id" />
        <TextField label="Preview URL" value={draft.url} onChange={(url) => setDraft((cur) => ({ ...cur, url }))} placeholder="https://..." />
        <TextField label="Display name" value={draft.displayName} onChange={(displayName) => setDraft((cur) => ({ ...cur, displayName }))} />
        <TextField label="Tags" value={draft.tags} onChange={(tags) => setDraft((cur) => ({ ...cur, tags }))} placeholder="sunset, artist, premium" />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Usage context" value={draft.usageContext} onChange={(usageContext) => setDraft((cur) => ({ ...cur, usageContext }))} />
          <NumberField label="Priority" value={draft.priority} onChange={(priority) => setDraft((cur) => ({ ...cur, priority }))} />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={draft.isApproved}
            onChange={(event) => setDraft((cur) => ({ ...cur, isApproved: event.target.checked }))}
          />
          Agent/Canva resolver kullanabilir
        </label>
      </div>
      {error && <p className="mt-3 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-600 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-500">{error}</p>}
      <Button
        type="button"
        disabled={saving || !draft.url || !draft.storageKey || assetGate?.decision === 'blocked'}
        onClick={() => onCreate({
          officeId: officeId || null,
          assetType: draft.assetType,
          url: draft.url,
          storageKey: draft.storageKey,
          displayName: draft.displayName,
          tags: JSON.stringify(splitCsv(draft.tags)),
          usageContext: draft.usageContext,
          isApproved: assetGate?.forceUnapproved ? false : draft.isApproved,
          priority: draft.priority,
        })}
        className="mt-4 w-full"
      >
        {saving ? 'Ekleniyor...' : 'Asset ekle'}
      </Button>
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{approvedCount} approved asset resolver tarafından kullanılabilir.</p>
        {assets.some((a) => (a.url || '').startsWith('http')) ? (
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {assets
              .filter((a) => (a.url || '').startsWith('http'))
              .slice(0, 12)
              .map((asset) => (
                <TenantAssetThumb key={asset.id} asset={asset} />
              ))}
          </div>
        ) : null}
        {assets.slice(0, 5).map((asset) => (
          <div key={asset.id} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{asset.displayName || asset.assetType}</p>
                <p className="mt-1 break-all font-mono text-[10px] text-gray-500 dark:text-gray-400">{asset.storageKey}</p>
              </div>
              <StatusPill label={asset.isApproved ? 'approved' : 'draft'} tone={asset.isApproved ? 'emerald' : 'amber'} />
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

function DiscoveryImageTile({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div
        className="flex aspect-square items-center justify-center rounded-xl border border-gray-200 bg-gray-100 p-2 text-center dark:border-gray-800 dark:bg-white/[0.05]"
        title={url}
      >
        <span className="text-[10px] text-gray-500 dark:text-gray-400">Önizlenemedi</span>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-gray-900/20 dark:border-gray-800"
      title={url}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
        onError={() => setBroken(true)}
      />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition group-hover:opacity-100" />
    </a>
  );
}

function TenantAssetThumb({ asset }: { asset: TenantMediaAsset }) {
  const [broken, setBroken] = useState(false);
  const url = (asset.url || '').trim();
  if (broken) {
    return (
      <div
        className="flex aspect-square items-center justify-center rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-white/[0.05]"
        title={asset.displayName || asset.assetType}
      >
        <span className="px-1 text-center text-[9px] text-gray-500 dark:text-gray-400">—</span>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
      title={`${asset.displayName || asset.assetType} · ${asset.assetType}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover transition group-hover:opacity-90"
        onError={() => setBroken(true)}
      />
    </a>
  );
}

function TemplateRegistryCard({
  template,
  assignment,
  saving,
  error,
  onSave,
  previewRefreshing,
  previewError,
  onRefreshPreview,
  onOpenPreview,
}: {
  template: CanvaTemplateSummary;
  assignment?: CanvaTemplateAssignment;
  saving: boolean;
  error?: string;
  onSave: (payload: CanvaTemplateSavePayload) => void;
  previewRefreshing?: boolean;
  previewError?: string;
  onRefreshPreview: () => void;
  onOpenPreview: () => void;
}) {
  const health = templateHealth(template);
  const contract = analyzeCanvaTemplateContract(template.dataset ?? {});
  const textFields = Object.entries(template.dataset ?? {})
    .filter(([, field]) => field.type === 'text')
    .sort(([a], [b]) => a.localeCompare(b));
  const [draft, setDraft] = useState({
    title: template.title || '',
    enabled: template.enabled !== false,
    contentKind: template.contentKinds?.[0] ?? 'instagram_post' as CanvaContentKind,
    aspectRatio: template.aspectRatio ?? '1:1' as CanvaAspectRatio,
    objective: template.objectives?.[0] ?? 'announcement' as CanvaTemplateObjective,
    tone: template.tones?.[0] ?? 'minimal' as CanvaTemplateTone,
    priority: template.priority ?? 0,
    brandFit: template.brandFit ?? 0,
    industries: template.industries?.join(', ') ?? '',
    useCases: template.useCases?.join(', ') ?? '',
    templateFamilyId: template.templateFamilyId ?? '',
    allowedIntents: template.allowedIntents?.join(', ') ?? template.useCases?.join(', ') ?? '',
    allowedChannels: template.allowedChannels?.join(', ') ?? template.contentKinds?.join(', ') ?? '',
    requiredAssetIntents: template.requiredAssetIntents?.join(', ') ?? '',
    riskTier: template.riskTier ?? 'low' as CanvaTemplateRiskTier,
    status: template.status ?? 'draft' as CanvaTemplateGovernanceStatus,
    manualApprovalRequired: template.manualApprovalRequired ?? false,
    locale: template.locale ?? 'tr-TR',
    tags: template.tags?.join(', ') ?? '',
    notes: template.notes ?? '',
    fieldContracts: fieldContractDraftFromDataset(template.dataset ?? {}),
  });
  const [flipped, setFlipped] = useState(false);

  const serverFormSyncKey = useMemo(
    () =>
      [
        template.id,
        template.title ?? '',
        String(template.enabled !== false),
        template.registryUpdatedAt ?? '',
        template.previewUpdatedAt ?? '',
        template.previewHash ?? '',
        template.templateFamilyId ?? '',
        template.riskTier ?? '',
        template.status ?? '',
        String(template.manualApprovalRequired ?? false),
        template.locale ?? 'tr-TR',
        String(template.priority ?? 0),
        String(template.brandFit ?? 0),
        template.aspectRatio ?? '',
        JSON.stringify(template.contentKinds ?? []),
        JSON.stringify(template.objectives ?? []),
        JSON.stringify(template.tones ?? []),
        JSON.stringify(template.useCases ?? []),
        (template.industries ?? []).join(','),
        (template.allowedIntents ?? []).join(','),
        (template.allowedChannels ?? []).join(','),
        (template.requiredAssetIntents ?? []).join(','),
        (template.tags ?? []).join(','),
        template.notes ?? '',
        JSON.stringify(template.dataset ?? {}),
      ].join('\u0001'),
    [
      template.id,
      template.title,
      template.enabled,
      template.registryUpdatedAt,
      template.previewUpdatedAt,
      template.previewHash,
      template.templateFamilyId,
      template.riskTier,
      template.status,
      template.manualApprovalRequired,
      template.locale,
      template.priority,
      template.brandFit,
      template.aspectRatio,
      template.contentKinds,
      template.objectives,
      template.tones,
      template.useCases,
      template.industries,
      template.allowedIntents,
      template.allowedChannels,
      template.requiredAssetIntents,
      template.tags,
      template.notes,
      template.dataset,
    ],
  );

  useEffect(() => {
    setFlipped(false);
  }, [template.id]);

  useEffect(() => {
    setDraft({
      title: template.title || '',
      enabled: template.enabled !== false,
      contentKind: template.contentKinds?.[0] ?? 'instagram_post',
      aspectRatio: template.aspectRatio ?? '1:1',
      objective: template.objectives?.[0] ?? 'announcement',
      tone: template.tones?.[0] ?? 'minimal',
      priority: template.priority ?? 0,
      brandFit: template.brandFit ?? 0,
      industries: template.industries?.join(', ') ?? '',
      useCases: template.useCases?.join(', ') ?? '',
      templateFamilyId: template.templateFamilyId ?? '',
      allowedIntents: template.allowedIntents?.join(', ') ?? template.useCases?.join(', ') ?? '',
      allowedChannels: template.allowedChannels?.join(', ') ?? template.contentKinds?.join(', ') ?? '',
      requiredAssetIntents: template.requiredAssetIntents?.join(', ') ?? '',
      riskTier: template.riskTier ?? 'low',
      status: template.status ?? 'draft',
      manualApprovalRequired: template.manualApprovalRequired ?? false,
      locale: template.locale ?? 'tr-TR',
      tags: template.tags?.join(', ') ?? '',
      notes: template.notes ?? '',
      fieldContracts: fieldContractDraftFromDataset(template.dataset ?? {}),
    });
  }, [serverFormSyncKey]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 transition dark:border-gray-800 dark:bg-white/[0.03]">
      {!flipped ? (
        <div className="flex h-full flex-col">
          <button
            type="button"
            onClick={template.previewUrl ? onOpenPreview : undefined}
            disabled={!template.previewUrl}
            className="block w-full overflow-hidden rounded-2xl border border-gray-200 bg-white text-left transition hover:border-brand-300 disabled:cursor-default dark:border-gray-800 dark:bg-gray-950"
          >
            {template.previewUrl ? (
              isTemplateVideoPreview(template) ? (
                <video src={template.previewUrl} className="aspect-[4/3] w-full object-cover" muted playsInline preload="metadata" />
              ) : (
                <img src={template.previewUrl} alt={`${template.title} preview`} className="aspect-[4/3] w-full object-cover" />
              )
            ) : (
              <div className="flex aspect-[4/3] flex-col items-center justify-center bg-gradient-to-br from-brand-500/20 via-purple-500/10 to-cyan-500/20 p-6 text-center">
                <Palette className="h-9 w-9 text-brand-500 dark:text-brand-300" />
                <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-white/90">Default preview yok</p>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Template contract default bilgilerle render/export edilince burada görünür.</p>
              </div>
            )}
          </button>

          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{template.title || 'Untitled Brand Template'}</p>
              <p className="mt-1 break-all font-mono text-[10px] leading-5 text-gray-500 dark:text-gray-400">{template.id}</p>
            </div>
            <StatusPill label={draft.enabled ? 'active' : 'off'} tone={draft.enabled ? 'emerald' : 'amber'} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill label={health.label} tone={health.tone} />
            <StatusPill label={draft.status} tone={draft.status === 'approved' ? 'emerald' : draft.status === 'disabled' ? 'amber' : 'violet'} />
            <StatusPill label={`risk: ${draft.riskTier}`} tone={draft.riskTier === 'high' || draft.riskTier === 'blocked' ? 'rose' : draft.riskTier === 'medium' ? 'amber' : 'cyan'} />
            {template.previewUrl && <StatusPill label={template.previewStale ? 'preview stale' : 'preview cached'} tone={template.previewStale ? 'amber' : 'emerald'} />}
          </div>

          <div className="mt-4 grid gap-2">
            <Button type="button" variant="outline" onClick={() => setFlipped(true)} className="w-full">
              Properties yüzünü aç
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button type="button" disabled={previewRefreshing} onClick={onRefreshPreview} className="w-full">
              <RefreshCw className={`h-4 w-4 ${previewRefreshing ? 'animate-spin' : ''}`} />
              {template.previewUrl ? 'Preview yenile' : 'Default preview üret'}
            </Button>
            {template.previewUrl && (
              <Button type="button" variant="outline" onClick={onOpenPreview} className="w-full">
                Büyük preview aç
              </Button>
            )}
          </div>

          {template.previewUpdatedAt && (
            <p className="mt-3 text-[10px] leading-5 text-gray-500 dark:text-gray-400">
              Preview: {new Date(template.previewUpdatedAt).toLocaleString('tr-TR')} · {template.previewRendererProvider ?? 'canva'}
            </p>
          )}
          {previewError && (
            <p className="mt-3 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-[11px] leading-5 text-error-600 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-500">{previewError}</p>
          )}
        </div>
      ) : (
      <>
      <div className="mb-3 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setFlipped(false)}>
          Preview yüzüne dön
        </Button>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{template.title || 'Untitled Brand Template'}</p>
          <p className="mt-2 break-all font-mono text-[11px] leading-5 text-gray-500 dark:text-gray-400">{template.id}</p>
        </div>
        <StatusPill label={draft.enabled ? 'active' : 'off'} tone={draft.enabled ? 'emerald' : 'amber'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusPill label={health.label} tone={health.tone} />
        <StatusPill label={`${Object.keys(template.dataset ?? {}).length} fields`} tone={Object.keys(template.dataset ?? {}).length ? 'cyan' : 'amber'} />
        <StatusPill label={`${contract.knownFields.length} standard`} tone={contract.ready ? 'emerald' : 'amber'} />
        <StatusPill label={draft.status} tone={draft.status === 'approved' ? 'emerald' : draft.status === 'disabled' ? 'amber' : 'violet'} />
        <StatusPill label={`risk: ${draft.riskTier}`} tone={draft.riskTier === 'high' || draft.riskTier === 'blocked' ? 'rose' : draft.riskTier === 'medium' ? 'amber' : 'cyan'} />
        {template.registryUpdatedAt && <StatusPill label="registry saved" tone="emerald" />}
        {assignment && <StatusPill label={assignment.officeId ? 'office assignment' : 'tenant assignment'} tone="violet" />}
      </div>
      {health.message && (
        <p className="mt-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[11px] leading-5 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-300">
          {health.message}
        </p>
      )}

      <div className="mt-4 grid gap-3">
        {contract.knownFields.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Detected contract fields</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {contract.knownFields.map((field) => (
                <StatusPill
                  key={`${field.sourceFieldName}-${field.name}`}
                  label={`${field.sourceFieldName}: ${field.type}${field.maxLength ? `/${field.maxLength}` : ''}`}
                  tone={field.required ? 'emerald' : 'cyan'}
                />
              ))}
            </div>
          </div>
        )}

        {textFields.length > 0 && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/20 dark:bg-brand-500/15">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">Template text limits</p>
            <p className="mt-1 text-[11px] leading-5 text-brand-600/80 dark:text-brand-300/80">
              Her field için template'teki default metin kadar karakter limiti gir. `defaultText` yazarsan limit otomatik onun uzunluğundan hesaplanır.
            </p>
            <div className="mt-3 grid gap-3">
              {textFields.map(([fieldName, field]) => {
                const fieldDraft = draft.fieldContracts[fieldName] ?? { characterLimit: '', defaultText: '' };
                return (
                  <div key={fieldName} className="grid gap-2 rounded-lg border border-white/70 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs font-semibold text-gray-800 dark:text-white/90">{fieldName}</span>
                      <StatusPill label={field.required ? 'required' : 'optional'} tone={field.required ? 'emerald' : 'cyan'} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                      <Input
                        type="number"
                        min="1"
                        value={fieldDraft.characterLimit}
                        onChange={(event) => setDraft((cur) => ({
                          ...cur,
                          fieldContracts: {
                            ...cur.fieldContracts,
                            [fieldName]: {
                              defaultText: cur.fieldContracts[fieldName]?.defaultText ?? '',
                              characterLimit: event.target.value,
                            },
                          },
                        }))}
                        placeholder="Limit"
                      />
                      <Input
                        value={fieldDraft.defaultText}
                        onChange={(event) => setDraft((cur) => ({
                          ...cur,
                          fieldContracts: {
                            ...cur.fieldContracts,
                            [fieldName]: {
                              characterLimit: cur.fieldContracts[fieldName]?.characterLimit ?? '',
                              defaultText: event.target.value,
                            },
                          },
                        }))}
                        placeholder="Template default text, örn. SUMMER NIGHT"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <Label>Registry title</Label>
          <Input
            value={draft.title}
            onChange={(event) => setDraft((cur) => ({ ...cur, title: event.target.value }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Kind" value={draft.contentKind} options={CONTENT_KIND_OPTIONS} onChange={(value) => setDraft((cur) => ({ ...cur, contentKind: value as CanvaContentKind }))} />
          <SelectField label="Format" value={draft.aspectRatio} options={ASPECT_RATIO_OPTIONS} onChange={(value) => setDraft((cur) => ({ ...cur, aspectRatio: value as CanvaAspectRatio }))} />
          <SelectField label="Objective" value={draft.objective} options={OBJECTIVE_OPTIONS} onChange={(value) => setDraft((cur) => ({ ...cur, objective: value as CanvaTemplateObjective }))} />
          <SelectField label="Tone" value={draft.tone} options={TONE_OPTIONS} onChange={(value) => setDraft((cur) => ({ ...cur, tone: value as CanvaTemplateTone }))} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Priority" value={draft.priority} onChange={(value) => setDraft((cur) => ({ ...cur, priority: value }))} />
          <NumberField label="Brand fit" value={draft.brandFit} onChange={(value) => setDraft((cur) => ({ ...cur, brandFit: value }))} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Governance status" value={draft.status} options={TEMPLATE_STATUS_OPTIONS} onChange={(value) => setDraft((cur) => ({ ...cur, status: value as CanvaTemplateGovernanceStatus }))} />
          <SelectField label="Risk tier" value={draft.riskTier} options={RISK_TIER_OPTIONS} onChange={(value) => setDraft((cur) => ({ ...cur, riskTier: value as CanvaTemplateRiskTier }))} />
        </div>

        <div>
          <Label>Template family id</Label>
          <Input
            value={draft.templateFamilyId}
            onChange={(event) => setDraft((cur) => ({ ...cur, templateFamilyId: event.target.value }))}
            placeholder="restaurant_cafe.event_announcement.story"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Allowed intents</Label>
            <Input
              value={draft.allowedIntents}
              onChange={(event) => setDraft((cur) => ({ ...cur, allowedIntents: event.target.value }))}
              placeholder="event_announcement, campaign_offer"
            />
          </div>
          <div>
            <Label>Allowed channels</Label>
            <Input
              value={draft.allowedChannels}
              onChange={(event) => setDraft((cur) => ({ ...cur, allowedChannels: event.target.value }))}
              placeholder="instagram_story, instagram_post"
            />
          </div>
        </div>

        <div>
          <Label>Required asset intents</Label>
          <Input
            value={draft.requiredAssetIntents}
            onChange={(event) => setDraft((cur) => ({ ...cur, requiredAssetIntents: event.target.value }))}
            placeholder="hero_image, logo"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Industries</Label>
            <Input
              value={draft.industries}
              onChange={(event) => setDraft((cur) => ({ ...cur, industries: event.target.value }))}
              placeholder="restaurant, ecommerce, real_estate"
            />
          </div>
          <div>
            <Label>Locale</Label>
            <Input
              value={draft.locale}
              onChange={(event) => setDraft((cur) => ({ ...cur, locale: event.target.value }))}
              placeholder="tr-TR"
            />
          </div>
        </div>

        <div>
          <Label>Use cases</Label>
          <Input
            value={draft.useCases}
            onChange={(event) => setDraft((cur) => ({ ...cur, useCases: event.target.value }))}
            placeholder={TEMPLATE_USE_CASE_OPTIONS.join(', ')}
          />
        </div>

        <div>
          <Label>Tags</Label>
          <Input
            value={draft.tags}
            onChange={(event) => setDraft((cur) => ({ ...cur, tags: event.target.value }))}
            placeholder="event, luxury, menu"
          />
        </div>

        <div>
          <Label>Notes</Label>
          <TextArea
            value={draft.notes}
            onChange={(value) => setDraft((cur) => ({ ...cur, notes: value }))}
            rows={2}
          />
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft((cur) => ({ ...cur, enabled: event.target.checked }))}
          />
          Template seçim motorunda aktif
        </label>

        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={draft.manualApprovalRequired}
            onChange={(event) => setDraft((cur) => ({ ...cur, manualApprovalRequired: event.target.checked }))}
          />
          Bu template ile üretilen çıktılar manuel onay gerektirir
        </label>

        {error && (
          <p className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-[11px] leading-5 text-error-600 dark:border-error-500/20 dark:bg-error-500/15 dark:text-error-500">{error}</p>
        )}

        <Button
          type="button"
          disabled={saving}
          onClick={() => onSave({
            title: draft.title,
            enabled: draft.enabled,
            contentKinds: [draft.contentKind],
            aspectRatio: draft.aspectRatio,
            objectives: [draft.objective],
            tones: [draft.tone],
            priority: draft.priority,
            brandFit: draft.brandFit,
            industries: splitCsv(draft.industries),
            useCases: splitCsv(draft.useCases),
            templateFamilyId: draft.templateFamilyId,
            allowedIntents: splitCsv(draft.allowedIntents),
            allowedChannels: splitCsv(draft.allowedChannels),
            requiredAssetIntents: splitCsv(draft.requiredAssetIntents),
            riskTier: draft.riskTier,
            status: draft.status,
            manualApprovalRequired: draft.manualApprovalRequired,
            locale: draft.locale,
            tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
            notes: draft.notes,
            previewStale: Boolean(template.previewUrl),
            previewFormat: template.previewFormat,
            previewMimeType: template.previewMimeType,
            dataset: mergeDatasetFieldContracts(template.dataset ?? {}, draft.fieldContracts),
          })}
          className="w-full"
        >
          {saving ? 'Kaydediliyor...' : 'Registry + DB assignment kaydet'}
        </Button>
      </div>
      </>
      )}
    </div>
  );
}

function templateHealth(template: CanvaTemplateSummary): { label: string; tone: 'emerald' | 'amber' | 'rose'; message?: string } {
  const contract = analyzeCanvaTemplateContract(template.dataset ?? {});

  if (template.enabled === false) {
    return { label: 'disabled', tone: 'amber', message: 'Bu template seçim motorunda pasif.' };
  }
  if (Object.keys(template.dataset ?? {}).length === 0) {
    return { label: 'no autofill fields', tone: 'rose', message: 'Canva dataset boş görünüyor; autofill design üretimi başarısız olabilir.' };
  }
  if (contract.missingRequiredFields.length > 0) {
    return { label: 'missing required', tone: 'rose', message: `Eksik zorunlu fieldlar: ${contract.missingRequiredFields.join(', ')}` };
  }
  if (contract.missingRecommendedFields.length > 0) {
    return { label: 'partial fields', tone: 'amber', message: `Eksik önerilen fieldlar: ${contract.missingRecommendedFields.join(', ')}` };
  }
  return { label: 'ready', tone: 'emerald' };
}

function summarizeTemplateHealth(templates: CanvaTemplateSummary[]) {
  const summary = templates.reduce(
    (acc, template) => {
      const health = templateHealth(template);
      if (health.label === 'ready') acc.ready += 1;
      if (health.label === 'partial fields') acc.partial += 1;
      if (health.label === 'missing required' || health.label === 'no autofill fields') acc.missingRequired += 1;
      if (template.status === 'needs_review' || template.status === 'draft') acc.needsReview += 1;
      if (template.status === 'disabled' || template.riskTier === 'blocked' || template.enabled === false) acc.blocked += 1;
      if (health.message) acc.topIssues.push(`${template.title || template.id}: ${health.message}`);
      if (template.status === 'needs_review') acc.topIssues.push(`${template.title || template.id}: governance review bekliyor.`);
      if (template.riskTier === 'blocked') acc.topIssues.push(`${template.title || template.id}: risk tier blocked.`);
      return acc;
    },
    {
      ready: 0,
      partial: 0,
      missingRequired: 0,
      needsReview: 0,
      blocked: 0,
      topIssues: [] as string[],
    },
  );

  return {
    ...summary,
    attention: summary.partial + summary.missingRequired + summary.needsReview + summary.blocked,
    topIssues: summary.topIssues.slice(0, 5),
  };
}

function HealthSummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'rose';
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{label}</p>
        <StatusPill label={String(value)} tone={tone} />
      </div>
    </div>
  );
}

function TemplatePreviewModal({ template, onClose }: { template: CanvaTemplateSummary | null; onClose: () => void }) {
  if (!template) return null;

  const platformLabel = platformLabelsForTemplate(template).join(', ') || 'Sosyal medya';
  const contentLabel = contentTypeLabelsForTemplate(template).join(', ') || template.aspectRatio || 'Template preview';
  const isVideoPreview = isTemplateVideoPreview(template);
  const shouldBeVideo = isVideoTemplate(template);
  const frameClass = template.aspectRatio === '9:16'
    ? 'max-h-[76vh] max-w-[min(420px,92vw)]'
    : template.aspectRatio === '16:9'
      ? 'max-h-[76vh] max-w-[min(980px,92vw)]'
      : 'max-h-[76vh] max-w-[min(720px,92vw)]';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-gray-950 shadow-theme-xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <StatusPill label={platformLabel} tone="violet" />
              <StatusPill label={contentLabel} tone="cyan" />
              {template.previewStale && <StatusPill label="preview stale" tone="amber" />}
            </div>
            <h2 className="mt-3 truncate text-lg font-semibold text-white">{template.title || 'Untitled Brand Template'}</h2>
            <p className="mt-1 break-all font-mono text-[11px] text-white/40">{template.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/60 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Preview modalını kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-black/35 p-4">
            {template.previewUrl && isVideoPreview ? (
              <PreviewVideoPlayer src={template.previewUrl} frameClass={frameClass} />
            ) : template.previewUrl ? (
              <div className="relative">
                <img
                  src={template.previewUrl}
                  alt={`${template.title} large preview`}
                  className={`${frameClass} w-full rounded-2xl object-contain shadow-2xl`}
                />
                {shouldBeVideo && (
                  <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-amber-300/25 bg-black/70 px-4 py-3 text-xs font-semibold text-amber-100 shadow-lg backdrop-blur">
                    Bu reel/video template için mevcut cache PNG. MP4 oynatıcı için karttan `Preview yenile` çalıştır.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-sm text-white/55">
                Bu template için cached preview yok.
              </div>
            )}
          </div>
          <aside className="space-y-3">
            <PreviewInfoRow label="Platform" value={platformLabel} />
            <PreviewInfoRow label="Content type" value={contentLabel} />
            <PreviewInfoRow label="Format" value={template.aspectRatio ?? 'freeform'} />
            <PreviewInfoRow label="Status" value={template.status ?? 'draft'} />
            <PreviewInfoRow label="Risk" value={template.riskTier ?? 'low'} />
            <PreviewInfoRow label="Renderer" value={template.previewRendererProvider ?? 'canva'} />
            <PreviewInfoRow label="Preview type" value={isVideoPreview ? 'MP4 video' : shouldBeVideo ? 'PNG image - MP4 için yenile' : 'PNG image'} />
            <PreviewInfoRow label="Updated" value={template.previewUpdatedAt ? new Date(template.previewUpdatedAt).toLocaleString('tr-TR') : 'Henüz yok'} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function PreviewVideoPlayer({ src, frameClass }: { src: string; frameClass: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={src}
        className={`${frameClass} w-full rounded-2xl object-contain shadow-2xl`}
        controls
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/65 text-white shadow-2xl backdrop-blur transition hover:scale-105 hover:bg-black/80"
          aria-label="Video preview oynat"
        >
          <Play className="ml-1 h-7 w-7 fill-current" />
        </button>
      )}
    </div>
  );
}

function isTemplateVideoPreview(template: CanvaTemplateSummary) {
  if (template.previewMimeType?.startsWith('video/')) return true;
  if (template.previewFormat === 'mp4') return true;
  return Boolean(template.previewUrl && /\.(mp4|webm|mov)(\?|#|$)/i.test(template.previewUrl));
}

function isVideoTemplate(template: CanvaTemplateSummary) {
  return contentTypesForTemplate(template).has('reel');
}

function PreviewInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white/80">{value}</p>
    </div>
  );
}

function templateMatchesSocialFilters(template: CanvaTemplateSummary, platform: SocialPlatformFilter, contentType: string) {
  const platforms = platformsForTemplate(template);
  const contentTypes = contentTypesForTemplate(template);
  const platformMatch = platform === 'all' || platforms.has(platform);
  const contentMatch = contentType === 'all' || contentTypes.has(contentType);
  return platformMatch && contentMatch;
}

function contentTypeOptionsForTemplates(templates: CanvaTemplateSummary[], platform: SocialPlatformFilter) {
  const counts = new Map<string, number>();
  for (const template of templates) {
    if (!templateMatchesSocialFilters(template, platform, 'all')) continue;
    for (const type of contentTypesForTemplate(template)) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }

  return [
    { id: 'all', label: 'Tüm content type', count: templates.filter((template) => templateMatchesSocialFilters(template, platform, 'all')).length },
    ...Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ id, label: contentTypeLabel(id), count })),
  ];
}

function platformsForTemplate(template: CanvaTemplateSummary): Set<SocialPlatformFilter> {
  const text = templateSearchText(template);
  const platforms = new Set<SocialPlatformFilter>();
  if (/instagram|insta|reel|story/i.test(text)) platforms.add('instagram');
  if (/tiktok|tik_tok/i.test(text)) platforms.add('tiktok');
  if (/twitter|x\.com|\btweet\b/i.test(text)) platforms.add('twitter');
  if (/facebook|fb\b/i.test(text)) platforms.add('facebook');
  if (/linkedin/i.test(text)) platforms.add('linkedin');
  if (/\bad\b|ads|campaign|creative/i.test(text)) platforms.add('ads');
  if (platforms.size === 0) platforms.add('instagram');
  return platforms;
}

function contentTypesForTemplate(template: CanvaTemplateSummary): Set<string> {
  const text = templateSearchText(template);
  const types = new Set<string>();
  if (/story/i.test(text)) types.add('story');
  if (/reel|video|tiktok/i.test(text)) types.add('reel');
  if (/carousel|calendar|weekly/i.test(text)) types.add('carousel');
  if (/post|feed|menu|review|testimonial|offer|event|announcement/i.test(text)) types.add('post');
  if (/campaign|ads|creative/i.test(text)) types.add('ad_creative');
  for (const kind of template.contentKinds ?? []) {
    if (kind.includes('story')) types.add('story');
    else if (kind.includes('reel')) types.add('reel');
    else if (kind.includes('ad')) types.add('ad_creative');
    else if (kind.includes('plan')) types.add('calendar');
    else if (kind.includes('post')) types.add('post');
  }
  if (types.size === 0) types.add('post');
  return types;
}

function platformLabelsForTemplate(template: CanvaTemplateSummary) {
  const labels: Record<SocialPlatformFilter, string> = {
    all: 'Tümü',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    twitter: 'Twitter / X',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    ads: 'Ads',
  };
  return Array.from(platformsForTemplate(template)).map((platform) => labels[platform]);
}

function contentTypeLabelsForTemplate(template: CanvaTemplateSummary) {
  return Array.from(contentTypesForTemplate(template)).map(contentTypeLabel);
}

function contentTypeLabel(value: string) {
  const labels: Record<string, string> = {
    post: 'Post',
    story: 'Story',
    reel: 'Reels / Video',
    carousel: 'Carousel',
    calendar: 'Calendar',
    ad_creative: 'Ad Creative',
  };
  return labels[value] ?? value.replace(/_/g, ' ');
}

function templateSearchText(template: CanvaTemplateSummary) {
  return [
    template.title,
    template.aspectRatio,
    ...(template.contentKinds ?? []),
    ...(template.allowedChannels ?? []),
    ...(template.allowedIntents ?? []),
    ...(template.objectives ?? []),
    ...(template.useCases ?? []),
    ...(template.tags ?? []),
    template.notes,
    template.templateFamilyId,
  ].filter(Boolean).join(' ').toLowerCase();
}

function splitCsv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function fieldContractDraftFromDataset(dataset: Record<string, CanvaTemplateDatasetField>) {
  return Object.entries(dataset).reduce<Record<string, { characterLimit: string; defaultText: string }>>((acc, [fieldName, field]) => {
    if (field.type !== 'text') return acc;
    acc[fieldName] = {
      characterLimit: field.characterLimit?.toString() ?? field.maxLength?.toString() ?? '',
      defaultText: field.defaultText ?? field.sampleText ?? field.placeholder ?? field.text ?? field.value ?? field.default ?? '',
    };
    return acc;
  }, {});
}

function mergeDatasetFieldContracts(
  dataset: Record<string, CanvaTemplateDatasetField>,
  drafts: Record<string, { characterLimit?: string; defaultText?: string }>,
): Record<string, CanvaTemplateDatasetField> {
  return Object.entries(dataset).reduce<Record<string, CanvaTemplateDatasetField>>((acc, [fieldName, field]) => {
    const draft = drafts[fieldName];
    if (!draft || field.type !== 'text') {
      acc[fieldName] = field;
      return acc;
    }

    const defaultText = draft.defaultText?.trim() ?? '';
    const parsedLimit = Number(draft.characterLimit);
    const characterLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : defaultText.length || undefined;

    acc[fieldName] = {
      ...field,
      ...(characterLimit ? { characterLimit } : {}),
      ...(defaultText ? { defaultText } : {}),
    };
    return acc;
  }, {});
}

function BrandKitItem({ label, value, fallback }: { label: string; value?: string; fallback: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{label}</p>
      <p className="mt-2 line-clamp-3 text-sm font-semibold text-gray-800 dark:text-white/90">{value?.trim() || fallback}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

// ── Sprint 1-3 Intelligence Panel ─────────────────────────────────────────

// ── Instagram Analytics Panel ─────────────────────────────────────────────────

interface MetaStatus {
  connected: boolean;
  ig_username?: string;
  followers_count?: number;
  token_valid?: boolean;
  insights_updated_at?: string;
}

interface MetaAnalytics extends MetaStatus {
  account_28d?: Record<string, number>;
  best_posting_times?: { day: string; hour: string; avg_engagement_score: number }[];
  top_content_patterns?: string[];
  top_posts?: { id: string; media_type: string; likes: number; comments: number; reach: number; caption_preview: string; timestamp: string }[];
  recent_posts_count?: number;
  error?: string;
}

function InstagramAnalyticsPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [disconnecting, setDisconnecting] = useState(false);

  const { data: status, isLoading } = useQuery<MetaAnalytics>({
    queryKey: ['meta-analytics', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/meta/analytics?workspaceId=${workspaceId}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Handle OAuth callback success params — in useEffect to avoid render-loop
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('meta_connected') === '1') {
      queryClient.invalidateQueries({ queryKey: ['meta-analytics'] });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [queryClient]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch(`/api/meta/analytics?workspaceId=${workspaceId}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['meta-analytics'] });
    } finally {
      setDisconnecting(false);
    }
  }

  const account28d = status?.account_28d ?? {};

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} className="px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Instagram Business Analytics
        </p>
        {status?.connected ? (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              @{status.ig_username}
            </span>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-[10px] text-slate-600 hover:text-slate-400 transition"
            >
              Bağlantıyı kes
            </button>
          </div>
        ) : (
          <a
            href={`/api/meta/oauth/login?workspaceId=${workspaceId}`}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}
          >
            <span>📱</span> Instagram'ı Bağla
          </a>
        )}
      </div>

      {isLoading && (
        <p className="text-[11px] text-slate-700">Yükleniyor…</p>
      )}

      {!isLoading && !status?.connected && (
        <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[12px] text-slate-500 mb-2">Instagram Business hesabını bağla</p>
          <p className="text-[11px] text-slate-700">
            Gerçek reach, impressions, en iyi paylaşım saatleri ve top performing content verileri agent'lara aktarılır.
          </p>
        </div>
      )}

      {status?.connected && (
        <div className="flex flex-col gap-3">
          {/* 28-day overview */}
          {Object.keys(account28d).length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'reach', label: 'Reach (28g)' },
                { key: 'impressions', label: 'Görüntülenme' },
                { key: 'profile_views', label: 'Profil görüntüleme' },
              ].map(({ key, label }) => (
                <div key={key} className="rounded-lg px-3 py-2 text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[16px] font-bold text-white">{((account28d[key] ?? 0) / 1000).toFixed(1)}K</p>
                  <p className="text-[9px] text-slate-600">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Best posting times */}
          {(status.best_posting_times ?? []).length > 0 && (
            <div className="rounded-xl p-3" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-400/80">
                ⏰ En iyi paylaşım saatleri (gerçek veri)
              </p>
              {(status.best_posting_times ?? []).slice(0, 3).map((t, i) => (
                <div key={i} className="flex items-center justify-between py-0.5">
                  <span className="text-[11px] text-slate-400">{t.day} {t.hour}</span>
                  <span className="text-[10px] text-indigo-300/70">skor {t.avg_engagement_score}</span>
                </div>
              ))}
            </div>
          )}

          {/* Top patterns */}
          {(status.top_content_patterns ?? []).length > 0 && (
            <div className="rounded-xl p-3" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)' }}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-400/80">
                ✅ Bu hesap için çalışan formatlar
              </p>
              {(status.top_content_patterns ?? []).map((p, i) => (
                <p key={i} className="text-[11px] text-slate-400 py-0.5">• {p}</p>
              ))}
            </div>
          )}

          {/* Top posts */}
          {(status.top_posts ?? []).length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                Top 5 Performanslı Post
              </p>
              {(status.top_posts ?? []).slice(0, 3).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                  <p className="flex-1 truncate text-[11px] text-slate-500 mr-3">{p.caption_preview || '—'}</p>
                  <div className="flex gap-2 text-[10px] text-slate-600 shrink-0">
                    <span>❤️ {p.likes}</span>
                    <span>💬 {p.comments}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {status.error && (
            <p className="text-[11px] text-amber-400/80">{status.error}</p>
          )}

          {status.insights_updated_at && (
            <p className="text-[9px] text-slate-700">
              Son güncelleme: {new Date(status.insights_updated_at).toLocaleString('tr-TR')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Intelligence Jobs Panel ───────────────────────────────────────────────────

interface IntelJob {
  key: string;
  label: string;
  description: string;
  cadence: string;
  icon: string;
  color: string;
  endpoint: string;
  updatedAtKey?: string;
}

const INTEL_JOBS: IntelJob[] = [
  {
    key: 'analyze',
    label: 'Marka Analizi',
    description: 'Website, Instagram, Google Business verilerini çeker — referans görseller, hashtag\'ler, biyografi.',
    cadence: 'Manuel / Onboarding',
    icon: '🔎',
    color: '#818cf8',
    endpoint: 'analyze',
  },
  {
    key: 'visuals',
    label: 'Visual DNA',
    description: 'GPT-4o Vision ile mekan fotoğraflarını analiz eder → renk paleti, atmosfer, materyal dili.',
    cadence: 'Manuel',
    icon: '🎨',
    color: '#a78bfa',
    endpoint: 'analyze-visuals',
    updatedAtKey: undefined,
  },
  {
    key: 'competitor',
    label: 'Rakip Analizi',
    description: 'Rakip Instagram hesaplarını tarar, içerik stratejilerini ve boşlukları tespit eder.',
    cadence: 'Haftalık (Pazartesi)',
    icon: '🏆',
    color: '#f59e0b',
    endpoint: 'analyze-competitors',
  },
  {
    key: 'trends',
    label: 'Haftalık Trend Brief',
    description: 'Perplexity + Apify ile bu haftanın sektör trendleri, hashtag\'ler ve fırsatları.',
    cadence: 'Günlük 07:00 UTC',
    icon: '📈',
    color: '#22d3ee',
    endpoint: 'refresh-trends',
    updatedAtKey: 'trend_brief_updated_at',
  },
  {
    key: 'industry',
    label: 'Sektör Analizi + Etkinlik + LinkedIn',
    description: 'Mevsimsel takvim · Eventbrite/Biletix etkinlik aciliyeti (hafta sonu HIGH uyarısı) · LinkedIn B2B sektör haberleri — 3 kaynak paralel çalışır.',
    cadence: 'Haftalık (Pazartesi 05:30)',
    icon: '📅',
    color: '#34d399',
    endpoint: 'industry-intelligence',
    updatedAtKey: 'industry_intelligence_updated_at',
  },
  {
    key: 'brand_dna',
    label: 'Marka DNA',
    description: 'Tüm sinyalleri GPT-4o ile sentezler → agentların okuduğu master marka brifing belgesi.',
    cadence: 'Pazar 23:00 UTC',
    icon: '🧬',
    color: '#f472b6',
    endpoint: 'brand-dna',
    updatedAtKey: 'brand_dna_updated_at',
  },
  {
    key: 'social_listening',
    label: 'Social Listening',
    description: 'Marka adı + rakip + sektör hashtag\'lerini web ve Instagram\'da tarar. Gerçek zamanlı mention, trend ve boşluk tespiti.',
    cadence: 'Günlük 06:30 UTC',
    icon: '📡',
    color: '#06b6d4',
    endpoint: 'social-listening',
    updatedAtKey: undefined,
  },
  {
    key: 'monthly_brief',
    label: 'Aylık Stratejik Brief',
    description: 'Kıdemli hesap yöneticisi seviyesinde aylık kampanya planı, rekabetçi konum, KPI önerileri.',
    cadence: 'Ayın 1\'i',
    icon: '📋',
    color: '#fb923c',
    endpoint: 'monthly-brief',
    updatedAtKey: 'monthly_brief_updated_at',
  },
];

function IntelligenceJobsPanel({ workspaceId, allBriefs }: {
  workspaceId: string;
  allBriefs: Record<string, unknown> | null;
}) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, 'done' | 'error'>>({});
  const [lastRan, setLastRan] = useState<Record<string, string>>({});
  const [jobMeta, setJobMeta] = useState<Record<string, Record<string, unknown>>>({});

  async function runJob(job: IntelJob) {
    if (!workspaceId) return;
    setRunning((r) => ({ ...r, [job.key]: true }));
    setResults((r) => { const n = { ...r }; delete n[job.key]; return n; });
    try {
      const res = await fetch(`/api/brand-context/${workspaceId}/${job.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Record<string, unknown>;
      setResults((r) => ({ ...r, [job.key]: 'done' }));
      setLastRan((r) => ({ ...r, [job.key]: new Date().toLocaleTimeString('tr-TR') }));
      setJobMeta((m) => ({ ...m, [job.key]: data }));
      await queryClient.invalidateQueries({ queryKey: ['python-brand-ctx-display', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['all-briefs', workspaceId] });
    } catch {
      setResults((r) => ({ ...r, [job.key]: 'error' }));
    } finally {
      setRunning((r) => ({ ...r, [job.key]: false }));
    }
  }

  const getUpdatedAt = (job: IntelJob): string | null => {
    if (!job.updatedAtKey || !allBriefs) return null;
    const val = allBriefs[job.updatedAtKey];
    return typeof val === 'string' ? val.slice(0, 16).replace('T', ' ') : null;
  };

  return (
    <div className="glass-panel-v2 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div>
          <p className="text-[13px] font-semibold text-white">Intelligence Jobs</p>
          <p className="mt-0.5 text-[11px] text-slate-600">Otomatik veya manuel çalıştırılabilir — tüm agent brifingleri buradan beslenir</p>
        </div>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {INTEL_JOBS.map((job) => {
          const isRunning = running[job.key];
          const result = results[job.key];
          const updatedAt = lastRan[job.key] ?? getUpdatedAt(job);

          return (
            <div key={job.key} className="flex items-center gap-4 px-5 py-3.5">
              {/* Icon + info */}
              <div className="w-7 text-center text-lg">{job.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[12px] font-semibold text-white">{job.label}</p>
                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                    style={{ background: `${job.color}15`, color: job.color, border: `1px solid ${job.color}30` }}>
                    {job.cadence}
                  </span>
                  {result === 'done' && <span className="text-[10px] text-emerald-400">✓ Tamamlandı</span>}
                  {result === 'error' && <span className="text-[10px] text-red-400">✕ Hata</span>}
                  {/* Event urgency badge — shown after industry job completes */}
                  {job.key === 'industry' && result === 'done' && (() => {
                    const meta = jobMeta['industry'] ?? {};
                    const urgency = meta.event_urgency as string | undefined;
                    if (!urgency || urgency === 'LOW') return null;
                    const color = urgency === 'HIGH' ? '#ef4444' : '#eab308';
                    return (
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                        🎟️ {urgency} ({meta.event_count as number} etkinlik)
                      </span>
                    );
                  })()}
                </div>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600 line-clamp-1">{job.description}</p>
                {updatedAt && (
                  <p className="mt-0.5 text-[10px] text-slate-700">Son: {updatedAt}</p>
                )}
              </div>
              {/* Run button */}
              <button
                type="button"
                disabled={isRunning || !workspaceId}
                onClick={() => void runJob(job)}
                className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-40"
                style={{
                  background: isRunning ? `${job.color}10` : result === 'done' ? 'rgba(34,197,94,0.08)' : `${job.color}12`,
                  border: `1px solid ${result === 'done' ? 'rgba(34,197,94,0.25)' : `${job.color}25`}`,
                  color: result === 'done' ? '#22c55e' : job.color,
                }}
              >
                {isRunning ? (
                  <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Çalışıyor</>
                ) : (
                  <>{result === 'done' ? '✓' : '▶'} Çalıştır</>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shotstack Template Gallery ────────────────────────────────────────────────

type ShotstackTemplate = {
  key: string; label: string; format: string; tone: string;
  description: string; thumbnail_color: string; brand_types: string[];
  content_uses: string[]; template_id: string; seeded: boolean;
};

const TONE_COLORS: Record<string, string> = {
  minimal: '#94a3b8', luxury: '#c9a96e', impact: '#f472b6',
  warm: '#fb923c', corporate: '#818cf8', editorial: '#34d399',
};
const FORMAT_ICONS: Record<string, string> = { reel: '▶', story: '◉', feed: '◼' };

function ShotstackTemplateGallery({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();

  const { data: tplData, isLoading } = useQuery({
    queryKey: ['shotstack-templates'],
    queryFn: async () => {
      const res = await fetch('/api/brand-context/shotstack');
      if (!res.ok) return { templates: [] as ShotstackTemplate[], seeded: false, seeded_count: 0 };
      return res.json() as Promise<{ templates: ShotstackTemplate[]; seeded: boolean; seeded_count: number }>;
    },
    staleTime: 5 * 60_000,
  });

  const { mutate: seed, isPending: seeding } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/brand-context/shotstack', { method: 'POST' });
      if (!res.ok) throw new Error('Seed failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shotstack-templates'] }),
  });

  const templates = tplData?.templates ?? [];
  const seeded = tplData?.seeded ?? false;
  const seededCount = tplData?.seeded_count ?? 0;

  const grouped: Record<string, ShotstackTemplate[]> = {};
  for (const t of templates) {
    if (!grouped[t.format]) grouped[t.format] = [];
    (grouped[t.format] as ShotstackTemplate[]).push(t);
  }

  return (
    <div className="glass-panel-v2 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div>
          <p className="text-[13px] font-semibold text-white">🎬 Shotstack Template Galerisi</p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            12 profesyonel şablon · AI marka+içerik tipine göre otomatik seçer
            {seeded && <span className="ml-1 text-emerald-400">· {seededCount} yüklendi ✓</span>}
          </p>
        </div>
        {!seeded && (
          <button type="button" onClick={() => seed()} disabled={seeding}
            className="rounded-lg px-3 py-1.5 text-[10px] font-semibold text-cyan-300 transition disabled:opacity-50"
            style={{ border: '1px solid rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.08)' }}>
            {seeding ? 'Yükleniyor…' : '↑ Hesaba Yükle'}
          </button>
        )}
      </div>

      {isLoading && <p className="px-5 py-4 text-[11px] text-slate-700">Yükleniyor…</p>}

      {Object.entries(grouped).map(([format, fmtTemplates]) => (
        <div key={format} className="border-b border-white/[0.04] last:border-0">
          <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
            {FORMAT_ICONS[format] ?? '▷'} {format.toUpperCase()}
          </p>
          <div className="p-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fmtTemplates.map((tpl) => {
              const color = TONE_COLORS[tpl.tone] ?? '#64748b';
              return (
                <div key={tpl.key}
                  className="rounded-xl overflow-hidden"
                  style={{ border: `1px solid ${color}22`, background: `${color}08` }}>
                  {/* Renk önizleme */}
                  <div className="h-16 flex items-end justify-center pb-2 relative"
                    style={{ background: `linear-gradient(135deg, ${tpl.thumbnail_color}, ${color}44)` }}>
                    <span className="text-[9px] font-black tracking-widest uppercase text-white/90">
                      {tpl.tone.toUpperCase()}
                    </span>
                    {tpl.seeded && (
                      <span className="absolute top-1.5 right-1.5 text-[8px] font-bold text-emerald-400">✓</span>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-[10px] font-semibold text-white leading-tight">{tpl.label}</p>
                    <p className="text-[9px] text-slate-600 mt-0.5 leading-3">{tpl.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {tpl.brand_types.slice(0,3).map(bt => (
                        <span key={bt} className="rounded-full px-1.5 py-0.5 text-[8px]"
                          style={{ background: `${color}15`, color }}>
                          {bt.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="px-4 py-2.5 border-t border-white/[0.04]">
        <p className="text-[10px] text-slate-700">
          Content Studio'da "🎬 Video Paketi Oluştur" butonu brand profilinize göre otomatik template seçer.
        </p>
      </div>
    </div>
  );
}

// ── Creatomate Template Selector ──────────────────────────────────────────────

type CreatomateTemplate = {
  template_id: string; name: string; key: string;
  preview_label: string; format: string; description: string; thumbnail_url: string;
};

const STYLE_INFO: Record<string, { color: string; icon: string }> = {
  reel_minimal:   { color: '#94a3b8', icon: '◻' },
  reel_editorial: { color: '#818cf8', icon: '◈' },
  reel_impact:    { color: '#f472b6', icon: '◆' },
  story_clean:    { color: '#34d399', icon: '◉' },
};

function CreatomateTemplateSelectorPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();

  const { data: templateData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['creatomate-templates'],
    queryFn: async () => {
      const res = await fetch('/api/brand-context/templates');
      return res.ok ? res.json() as Promise<{ templates: CreatomateTemplate[]; seeded: boolean }> : { templates: [], seeded: false };
    },
    staleTime: 5 * 60_000,
  });

  const { data: brandCtx } = useQuery({
    queryKey: ['python-brand-ctx-display', workspaceId],
    queryFn: async () => {
      const res = await fetch(
        (process.env.NEXT_PUBLIC_CREW_BACKEND_URL || 'http://localhost:8000') +
        `/api/v1/brand-context/${workspaceId}`
      ).catch(() => null);
      return res?.ok ? res.json() : null;
    },
    staleTime: 30_000,
    enabled: !!workspaceId,
  });

  const assignedTemplateId = brandCtx?.creatomate_template_id as string | undefined;

  const { mutate: seed, isPending: seeding } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/brand-context/templates', { method: 'POST' });
      if (!res.ok) throw new Error('Seed failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['creatomate-templates'] }),
  });

  const { mutate: assign, isPending: assigning } = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(`/api/brand-context/${workspaceId}/assign-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId }),
      });
      if (!res.ok) throw new Error('Assign failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['python-brand-ctx-display', workspaceId] }),
  });

  const templates = templateData?.templates ?? [];
  const seeded = templateData?.seeded ?? false;

  return (
    <div className="glass-panel-v2 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div>
          <p className="text-[13px] font-semibold text-white">🎬 Video Template Seç</p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            Bu brand için Creatomate video paketi şablonu
            {assignedTemplateId && <span className="ml-1 text-emerald-400">· Atandı ✓</span>}
          </p>
        </div>
        {!seeded && (
          <button type="button" onClick={() => seed()} disabled={seeding}
            className="rounded-lg px-3 py-1.5 text-[10px] font-semibold text-indigo-300 transition disabled:opacity-50"
            style={{ border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)' }}>
            {seeding ? 'Yükleniyor…' : '+ Template Yükle'}
          </button>
        )}
      </div>

      {loadingTemplates && <p className="px-5 py-4 text-[11px] text-slate-700">Yükleniyor…</p>}

      {!loadingTemplates && !seeded && (
        <div className="px-5 py-5 text-center">
          <p className="text-[11px] text-slate-500 mb-3">
            SmartAgency template'leri henüz yüklenmemiş.
          </p>
          <button type="button" onClick={() => seed()} disabled={seeding}
            className="rounded-xl px-4 py-2 text-[11px] font-semibold text-white transition disabled:opacity-50"
            style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)' }}>
            {seeding ? 'Yükleniyor…' : '4 Template Yükle (Bir Kez)'}
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="p-3 grid grid-cols-2 gap-2">
          {templates.map((tpl) => {
            const isAssigned = tpl.template_id === assignedTemplateId;
            const si = STYLE_INFO[tpl.key] ?? { color: '#64748b', icon: '◇' };
            return (
              <button
                key={tpl.template_id}
                type="button"
                disabled={assigning}
                onClick={() => assign(tpl.template_id)}
                className="text-left rounded-xl p-3 transition disabled:opacity-50"
                style={{
                  background: isAssigned ? `${si.color}12` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isAssigned ? si.color + '50' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                {/* Preview badge */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center justify-center rounded-lg text-[13px] font-black"
                    style={{ width: 40, height: 40, background: `${si.color}15`, color: si.color }}>
                    {si.icon}
                  </div>
                  {isAssigned && (
                    <span className="text-[9px] font-bold text-emerald-400">ATANDI</span>
                  )}
                </div>
                <p className="text-[11px] font-bold text-white mb-0.5" style={{ color: isAssigned ? si.color : undefined }}>
                  {tpl.preview_label}
                </p>
                <p className="text-[9px] text-slate-600 leading-4">{tpl.description}</p>
                <p className="text-[9px] font-mono mt-1" style={{ color: si.color + 'aa' }}>
                  {tpl.format.toUpperCase()} · {tpl.template_id.slice(0, 8)}…
                </p>
              </button>
            );
          })}
        </div>
      )}

      {assignedTemplateId && (
        <div className="px-4 py-2.5 border-t border-white/[0.04]">
          <p className="text-[10px] text-slate-600">
            Content Studio'da <span className="text-indigo-400">"🎬 Template ile Render"</span> butonu bu template'i kullanır.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Brand Template Config Panel (Creatomate) ──────────────────────────────────

const FONT_OPTIONS = [
  { value: 'Montserrat', label: 'Montserrat', desc: 'Modern, kurumsal' },
  { value: 'Playfair Display', label: 'Playfair Display', desc: 'Lüks, editorial' },
  { value: 'Inter', label: 'Inter', desc: 'Minimal, teknoloji' },
  { value: 'Cormorant Garamond', label: 'Cormorant Garamond', desc: 'Şık, premium' },
  { value: 'Raleway', label: 'Raleway', desc: 'Yalın, modern' },
] as const;

function BrandTemplateConfigPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['brand-template-config', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/brand-context/${workspaceId}/brand-template-config`);
      return res.ok ? res.json() as Promise<{ primary_color: string; accent_color: string; font_family: string; overlay_opacity: number; logo_url: string; business_name: string }> : null;
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const [primary, setPrimary] = useState('#1a1a2e');
  const [accent, setAccent] = useState('#e8c97a');
  const [font, setFont] = useState('Montserrat');
  const [opacity, setOpacity] = useState(0.55);

  useEffect(() => {
    if (config) {
      setPrimary(config.primary_color);
      setAccent(config.accent_color);
      setFont(config.font_family);
      setOpacity(config.overlay_opacity);
    }
  }, [config]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brand-context/${workspaceId}/brand-template-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_color: primary, accent_color: accent, font_family: font, overlay_opacity: opacity }),
      });
      if (!res.ok) throw new Error('Kayıt başarısız');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-template-config', workspaceId] }),
  });

  return (
    <div className="glass-panel-v2 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <p className="text-[13px] font-semibold text-white">🎬 Video Paketi Şablonu</p>
        <p className="mt-0.5 text-[11px] text-slate-600">
          Creatomate ile üretilecek Reel · Story · Feed · Event · Teaser formatlarının marka kimliği
        </p>
      </div>

      {isLoading ? (
        <p className="px-5 py-4 text-[11px] text-slate-700">Yükleniyor…</p>
      ) : (
        <div className="p-4 space-y-4">
          {/* Color pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-slate-500 mb-1.5">Ana Renk (overlay, bar)</p>
              <div className="flex items-center gap-2">
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
                <span className="text-[10px] font-mono text-slate-400">{primary}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 mb-1.5">Vurgu Rengi (CTA, badge)</p>
              <div className="flex items-center gap-2">
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
                <span className="text-[10px] font-mono text-slate-400">{accent}</span>
              </div>
            </div>
          </div>

          {/* Font selector */}
          <div>
            <p className="text-[10px] text-slate-500 mb-1.5">Font</p>
            <div className="grid grid-cols-1 gap-1.5">
              {FONT_OPTIONS.map((f) => (
                <button key={f.value} type="button" onClick={() => setFont(f.value)}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-left transition"
                  style={{
                    background: font === f.value ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${font === f.value ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                  <span className="text-[11px] font-semibold text-white" style={{ fontFamily: f.value }}>{f.label}</span>
                  <span className="text-[9px] text-slate-600">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Opacity slider */}
          <div>
            <p className="text-[10px] text-slate-500 mb-1.5">Overlay Şeffaflık — {Math.round(opacity * 100)}%</p>
            <input type="range" min="0.2" max="0.85" step="0.05" value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-full accent-indigo-500" />
            <div className="flex justify-between text-[9px] text-slate-700 mt-0.5">
              <span>Hafif</span><span>Yoğun</span>
            </div>
          </div>

          {/* Preview swatch */}
          <div className="relative h-16 rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            <div className="absolute inset-0" style={{ background: primary, opacity }} />
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-bold text-white" style={{ fontFamily: font, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                {config?.business_name ?? 'Marka Adı'}
              </span>
              <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: accent, color: primary }}>
                Keşfet
              </span>
            </div>
          </div>

          <button type="button" onClick={() => save()} disabled={isPending}
            className="w-full rounded-xl py-2 text-[11px] font-semibold text-white transition disabled:opacity-50"
            style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)' }}>
            {isPending ? 'Kaydediliyor…' : '✓ Şablonu Kaydet'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Per-Tenant LLM Config Panel ───────────────────────────────────────────────

const LLM_PRESETS = [
  { label: 'Otomatik (Görev bazlı)', provider: null, model: null, description: 'İçerik → Claude, Analiz → GPT-4o' },
  { label: 'GPT-4o (OpenAI)', provider: 'openai', model: 'gpt-4o', description: 'Güçlü analiz, yapılandırılmış çıktı' },
  { label: 'GPT-4o Mini', provider: 'openai', model: 'gpt-4o-mini', description: 'Hızlı ve ekonomik' },
  { label: 'Claude Sonnet 4.6', provider: 'anthropic', model: 'claude-sonnet-4-6', description: 'Yaratıcı içerik, marka sesi' },
  { label: 'Claude Opus 4.7', provider: 'anthropic', model: 'claude-opus-4-7', description: 'En güçlü — B2B, kurumsal içerik' },
] as const;

function LLMConfigPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();

  const { data: current, isLoading } = useQuery({
    queryKey: ['llm-config', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/brand-context/${workspaceId}/llm-config`);
      return res.ok ? (res.json() as Promise<{ provider: string | null; model: string | null }>) : null;
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: async (preset: typeof LLM_PRESETS[number]) => {
      const res = await fetch(`/api/brand-context/${workspaceId}/llm-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: preset.provider, model: preset.model }),
      });
      if (!res.ok) throw new Error('Save failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['llm-config', workspaceId] }),
  });

  const activePreset = LLM_PRESETS.find(
    (p) => p.provider === (current?.provider ?? null) && p.model === (current?.model ?? null)
  ) ?? LLM_PRESETS[0];

  return (
    <div className="glass-panel-v2 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <p className="text-[13px] font-semibold text-white">🤖 Tenant LLM Modeli</p>
        <p className="mt-0.5 text-[11px] text-slate-600">
          Her tenant farklı model kullanabilir — tenantlar asla birbirine karışmaz.
          Şu an: <span className="text-indigo-400 font-medium">{isLoading ? '…' : activePreset.label}</span>
        </p>
      </div>
      <div className="p-3 grid gap-2 grid-cols-1 sm:grid-cols-2">
        {LLM_PRESETS.map((preset) => {
          const isActive = preset.provider === (current?.provider ?? null) && preset.model === (current?.model ?? null);
          return (
            <button
              key={`${preset.provider ?? 'auto'}-${preset.model ?? 'auto'}`}
              type="button"
              disabled={isPending || isLoading}
              onClick={() => save(preset)}
              className="text-left rounded-xl px-3 py-2.5 transition disabled:opacity-50"
              style={{
                background: isActive ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-white">{preset.label}</p>
                {isActive && <span className="text-[9px] text-indigo-400 font-bold">AKTİF</span>}
              </div>
              <p className="text-[10px] text-slate-600 mt-0.5">{preset.description}</p>
            </button>
          );
        })}
      </div>
      <div className="px-5 py-3 border-t border-white/[0.04]">
        <p className="text-[10px] text-slate-700">
          ⚠️ Tenant izolasyonu garantisi: her agent çağrısı kendi tenant ID + model seçimiyle çalışır.
          ChromaDB memory devre dışı — tenant veri karışımı riski sıfır.
        </p>
      </div>
    </div>
  );
}

// ── Media Upload Panel ────────────────────────────────────────────────────────

const ASSET_TYPES = [
  { value: 'venue_photo',    label: 'Mekan Fotoğrafı' },
  { value: 'product_photo',  label: 'Ürün Fotoğrafı' },
  { value: 'team_photo',     label: 'Ekip / İnsan' },
  { value: 'logo',           label: 'Logo' },
  { value: 'video',          label: 'Video' },
  { value: 'other',          label: 'Diğer' },
] as const;

function MediaUploadPanel({ workspaceId, officeId }: { workspaceId: string; officeId: string }) {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [error, setError] = useState('');
  const [assetType, setAssetType] = useState<string>('venue_photo');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    let count = 0;

    for (const file of Array.from(files)) {
      try {
        // 1. R2'ye yükle
        const formData = new FormData();
        formData.append('file', file);
        formData.append('tenantId', workspaceId);
        formData.append('type', file.type.startsWith('video/') ? 'video' : 'image');

        const uploadRes = await fetch('/api/media/upload', {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) {
          const d = await uploadRes.json().catch(() => ({}));
          throw new Error(d.error ?? 'Yükleme başarısız');
        }
        const { url, key } = await uploadRes.json() as { url: string; key: string };

        // 2. .NET'e asset kaydı
        await apiClient.createTenantMediaAsset({
          officeId: officeId || null,
          assetType,
          url,
          storageKey: key,
          displayName: file.name,
          description: '',
          tags: assetType,
          usageContext: assetType,
        });

        count++;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Yükleme hatası');
      }
    }

    setUploadedCount((n) => n + count);
    setUploading(false);
    if (count > 0) {
      await queryClient.invalidateQueries({ queryKey: ['brand-context-assets'] });
    }
  }

  return (
    <div className="glass-panel-v2 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <p className="text-[13px] font-semibold text-white">📁 Görsel & Video Yükle</p>
        <p className="mt-0.5 text-[11px] text-slate-600">
          Yüklenen görseller AI üretiminde, Shotstack template'lerinde ve reel oluşturmada kullanılır
        </p>
      </div>

      <div className="p-4 space-y-3">
        {/* Asset tipi seçimi */}
        <div className="flex flex-wrap gap-1.5">
          {ASSET_TYPES.map((t) => (
            <button key={t.value} type="button" onClick={() => setAssetType(t.value)}
              className="rounded-full px-2.5 py-1 text-[10px] font-medium transition"
              style={{
                background: assetType === t.value ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${assetType === t.value ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: assetType === t.value ? '#a5b4fc' : '#64748b',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer transition"
          style={{
            border: `2px dashed ${dragging ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.10)'}`,
            background: dragging ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
            minHeight: 96, padding: '20px 16px',
          }}>
          <input ref={inputRef} type="file" multiple accept="image/*,video/mp4,video/mov"
            className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
          {uploading ? (
            <><Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
              <p className="text-[11px] text-slate-500">Yükleniyor…</p></>
          ) : (
            <><ArrowRight className="h-5 w-5 text-slate-600 rotate-[-90deg]" />
              <p className="text-[11px] text-slate-500">Sürükle & bırak veya tıkla</p>
              <p className="text-[10px] text-slate-700">JPG · PNG · WEBP · MP4 · MOV</p></>
          )}
        </div>

        {error && <p className="text-[10px] text-red-400">{error}</p>}
        {uploadedCount > 0 && !uploading && (
          <p className="text-[10px] text-emerald-400">✓ {uploadedCount} dosya yüklendi</p>
        )}
      </div>
    </div>
  );
}

// ── Pinterest Visual Inspiration Panel ───────────────────────────────────────

function PinterestInspirationPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['pinterest-inspiration', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/brand-context/${workspaceId}/pinterest-inspiration`);
      return res.ok ? res.json() : null;
    },
    staleTime: 60_000 * 30,
    enabled: !!workspaceId,
  });

  const { mutate: refresh, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brand-context/${workspaceId}/pinterest-inspiration`, { method: 'POST' });
      if (!res.ok) throw new Error('Pinterest scrape failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pinterest-inspiration', workspaceId] }),
  });

  const themes: string[] = data?.visual_themes ?? [];
  const topPins: { title: string; imageUrl: string; saves: number }[] = data?.top_pins ?? [];
  const updatedAt = data?.updated_at ? new Date(data.updated_at).toLocaleDateString('tr-TR') : null;

  return (
    <div className="glass-panel-v2 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div>
          <p className="text-[13px] font-semibold text-white">📌 Pinterest Görsel İlham</p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            Sektör trendleri · {updatedAt ? `Son güncelleme: ${updatedAt}` : 'Henüz taranmadı'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={isPending || isLoading}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-indigo-300 transition hover:bg-indigo-500/10 disabled:opacity-50"
          style={{ border: '1px solid rgba(99,102,241,0.3)' }}
        >
          <RefreshCw size={11} className={isPending ? 'animate-spin' : ''} />
          {isPending ? 'Taranıyor…' : 'Tara'}
        </button>
      </div>

      {isLoading && <p className="px-5 py-4 text-[11px] text-slate-700">Yükleniyor…</p>}

      {!isLoading && !data?.available && !isPending && (
        <p className="px-5 py-4 text-[11px] text-slate-600">
          Pinterest verisi yok. "Tara" butonuna basarak Apify ile sektör trendlerini çekin.
        </p>
      )}

      {themes.length > 0 && (
        <div className="px-5 py-3 border-b border-white/[0.04]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">Görsel Temalar</p>
          <div className="flex flex-wrap gap-1.5">
            {themes.map((t) => (
              <span key={t} className="rounded-full px-2 py-0.5 text-[10px] font-medium text-indigo-300" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {topPins.length > 0 && (
        <div className="px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-3">Top Pin&apos;ler ({data.pins_count} toplam)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {topPins.map((pin, i) => (
              <div key={i} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {pin.imageUrl ? (
                  <img src={pin.imageUrl} alt={pin.title} className="w-full aspect-square object-cover" loading="lazy" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center text-[9px] text-slate-700">Görsel yok</div>
                )}
                <div className="p-2">
                  <p className="text-[9px] text-slate-400 truncate">{pin.title || '—'}</p>
                  <p className="text-[9px] text-indigo-400 mt-0.5">♥ {pin.saves.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scheduled Posts Panel ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#818cf8', published: '#22c55e', failed: '#ef4444', cancelled: '#64748b',
};

function ScheduledPostsPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['scheduled-posts', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/meta/scheduled-posts?workspaceId=${workspaceId}`);
      return res.ok ? res.json() : [];
    },
    refetchInterval: 30_000,
    enabled: !!workspaceId,
  });

  async function cancel(postId: string) {
    await fetch('/api/meta/scheduled-posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, postId }),
    });
    queryClient.invalidateQueries({ queryKey: ['scheduled-posts', workspaceId] });
  }

  if (!posts.length && !isLoading) return null;

  return (
    <div className="glass-panel-v2 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <p className="text-[13px] font-semibold text-white">📅 Zamanlanmış Gönderiler</p>
        <p className="mt-0.5 text-[11px] text-slate-600">APScheduler her 5 dakikada kontrol eder ve zamanı gelenleri yayınlar</p>
      </div>
      {isLoading ? (
        <p className="px-5 py-4 text-[11px] text-slate-700">Yükleniyor…</p>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {posts.map((p: Record<string, unknown>) => {
            const scheduledAt = p.scheduled_at ? new Date(p.scheduled_at as string).toLocaleString('tr-TR') : '';
            const status = p.status as string;
            return (
              <div key={p.id as string} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-white truncate">{(p.artifact_title as string) || (p.caption as string)?.slice(0, 50) || '—'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-bold uppercase" style={{ color: STATUS_COLORS[status] ?? '#64748b' }}>{status}</span>
                    <span className="text-[10px] text-slate-600">{p.platform as string} · {scheduledAt}</span>
                  </div>
                  {typeof p.permalink === 'string' && p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 hover:underline">Görüntüle →</a>
                  )}
                  {typeof p.error_message === 'string' && p.error_message && <p className="text-[10px] text-red-400 mt-0.5 truncate">{p.error_message}</p>}
                </div>
                {status === 'scheduled' && (
                  <button type="button" onClick={() => void cancel(p.id as string)}
                    className="shrink-0 rounded-lg px-2 py-1 text-[10px] text-slate-500 hover:text-red-400 transition"
                    style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    İptal
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BrandIntelligencePanel({ workspaceId, mediaOnly = false }: { workspaceId: string; mediaOnly?: boolean }) {
  const queryClient = useQueryClient();
  const officeId = useWorkspaceStore((s) => s.officeId);
  const { data: mediaAssets = [] } = useQuery<TenantMediaAsset[]>({
    queryKey: ['brand-context-assets'],
    queryFn: () => apiClient.getTenantMediaAssets({}),
    staleTime: 30_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['python-brand-context', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      const res = await fetch(`/api/brand-context/${workspaceId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => null);
      // Use GET instead for display
      const getRes = await fetch(`/api/brand-context/${workspaceId}/get`).catch(() => null);
      return null; // Display handled via direct GET below
    },
    enabled: false, // don't auto-fetch
    staleTime: Infinity,
  });

  const { data: ctx, refetch } = useQuery({
    queryKey: ['python-brand-ctx-display', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;
      const res = await fetch(
        (process.env.NEXT_PUBLIC_CREW_BACKEND_URL || 'http://localhost:8000') +
        `/api/v1/brand-context/${workspaceId}`
      ).catch(() => null);
      if (!res?.ok) return null;
      return res.json() as Promise<Record<string, string | number | null>>;
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  // Also fetch structured briefs (monthly + brand DNA)
  const { data: allBriefs } = useQuery({
    queryKey: ['all-briefs', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/brand-context/${workspaceId}/all-briefs`).catch(() => null);
      if (!res?.ok) return null;
      return res.json();
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  // Language selector state — reads from ctx.languages when available
  const currentLang = (ctx?.languages as string | null) ?? 'en';
  const [langSaving, setLangSaving] = useState(false);

  async function setLanguage(lang: string) {
    if (!workspaceId || langSaving) return;
    setLangSaving(true);
    try {
      await fetch(`/api/brand-context/${workspaceId}/set-language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
      await queryClient.invalidateQueries({ queryKey: ['python-brand-ctx-display', workspaceId] });
    } finally {
      setLangSaving(false);
    }
  }

  const LANGUAGES = [
    { code: 'tr', label: 'Türkçe', flag: '🇹🇷', note: 'Native Türkçe copywriting' },
    { code: 'en', label: 'English', flag: '🇬🇧', note: 'Native English copywriting' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪', note: 'Native Deutsch copywriting' },
  ];

  const langPanel = (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(13,14,22,0.8)', border: '1px solid rgba(99,102,241,0.2)' }}>
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <p className="text-[13px] font-semibold text-white">İçerik Dili</p>
        <p className="mt-0.5 text-[11px] text-slate-600">
          Agent'lar seçili dilde <strong>yerel olarak</strong> üretir — çeviri değil, native yazarlık
        </p>
      </div>
      <div className="flex gap-2 p-4 flex-wrap">
        {LANGUAGES.map((lang) => {
          const active = currentLang === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              disabled={langSaving}
              onClick={() => void setLanguage(lang.code)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold transition disabled:opacity-50"
              style={{
                background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                border: active ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)',
                color: active ? '#818cf8' : '#64748b',
              }}
            >
              <span className="text-base">{lang.flag}</span>
              <div className="text-left">
                <div>{lang.label}</div>
                <div className="text-[9px] font-normal opacity-70">{lang.note}</div>
              </div>
              {active && <span className="ml-1 text-[10px]">✓</span>}
            </button>
          );
        })}
      </div>
      <div className="px-5 pb-4">
        <p className="text-[10px] text-slate-700">
          Türkçe seçiliyse Gram Master Türkçe düşünür, İngilizce çeviri yapmaz.
          {' '}<span style={{ color: '#f59e0b' }}>Caption, hashtag, CTA, headline</span> — hepsi native üretilir.
        </p>
      </div>
    </div>
  );

  // Always render jobs panel even before ctx loads
  const jobsPanel = (
    <IntelligenceJobsPanel
      workspaceId={workspaceId}
      allBriefs={allBriefs as Record<string, unknown> | null}
    />
  );

  if (!ctx) return <div className="p-5 flex flex-col gap-5">{langPanel}{jobsPanel}</div>;

  const sections: Array<{ key: string; label: string; color: string; emoji: string }> = [
    { key: 'visual_dna',       label: 'Visual DNA',           color: '#a78bfa', emoji: '🎨' },
    { key: 'competitor_brief', label: 'Competitor Brief',     color: '#f59e0b', emoji: '🔍' },
    { key: 'trend_brief',      label: 'Weekly Trend Brief',   color: '#22d3ee', emoji: '📈' },
  ];

  const hasAny = sections.some((s) => ctx[s.key]);

  // Social Listening
  const socialSignals = allBriefs?.social_signals as Record<string, unknown> | null;
  const socialBrief = typeof socialSignals?.brief === 'string' ? socialSignals.brief : null;
  const socialUpdatedAt = allBriefs?.social_signals_updated_at as string | null;
  const hashtagTrends = (socialSignals?.hashtag_trends as Record<string, { post_count?: number; avg_likes?: number; top_co_hashtags?: string[] }>) ?? {};
  const brandMentions = (socialSignals?.brand_mentions as { total_mentions?: number; positive_mentions?: number; negative_mentions?: number }) ?? {};

  // Parse monthly brief text
  const monthlyBriefData = allBriefs?.monthly_brief;
  const monthlyBriefText = typeof monthlyBriefData === 'object' ? monthlyBriefData?.brief_text : monthlyBriefData;
  const monthlyBriefSources: string[] = typeof monthlyBriefData === 'object' ? (monthlyBriefData?.data_sources_used ?? []) : [];
  const monthlyBriefMonth = typeof monthlyBriefData === 'object' ? monthlyBriefData?.month : null;
  const monthlyBriefRichness = typeof monthlyBriefData === 'object' ? monthlyBriefData?.richness : null;

  // Parse brand DNA
  const dnaData = allBriefs?.brand_dna;
  const dnaEssence = dnaData?.brand_essence;
  const dnaPriority = dnaData?.current_strategic_priority;
  const dnaRecommendation = dnaData?.agency_recommendation;
  const dnaDos = dnaData?.content_do_list ?? [];
  const dnaDonts = dnaData?.content_dont_list ?? [];
  const dnaRichness = dnaData?.data_richness;

  // Medya tab'ı için: sadece görsel analiz kısmını göster
  if (mediaOnly) {
    return (
      <div className="flex flex-col gap-4">
        {ctx['reference_image_urls'] && (() => {
          let urls: string[] = [];
          try { urls = JSON.parse(ctx['reference_image_urls'] as string); } catch { urls = []; }
          if (!urls.length) return <p className="text-[11px] text-slate-700 px-1">Görsel galerisi henüz yok. Fotoğraf yükleyin veya brand analizi çalıştırın.</p>;
          return (
            <GalleryAnalysisPanel urls={urls} mediaAssets={mediaAssets} workspaceId={workspaceId}
              onAnalysisComplete={async (results) => {
                for (const r of results) {
                  const asset = mediaAssets.find((a: TenantMediaAsset) => a.url === r.url);
                  if (!asset) continue;
                  try {
                    await apiClient.updateTenantMediaAsset(asset.id, {
                      url: asset.url, assetType: r.suggestedAssetType,
                      tags: r.contentTags.join(', '), usageContext: r.usageContext, description: r.description,
                    });
                  } catch { /* non-blocking */ }
                }
                queryClient.invalidateQueries({ queryKey: ['brand-context-assets'] });
              }} />
          );
        })()}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Language selector */}
      {langPanel}
      {/* Intelligence Jobs — always visible, manual trigger panel */}
      {jobsPanel}

    <div className="glass-panel-v2 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <p className="text-[13px] font-semibold text-white/90">AI Brand Intelligence</p>
          <p className="text-[10px] text-slate-600">Sprint 1-3 sonuçları — tüm ajanlar bu verileri kullanıyor</p>
        </div>
        {ctx['discovery_confidence'] && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-indigo-500 transition-[width]" style={{ width: `${ctx['discovery_confidence']}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-indigo-400">{ctx['discovery_confidence']}%</span>
          </div>
        )}
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-3">
        {sections.map(({ key, label, color, emoji }) => {
          const value = ctx[key] as string | null;
          if (!value)
            return (
              <div
                key={key}
                className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-700">
                  {emoji} {label}
                </p>
                <p className="mt-2 text-[11px] text-slate-800">Henüz analiz edilmedi</p>
                {key === 'visual_dna' && (
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-700">
                    Üstteki <span className="text-violet-400">▶ Visual DNA</span> ile çalıştırın. Python backend +{' '}
                    <code className="rounded bg-white/5 px-1">OPENAI_API_KEY</code> ve marka analizi sonrası referans görseller
                    gerekir.
                  </p>
                )}
                {key === 'competitor_brief' && (
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-700">
                    Üstteki <span className="text-amber-400">▶ Rakip Analiz</span> ile çalıştırın. Brand context&apos;te rakip
                    alanı dolu olmalı ve <code className="rounded bg-white/5 px-1">APIFY_API_KEY</code> tanımlı olmalı.
                  </p>
                )}
              </div>
            );
          return (
            <div key={key} className="rounded-xl p-4" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color }}>{emoji} {label}</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-400 line-clamp-6 whitespace-pre-wrap">{value}</p>
            </div>
          );
        })}
      </div>
      {ctx['google_rating'] && (
        <div className="flex items-center gap-4 border-t border-white/[0.05] px-5 py-3">
          <span className="text-[11px] text-slate-600">Google:</span>
          <span className="text-[13px] font-semibold text-amber-400">⭐ {ctx['google_rating']}/5</span>
          {ctx['google_review_count'] && <span className="text-[11px] text-slate-700">({ctx['google_review_count']} yorum)</span>}
        </div>
      )}

      {/* Brand DNA Panel */}
      {dnaEssence && (
        <div style={{ borderTop: '1px solid rgba(244,114,182,0.15)' }} className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: '#f472b6' }}>
              🧬 Marka DNA — {dnaRichness === 'rich' ? '🟢 Zengin' : dnaRichness === 'moderate' ? '🟡 Orta' : '🔴 Seyrek'}
            </p>
            <p className="text-[9px] text-slate-700">{allBriefs?.brand_dna_updated_at?.slice(0, 10)}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl p-3" style={{ background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.15)' }}>
              <p className="mb-1 text-[9px] font-bold uppercase text-pink-400/70">Marka Özü</p>
              <p className="text-[11px] leading-5 text-slate-300">{dnaEssence}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.15)' }}>
              <p className="mb-1 text-[9px] font-bold uppercase text-pink-400/70">Bu Haftanın Önceliği</p>
              <p className="text-[11px] leading-5 text-slate-300">{dnaPriority}</p>
            </div>
            {dnaRecommendation && (
              <div className="rounded-xl p-3 md:col-span-2" style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.15)' }}>
                <p className="mb-1 text-[9px] font-bold uppercase text-orange-400/70">💡 Ajans Tavsiyesi</p>
                <p className="text-[11px] leading-5 text-slate-300">{dnaRecommendation}</p>
              </div>
            )}
            {(dnaDos.length > 0 || dnaDonts.length > 0) && (
              <div className="rounded-xl p-3 md:col-span-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="grid gap-2 md:grid-cols-2">
                  {dnaDos.length > 0 && (
                    <div>
                      <p className="mb-1 text-[9px] font-bold uppercase text-emerald-400/70">✓ İçerikte Yapılacaklar</p>
                      {dnaDos.slice(0, 4).map((d: string, i: number) => (
                        <p key={i} className="text-[11px] leading-5 text-slate-400">• {d}</p>
                      ))}
                    </div>
                  )}
                  {dnaDonts.length > 0 && (
                    <div>
                      <p className="mb-1 text-[9px] font-bold uppercase text-red-400/70">✗ Kaçınılacaklar</p>
                      {dnaDonts.slice(0, 3).map((d: string, i: number) => (
                        <p key={i} className="text-[11px] leading-5 text-slate-400">• {d}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Social Listening Panel */}
      {(socialBrief || Object.keys(hashtagTrends).length > 0) && (
        <div style={{ borderTop: '1px solid rgba(6,182,212,0.15)' }} className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: '#06b6d4' }}>
                📡 Social Listening
              </p>
              {socialUpdatedAt && (
                <p className="mt-0.5 text-[9px] text-slate-700">Son: {socialUpdatedAt.slice(0, 16).replace('T', ' ')}</p>
              )}
            </div>
            {brandMentions.total_mentions ? (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-cyan-400 font-semibold">{brandMentions.total_mentions} mention</span>
                {brandMentions.positive_mentions ? <span className="text-emerald-400">+{brandMentions.positive_mentions} pozitif</span> : null}
                {brandMentions.negative_mentions ? <span className="text-red-400">-{brandMentions.negative_mentions} negatif</span> : null}
              </div>
            ) : null}
          </div>

          {/* Hashtag trends */}
          {Object.keys(hashtagTrends).length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {Object.entries(hashtagTrends).map(([tag, data]) => (
                <div key={tag} className="rounded-xl px-3 py-2"
                  style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
                  <p className="text-[11px] font-bold text-cyan-300">#{tag}</p>
                  <p className="text-[10px] text-slate-500">{data.post_count} post · ort. {data.avg_likes} ❤️</p>
                  {(data.top_co_hashtags ?? []).length > 0 && (
                    <p className="text-[9px] text-slate-700 mt-0.5 truncate max-w-[160px]">
                      {(data.top_co_hashtags ?? []).slice(0, 3).join(' ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Brief text */}
          {socialBrief && (
            <div className="rounded-xl p-3 text-[12px] leading-6 text-slate-300 whitespace-pre-wrap"
              style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.1)', maxHeight: 400, overflowY: 'auto' }}>
              {socialBrief}
            </div>
          )}
        </div>
      )}

      {/* Monthly Brief Panel */}
      {monthlyBriefText && (
        <div style={{ borderTop: '1px solid rgba(251,146,60,0.15)' }} className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: '#fb923c' }}>
                📋 Aylık Stratejik Brief — {monthlyBriefMonth}
              </p>
              {monthlyBriefSources.length > 0 && (
                <p className="mt-0.5 text-[9px] text-slate-600">
                  Kullanılan kaynaklar: {monthlyBriefSources.join(' · ')}
                  {' '}· Zenginlik: <span className={monthlyBriefRichness === 'rich' ? 'text-emerald-500' : monthlyBriefRichness === 'moderate' ? 'text-amber-500' : 'text-red-500'}>{monthlyBriefRichness}</span>
                </p>
              )}
            </div>
            <p className="text-[9px] text-slate-700">{allBriefs?.monthly_brief_updated_at?.slice(0, 10)}</p>
          </div>
          <div
            className="rounded-xl p-4 text-[11px] leading-6 text-slate-300 whitespace-pre-wrap"
            style={{ background: 'rgba(251,146,60,0.04)', border: '1px solid rgba(251,146,60,0.12)', maxHeight: 600, overflowY: 'auto' }}
          >
            {monthlyBriefText}
          </div>
        </div>
      )}

    </div>
    </div>
  );
}
