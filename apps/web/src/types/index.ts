// Enums
export type AgentState = 'idle' | 'working' | 'blocked' | 'completed' | 'error';
export type AgentType = 'writer' | 'researcher' | 'designer' | 'manager' | 'analyst' | 'developer';
export type ZoneType = 'workspace' | 'collaboration' | 'review' | 'storage';
export type BriefStatus = 'draft' | 'decomposed' | 'in_progress' | 'review' | 'completed' | 'archived';
export type TaskStatus = 'pending' | 'in_progress' | 'review' | 'completed' | 'blocked' | 'failed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type ReviewDecisionType = 'approved' | 'rejected' | 'revision_requested';
export type NotificationType = 'task_started' | 'task_completed' | 'review_needed' | 'error' | 'agent_state_changed' | 'brief_decomposed';

// Core Models
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Office {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  zones: OfficeZone[];
  agents: Agent[];
  createdAt: string;
  updatedAt: string;
}

export interface OfficeZone {
  id: string;
  officeId: string;
  name: string;
  type: ZoneType;
  position: Vector3;
  size: Vector3;
  color: string;
  capacity: number;
  occupants: string[];
  createdAt: string;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Agent {
  id: string;
  officeId: string;
  name: string;
  type: AgentType;
  state: AgentState;
  description: string;
  capabilities: AgentCapability[];
  position: Vector3;
  currentTaskId?: string;
  taskQueue: string[];
  lastActivity: string;
  performanceScore: number;
  completedTasks: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCapability {
  id: string;
  agentId: string;
  name: string;
  description: string;
  rating: number;
}

export interface Brief {
  id: string;
  officeId: string;
  title: string;
  description: string;
  status: BriefStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  tasks: TaskItem[];
  attachments: BriefAttachment[];
  decomposedAt?: string;
  completedAt?: string;
}

export interface BriefAttachment {
  id: string;
  briefId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploadedAt: string;
}

export interface TaskItem {
  id: string;
  briefId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgent?: string;
  dependencies: TaskDependency[];
  estimatedDuration: number;
  actualDuration?: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  dependencyType: 'blocks' | 'depends_on';
}

export interface TaskAssignment {
  id: string;
  taskId: string;
  agentId: string;
  assignedAt: string;
  status: TaskStatus;
  completedAt?: string;
}

export interface AgentRun {
  id: string;
  agentId: string;
  taskId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  outputs: OutputArtifact[];
}

export interface OutputArtifact {
  id: string;
  taskId?: string;
  agentRunId: string;
  type: 'text' | 'image' | 'document' | 'code' | 'data';
  title: string;
  content: string;
  /** CDN URL for video (mp4) or image artifacts. Empty if not applicable. */
  contentUrl?: string;
  mimeType: string;
  artifactType?: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'archived';
  lifecycleStatus?: 'draft' | 'review' | 'approved' | 'generated' | 'exported' | 'scheduled' | 'published' | 'failed';
  metadata?: Record<string, unknown>;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewDecision?: ReviewDecision;
}

export interface ReviewDecision {
  id: string;
  artifactId: string;
  decision: ReviewDecisionType;
  comments: string;
  requestedChanges?: string;
  decidedAt: string;
  decidedBy: string;
}

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  read: boolean;
  createdAt: string;
}

// API Request/Response Types
export interface BriefCreateRequest {
  title: string;
  description: string;
  attachments?: File[];
}

export interface BriefDecomposedResponse {
  briefId: string;
  tasks: TaskItem[];
  timeline: string;
}

export interface TaskUpdateRequest {
  status?: TaskStatus;
  assignedAgent?: string;
  priority?: TaskPriority;
}

export interface ArtifactReviewRequest {
  decision: ReviewDecisionType;
  comments: string;
  requestedChanges?: string;
}

export interface AgentExecutionRequest {
  taskType?: string;
  inputData?: Record<string, unknown>;
}

export interface AgentExecutionResponse {
  taskId: string;
  agentRunId: string;
  artifactId?: string;
  artifactType?: string;
  status: string;
  message: string;
}

/** POST /api/agents/{id}/cancel-stuck-execution */
export interface CancelStuckExecutionResult {
  cancelled: boolean;
  message: string;
  taskId?: string | null;
  agentRunId?: string | null;
  officeId: string;
  taskTitle: string;
}

export interface WorkflowStep {
  taskId: string;
  title: string;
  agentType: string;
  status: string;
  dependsOnTaskId?: string | null;
}

export interface WorkflowStartResponse {
  briefId: string;
  workflowType: string;
  title: string;
  steps: WorkflowStep[];
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ── Setup & Packages & Integrations ──

export type ApprovalMode = 'SuggestOnly' | 'SuggestAndWait' | 'AutoExecute';
export type SubscriptionStatus = 'Trial' | 'Active' | 'PastDue' | 'Cancelled' | 'Expired';
export type IntegrationProvider = 'GoogleBusiness' | 'Instagram' | 'GoogleAds' | 'Facebook' | 'SearchConsole' | 'GoogleAnalytics' | 'WhatsAppBusiness' | 'Canva';
export type IntegrationStatus = 'Connected' | 'Expired' | 'Error' | 'Disconnected';

export interface CompanyProfile {
  id: string;
  brandName: string;
  industry: string;
  location: string;
  brandTone: string;
  targetAudience: string;
  visualStyle: string;
  campaignGoals: string;
  competitors: string;
  customRules: string;
  languages: string;
  logoUrl: string;
  websiteUrl: string;
  description: string;
  primaryFont: string;
  secondaryFont: string;
  brandColors: string;
  accentColors: string;
  socialTemplateStyle: string;
  logoUsageRules: string;
  defaultApprovalMode: ApprovalMode;
  setupCompleted: boolean;
  setupCompletedAt?: string;
  instagramHandle?: string;
  googleBusinessUrl?: string;
  brandImageUrls?: string;
  brandAnalysis?: string;
  brandAnalyzedAt?: string;
  platformProfiles: string;
  contentNeeds: string;
  operatingCapabilities: string;
  galleryPolicy: string;
  templateFamilies: string;
  riskRules: string;
  customerVisibleSummary: string;
  systemIntelligence: string;
  discoveryConfidence?: number | null;
  creativeProfileConfirmedAt?: string | null;
}

export interface OnboardingStatus {
  score: number;
  completed: number;
  total: number;
  readyForLaunch: boolean;
  readyForLiveActions: boolean;
  setupCompleted: boolean;
  profile?: {
    brandName: string;
    industry: string;
    brandTone: string;
    setupCompleted: boolean;
    brandAnalyzedAt?: string | null;
    contentNeeds?: string;
    templateFamilies?: string;
    creativeProfileConfirmedAt?: string | null;
  } | null;
  integrations: Array<{
    provider: string;
    status: string;
    displayName: string;
    accountId: string;
  }>;
  subscription?: {
    id: string;
    packageId: string;
    packageName: string;
    status: string;
  } | null;
  checks: Array<{
    id: string;
    label: string;
    complete: boolean;
    detail: string;
    cta: string;
  }>;
  nextStep?: {
    id: string;
    label: string;
    complete: boolean;
    detail: string;
    cta: string;
  } | null;
}

export interface SaveCompanyProfileRequest {
  brandName: string;
  industry: string;
  location: string;
  brandTone: string;
  targetAudience: string;
  visualStyle: string;
  campaignGoals: string;
  competitors: string;
  customRules: string;
  languages: string;
  logoUrl: string;
  websiteUrl: string;
  description: string;
  primaryFont?: string;
  secondaryFont?: string;
  brandColors?: string;
  accentColors?: string;
  socialTemplateStyle?: string;
  logoUsageRules?: string;
  defaultApprovalMode: ApprovalMode;
  /** Instagram handle without @, e.g. "cafebosphorus" */
  instagramHandle?: string;
  /** Google Business Profile URL */
  googleBusinessUrl?: string;
  /** Comma-separated public brand image URLs */
  brandImageUrls?: string;
  platformProfiles?: string;
  contentNeeds?: string;
  operatingCapabilities?: string;
  galleryPolicy?: string;
  templateFamilies?: string;
  riskRules?: string;
  customerVisibleSummary?: string;
  systemIntelligence?: string;
  discoveryConfidence?: number | null;
  creativeProfileConfirmedAt?: string | null;
}

export interface BrandDiscoveryRequest {
  websiteUrl?: string;
  instagramHandle?: string;
  googleBusinessUrl?: string;
  tikTokUrl?: string;
  youTubeUrl?: string;
  linkedInUrl?: string;
  primaryGoal?: string;
  applyToProfile?: boolean;
}

export interface BrandIntelligenceReport {
  brandName: string;
  industry: string;
  targetAudience: string[];
  brandTone: string;
  visualStyle: string;
  primaryGoals: string[];
  contentPillars: string[];
  defaultCtas: string[];
  templateNeeds: string[];
  assetRecommendations: string[];
  missingQuestions: string[];
  websiteSummary: string;
  topHashtags: string[];
  playbookId: string;
  preferredChannels: string[];
  riskRules: Record<string, string>;
  approvalRequiredFor: string[];
}

export interface BrandDiscoveryResult {
  success: boolean;
  message: string;
  report: BrandIntelligenceReport;
  profile: CompanyProfile;
  analysisText: string;
  inferredLanguage: string;
  fetchOk: boolean;
  analyzedAt?: string | null;
}

/** Response from the Python crew backend's /analyze endpoint (via Next.js BFF) */
export interface PythonSourceStatus {
  attempted: boolean;
  ok: boolean;
  error: string | null;
  data_points: string[];
}

export interface PythonBrandAnalyzeResponse {
  success: boolean;
  sources: {
    website: PythonSourceStatus;
    instagram: PythonSourceStatus;
    google: PythonSourceStatus;
  };
  confidence: number;               // 0-100
  inferred_tone: string;
  inferred_language: string;
  inferred_industry: string;
  content_pillars: string[];
  default_ctas: string[];
  risk_rules: Record<string, string>;
  instagram_top_hashtags: string[];
  website_summary: string;
  instagram_bio: string;
  missing_signals: string[];
  reference_image_urls?: string[];
  brand_context: {
    id: string;
    workspace_id: string;
    business_name: string;
    brand_tone: string | null;
    visual_style: string | null;
    target_audience: string | null;
    content_pillars: string | null;
    default_ctas: string | null;
    risk_rules: string | null;
    discovery_confidence: number | null;
    last_brand_analysis_at: string | null;
    brand_constitution_confirmed_at: string | null;
    reference_image_urls?: string | null;
  };
  // Present only when Python backend is unreachable
  error?: string;
  message?: string;
  hint?: string;
}

/** A single task recommendation from the CEO Intelligence Agent */
export interface RecommendedTask {
  priority: 'critical' | 'high' | 'medium' | 'low';
  agent_role: 'review_agent' | 'content_agent' | 'content_strategy_agent' | 'ads_agent' | 'analytics_agent';
  task_type: string;
  title: string;
  reason: string;
  brief: string;
  estimated_impact: string;
  input_data: Record<string, unknown>;
}

export interface TaskRecommendationsResponse {
  recommendations: RecommendedTask[];
  business_name: string;
  health_snapshot?: Record<string, unknown>;
  cached: boolean;
  generated_at: string;
  error?: string;
}

// ── Brand Rules types ─────────────────────────────────────────────────────────

export interface BrandRuleItem {
  id: string;
  workspace_id: string;
  rule_type: string;   // cta | format_preference | format_avoidance | hook_pattern | content_pillar
  rule_key: string;
  rule_value: string | null;
  confirmation_count: number;
  approval_rate: number | null;
  confidence: number;
  evidence_summary: string | null;
  status: string;      // under_review | active | rejected | deprecated
  source: string;      // learning | manual | brand_discovery
  promoted_at: string | null;
  promoted_by: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandRulesScanResponse {
  workspace_id: string;
  candidates_found: number;
  already_known: number;
  created: number;
  message: string;
}

// ── Mission orchestration types ───────────────────────────────────────────────

export interface MissionSummary {
  id: string;
  title: string;
  type: string;                 // seasonal | opportunity | competitive | recovery | manual
  trigger_signal: string | null;
  objective: string | null;
  timeline_days: number | null;
  priority: string;             // critical | high | medium | low
  confidence: number;
  status: string;               // proposed | approved | in_flight | completed | rejected | cancelled
  assigned_agent_roles: string[] | null;
  total_nodes: number;
  completed_nodes: number;
  failed_nodes: number;
  completion_pct: number;
  created_at: string;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface MissionNodeProgress {
  node_key: string;
  title: string;
  phase_index: number;
  task_type: string;
  agent_role: string;
  depends_on: string[];
  status: string;               // pending | running | completed | failed | skipped
  is_ready: boolean;
  output_artifact_id: string | null;
  output_summary: string | null;  // full agent output (up to 8000 chars)
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
}

export interface MissionProgress {
  mission_id: string;
  title: string;
  status: string;
  priority: string;
  confidence: number;
  timeline_days: number | null;
  total_nodes: number;
  completed_nodes: number;
  running_nodes: number;
  failed_nodes: number;
  pending_nodes: number;
  skipped_nodes: number;
  completion_pct: number;
  nodes: MissionNodeProgress[];
  created_at: string;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  performance_summary?: {
    production_error?: { message?: string; status_code?: number; at?: string };
    [key: string]: unknown;
  } | null;
}

export interface ProposeMissionsResponse {
  workspace_id: string;
  proposals_created: number;
  missions: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    priority: string;
    confidence: number;
    timeline_days: number | null;
    rationale: string;
    expected_outcome: string;
  }>;
  message: string;
}

export interface IndustryPlaybookDto {
  id: string;
  label: string;
  defaultContentNeeds: string[];
  riskySignals: string[];
  approvalRequiredFor: string[];
  preferredChannels: string[];
}

export interface TenantGalleryPolicyDto {
  allowedAssetIntents: string[];
  clientPhotoPolicy: string;
  beforeAfterPolicy: string;
  maxGalleryPhotos: number;
  requireConsentMetadata: boolean;
}

export interface TenantOperatingProfileDto {
  tenantId: string;
  industry: string;
  playbookId: string;
  enabledCapabilities: string[];
  galleryPolicy: TenantGalleryPolicyDto;
  riskRules: Record<string, string>;
  customRules: string;
}

export interface TenantCapabilityDefinitionDto {
  id: string;
  kind: string;
  label: string;
  description: string;
  industries: string[];
  defaultEnabled: boolean;
  riskSignals: string[];
  requiredAssetIntents: string[];
  requires: string[];
}

export interface TenantMediaAsset {
  id: string;
  officeId?: string | null;
  assetType: string;
  url: string;
  storageKey: string;
  displayName: string;
  description: string;
  tags: string;
  usageContext: string;
  isApproved: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTenantMediaAssetRequest {
  officeId?: string | null;
  assetType: string;
  url: string;
  storageKey?: string;
  displayName?: string;
  description?: string;
  tags?: string;
  usageContext?: string;
  isApproved?: boolean;
  priority?: number;
}

export interface OfficeBrandProfile {
  id: string;
  officeId: string;
  displayName: string;
  location: string;
  logoUrl: string;
  brandColors: string;
  accentColors: string;
  contact: string;
  websiteUrl: string;
  reservationUrl: string;
  socialTemplateStyle: string;
  defaultCta: string;
  configuration: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertOfficeBrandProfileRequest {
  officeId: string;
  displayName?: string;
  location?: string;
  logoUrl?: string;
  brandColors?: string;
  accentColors?: string;
  contact?: string;
  websiteUrl?: string;
  reservationUrl?: string;
  socialTemplateStyle?: string;
  defaultCta?: string;
  configuration?: string;
}

export interface CanvaTemplateAssignment {
  id: string;
  officeId?: string | null;
  canvaTemplateId: string;
  name: string;
  contentKinds: string;
  useCases: string;
  templateFamilyId: string;
  allowedIntents: string;
  allowedChannels: string;
  requiredAssetIntents: string;
  riskTier: string;
  status: string;
  manualApprovalRequired: boolean;
  lastReviewedAt?: string | null;
  lastReviewedBy?: string | null;
  aspectRatio: string;
  datasetContract: string;
  enabled: boolean;
  priority: number;
  brandFitScore: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCanvaTemplateAssignmentRequest {
  officeId?: string | null;
  canvaTemplateId: string;
  name: string;
  contentKinds?: string;
  useCases?: string;
  templateFamilyId?: string;
  allowedIntents?: string;
  allowedChannels?: string;
  requiredAssetIntents?: string;
  riskTier?: string;
  status?: string;
  manualApprovalRequired?: boolean;
  aspectRatio?: string;
  datasetContract?: string;
  enabled?: boolean;
  priority?: number;
  brandFitScore?: number;
  notes?: string;
}

export interface PackageDefinition {
  id: string;
  name: string;
  slug: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  taskLimitPerMonth: number;
  includedAgentTypes: string;
  features: string;
  sortOrder: number;
  isPopular: boolean;
}

export interface TenantSubscription {
  id: string;
  packageId: string;
  packageName: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  tasksUsedThisPeriod: number;
  taskLimit: number;
  addOnAgents: SubscriptionAgent[];
}

export interface UsageQuotaMetric {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  isUnlimited: boolean;
}

export interface PlanMonthlyOutputs {
  missions: number;
  socialContent: number;
  galleryAnalysis: number;
  reels: number;
}

export interface PlanUnitEconomics {
  monthlyPriceTry: number;
  revenueUsdEstimate: number;
  monthCostUsd: number;
  monthBilledUsd: number;
  costProfitRatio: number | null;
  effectiveTokenMarginPercent: number;
  targetTokenMarginPercent: number;
}

export interface UsageQuotaSummary {
  subscriptionId?: string | null;
  packageName: string;
  packageSlug: string;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  agentRuns: UsageQuotaMetric;
  providerActions: UsageQuotaMetric;
  liveProviderActions: UsageQuotaMetric;
  tokens: UsageQuotaMetric;
  monthlyOutputs?: PlanMonthlyOutputs | null;
  unitEconomics?: PlanUnitEconomics | null;
}

export interface SubscriptionAgent {
  id: string;
  agentType: string;
  isIncluded: boolean;
  isAddOn: boolean;
  monthlyPrice: number;
}

export interface IntegrationConnection {
  id: string;
  provider: IntegrationProvider;
  accountId: string;
  displayName: string;
  status: IntegrationStatus;
  scopes: string;
  tokenExpiresAt?: string;
  lastHealthCheck?: string;
  createdAt: string;
}

export interface CreateIntegrationRequest {
  provider: IntegrationProvider;
  accountId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  scopes: string;
}

export interface ProviderAccountMapping {
  id: string;
  integrationConnectionId: string;
  integrationDisplayName: string;
  agentType: string;
  isActive: boolean;
}

// ── Suggested Actions & Execution ────────────────────────────────────────

export type ActionStatus = 'Pending' | 'Approved' | 'Rejected' | 'Executed' | 'Failed';
export type ActionProvider =
  | 'GoogleBusiness'
  | 'Instagram'
  | 'GoogleAds'
  | 'Facebook'
  | 'SearchConsole'
  | 'GoogleAnalytics'
  | 'WhatsAppBusiness'
  | 'Canva'
  | 'system';

export interface SuggestedActionDto {
  id: string;
  artifactId: string;
  artifactTitle: string;
  actionType: string;
  provider: ActionProvider;
  approvalRequired: boolean;
  status: ActionStatus;
  /** JSON string — parsed payload from CrewAI output */
  payload: string;
  renderedPreview?: {
    kind: 'text' | 'social' | 'ad' | 'report' | 'video' | 'strategy';
    title: string;
    summary: string;
    imageUrl?: string | null;
    /** CDN URL of a Runway-generated mp4 */
    videoUrl?: string | null;
    caption?: string;
    hashtags?: string[];
    /** Full content plan ideas (Instagram content plan) */
    missionBrief?: string;
    missingQuestion?: string;
    readyForGramMaster?: boolean;
    weeklyTheme?: string;
    pillarMix?: unknown;
    recommendedFormats?: unknown;
    templateUseCases?: unknown;
    assetIntents?: unknown;
    ideas?: Array<{
      contentType: string;
      contentKind?: string;
      templateUseCase?: string;
      headline?: string;
      title: string;
      caption: string;
      visualDirection: string;
      hashtags: string[];
      postingTime: string;
      eventDate?: string;
      location?: string;
      cta?: string;
      assetIntent?: string;
      missingQuestions?: string[];
      engagement: string;
      purpose: string;
    }>;
  };
  integrationConnectionId?: string;
  integrationName?: string;
  targetRef?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ActionExecutionResult {
  jobId: string;
  actionId: string;
  success: boolean;
  status: ActionStatus;
  mode?: 'dry-run' | 'live' | string;
  message: string;
  providerResponse: Record<string, unknown>;
}

export interface CurrentUserSecurity {
  userId: string;
  tenantId: string;
  tenantName: string;
  role: string;
  displayName: string;
  email: string;
  permissions: string[];
  isDemoFallback: boolean;
}

export interface UserAdmin {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  invitedAt?: string | null;
  inviteAcceptedAt?: string | null;
}

export interface AuthSession {
  token: string;
  user: UserAdmin;
  tenantId: string;
  officeId: string;
}

export interface OperationsSummary {
  generatedAt: string;
  correlationId?: string;
  health: {
    agentRuns24h: number;
    failedAgentRuns24h: number;
    executionJobs24h: number;
    failedExecutionJobs24h: number;
    providerFailureRate: number;
    avgAgentRunDurationMs: number;
    avgExecutionDurationMs: number;
    tokensUsed24h: number;
  };
  recentAgentRuns: Array<{
    id: string;
    agentId: string;
    agentName: string;
    agentType: string;
    taskTitle: string;
    status: string;
    startedAt: string;
    completedAt?: string | null;
    durationMs: number;
    tokensUsed: number;
    providerModel: string;
    errorMessage: string;
    stage: string;
    summary: string;
    /** Ham JSON — modalda akış / teknik detay */
    executionLog?: string;
  }>;
  recentExecutionJobs: Array<{
    id: string;
    suggestedActionId: string;
    actionType: string;
    provider: string;
    status: string;
    startedAt?: string | null;
    completedAt?: string | null;
    durationMs: number;
    success: boolean;
    retryCount: number;
    errorMessage: string;
    mode: string;
    providerStatus: string;
    providerError: string;
    auditLog?: string;
    providerResponseJson?: string;
    resultData?: string;
  }>;
  failures: Array<{
    source: string;
    id: string;
    title: string;
    detail: string;
    occurredAt: string;
  }>;
  auditTrail: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    timestamp: string;
    newValues: string;
  }>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
