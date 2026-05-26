import type {
  Agent,
  TaskItem,
  Notification,
  OutputArtifact,
} from '@/types';
import { FLAGSHIP_AGENTS } from '@/lib/office-layout';

// ── Agent Colors ──────────────────────────────────────────────
export const AGENT_COLORS: Record<string, string> = {
  writer: '#a78bfa',
  researcher: '#60a5fa',
  designer: '#f472b6',
  manager: '#a5b4fc',
  analyst: '#34d399',
  developer: '#818cf8',
};

export const STATE_COLORS: Record<string, string> = {
  working: '#22c55e',
  idle: '#6b7280',
  blocked: '#ef4444',
  completed: '#3b82f6',
  error: '#ef4444',
};

// ── Mock Agents (aligned with flagship 3D layout) ────────────
export const mockAgents: Agent[] = [
  {
    id: 'agent-ceo',
    officeId: 'office-1',
    name: 'Helm',
    type: 'manager',
    state: 'working',
    description: 'Executive orchestration agent — decomposes briefs, resolves dependencies, aligns the fleet.',
    capabilities: [
      { id: 'cap-ceo-1', agentId: 'agent-ceo', name: 'Strategic Decomposition', description: 'Brief → executable work graph', rating: 98 },
      { id: 'cap-ceo-2', agentId: 'agent-ceo', name: 'Fleet Coordination', description: 'Live prioritization across agents', rating: 96 },
    ],
    position: { x: 0.8, y: 0, z: -10.2 },
    currentTaskId: 'task-orchestrate',
    taskQueue: [],
    lastActivity: '2026-04-03T09:55:00Z',
    performanceScore: 98,
    completedTasks: 412,
    createdAt: '2026-01-05T10:00:00Z',
    updatedAt: '2026-04-03T09:55:00Z',
  },
  {
    id: 'agent-review',
    officeId: 'office-1',
    name: 'Vellum',
    type: 'manager',
    state: 'working',
    description: 'Quality gate & review — approves outputs, requests revisions, protects brand voice.',
    capabilities: [
      { id: 'cap-rev-1', agentId: 'agent-review', name: 'Multi-format Review', description: 'Copy, design, code rubrics', rating: 95 },
      { id: 'cap-rev-2', agentId: 'agent-review', name: 'Risk Detection', description: 'Policy & tone checks', rating: 92 },
    ],
    position: { x: -3.2, y: 0, z: -8.4 },
    currentTaskId: 'task-review-blog',
    taskQueue: ['task-review-ig'],
    lastActivity: '2026-04-03T09:52:00Z',
    performanceScore: 94,
    completedTasks: 889,
    createdAt: '2026-01-08T10:00:00Z',
    updatedAt: '2026-04-03T09:52:00Z',
  },
  {
    id: 'agent-blog', officeId: 'office-1', name: 'Nova', type: 'writer', state: 'working',
    description: 'Long-form blog, editorial, and narrative for product launches.',
    capabilities: [
      { id: 'cap-b1', agentId: 'agent-blog', name: 'Blog Writing', description: 'SEO-aware long form', rating: 96 },
      { id: 'cap-b2', agentId: 'agent-blog', name: 'Editorial Voice', description: 'Brand-aligned storytelling', rating: 93 },
    ],
    position: { x: -12.6, y: 0, z: 0.6 },
    currentTaskId: 'task-blog-draft',
    taskQueue: ['task-newsletter'],
    lastActivity: '2026-04-03T09:54:00Z',
    performanceScore: 94,
    completedTasks: 210,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-04-03T09:54:00Z',
  },
  {
    id: 'agent-social', officeId: 'office-1', name: 'Pixel', type: 'designer', state: 'working',
    description: 'Social feed design, campaign visuals, and motion-ready assets.',
    capabilities: [
      { id: 'cap-s1', agentId: 'agent-social', name: 'Feed Design', description: 'Threads, carousels, stories', rating: 94 },
      { id: 'cap-s2', agentId: 'agent-social', name: 'Brand Systems', description: 'Layouts & tokens', rating: 90 },
    ],
    position: { x: -9.6, y: 0, z: 9.2 },
    currentTaskId: 'task-social-campaign',
    taskQueue: [],
    lastActivity: '2026-04-03T09:53:00Z',
    performanceScore: 92,
    completedTasks: 156,
    createdAt: '2026-02-01T10:00:00Z',
    updatedAt: '2026-04-03T09:53:00Z',
  },
  {
    id: 'agent-ig', officeId: 'office-1', name: 'Flux', type: 'designer', state: 'working',
    description: 'Instagram-native content engine — reels covers, story arcs, hooks.',
    capabilities: [
      { id: 'cap-i1', agentId: 'agent-ig', name: 'Instagram Sets', description: 'Stories & reels packages', rating: 93 },
      { id: 'cap-i2', agentId: 'agent-ig', name: 'Hook Lab', description: 'Opening frames & captions', rating: 91 },
    ],
    position: { x: -4.2, y: 0, z: 11.4 },
    currentTaskId: 'task-ig-batch',
    taskQueue: [],
    lastActivity: '2026-04-03T09:50:00Z',
    performanceScore: 91,
    completedTasks: 134,
    createdAt: '2026-02-10T10:00:00Z',
    updatedAt: '2026-04-03T09:50:00Z',
  },
  {
    id: 'agent-seo', officeId: 'office-1', name: 'Orbit', type: 'researcher', state: 'working',
    description: 'Technical & content SEO — structure, entities, and search intent.',
    capabilities: [
      { id: 'cap-seo1', agentId: 'agent-seo', name: 'Keyword & Intent', description: 'Cluster mapping', rating: 97 },
      { id: 'cap-seo2', agentId: 'agent-seo', name: 'On-page Optimization', description: 'Schema & snippets', rating: 94 },
    ],
    position: { x: 10.2, y: 0, z: 2.8 },
    currentTaskId: 'task-seo-audit',
    taskQueue: ['task-seo-brief'],
    lastActivity: '2026-04-03T09:49:00Z',
    performanceScore: 96,
    completedTasks: 278,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-04-03T09:49:00Z',
  },
  {
    id: 'agent-analytics', officeId: 'office-1', name: 'Lens', type: 'analyst', state: 'idle',
    description: 'Operational analytics — fleet throughput, funnel, and experiment readouts.',
    capabilities: [
      { id: 'cap-an1', agentId: 'agent-analytics', name: 'Fleet Metrics', description: 'SLA & throughput', rating: 95 },
      { id: 'cap-an2', agentId: 'agent-analytics', name: 'Executive Summaries', description: 'Narrative dashboards', rating: 90 },
    ],
    position: { x: 13.6, y: 0, z: -0.8 },
    currentTaskId: undefined,
    taskQueue: ['task-dashboard'],
    lastActivity: '2026-04-03T09:30:00Z',
    performanceScore: 93,
    completedTasks: 341,
    createdAt: '2026-01-12T10:00:00Z',
    updatedAt: '2026-04-03T09:30:00Z',
  },
  {
    id: 'agent-chatbot', officeId: 'office-1', name: 'Cipher', type: 'developer', state: 'working',
    description: 'Conversational AI surfaces — RAG, tools, guardrails, and channels.',
    capabilities: [
      { id: 'cap-c1', agentId: 'agent-chatbot', name: 'Conversation Design', description: 'Flows & tools', rating: 94 },
      { id: 'cap-c2', agentId: 'agent-chatbot', name: 'Integrations', description: 'CRM & helpdesk', rating: 92 },
    ],
    position: { x: 7.8, y: 0, z: -5.8 },
    currentTaskId: 'task-chatbot-rag',
    taskQueue: ['task-chatbot-tool'],
    lastActivity: '2026-04-03T09:56:00Z',
    performanceScore: 93,
    completedTasks: 188,
    createdAt: '2026-01-20T10:00:00Z',
    updatedAt: '2026-04-03T09:56:00Z',
  },
  {
    id: 'agent-ads', officeId: 'office-1', name: 'Spark', type: 'developer', state: 'blocked',
    description: 'Paid growth loops — creative variants, audience experiments, attribution hooks.',
    capabilities: [
      { id: 'cap-ad1', agentId: 'agent-ads', name: 'Creative Variants', description: 'DPA & UGC mixes', rating: 89 },
      { id: 'cap-ad2', agentId: 'agent-ads', name: 'Experiment Design', description: 'Geo & holdout tests', rating: 87 },
    ],
    position: { x: 13.4, y: 0, z: -11.6 },
    currentTaskId: 'task-ads-batch',
    taskQueue: [],
    lastActivity: '2026-04-03T09:20:00Z',
    performanceScore: 88,
    completedTasks: 76,
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-04-03T09:20:00Z',
  },
];

