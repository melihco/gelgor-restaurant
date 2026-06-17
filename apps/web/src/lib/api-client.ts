import {
  Brief,
  BriefCreateRequest,
  BriefDecomposedResponse,
  TaskItem,
  TaskUpdateRequest,
  Agent,
  Office,
  Notification,
  OutputArtifact,
  AgentExecutionRequest,
  AgentExecutionResponse,
  CancelStuckExecutionResult,
  WorkflowStartResponse,
  CompanyProfile,
  SaveCompanyProfileRequest,
  BrandDiscoveryRequest,
  BrandDiscoveryResult,
  PythonBrandAnalyzeResponse,
  TaskRecommendationsResponse,
  IndustryPlaybookDto,
  TenantCapabilityDefinitionDto,
  TenantOperatingProfileDto,
  TenantMediaAsset,
  UpsertTenantMediaAssetRequest,
  OfficeBrandProfile,
  UpsertOfficeBrandProfileRequest,
  CanvaTemplateAssignment,
  UpsertCanvaTemplateAssignmentRequest,
  PackageDefinition,
  TenantSubscription,
  IntegrationConnection,
  CreateIntegrationRequest,
  ProviderAccountMapping,
  UsageQuotaSummary,
  SuggestedActionDto,
  ActionExecutionResult,
  OperationsSummary,
  OnboardingStatus,
  CurrentUserSecurity,
  AuthSession,
  UserAdmin,
  MissionSummary,
  MissionProgress,
  ProposeMissionsResponse,
  BrandRuleItem,
  BrandRulesScanResponse,
} from '@/types';
import type {
  BrandProfileSnapshot,
  PlatformAdminOverview,
  ProductionBrandContextSnapshot,
} from '@smartagency/contracts';
import { getApiFetchUrl, getRequestContextHeaders, getTenantBffHeaders } from '@/lib/runtime-config';
import { humanizeMobileServiceError } from '@/lib/mobile-customer-copy';
import { setSessionToken } from '@/lib/session-token';

export class ApiRequestError extends Error {
  status: number;
  statusText: string;
  responseBody: string;

