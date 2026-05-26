import type { Agent, OutputArtifact, TaskItem } from '@/types';
import { FLAGSHIP_AGENTS, agentLayoutById } from '@/lib/office-layout';
import { getProductRoleLabel } from '@/lib/agent-product-catalog';

export interface DashboardAgent extends Agent {
  apiId: string;
  backendAgentType: string;
  layoutSlotId: string;
  roleLabel: string;
  zoneId: string;
}

export interface DashboardArtifact extends OutputArtifact {
  taskId: string;
}

export type CrewLine = 'review_agent' | 'content_agent' | 'ads_agent' | 'analytics_agent';

/** C# `AgentType` enum sırası — API çoğu zaman sayı döndürür; runtime profilleri isim bekler. */
export const AGENT_TYPE_ENUM_TO_NAME: Record<string, string> = {
  '0': 'AiCeo',
  '1': 'BlogWriter',
  '2': 'SocialMediaDesigner',
  '3': 'InstagramContentGenerator',
  '4': 'UiUxDesigner',
  '5': 'VideoEditor',
  '6': 'SeoSpecialist',
  '7': 'GoogleAdsAnalyst',
  '8': 'CustomerReviewResponder',
  '9': 'ChatbotManager',
  '10': 'AiStrategist',
  '11': 'AnalyticsAnalyst',
};

const AGENT_TYPE_BY_LAYOUT_ID: Record<string, string[]> = {
  'agent-ceo': ['AiCeo', '0'],
  'agent-review': ['CustomerReviewResponder', '8'],
  'agent-blog': ['BlogWriter', '1'],
  'agent-social': ['SocialMediaDesigner', '2'],
  'agent-ig': ['InstagramContentGenerator', '3'],
  'agent-seo': ['SeoSpecialist', '6'],
  'agent-analytics': ['AnalyticsAnalyst', '11'],
  'agent-chatbot': ['ChatbotManager', '9'],
  'agent-ads': ['GoogleAdsAnalyst', '7'],
};

const UI_AGENT_TYPE_BY_BACKEND: Record<string, Agent['type']> = {
  AiCeo: 'manager',
  BlogWriter: 'writer',
  SocialMediaDesigner: 'designer',
  InstagramContentGenerator: 'designer',
  UiUxDesigner: 'designer',
  VideoEditor: 'designer',
  SeoSpecialist: 'researcher',
  GoogleAdsAnalyst: 'analyst',
  CustomerReviewResponder: 'manager',
  ChatbotManager: 'developer',
  AiStrategist: 'analyst',
  AnalyticsAnalyst: 'analyst',
  '0': 'manager',
  '1': 'writer',
  '2': 'designer',
  '3': 'designer',
  '4': 'designer',
  '5': 'designer',
  '6': 'researcher',
  '7': 'analyst',
  '8': 'manager',
  '9': 'developer',
  '10': 'analyst',
  '11': 'analyst',
};

const UI_AGENT_STATE_BY_BACKEND: Record<string, Agent['state']> = {
  Idle: 'idle',
  Working: 'working',
  Collaborating: 'working',
  Blocked: 'blocked',
  Completed: 'completed',
  Error: 'error',
  Offline: 'idle',
  '0': 'idle',
  '1': 'working',
  '2': 'working',
  '3': 'blocked',
  '4': 'completed',
  '5': 'error',
  '6': 'idle',
};

const UI_TASK_STATUS_BY_BACKEND: Record<string, TaskItem['status']> = {
  Pending: 'pending',
  Queued: 'pending',
  InProgress: 'in_progress',
  WaitingForDependency: 'blocked',
  WaitingForApproval: 'review',
  Approved: 'completed',
  Rejected: 'failed',
  RevisionRequested: 'review',
  Completed: 'completed',
  Failed: 'failed',
  Cancelled: 'failed',
  '0': 'pending',
  '1': 'pending',
  '2': 'in_progress',
  '3': 'blocked',
  '4': 'review',
  '5': 'completed',
  '6': 'failed',
  '7': 'review',
  '8': 'completed',
  '9': 'failed',
  '10': 'failed',
};

const UI_TASK_PRIORITY_BY_BACKEND: Record<string, TaskItem['priority']> = {
  Low: 'low',
  Normal: 'medium',
  High: 'high',
  Urgent: 'critical',
  Critical: 'critical',
  '0': 'low',
  '1': 'medium',
  '2': 'high',
  '3': 'critical',
  '4': 'critical',
};

const UI_REVIEW_STATUS_BY_BACKEND: Record<string, OutputArtifact['status']> = {
  Pending: 'pending_review',
  Approved: 'approved',
  Rejected: 'rejected',
  RevisionRequested: 'rejected',
  '0': 'pending_review',
  '1': 'approved',
  '2': 'rejected',
  '3': 'rejected',
};

const UI_ARTIFACT_TYPE_BY_BACKEND: Record<string, OutputArtifact['type']> = {
  ReviewResponse: 'text',
  BlogPost: 'text',
  SocialMediaGraphic: 'image',
  InstagramCaption: 'text',
  SeoReport: 'data',
  AdCopy: 'text',
  VideoEdit: 'document',
  UiMockup: 'image',
  StrategyDocument: 'document',
  ChatbotFlow: 'code',
  GenericDocument: 'document',
  AnalyticsReport: 'data',
  '0': 'text',
  '1': 'image',
  '2': 'text',
  '3': 'data',
  '4': 'text',
  '5': 'document',
  '6': 'image',
  '7': 'document',
  '8': 'text',
  '9': 'code',
  '10': 'document',
  '11': 'data',
};