// ── Mock Tasks ────────────────────────────────────────────────
export const mockTasks: TaskItem[] = [
  {
    id: 'task-blog-draft', briefId: 'brief-1', title: 'Q2 Launch — Hero Blog Draft', description: '2000w narrative + pull quotes.',
    status: 'in_progress', priority: 'high', assignedAgent: 'agent-blog', dependencies: [],
    estimatedDuration: 45, createdAt: '2026-04-03T08:00:00Z', updatedAt: '2026-04-03T09:54:00Z', startedAt: '2026-04-03T09:00:00Z',
  },
  {
    id: 'task-review-blog', briefId: 'brief-1', title: 'Review: Blog Draft v2', description: 'Voice, claims, CTA review.',
    status: 'in_progress', priority: 'high', assignedAgent: 'agent-review',
    dependencies: [{ id: 'dep-r1', taskId: 'task-review-blog', dependsOnTaskId: 'task-blog-draft', dependencyType: 'depends_on' }],
    estimatedDuration: 20, createdAt: '2026-04-03T08:30:00Z', updatedAt: '2026-04-03T09:52:00Z', startedAt: '2026-04-03T09:40:00Z',
  },
  {
    id: 'task-social-campaign', briefId: 'brief-2', title: 'Spring Social Carousel Set', description: '5 slides + cover system.',
    status: 'in_progress', priority: 'medium', assignedAgent: 'agent-social', dependencies: [],
    estimatedDuration: 60, createdAt: '2026-04-03T08:15:00Z', updatedAt: '2026-04-03T09:53:00Z', startedAt: '2026-04-03T08:45:00Z',
  },
  {
    id: 'task-ig-batch', briefId: 'brief-2', title: 'Instagram Story Arc (3-day)', description: 'Narrative + sticker variants.',
    status: 'in_progress', priority: 'medium', assignedAgent: 'agent-ig', dependencies: [],
    estimatedDuration: 55, createdAt: '2026-04-03T08:20:00Z', updatedAt: '2026-04-03T09:50:00Z', startedAt: '2026-04-03T09:10:00Z',
  },
  {
    id: 'task-seo-audit', briefId: 'brief-1', title: 'Technical SEO Sweep', description: 'Crawl, schema, internal links.',
    status: 'in_progress', priority: 'high', assignedAgent: 'agent-seo', dependencies: [],
    estimatedDuration: 40, createdAt: '2026-04-03T07:45:00Z', updatedAt: '2026-04-03T09:49:00Z', startedAt: '2026-04-03T08:50:00Z',
  },
  {
    id: 'task-chatbot-rag', briefId: 'brief-3', title: 'RAG Corpus Refresh', description: 'New docs + embeddings pipeline.',
    status: 'in_progress', priority: 'critical', assignedAgent: 'agent-chatbot', dependencies: [],
    estimatedDuration: 90, createdAt: '2026-04-02T14:00:00Z', updatedAt: '2026-04-03T09:56:00Z', startedAt: '2026-04-03T07:30:00Z',
  },
  {
    id: 'task-orchestrate', briefId: 'brief-1', title: 'Fleet Alignment — Q2 Launch', description: 'Rebalance dependencies & SLAs.',
    status: 'in_progress', priority: 'critical', assignedAgent: 'agent-ceo', dependencies: [],
    estimatedDuration: 25, createdAt: '2026-04-03T09:00:00Z', updatedAt: '2026-04-03T09:55:00Z', startedAt: '2026-04-03T09:30:00Z',
  },
  {
    id: 'task-ads-batch', briefId: 'brief-4', title: 'Paid Variant Lab', description: 'Blocked: awaiting creative tokens from design.',
    status: 'in_progress', priority: 'high', assignedAgent: 'agent-ads',
    dependencies: [{ id: 'dep-ad', taskId: 'task-ads-batch', dependsOnTaskId: 'task-social-campaign', dependencyType: 'depends_on' }],
    estimatedDuration: 70, createdAt: '2026-04-03T07:00:00Z', updatedAt: '2026-04-03T09:20:00Z', startedAt: '2026-04-03T08:00:00Z',
  },
  {
    id: 'task-newsletter', briefId: 'brief-1', title: 'Newsletter — Launch Edition', description: 'Depends on blog approval.',
    status: 'pending', priority: 'medium', assignedAgent: 'agent-blog',
    dependencies: [{ id: 'dep-nl', taskId: 'task-newsletter', dependsOnTaskId: 'task-review-blog', dependencyType: 'depends_on' }],
    estimatedDuration: 30, createdAt: '2026-04-03T08:00:00Z', updatedAt: '2026-04-03T08:00:00Z',
  },
  {
    id: 'task-review-ig', briefId: 'brief-2', title: 'Review: IG Story Arc', description: 'Motion-safe zones & copy.',
    status: 'pending', priority: 'medium', assignedAgent: 'agent-review',
    dependencies: [{ id: 'dep-ig', taskId: 'task-review-ig', dependsOnTaskId: 'task-ig-batch', dependencyType: 'depends_on' }],
    estimatedDuration: 15, createdAt: '2026-04-03T08:30:00Z', updatedAt: '2026-04-03T08:30:00Z',
  },
  {
    id: 'task-seo-brief', briefId: 'brief-1', title: 'Keyword Brief for Blog', description: 'Deliverable to Nova.',
    status: 'pending', priority: 'high', assignedAgent: 'agent-seo', dependencies: [],
    estimatedDuration: 25, createdAt: '2026-04-03T08:00:00Z', updatedAt: '2026-04-03T08:00:00Z',
  },
  {
    id: 'task-dashboard', briefId: 'brief-5', title: 'Exec Fleet Dashboard', description: 'Throughput & anomaly strip.',
    status: 'pending', priority: 'low', assignedAgent: 'agent-analytics', dependencies: [],
    estimatedDuration: 35, createdAt: '2026-04-03T07:00:00Z', updatedAt: '2026-04-03T07:00:00Z',
  },
  {
    id: 'task-chatbot-tool', briefId: 'brief-3', title: 'Tool: Order Lookup', description: 'Typed tool + policy checks.',
    status: 'pending', priority: 'medium', assignedAgent: 'agent-chatbot',
    dependencies: [{ id: 'dep-tool', taskId: 'task-chatbot-tool', dependsOnTaskId: 'task-chatbot-rag', dependencyType: 'depends_on' }],
    estimatedDuration: 50, createdAt: '2026-04-02T14:00:00Z', updatedAt: '2026-04-02T14:00:00Z',
  },
];