  constructor(status: number, statusText: string, responseBody: string) {
    const detail = responseBody ? ` - ${responseBody.slice(0, 400)}` : '';
    super(`API Error: ${status} ${statusText}${detail}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.statusText = statusText;
    this.responseBody = responseBody;
  }
}

/** Retry when Python crew backend is briefly unreachable (503 / network blip). */
async function fetchWithTransientRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = 2,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(input, init);
      if (res.status !== 503 || attempt === retries) return res;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    } catch (err) {
      lastError = err;
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

export interface UserFriendlyApiError {
  title: string;
  detail: string;
  hint?: string;
  status?: number;
}

export interface GetArtifactsParams {
  agentRunId?: string;
  status?: string;
  contentType?: string;
  /** Max rows (newest first). Omit for full tenant list (admin). */
  limit?: number;
  /** ISO-8601 — only artifacts created at or after this instant. */
  since?: string;
  /** Filter metadata JSON containing this mission UUID. */
  missionId?: string;
}

export function toUserFriendlyApiError(error: unknown, fallback = 'İşlem tamamlanamadı.'): UserFriendlyApiError {
  if (error instanceof ApiRequestError) {
    const parsed = parseErrorBody(error.responseBody);
    return {
      title: parsed.title || statusTitle(error.status),
      detail: parsed.detail || fallback,
      hint: parsed.hint,
      status: error.status,
    };
  }

  if (error instanceof Error) {
    return {
      title: fallback,
      detail: cleanErrorMessage(error.message) || fallback,
    };
  }

  return {
    title: fallback,
    detail: fallback,
  };
}

function parseErrorBody(body: string): { title?: string; detail?: string; hint?: string } {
  if (!body) return {};

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const title = stringValue(parsed.title) || stringValue(parsed.error) || stringValue(parsed.message);
    const detail = stringValue(parsed.detail) || stringValue(parsed.details) || stringValue(parsed.reason);
    const hint = stringValue(parsed.hint) || stringValue(parsed.action);
    return { title, detail: detail && detail !== title ? detail : undefined, hint };
  } catch {
    return { detail: cleanErrorMessage(body) };
  }
}

function statusTitle(status: number) {
  if (status === 0) return 'API’ye bağlanılamıyor';
  if (status === 400) return 'Eksik veya hatalı bilgi var';
  if (status === 401) return 'Oturum gerekli';
  if (status === 403) return 'Bu işlem için yetkin yok';
  if (status === 404) return 'Kayıt bulunamadı';
  if (status === 409) return 'Bu kayıt zaten var';
  if (status === 503) return 'Servis geçici olarak ulaşılamıyor';
  if (status >= 500) return 'Sunucu tarafında bir sorun oluştu';
  return 'İşlem tamamlanamadı';
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function cleanErrorMessage(message: string) {
  const stripped = message
    .replace(/^API Error:\s*\d+\s+[A-Za-z ]+\s*-\s*/i, '')
    .trim();
  return humanizeMobileServiceError(stripped);
}

/** Nexus API expects ApprovalMode as numeric enum unless JsonStringEnumConverter is enabled. */
const APPROVAL_MODE_NUMERIC: Record<string, number> = {
  SuggestOnly: 0,
  SuggestAndWait: 1,
  AutoExecute: 2,
};

function normalizeApprovalModeForApi(
  mode: SaveCompanyProfileRequest['defaultApprovalMode'],
): number {
  if (typeof mode === 'number' && Number.isFinite(mode)) return mode;
  if (typeof mode === 'string' && Object.prototype.hasOwnProperty.call(APPROVAL_MODE_NUMERIC, mode)) {
    return APPROVAL_MODE_NUMERIC[mode] ?? 1;
  }
  return 1;
}

type ApiRequestOptions = RequestInit & { timeoutMs?: number };

class ApiClient {
  private async request<T>(
    endpoint: string,
    options?: ApiRequestOptions
  ): Promise<T> {
    const url = getApiFetchUrl(endpoint);
    const { timeoutMs, ...fetchOptions } = options ?? {};
    const controller = timeoutMs ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    let response: Response;
    try {
      response = await fetch(url, {
      credentials: 'include',
      ...fetchOptions,
      signal: controller?.signal ?? fetchOptions.signal,
      headers: {
        'Content-Type': 'application/json',
        ...getRequestContextHeaders(),
        ...fetchOptions.headers,
      },
    });
    } catch (cause) {
      const aborted = cause instanceof DOMException && cause.name === 'AbortError';
      const message = aborted
        ? 'Request timed out'
        : cause instanceof Error
          ? cause.message
          : 'Failed to fetch';
      throw new ApiRequestError(0, 'Network Error', JSON.stringify({ error: message }));
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new ApiRequestError(response.status, response.statusText, errorBody);
    }

    return response.json();
  }

  // Briefs
  async getBriefs(_officeId: string): Promise<Brief[]> {
    return this.request('/api/briefs');
  }

  async getBrief(briefId: string): Promise<Brief> {
    return this.request(`/api/briefs/${briefId}`);
  }

  async createBrief(
    _officeId: string,
    data: BriefCreateRequest
  ): Promise<Brief> {
    return this.request('/api/briefs', {
      method: 'POST',
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        rawContent: data.description,
      }),
    });
  }

  async submitBrief(briefId: string): Promise<BriefDecomposedResponse> {
    return this.request(`/api/briefs/${briefId}/submit`, {
      method: 'POST',
    });
  }

  // Tasks
  async getRecentTasks(limit: number = 80): Promise<TaskItem[]> {
    return this.request(`/api/tasks?limit=${encodeURIComponent(limit)}`);
  }

  async getTasks(briefId: string): Promise<TaskItem[]> {
    return this.request(`/api/tasks/brief/${briefId}`);
  }

  async getTask(taskId: string): Promise<TaskItem> {
    return this.request(`/api/tasks/${taskId}`);
  }

  async updateTaskStatus(
    taskId: string,
    data: TaskUpdateRequest
  ): Promise<TaskItem> {
    return this.request(`/api/tasks/${taskId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        taskId,
        status: data.status ?? 'pending',
      }),
    });
  }

  async assignTask(taskId: string, agentId: string): Promise<TaskItem> {
    return this.request(`/api/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    });
  }

  // Agents
  async getAgents(officeId: string): Promise<Agent[]> {
    return this.request(`/api/agents/office/${officeId}`);
  }

  async getAgent(agentId: string): Promise<Agent> {
    return this.request(`/api/agents/${agentId}`);
  }

  async updateAgentState(
    agentId: string,
    state: string
  ): Promise<Agent> {
    return this.request(`/api/agents/${agentId}/state`, {
      method: 'PUT',
      body: JSON.stringify({ agentId, newState: state }),
    });
  }

  async executeAgent(
    agentId: string,
    data: AgentExecutionRequest
  ): Promise<AgentExecutionResponse> {
    return this.request(`/api/agents/${agentId}/execute`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async startGrowthRecoveryWorkflow(): Promise<WorkflowStartResponse> {
    return this.request('/api/agents/workflows/growth-recovery/start', {
      method: 'POST',
    });
  }

  async cancelStuckAgentExecution(
    agentId: string,
    options?: { agentRunId?: string; minAgeMinutes?: number; force?: boolean }
  ): Promise<CancelStuckExecutionResult> {
    const params = new URLSearchParams();
    if (options?.agentRunId) params.set('agentRunId', options.agentRunId);
    if (options?.minAgeMinutes != null) params.set('minAgeMinutes', String(options.minAgeMinutes));
    if (options?.force) params.set('force', 'true');
    const qs = params.toString();
    return this.request(
      `/api/agents/${encodeURIComponent(agentId)}/cancel-stuck-execution${qs ? `?${qs}` : ''}`,
      { method: 'POST' }
    );
  }

  // Office
  async getOffice(officeId: string): Promise<Office> {
    return this.request(`/api/office/${officeId}`);
  }

  // Artifacts & Review
  async getArtifacts(params?: GetArtifactsParams): Promise<OutputArtifact[]> {
    const qs = new URLSearchParams();
    if (params?.agentRunId) qs.set('agentRunId', params.agentRunId);
    if (params?.status) qs.set('status', params.status);
    if (params?.contentType) qs.set('contentType', params.contentType);
    if (params?.limit != null && params.limit > 0) qs.set('limit', String(params.limit));
    if (params?.since) qs.set('since', params.since);
    if (params?.missionId) qs.set('missionId', params.missionId);
    const endpoint = `/api/artifacts${qs.toString() ? `?${qs.toString()}` : ''}`;
    try {
      const artifacts = await this.request<any[]>(endpoint);
      return artifacts.map((artifact) => this.mapArtifact(artifact));
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return [];
      }
      throw error;
    }
  }

  async getArtifact(artifactId: string): Promise<OutputArtifact> {
    const artifact = await this.request<any>(`/api/artifacts/${artifactId}`);
    return this.mapArtifact(artifact);
  }

  /** Fetch Python brand context (reference images, visual DNA, colors, etc.) */
  async getBrandContextData(workspaceId: string): Promise<{
    reference_image_urls?: string[];
    visual_dna?: string;
    visual_style?: string;
    brand_tone?: string;
    business_name?: string;
    location?: string;
    industry?: string;
    content_pillars?: string[];
    brand_primary_color?: string;
    brand_accent_color?: string;
    logo_url?: string;
    website_summary?: string;
    instagram_bio?: string;
    target_audience?: string;
    business_type?: string;
    website_url?: string;
    instagram_handle?: string;
    description?: string;
    brand_dna?: string;
    brand_constitution_confirmed_at?: string | null;
    campaign_goals?: string;
  }> {
    const res = await fetch(`/api/brand-context-data/${workspaceId}`, {
      headers: getTenantBffHeaders(workspaceId),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const msg = String(data.message ?? data.error ?? `HTTP ${res.status}`);
      throw new Error(
        data.error === 'crew_backend_unreachable'
          ? `Marka servisi şu an ulaşılamıyor: ${msg}`
          : `Marka verisi alınamadı: ${msg}`,
      );
    }
    return data;
  }

  /** Copy Python brand_context into Nexus CompanyProfile (fills empty fields only). */
  async hydrateCompanyProfileFromPython(workspaceId: string): Promise<{ ok: boolean; applied?: string[] }> {
    return this.request(`/api/brand-context/${workspaceId}/hydrate-company-profile`, {
      method: 'POST',
    });
  }

  /**
   * Generate an Instagram image via Next.js BFF → Flux/GPT-image.
   * Returns { imageUrl, base64 } on success.
   */
  async generateInstagramImage(params: {
    title: string;
    caption?: string;
    concept?: string;
    brandName?: string;
    industry?: string;
    location?: string;
    visualStyle?: string;
    contentType?: 'post' | 'story' | 'reel';
    referenceImageUrls?: string[];
    campaignContext?: string;
    // Design card mode: uses brand photo as base + adds text overlay
    designCardPrompt?: string;
    // Enhance mode: retouches the first reference image
    enhanceMode?: boolean;
    enhanceContext?: string;
    assetIntent?: string;
    logoUrl?: string;
    photoMetadata?: Array<{ tags?: string; description?: string; assetType?: string }>;
  }): Promise<{ imageUrl: string; revisedPrompt?: string }> {
    const res = await fetch('/api/generate-instagram-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Image generation failed (${res.status})`);
    }
    return res.json();
  }

  /**
   * Save a generated creative image as a .NET OutputArtifact (pending_review).
   * It will appear in the Outputs screen for approval.
   */
  async saveCreativeArtifact(params: {
    title: string;
    contentUrl: string;
    content?: string;
    platform?: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; title: string; contentUrl: string; reviewStatus: string }> {
    return this.request('/api/artifacts/creative', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async approveArtifact(
    artifactId: string,
    comments?: string,
    finalizedContent?: string,
  ): Promise<unknown> {
    return this.request(`/api/artifacts/${artifactId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        comments: comments ?? '',
        ...(finalizedContent !== undefined ? { finalizedContent } : {}),
      }),
    });
  }

  async rejectArtifact(
    artifactId: string,
    comments?: string
  ): Promise<unknown> {
    return this.request(`/api/artifacts/${artifactId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comments }),
    });
  }

  async requestRevision(
    artifactId: string,
    changes: string
  ): Promise<unknown> {
    return this.request(`/api/artifacts/${artifactId}/request-revision`, {
      method: 'POST',
      body: JSON.stringify({ requestedChanges: changes }),
    });
  }

  async attachImageToArtifact(
    artifactId: string,
    imageUrl: string,
    contentType?: string,
  ): Promise<{ id: string; contentUrl: string }> {
    return this.request(`/api/artifacts/${artifactId}/attach-image`, {
      method: 'PATCH',
      body: JSON.stringify({ imageUrl, contentType }),
    });
  }

  /** PATCH Remotion MP4 onto an existing production bundle artifact (no duplicate card). */
  async attachVideoToArtifact(
    artifactId: string,
    videoUrl: string,
    posterUrl?: string,
    extras?: {
      compositionId?: string;
      grafikerScore?: number;
      grafikerPass?: boolean;
      renderMs?: number;
    },
  ): Promise<{ id: string; contentUrl: string; bundleStatus?: string }> {
    return this.request(`/api/artifacts/${artifactId}/attach-video`, {
      method: 'PATCH',
      body: JSON.stringify({
        videoUrl,
        posterUrl: posterUrl ?? undefined,
        compositionId: extras?.compositionId,
        grafikerScore: extras?.grafikerScore,
        grafikerPass: extras?.grafikerPass,
        renderMs: extras?.renderMs,
      }),
    });
  }

  // ── Meta Ads ───────────────────────────────────────────────────────────
  async getMetaAdAccounts(workspaceId: string): Promise<import('@/types/meta-ads.types').MetaAdAccount[]> {
    const res = await fetch(`/api/meta/ad-accounts?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) return [];
    return res.json();
  }

  async boostPost(params: import('@/types/meta-ads.types').BoostPostParams): Promise<import('@/types/meta-ads.types').BoostPostResult> {
    const { workspaceId, ...rest } = params;
    const res = await fetch('/api/meta/boost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        artifact_id: rest.artifactId,
        ig_media_id: rest.igMediaId ?? '',
        caption: rest.caption,
        objective: rest.objective,
        budget_tl: rest.budgetTl,
        duration_days: rest.durationDays,
        ad_account_id: rest.adAccountId ?? '',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || data?.error || 'Boost başarısız');
    return {
      campaignId: data.campaign_id,
      status: data.status,
      estimatedReach: data.estimated_reach ?? 0,
      message: data.message,
    };
  }

  // ── Mertcafe Ads ───────────────────────────────────────────────────────
  async getMertcafeStatus(workspaceId: string): Promise<import('@/types/mertcafe-ads.types').MertcafeStatus> {
    const res = await fetch(`/api/mertcafe/status?workspaceId=${encodeURIComponent(workspaceId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Mertcafe status failed (${res.status})`);
    return data as import('@/types/mertcafe-ads.types').MertcafeStatus;
  }

  async getMertcafeInstagramConnectUrl(
    workspaceId: string,
  ): Promise<import('@/types/mertcafe-ads.types').MertcafeInstagramConnect> {
    const res = await fetch(`/api/mertcafe/connect-instagram?workspaceId=${encodeURIComponent(workspaceId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Instagram connect failed (${res.status})`);
    return data as import('@/types/mertcafe-ads.types').MertcafeInstagramConnect;
  }

  async syncMertcafeInstagram(workspaceId: string): Promise<{
    ok: boolean;
    instagram_connected?: boolean;
    oauth_account_id?: string | null;
    instagram_username?: string | null;
    message?: string;
    error?: string;
  }> {
    const res = await fetch('/api/mertcafe/sync-instagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || data?.message || `Sync failed (${res.status})`);
    return data;
  }

  async provisionMertcafeTenant(
    workspaceId: string,
    options?: { force?: boolean },
  ): Promise<import('@/types/mertcafe-ads.types').MertcafeProvisionResult> {
    const res = await fetch('/api/mertcafe/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, force: options?.force === true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Mertcafe provision failed (${res.status})`);
    return data as import('@/types/mertcafe-ads.types').MertcafeProvisionResult;
  }

  async setMertcafeActiveAccount(
    params: import('@/types/mertcafe-ads.types').MertcafeSetActiveAccountParams,
  ): Promise<{ ok: boolean; instagram_account_id: string; theme?: Record<string, unknown> | null }> {
    const res = await fetch('/api/mertcafe/set-active-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: params.workspaceId,
        accountId: params.accountId,
        label: params.label,
        remember: params.remember,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Account switch failed (${res.status})`);
    return data as { ok: boolean; instagram_account_id: string; theme?: Record<string, unknown> | null };
  }

  async syncMertcafeBusinessSetup(
    params: import('@/types/mertcafe-ads.types').MertcafeBusinessSetupParams,
  ): Promise<unknown> {
    const res = await fetch('/api/mertcafe/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: params.workspaceId,
        business_name: params.businessName,
        menu: params.menu,
        hours: params.hours,
        address: params.address,
        phone: params.phone,
        price_range: params.priceRange,
        notes: params.notes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Mertcafe setup failed (${res.status})`);
    return data;
  }

  async connectMertcafeMetaAds(params: import('@/types/mertcafe-ads.types').MertcafeConnectMetaAdsParams): Promise<unknown> {
    const res = await fetch('/api/mertcafe/connect-meta-ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ads_account_id: params.adsAccountId,
        workspaceId: params.workspaceId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Meta Ads connect failed (${res.status})`);
    return data;
  }

  async boostMertcafePost(
    params: import('@/types/mertcafe-ads.types').MertcafeBoostParams & { workspaceId?: string },
  ): Promise<unknown> {
    const res = await fetch('/api/mertcafe/boost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: params.postId,
        goal: params.goal,
        budget: params.budget,
        duration_days: params.durationDays,
        workspaceId: params.workspaceId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Boost failed (${res.status})`);
    return data;
  }

  async createMertcafeAd(
    params: import('@/types/mertcafe-ads.types').MertcafeAdCreateParams & { workspaceId?: string },
  ): Promise<unknown> {
    const res = await fetch('/api/mertcafe/ad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: params.workspaceId,
        image_url: params.imageUrl,
        headline: params.headline,
        body: params.body,
        link_url: params.linkUrl,
        goal: params.goal,
        budget: params.budget,
        budget_type: params.budgetType,
        duration_days: params.durationDays,
        placement: params.placement,
        countries: params.countries,
        gender: params.gender,
        age_min: params.ageMin,
        age_max: params.ageMax,
        interests: params.interests,
        call_to_action: params.callToAction,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Ad create failed (${res.status})`);
    return data;
  }

  async checkMertcafeMedia(url: string, kind: 'image' | 'video' = 'image'): Promise<{ reachable: boolean; error?: string; url?: string }> {
    const res = await fetch('/api/mertcafe/media-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, kind }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      reachable: Boolean(data?.reachable),
      error: typeof data?.error === 'string' ? data.error : undefined,
      url: typeof data?.url === 'string' ? data.url : undefined,
    };
  }

  async getMetaCampaigns(workspaceId: string): Promise<import('@/types/meta-ads.types').MetaCampaign[]> {
    const res = await fetch(`/api/meta/campaigns?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) return [];
    const data: Record<string, unknown>[] = await res.json();
    return data.map(d => ({
      id:             String(d.id ?? ''),
      artifactId:     String(d.artifact_id ?? ''),
      campaignId:     String(d.campaign_id ?? ''),
      adsetId:        String(d.adset_id ?? ''),
      adId:           String(d.ad_id ?? ''),
      objective:      String(d.objective ?? ''),
      budgetTl:       Number(d.budget_tl ?? 0),
      durationDays:   Number(d.duration_days ?? 0),
      status:         String(d.status ?? 'PAUSED'),
      estimatedReach: Number(d.estimated_reach ?? 0),
      actualReach:    Number(d.actual_reach ?? 0),
      spendTl:        Number(d.spend_tl ?? 0),
      impressions:    Number(d.impressions ?? 0),
      clicks:         Number(d.clicks ?? 0),
      createdAt:      String(d.created_at ?? ''),
    }));
  }

  async getScheduledPosts(workspaceId: string): Promise<Array<{
    id: string;
    platform: string;
    publish_type: string;
    scheduled_at: string;
    image_url?: string | null;
    video_url?: string | null;
    caption?: string;
    status?: string;
    artifact_title?: string | null;
  }>> {
    const res = await fetch(`/api/meta/schedule?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return Array.isArray(data) ? data : [];
  }

  async cancelScheduledPost(workspaceId: string, scheduledPostId: string): Promise<void> {
    const res = await fetch('/api/meta/scheduled-posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, postId: scheduledPostId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as any)?.detail || 'İptal başarısız');
    }
  }

  async schedulePost(params: {
    workspaceId: string;
    platform?: 'instagram' | 'facebook';
    publishType: 'feed' | 'reel' | 'story';
    scheduledAt: string; // ISO
    imageUrl?: string;
    videoUrl?: string;
    caption?: string;
    hashtags?: string[];
    artifactTitle?: string;
  }): Promise<{ scheduled_post_id?: string; status?: string }> {
    const { workspaceId, ...rest } = params;
    const res = await fetch('/api/meta/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        platform: rest.platform ?? 'instagram',
        publish_type: rest.publishType,
        scheduled_at: rest.scheduledAt,
        image_url: rest.imageUrl ?? null,
        video_url: rest.videoUrl ?? null,
        caption: rest.caption ?? '',
        hashtags: rest.hashtags ?? [],
        artifact_title: rest.artifactTitle ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.detail || 'Zamanlama başarısız');
    return data;
  }

  async activateCampaign(workspaceId: string, campaignId: string): Promise<void> {
    const res = await fetch(
      `/api/meta/campaigns/${encodeURIComponent(campaignId)}/activate?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: 'POST' },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail || 'Aktivasyon başarısız');
    }
  }

  // Notifications
  async getNotifications(): Promise<Notification[]> {
    const notifications = await this.request<any[]>('/api/notifications');
    return notifications.map((notification) => ({
      id: notification.id,
      tenantId: notification.tenantId ?? '',
      userId: notification.userId ?? '',
      type: notification.type?.toString?.().toLowerCase?.() ?? 'task_started',
      title: notification.title,
      message: notification.message,
      relatedEntityId: notification.relatedEntityId,
      relatedEntityType: notification.relatedEntityType,
      read: notification.read ?? notification.isRead ?? false,
      createdAt: notification.createdAt,
    }));
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    await this.request(`/api/notifications/${notificationId}/mark-read`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsRead(): Promise<void> {
    const notifications = await this.getNotifications();
    await Promise.all(
      notifications
        .filter((notification) => !notification.read)
        .map((notification) => this.markNotificationRead(notification.id))
    );
  }

  // ── Setup ──
  async getCompanyProfile(): Promise<CompanyProfile> {
    return this.request('/api/setup/profile');
  }

  async saveCompanyProfile(data: SaveCompanyProfileRequest): Promise<CompanyProfile> {
    const payload = {
      ...data,
      defaultApprovalMode: normalizeApprovalModeForApi(data.defaultApprovalMode),
    };
    return this.request('/api/setup/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async completeSetup(): Promise<CompanyProfile> {
    return this.request('/api/setup/complete', { method: 'POST' });
  }

  async analyzeBrand(): Promise<{
    analysisText?: string;
    inferredTone?: string;
    inferredLanguage?: string;
    topHashtags?: string;
    instagramFollowers?: number;
    analyzedAt?: string;
  }> {
    return this.request('/api/setup/analyze-brand', { method: 'POST' });
  }

  async discoverBrand(data: BrandDiscoveryRequest): Promise<BrandDiscoveryResult> {
    return this.request('/api/setup/brand-discovery', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Calls the Python crew backend's brand analysis endpoint via a Next.js BFF route.
   * Fetches website/Instagram/Google, infers brand fields, and persists to Python BrandContext.
   * Returns per-source status so the UI can show exactly what worked.
   * Does NOT fail silently — errors are returned as structured objects.
   */
  async analyzeBrandContext(
    workspaceId: string,
    data: {
      websiteUrl?: string;
      instagramHandle?: string;
      googleBusinessUrl?: string;
      brandName?: string;
    },
  ): Promise<PythonBrandAnalyzeResponse> {
    const res = await fetch(`/api/brand-context/${workspaceId}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getTenantBffHeaders(workspaceId),
      },
      body: JSON.stringify({
        website_url: data.websiteUrl || '',
        instagram_handle: data.instagramHandle || '',
        google_business_url: data.googleBusinessUrl || '',
        brand_name: data.brandName || '',
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.message || json?.error || `Brand analysis failed (${res.status})`);
    }
    return json as PythonBrandAnalyzeResponse;
  }

  /**
   * Marks the Python BrandContext as operator-confirmed (sets brand_constitution_confirmed_at).
   * After this, agents receive brand_constitution_confirmed=true in their prompts.
   */
  async confirmBrandConstitution(workspaceId: string): Promise<{ brand_constitution_confirmed_at: string }> {
    const res = await fetch(`/api/brand-context/${workspaceId}/confirm-constitution`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getTenantBffHeaders(workspaceId),
      },
      body: '{}',
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        err?.message || err?.error || err?.detail || `Confirmation failed (${res.status})`,
      );
    }
    return res.json();
  }

  /**
   * Get CEO Intelligence Agent recommendations for the workspace.
   * Cached for 1 hour on the Python side — fast for dashboard display.
   */
  async getRecommendations(workspaceId: string): Promise<TaskRecommendationsResponse> {
    const res = await fetch(`/api/intelligence/${workspaceId}/recommendations`, {
      headers: getTenantBffHeaders(workspaceId),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Recommendations failed (${res.status})`);
    }
    return res.json() as Promise<TaskRecommendationsResponse>;
  }

  async refreshRecommendations(workspaceId: string): Promise<TaskRecommendationsResponse> {
    const res = await fetch(`/api/intelligence/${workspaceId}/recommendations`, {
      method: 'POST',
      headers: getTenantBffHeaders(workspaceId),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Refresh failed (${res.status})`);
    }
    return res.json() as Promise<TaskRecommendationsResponse>;
  }

  async getIndustryPlaybooks(): Promise<IndustryPlaybookDto[]> {
    return this.request('/api/setup/industry-playbooks');
  }

  async getTenantCapabilities(industry?: string): Promise<TenantCapabilityDefinitionDto[]> {
    const qs = industry ? `?industry=${encodeURIComponent(industry)}` : '';
    return this.request(`/api/setup/tenant-capabilities${qs}`);
  }

  async getOperatingProfile(): Promise<TenantOperatingProfileDto> {
    return this.request('/api/setup/operating-profile');
  }

  async evaluateCapability(capabilityId: string): Promise<{ decision: string; capabilityId: string; reasons: string[] }> {
    return this.request('/api/setup/evaluate-capability', {
      method: 'POST',
      body: JSON.stringify({ capabilityId }),
    });
  }

  async evaluateGalleryAsset(assetType: string): Promise<{
    decision: string;
    assetType: string;
    reasons: string[];
    forceUnapproved: boolean;
  }> {
    return this.request('/api/setup/evaluate-gallery-asset', {
      method: 'POST',
      body: JSON.stringify({ assetType }),
    });
  }

  async getBrandStyleScore(): Promise<{ tenantId: string; score: number; label: string }> {
    return this.request('/api/setup/brand-style-score');
  }

  async reindexBrandMemory(): Promise<unknown> {
    return this.request('/api/setup/vector-memory/reindex', { method: 'POST' });
  }

  async getOnboardingStatus(): Promise<OnboardingStatus> {
    return this.request('/api/setup/onboarding-status');
  }

  // ── Brand Context: assets, office overrides, Canva template assignments ──
  async getTenantMediaAssets(params?: { officeId?: string; assetType?: string }): Promise<TenantMediaAsset[]> {
    const search = new URLSearchParams();
    if (params?.officeId) search.set('officeId', params.officeId);
    if (params?.assetType) search.set('assetType', params.assetType);
    const qs = search.toString();
    return this.request(`/api/brand-context/assets${qs ? `?${qs}` : ''}`);
  }

  async createTenantMediaAsset(data: UpsertTenantMediaAssetRequest): Promise<TenantMediaAsset> {
    return this.request('/api/brand-context/assets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTenantMediaAsset(id: string, data: UpsertTenantMediaAssetRequest): Promise<TenantMediaAsset> {
    return this.request(`/api/brand-context/assets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getOfficeBrandProfiles(): Promise<OfficeBrandProfile[]> {
    return this.request('/api/brand-context/office-profiles');
  }

  async upsertOfficeBrandProfile(data: UpsertOfficeBrandProfileRequest): Promise<OfficeBrandProfile> {
    return this.request('/api/brand-context/office-profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCanvaTemplateAssignments(params?: { officeId?: string; includeDisabled?: boolean }): Promise<CanvaTemplateAssignment[]> {
    const search = new URLSearchParams();
    if (params?.officeId) search.set('officeId', params.officeId);
    if (params?.includeDisabled) search.set('includeDisabled', 'true');
    const qs = search.toString();
    return this.request(`/api/brand-context/canva-templates${qs ? `?${qs}` : ''}`);
  }

  async upsertCanvaTemplateAssignment(data: UpsertCanvaTemplateAssignmentRequest): Promise<CanvaTemplateAssignment> {
    return this.request('/api/brand-context/canva-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ── Packages (legacy — desktop SetupWizard/BillingPage only; mobile uses token_wallet) ──
  /** @deprecated Mobile billing uses token_wallet. Only used by desktop BillingPage / SetupWizard. */
  async getPackages(): Promise<PackageDefinition[]> {
    return this.request('/api/packages');
  }

  /** @deprecated Mobile billing uses token_wallet. */
  async getSubscription(): Promise<TenantSubscription | null> {
    try {
      return await this.request('/api/packages/subscription');
    } catch {
      return null;
    }
  }

  /** @deprecated Mobile billing uses token_wallet. */
  async getUsageQuota(): Promise<UsageQuotaSummary> {
    return this.request('/api/packages/usage');
  }

  /** @deprecated Mobile billing uses token_wallet. Only used by desktop PackageSelector. */
  async selectPackage(packageId: string): Promise<TenantSubscription> {
    return this.request('/api/packages/subscribe', {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    });
  }

  // ── Integrations ──
  async getIntegrations(): Promise<IntegrationConnection[]> {
    try {
      return await this.request('/api/integrations');
    } catch {
      return [];
    }
  }

  async createIntegration(data: CreateIntegrationRequest): Promise<IntegrationConnection> {
    // .NET enum serialized as integer — map string provider to numeric value
    const PROVIDER_MAP: Record<string, number> = {
      GoogleBusiness: 0, Instagram: 1, GoogleAds: 2, Facebook: 3,
      SearchConsole: 4, GoogleAnalytics: 5, WhatsAppBusiness: 6, Canva: 7,
    };
    const payload = {
      ...data,
      provider: PROVIDER_MAP[data.provider as string] ?? data.provider,
    };
    return this.request('/api/integrations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateIntegration(
    connectionId: string,
    data: { displayName?: string; accessToken?: string; refreshToken?: string }
  ): Promise<IntegrationConnection> {
    return this.request(`/api/integrations/${connectionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteIntegration(connectionId: string): Promise<void> {
    await this.request(`/api/integrations/${connectionId}`, { method: 'DELETE' });
  }

  async getGoogleAuthUrl(scopes: string = 'ads,analytics,search_console'): Promise<{ authUrl: string; requestedScopes: string }> {
    return this.request(`/api/integrations/google/auth-url?scopes=${scopes}`);
  }

  async getAdsCampaigns(dateRange: string = 'LAST_30_DAYS'): Promise<any> {
    return this.request(`/api/integrations/ads/campaigns?dateRange=${dateRange}`);
  }

  async getAnalyticsSummary(dateRange: string = 'LAST_30_DAYS'): Promise<any> {
    return this.request(`/api/integrations/analytics/summary?dateRange=${dateRange}`);
  }

  async getAnalyticsDashboard(dateRange: string = '30daysAgo'): Promise<any> {
    try {
      const summary = await this.getAnalyticsSummary(dateRange);
      return {
        traffic: {
          total_users: summary.total_users ?? summary.totalUsers ?? summary.users ?? 0,
          new_users: summary.new_users ?? summary.newUsers ?? 0,
          sessions: summary.sessions ?? 0,
          pageviews: summary.pageviews ?? summary.screenPageViews ?? summary.views ?? 0,
          avg_session_duration: summary.avg_session_duration ?? summary.averageSessionDuration ?? 0,
          bounce_rate: summary.bounce_rate ?? summary.bounceRate ?? 0,
          pages_per_session: summary.pages_per_session ?? summary.pagesPerSession ?? 0,
        },
        sources: summary.sources ?? summary.trafficSources ?? [],
        pages: summary.pages ?? summary.topPages ?? [],
        conversions: summary.conversions ?? [],
        realtime: summary.realtime ?? { active_users: 0, top_pages: [], top_sources: [] },
        daily: summary.daily ?? summary.dailyMetrics ?? [],
        search_queries: summary.search_queries ?? summary.searchQueries ?? [],
        devices: summary.devices ?? [],
        countries: summary.countries ?? [],
        ...summary,
        dateRange: summary.dateRange ?? dateRange,
        source: summary.source ?? 'summary-adapter',
      };
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return {
          traffic: {
            total_users: 0,
            new_users: 0,
            sessions: 0,
            pageviews: 0,
            avg_session_duration: 0,
            bounce_rate: 0,
            pages_per_session: 0,
          },
          sources: [],
          pages: [],
          conversions: [],
          realtime: { active_users: 0, top_pages: [], top_sources: [] },
          daily: [],
          search_queries: [],
          devices: [],
          countries: [],
          dateRange,
          source: 'dashboard-fallback',
        };
      }
      throw error;
    }
  }

  async getProviderMappings(): Promise<ProviderAccountMapping[]> {
    try {
      return await this.request('/api/integrations/mappings');
    } catch {
      return [];
    }
  }

  async setProviderMapping(agentType: string | number, integrationConnectionId: string): Promise<ProviderAccountMapping> {
    return this.request('/api/integrations/mappings', {
      method: 'POST',
      body: JSON.stringify({ agentType, integrationConnectionId }),
    });
  }

  // ── Suggested Actions ──────────────────────────────────────────────────
  async getActions(status?: string): Promise<SuggestedActionDto[]> {
    const qs = status ? `?status=${status}` : '';
    try {
      return await this.request(`/api/actions${qs}`);
    } catch {
      return [];
    }
  }

  async getAction(id: string): Promise<SuggestedActionDto> {
    return this.request(`/api/actions/${id}`);
  }

  async approveAction(id: string): Promise<{ id: string; status: string }> {
    return this.request(`/api/actions/${id}/approve`, { method: 'POST' });
  }

  async rejectAction(id: string, reason?: string): Promise<{ id: string; status: string }> {
    return this.request(`/api/actions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? '' }),
    });
  }

  async executeAction(id: string, mode: 'dry-run' | 'live' = 'dry-run'): Promise<ActionExecutionResult> {
    return this.request(`/api/actions/${id}/execute?mode=${encodeURIComponent(mode)}`, { method: 'POST' });
  }

  async getCurrentUserSecurity(): Promise<CurrentUserSecurity> {
    return this.request('/api/security/me', { timeoutMs: 20_000 });
  }

  async login(data: { email: string; password: string }): Promise<AuthSession> {
    return this.request('/api/security/login', {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: 20_000,
    });
  }

  async register(data: { email: string; password: string; displayName?: string; tenantName?: string }): Promise<AuthSession> {
    return this.request('/api/security/register', {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: 20_000,
    });
  }

  async logout(): Promise<{ status: string }> {
    try {
      return await this.request('/api/security/logout', { method: 'POST', timeoutMs: 20_000 });
    } finally {
      setSessionToken(null);
    }
  }

  async getUsers(): Promise<UserAdmin[]> {
    return this.request('/api/security/users');
  }

  async inviteUser(data: { email: string; displayName?: string; role: string }): Promise<UserAdmin> {
    return this.request('/api/security/invites', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUserRole(id: string, role: string): Promise<UserAdmin> {
    return this.request(`/api/security/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  async updateUserActive(id: string, isActive: boolean): Promise<UserAdmin> {
    return this.request(`/api/security/users/${id}/active`, {
      method: 'PUT',
      body: JSON.stringify({ isActive }),
    });
  }

  async getOperationsSummary(): Promise<OperationsSummary> {
    return this.request('/api/operations/summary');
  }

  async getPlatformAdminOverview(): Promise<PlatformAdminOverview> {
    const res = await fetch('/api/admin/platform/overview', {
      headers: {
        ...getRequestContextHeaders(),
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`Platform overview failed (${res.status})`);
    }
    return res.json();
  }

  async getPlatformBrandSnapshot(workspaceId: string): Promise<BrandProfileSnapshot> {
    const res = await fetch(`/api/brand-profile/${encodeURIComponent(workspaceId)}/snapshot`, {
      headers: getTenantBffHeaders(workspaceId),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`Brand snapshot failed (${res.status})`);
    }
    return res.json();
  }

  async getProductionBrandContextSnapshot(workspaceId: string): Promise<ProductionBrandContextSnapshot> {
    const res = await fetch(`/api/production-context/${encodeURIComponent(workspaceId)}/snapshot`, {
      headers: getTenantBffHeaders(workspaceId),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`Production context snapshot failed (${res.status})`);
    }
    return res.json();
  }

  /** Agent stats derived from Python mission task nodes (for agents run via the mission pipeline). */
  async getMissionAgentStats(workspaceId: string): Promise<{
    workspace_id: string;
    agent_stats: Array<{
      agent_role: string;
      total: number;
      completed: number;
      failed: number;
      last_run_at: string | null;
      task_types: string[];
    }>;
  }> {
    return this.request(`/api/missions-proxy/${workspaceId}/agent-stats`);
  }

  /** Takılı (InProgress) ajan çalıştırmalarını toplu iptal — API/Crew kesintisi sonrası zombi kayıtlar. */
  async reconcileStaleAgentRuns(minAgeMinutes = 10): Promise<{
    count: number;
    results: Array<{ agentRunId: string; cancelled?: boolean; message?: string; error?: string }>;
  }> {
    return this.request(
      `/api/operations/reconcile-stale-agent-runs?minAgeMinutes=${encodeURIComponent(String(minAgeMinutes))}`,
      { method: 'POST' }
    );
  }

  private mapArtifact(artifact: any): OutputArtifact {
    const reviewStatusToken = String(artifact.reviewStatus ?? '0');
    const artifactTypeToken = String(artifact.artifactType ?? '10');
    const status: OutputArtifact['status'] =
      reviewStatusToken === '1' || reviewStatusToken.toLowerCase?.() === 'approved'
        ? 'approved'
        : reviewStatusToken === '2' ||
            reviewStatusToken === '3' ||
            reviewStatusToken.toLowerCase?.() === 'rejected' ||
            reviewStatusToken.toLowerCase?.() === 'revisionrequested' ||
            reviewStatusToken.toLowerCase?.() === 'revision_requested'
          ? 'rejected'
          : 'pending_review';
    const metadata = parseArtifactMetadata(artifact.metadata ?? artifact.Metadata);
    const lifecycleStatus = inferArtifactLifecycleStatus(status, metadata, artifact.contentUrl ?? artifact.ContentUrl);
    const type: OutputArtifact['type'] =
      artifactTypeToken === '1' || artifactTypeToken.toLowerCase?.() === 'socialmediagraphic'
        ? 'image'
        : artifactTypeToken === '3' || artifactTypeToken.toLowerCase?.() === 'seoreport'
          ? 'data'
          : artifactTypeToken === '5' ||
              artifactTypeToken === '7' ||
              artifactTypeToken === '10' ||
              artifactTypeToken.toLowerCase?.() === 'videoedit' ||
              artifactTypeToken.toLowerCase?.() === 'strategydocument' ||
              artifactTypeToken.toLowerCase?.() === 'genericdocument'
            ? 'document'
            : artifactTypeToken === '6' || artifactTypeToken.toLowerCase?.() === 'uimockup'
              ? 'image'
              : artifactTypeToken === '9' || artifactTypeToken.toLowerCase?.() === 'chatbotflow'
                ? 'code'
                : 'text';
    const contentUrl = artifact.contentUrl ?? artifact.ContentUrl ?? '';
    let content = artifact.content;
    if (contentUrl && typeof content === 'string') {
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          // Propagate imageUrl from contentUrl when it's an image artifact
          parsed.renderedPreview = {
            ...(parsed.renderedPreview ?? {}),
            imageUrl: parsed.renderedPreview?.imageUrl
              ?? parsed.imageUrl                // MissionContentFactory stores imageUrl directly
              ?? (type === 'image' ? contentUrl : undefined),
            videoUrl: parsed.renderedPreview?.videoUrl
              ?? (type === 'document' && artifactTypeToken.toLowerCase?.() === 'videoedit' ? contentUrl : undefined),
          };
          // Also ensure the top-level imageUrl is set for signalFromArtifact
          if (!parsed.imageUrl && type === 'image') {
            parsed.imageUrl = contentUrl;
          }
          content = JSON.stringify(parsed);
        }
      } catch {
        content = JSON.stringify({
          renderedPreview: {
            kind: type === 'image' ? 'social' : 'video',
            title: artifact.title,
            summary: content,
            imageUrl: type === 'image' ? contentUrl : null,
            videoUrl: type !== 'image' ? contentUrl : null,
          },
        });
      }
    }

    return {
      id: artifact.id,
      taskId: artifact.taskId,
      agentRunId: artifact.agentRunId ?? '',
      type,
      title: artifact.title,
      content,
      contentUrl,
      mimeType: 'text/plain',
      status,
      lifecycleStatus,
      metadata,
      createdAt: artifact.createdAt,
      artifactType:
        artifact.artifactType != null ? String(artifact.artifactType) : undefined,
    };
  }

  // ── Mission API (Python crew backend via Next.js BFF) ──────────────────────

  async listMissions(
    workspaceId: string,
    status?: string,
    limit = 20,
  ): Promise<MissionSummary[]> {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (limit !== 20) qs.set('limit', String(limit));
    const query = qs.toString() ? `?${qs}` : '';
    const res = await fetch(`/api/missions/${workspaceId}${query}`, {
      headers: getTenantBffHeaders(workspaceId),
    });
    if (!res.ok) throw new Error(`Missions list failed (${res.status})`);
    return res.json();
  }

  /** Hub list: single fetch — proposed/active/completed all share one ordered list. */
  async listMissionsForHub(workspaceId: string): Promise<MissionSummary[]> {
    return this.listMissions(workspaceId, undefined, 35);
  }

  async proposeMissions(
    workspaceId: string,
    contextSignals?: string,
    opts?: { productionPackage?: string },
  ): Promise<ProposeMissionsResponse> {
    const body: Record<string, string> = {};
    if (contextSignals) body.context_signals = contextSignals;
    if (opts?.productionPackage) body.production_package = opts.productionPackage;
    const res = await fetch(`/api/missions/${workspaceId}/propose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getTenantBffHeaders(workspaceId),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.detail ?? err?.error ?? `Propose failed (${res.status})`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return res.json();
  }

  async getMissionProgress(workspaceId: string, missionId: string): Promise<MissionProgress> {
    const res = await fetchWithTransientRetry(
      `/api/missions/${workspaceId}/${missionId}/progress`,
      {
        headers: getTenantBffHeaders(workspaceId),
      },
    );
    if (!res.ok) throw new Error(humanizeMobileServiceError(`Mission progress failed (${res.status})`, res.status));
    return res.json();
  }

  async approveMission(workspaceId: string, missionId: string, approvedBy: string): Promise<unknown> {
    const res = await fetch(`/api/missions/${workspaceId}/${missionId}/approve`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getTenantBffHeaders(workspaceId),
      },
      body: JSON.stringify({ approved_by: approvedBy }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || err?.detail || `Approve failed (${res.status})`);
    }
    return res.json();
  }

  async rejectMission(workspaceId: string, missionId: string, reason?: string): Promise<unknown> {
    const res = await fetch(`/api/missions/${workspaceId}/${missionId}/reject`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getTenantBffHeaders(workspaceId),
      },
      body: JSON.stringify({ reason: reason ?? null }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Reject failed (${res.status})`);
    }
    return res.json();
  }

  async cancelMission(workspaceId: string, missionId: string): Promise<unknown> {
    const res = await fetch(`/api/missions/${workspaceId}/${missionId}/cancel`, {
      method: 'PUT',
      headers: getTenantBffHeaders(workspaceId),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Cancel failed (${res.status})`);
    }
    return res.json();
  }

  async restartMission(workspaceId: string, missionId: string): Promise<unknown> {
    const res = await fetch(`/api/missions/${workspaceId}/${missionId}/restart`, {
      method: 'PUT',
      headers: getTenantBffHeaders(workspaceId),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.detail || err?.error || `Restart failed (${res.status})`);
    }
    return res.json();
  }

  /** Non-blocking — starts Python ensure + Next auto-produce in background. */
  async kickMissionFeedProduction(
    workspaceId: string,
    missionId: string,
    opts?: { productionPackage?: string },
  ): Promise<{ accepted?: boolean; message?: string }> {
    const res = await fetchWithTransientRetry(
      `/api/missions/${workspaceId}/${missionId}/kick-feed-production`,
      {
        method: 'PUT',
        headers: {
          ...getTenantBffHeaders(workspaceId),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productionPackage: opts?.productionPackage,
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    const body = await res.json().catch(() => ({})) as {
      error?: string;
      detail?: string;
      message?: string;
      accepted?: boolean;
    };
    if (!res.ok) {
      throw new Error(
        humanizeMobileServiceError(
          body.error || body.detail || body.message || `Feed başlatılamadı (${res.status})`,
          res.status,
        ),
      );
    }
    return body;
  }

  async reproduceMissionFeed(
    workspaceId: string,
    missionId: string,
    opts?: { productionPackage?: string },
  ): Promise<{ message?: string; produced?: number; publishReady?: number; total?: number }> {
    const res = await fetch(`/api/missions/${workspaceId}/${missionId}/reproduce-feed`, {
      method: 'PUT',
      headers: {
        ...getTenantBffHeaders(workspaceId),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productionPackage: opts?.productionPackage,
      }),
      signal: AbortSignal.timeout(600_000),
    });
    const body = await res.json().catch(() => ({})) as {
      error?: string;
      detail?: string;
      message?: string;
      produced?: number;
      code?: string;
    };
    if (!res.ok) {
      throw new Error(
        body.error || body.detail || body.message || `Feed üretimi başarısız (${res.status})`,
      );
    }
    if ((body.produced ?? 0) <= 0) {
      throw new Error(body.error || body.message || 'Feed\'e kaydedilen içerik yok');
    }
    return body;
  }

  async getWorkspaceUsageCost(
    workspaceId: string,
    days = 7,
    packageSlug?: string | null,
  ): Promise<WorkspaceUsageSummary> {
    const qs = new URLSearchParams({ days: String(days) });
    if (packageSlug) qs.set('package_slug', packageSlug);
    const res = await fetch(`/api/usage-cost/${workspaceId}?${qs.toString()}`, {
      headers: getTenantBffHeaders(workspaceId),
    });
    if (res.status === 503) {
      return emptyWorkspaceUsageSummary(workspaceId, days, true);
    }
    if (!res.ok) throw new Error(`Usage cost failed (${res.status})`);
    return res.json();
  }

  // ── Brand Rules API ────────────────────────────────────────────────────────

  async listBrandRules(workspaceId: string, status?: string): Promise<BrandRuleItem[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`/api/brand-rules/${workspaceId}${qs}`, {
      headers: getTenantBffHeaders(workspaceId),
    });
    if (!res.ok) throw new Error(`Brand rules list failed (${res.status})`);
    return res.json();
  }

  async getPendingBrandRules(workspaceId: string): Promise<BrandRuleItem[]> {
    const res = await fetch(`/api/brand-rules/${workspaceId}/pending`, {
      headers: getTenantBffHeaders(workspaceId),
    });
    if (!res.ok) throw new Error(`Pending rules failed (${res.status})`);
    return res.json();
  }

  async scanBrandRules(workspaceId: string): Promise<BrandRulesScanResponse> {
    const res = await fetch(`/api/brand-rules/${workspaceId}/scan`, {
      method: 'POST',
      headers: getTenantBffHeaders(workspaceId),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Scan failed (${res.status})`);
    }
    return res.json();
  }

  async approveBrandRule(workspaceId: string, ruleId: string, approvedBy = 'operator'): Promise<unknown> {
    const res = await fetch(`/api/brand-rules/${workspaceId}/${ruleId}/approve`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getTenantBffHeaders(workspaceId),
      },
      body: JSON.stringify({ approved_by: approvedBy }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Approve rule failed (${res.status})`);
    }
    return res.json();
  }

  async rejectBrandRule(workspaceId: string, ruleId: string): Promise<unknown> {
    const res = await fetch(`/api/brand-rules/${workspaceId}/${ruleId}/reject`, {
      method: 'PUT',
      headers: getTenantBffHeaders(workspaceId),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Reject rule failed (${res.status})`);
    }
    return res.json();
  }
}

export interface TokenWalletSummary {
  enabled: boolean;
  token_name: string;
  markup_multiplier: number;
  profit_margin_percent: number;
  target_margin_percent: number;
  effective_margin_percent: number;
  cost_profit_ratio?: number | null;
  period_cost_profit_ratio?: number | null;
  token_usd_value: number;
  try_per_token: number;
  monthly_grant_tokens: number;
  spent_month_tokens: number;
  remaining_tokens: number;
  spent_today_tokens: number;
  period_spent_tokens: number;
  month_cost_usd: number;
  month_billed_usd: number;
  month_billed_try: number;
  period_cost_usd: number;
  period_billed_usd: number;
  period_billed_try: number;
  usage_percent: number;
  category_tokens: Record<string, number>;
  category_labels: Record<string, string>;
  period_days: number;
  note_tr: string;
  plan_monthly_outputs?: {
    missions: number;
    social_content: number;
    gallery_analysis: number;
    reels: number;
  } | null;
}

export interface WorkspaceUsageSummary {
  workspace_id: string;
  daily_budget_usd: number;
  spent_today_usd: number;
  remaining_today_usd: number;
  week_cost_usd: number;
  week_artifact_count: number;
  week_mission_count: number;
  week_days: number;
  category_totals: Record<string, number>;
  daily_series: {
    date: string;
    cost_usd: number;
    artifact_count: number;
    mission_count: number;
    breakdown?: Record<string, number>;
  }[];
  currency_note?: string;
  category_labels?: Record<string, string>;
  month_cost_usd?: number;
  month_tokens?: number;
  month_category_totals?: Record<string, number>;
  unit_cost_hints_usd?: Record<string, number>;
  token_wallet?: TokenWalletSummary;
}

export function emptyWorkspaceUsageSummary(
  workspaceId: string,
  days = 7,
  crewUnavailable = false,
): WorkspaceUsageSummary {
  return {
    workspace_id: workspaceId,
    daily_budget_usd: 5,
    spent_today_usd: 0,
    remaining_today_usd: 5,
    week_cost_usd: 0,
    week_artifact_count: 0,
    week_mission_count: 0,
    week_days: days,
    category_totals: {},
    daily_series: [],
    currency_note: crewUnavailable
      ? 'Maliyet servisi geçici olarak kapalı. Python crew backend çalışıyor mu? (./scripts/start-crew-backend.sh)'
      : undefined,
    ...(crewUnavailable ? { crew_backend_unavailable: true as const } : {}),
  };
}

export const apiClient = new ApiClient();

function parseArtifactMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function inferArtifactLifecycleStatus(
  reviewStatus: OutputArtifact['status'],
  metadata: Record<string, unknown>,
  contentUrl?: string,
): NonNullable<OutputArtifact['lifecycleStatus']> {
  const explicit = metadata.lifecycleStatus;
  if (typeof explicit === 'string') {
    const normalized = explicit.toLowerCase();
    if (['draft', 'review', 'approved', 'generated', 'exported', 'scheduled', 'published', 'failed'].includes(normalized)) {
      return normalized as NonNullable<OutputArtifact['lifecycleStatus']>;
    }
  }

  if (metadata.providerActionId || metadata.publishedAt) return 'published';
  if (metadata.scheduledAt) return 'scheduled';
  if (metadata.canvaExportUrl || metadata.permanentPreviewUrl) return 'exported';
  if (metadata.canvaDesignId || metadata.canvaJobId || contentUrl) return 'generated';
  if (reviewStatus === 'approved') return 'approved';
  if (reviewStatus === 'rejected') return 'failed';
  return 'review';
}