function resolveLayoutId(agentType: unknown): string | null {
  const token = String(agentType ?? '');
  const match = Object.entries(AGENT_TYPE_BY_LAYOUT_ID).find(([, candidates]) =>
    candidates.includes(token)
  );
  return match?.[0] ?? null;
}

export function mapDashboardAgent(raw: any): DashboardAgent | null {
  const layoutId = resolveLayoutId(raw.agentType);
  if (!layoutId) return null;

  const layout = agentLayoutById(layoutId);
  if (!layout) return null;
  const roleLabel = getProductRoleLabel(String(raw.agentType), layout.roleLabel);

  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.map((capability: any) => ({
        id: capability.id ?? `${raw.id}-${capability.name}`,
        agentId: raw.id,
        name: capability.name ?? 'Capability',
        description: capability.description ?? '',
        rating: Math.max(50, 100 - ((capability.priority ?? 1) - 1) * 10),
      }))
    : [];

  const typeToken = String(raw.agentType ?? '');
  const backendAgentType =
    AGENT_TYPE_ENUM_TO_NAME[typeToken] ?? typeToken;

  return {
    id: raw.id,
    apiId: raw.id,
    backendAgentType,
    layoutSlotId: layoutId,
    roleLabel,
    zoneId: layout.zoneId,
    officeId: raw.officeId ?? '',
    name: raw.displayName || raw.name || roleLabel,
    type:
      UI_AGENT_TYPE_BY_BACKEND[String(raw.agentType)] ||
      'manager',
    state:
      UI_AGENT_STATE_BY_BACKEND[String(raw.state)] ||
      'idle',
    description: raw.description || `${roleLabel} agent`,
    capabilities,
    position: { x: layout.position[0], y: layout.position[1], z: layout.position[2] },
    currentTaskId: raw.currentTaskId || undefined,
    taskQueue: [],
    lastActivity: raw.updatedAt || new Date().toISOString(),
    performanceScore: raw.performanceScore ?? 0,
    completedTasks: raw.completedTasks ?? 0,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function mapDashboardTask(raw: any, agents: DashboardAgent[]): TaskItem {
  const taskTypeToken = String(raw.agentType ?? '');
  const taskBackendName =
    AGENT_TYPE_ENUM_TO_NAME[taskTypeToken] ?? taskTypeToken;
  const assignedAgent = agents.find(
    (agent) => agent.backendAgentType === taskBackendName
  );

  return {
    id: raw.id,
    briefId: raw.briefId,
    title: raw.title,
    description: raw.description,
    status:
      UI_TASK_STATUS_BY_BACKEND[String(raw.status)] ||
      'pending',
    priority:
      UI_TASK_PRIORITY_BY_BACKEND[String(raw.priority)] ||
      'medium',
    assignedAgent: assignedAgent?.id,
    dependencies: [],
    estimatedDuration: raw.estimatedDurationMinutes ?? 0,
    actualDuration: raw.actualDurationMinutes ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    startedAt: raw.startedAt ?? undefined,
    completedAt: raw.completedAt ?? undefined,
  };
}

export function mapDashboardArtifact(raw: any): DashboardArtifact {
  return {
    id: raw.id,
    taskId: raw.taskId,
    agentRunId: raw.agentRunId ?? '',
    type:
      UI_ARTIFACT_TYPE_BY_BACKEND[String(raw.artifactType)] ||
      'document',
    title: raw.title,
    content: raw.content,
    mimeType: 'text/plain',
    status:
      UI_REVIEW_STATUS_BY_BACKEND[String(raw.reviewStatus)] ||
      'pending_review',
    createdAt: raw.createdAt,
    reviewedAt: undefined,
    reviewedBy: undefined,
    reviewDecision: undefined,
  };
}

/** Son görev/anlık görüntüden türetilen sayılar (API ayrı skor göndermediği için). */
export function computeAgentActivityStats(
  agent: DashboardAgent,
  tasks: TaskItem[],
  artifacts: Array<{ taskId?: string }>,
): { queue: number; completedCount: number; outputCount: number } {
  const isMine = (t: TaskItem) => t.assignedAgent === agent.id;
  const queue = tasks.filter((t) => isMine(t) && t.status === 'pending').length;
  const completedCount = tasks.filter(
    (t) => isMine(t) && (t.status === 'completed' || t.status === 'review'),
  ).length;
  const outputCount = artifacts.filter((a) => {
    const tid = a.taskId;
    if (!tid) return false;
    const task = tasks.find((x) => x.id === tid);
    return Boolean(task && isMine(task));
  }).length;
  return { queue, completedCount, outputCount };
}

export function sortAgentsForLayout(agents: DashboardAgent[]): DashboardAgent[] {
  const layoutOrder = FLAGSHIP_AGENTS.map((layout) => layout.id);
  return [...agents].sort(
    (left, right) =>
      layoutOrder.indexOf(left.layoutSlotId) - layoutOrder.indexOf(right.layoutSlotId)
  );
}

export function getCrewLineForAgentType(agentType: string): CrewLine {
  switch (agentType) {
    case 'CustomerReviewResponder':
    case 'ChatbotManager':
      return 'review_agent';
    case 'BlogWriter':
    case 'SocialMediaDesigner':
    case 'InstagramContentGenerator':
    case 'SeoSpecialist':
    case 'UiUxDesigner':
    case 'VideoEditor':
      return 'content_agent';
    case 'GoogleAdsAnalyst':
      return 'ads_agent';
    case 'AnalyticsAnalyst':
      return 'analytics_agent';
    case 'AiStrategist':
    case 'AiCeo':
    default:
      return 'ads_agent';
  }
}