// ── Mock Notifications ────────────────────────────────────────
export const mockNotifications: Notification[] = [
  {
    id: 'notif-1', tenantId: 'tenant-1', userId: 'user-1', type: 'task_started', title: 'RAG job running',
    message: 'Cipher refreshed embeddings for the support corpus.', relatedEntityId: 'task-chatbot-rag', relatedEntityType: 'task',
    read: false, createdAt: '2026-04-03T09:56:00Z',
  },
  {
    id: 'notif-2', tenantId: 'tenant-1', userId: 'user-1', type: 'review_needed', title: 'Review queue',
    message: 'Vellum flagged Blog Draft v2 for final pass.', relatedEntityId: 'task-review-blog', relatedEntityType: 'task',
    read: false, createdAt: '2026-04-03T09:40:00Z',
  },
  {
    id: 'notif-3', tenantId: 'tenant-1', userId: 'user-1', type: 'task_completed', title: 'SEO entities merged',
    message: 'Orbit merged entity graph into the launch cluster.', relatedEntityId: 'task-seo-audit', relatedEntityType: 'task',
    read: false, createdAt: '2026-04-03T09:15:00Z',
  },
  {
    id: 'notif-4', tenantId: 'tenant-1', userId: 'user-1', type: 'agent_state_changed', title: 'Growth pod blocked',
    message: 'Spark is waiting on social tokens before scaling ads.', relatedEntityId: 'agent-ads', relatedEntityType: 'agent',
    read: true, createdAt: '2026-04-03T09:20:00Z',
  },
  {
    id: 'notif-5', tenantId: 'tenant-1', userId: 'user-1', type: 'brief_decomposed', title: 'Brief decomposed',
    message: '"Spring Campaign" → 6 tasks mapped to Design Lab.', relatedEntityId: 'brief-2', relatedEntityType: 'brief',
    read: true, createdAt: '2026-04-03T08:00:00Z',
  },
  {
    id: 'notif-6', tenantId: 'tenant-1', userId: 'user-1', type: 'review_needed', title: 'Design review',
    message: 'Flux submitted IG arc frames for motion-safe review.', relatedEntityId: 'artifact-ig', relatedEntityType: 'artifact',
    read: false, createdAt: '2026-04-03T09:48:00Z',
  },
];

// ── Mock Pending Review Items ─────────────────────────────────
export interface PendingReviewItem {
  id: string;
  title: string;
  agentName: string;
  agentType: string;
  outputType: OutputArtifact['type'];
  createdAt: string;
}

export const mockPendingReviews: PendingReviewItem[] = [
  { id: 'review-1', title: 'Q2 Launch — Blog Draft v2', agentName: 'Nova', agentType: 'writer', outputType: 'text', createdAt: '2026-04-03T09:40:00Z' },
  { id: 'review-2', title: 'Spring Carousel — Visual system', agentName: 'Pixel', agentType: 'designer', outputType: 'image', createdAt: '2026-04-03T09:33:00Z' },
  { id: 'review-3', title: 'IG Story Arc — 3 day narrative', agentName: 'Flux', agentType: 'designer', outputType: 'image', createdAt: '2026-04-03T09:48:00Z' },
  { id: 'review-4', title: 'Webhook bridge — staging PR', agentName: 'Cipher', agentType: 'developer', outputType: 'code', createdAt: '2026-04-03T08:30:00Z' },
];

// ── Mock Activity Events ──────────────────────────────────────
export interface ActivityEvent {
  id: string;
  agentId: string;
  agentName: string;
  agentType: string;
  action: string;
  timestamp: string;
}

export const mockActivityEvents: ActivityEvent[] = [
  { id: 'evt-1', agentId: 'agent-blog', agentName: 'Nova', agentType: 'writer', action: 'drafting Q2 hero blog — section 3/5…', timestamp: '2026-04-03T09:55:00Z' },
  { id: 'evt-2', agentId: 'agent-seo', agentName: 'Orbit', agentType: 'researcher', action: 'published structured data diff to staging', timestamp: '2026-04-03T09:52:00Z' },
  { id: 'evt-3', agentId: 'agent-social', agentName: 'Pixel', agentType: 'designer', action: 'balancing carousel typography for mobile…', timestamp: '2026-04-03T09:50:00Z' },
  { id: 'evt-4', agentId: 'agent-chatbot', agentName: 'Cipher', agentType: 'developer', action: 're-indexed help corpus (42k chunks)', timestamp: '2026-04-03T09:48:00Z' },
  { id: 'evt-5', agentId: 'agent-review', agentName: 'Vellum', agentType: 'manager', action: 'left 6 inline notes on Blog Draft v2', timestamp: '2026-04-03T09:45:00Z' },
  { id: 'evt-6', agentId: 'agent-ceo', agentName: 'Helm', agentType: 'manager', action: 're-prioritized launch graph — SEO ↑', timestamp: '2026-04-03T09:42:00Z' },
  { id: 'evt-7', agentId: 'agent-ig', agentName: 'Flux', agentType: 'designer', action: 'rendered story arc frames batch B…', timestamp: '2026-04-03T09:38:00Z' },
  { id: 'evt-8', agentId: 'agent-analytics', agentName: 'Lens', agentType: 'analyst', action: 'snapshot: fleet efficiency 94.8%', timestamp: '2026-04-03T09:35:00Z' },
  { id: 'evt-9', agentId: 'agent-ads', agentName: 'Spark', agentType: 'developer', action: 'holding ad batch — waiting on tokens', timestamp: '2026-04-03T09:20:00Z' },
  { id: 'evt-10', agentId: 'agent-blog', agentName: 'Nova', agentType: 'writer', action: 'merged Orbit’s keyword annotations', timestamp: '2026-04-03T09:10:00Z' },
];

// ── Helpers ───────────────────────────────────────────────────
export function getAgentById(id: string): Agent | undefined {
  return mockAgents.find((a) => a.id === id);
}

export function getTaskById(id: string): TaskItem | undefined {
  return mockTasks.find((t) => t.id === id);
}

export function getTasksForAgent(agentId: string): TaskItem[] {
  return mockTasks.filter((t) => t.assignedAgent === agentId);
}

export function getRoleLabelForAgent(agentId: string): string {
  const layout = FLAGSHIP_AGENTS.find((f) => f.id === agentId);
  return layout?.roleLabel ?? '';
}

export function timeAgo(dateStr: string): string {
  const now = new Date('2026-04-03T10:00:00Z');
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
