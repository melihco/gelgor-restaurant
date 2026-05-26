import type { CanvaTemplateDecision, CanvaTemplateDecisionInput } from '@/lib/canva-template-selection';
import type { RendererProvider } from '@/lib/renderer-adapters';

export type RendererFailureCategory =
  | 'rate_limited'
  | 'auth'
  | 'policy_blocked'
  | 'missing_template'
  | 'missing_fields'
  | 'provider_unavailable'
  | 'provider_error'
  | 'export_failed'
  | 'unknown';

export interface RendererFailure {
  category: RendererFailureCategory;
  retryable: boolean;
  status?: number;
  message: string;
}

export interface TemplateDecisionAuditEvent {
  id: string;
  at: string;
  tenantId: string;
  officeId?: string | null;
  rendererProvider: RendererProvider;
  signalKind: string;
  signalTitle: string;
  templateId?: string;
  templateTitle?: string;
  selectedBy: 'ai_match' | 'manual_override';
  eligibility?: string;
  riskTier?: string;
  approvalRequired?: boolean;
  blockedReasons?: string[];
  policyWarnings?: string[];
  missingFields?: string[];
  missingAssetIntents?: string[];
  riskSignals?: string[];
}

export interface RendererMetricEvent {
  id: string;
  at: string;
  operation: 'render' | 'export' | 'template_match' | 'template_list';
  tenantId?: string;
  officeId?: string | null;
  rendererProvider: RendererProvider;
  status: 'success' | 'failed' | 'blocked' | 'pending';
  durationMs?: number;
  templateId?: string;
  designId?: string;
  jobId?: string;
  failure?: RendererFailure;
}

type ObservabilityStore = {
  decisions: TemplateDecisionAuditEvent[];
  metrics: RendererMetricEvent[];
};

const STORE_KEY = '__smartAgencyRendererObservability';
const MAX_EVENTS = 250;

export function auditTemplateDecision(input: {
  tenantId: string;
  officeId?: string | null;
  rendererProvider: RendererProvider;
  signal: CanvaTemplateDecisionInput;
  decision?: CanvaTemplateDecision | null;
  selectedBy: 'ai_match' | 'manual_override';
}) {
  const event: TemplateDecisionAuditEvent = {
    id: createEventId('decision'),
    at: new Date().toISOString(),
    tenantId: input.tenantId,
    officeId: input.officeId,
    rendererProvider: input.rendererProvider,
    signalKind: input.signal.kind,
    signalTitle: input.signal.title,
    templateId: input.decision?.template.id,
    templateTitle: input.decision?.template.title,
    selectedBy: input.selectedBy,
    eligibility: input.decision?.eligibility,
    riskTier: input.decision?.riskTier,
    approvalRequired: input.decision?.approvalRequired,
    blockedReasons: input.decision?.blockedReasons,
    policyWarnings: input.decision?.policyWarnings,
    missingFields: input.decision?.missingFields,
    missingAssetIntents: input.decision?.missingAssetIntents,
    riskSignals: input.decision?.riskSignals,
  };
  pushEvent('decisions', event);
  return event;
}

export function recordRendererMetric(input: Omit<RendererMetricEvent, 'id' | 'at'>) {
  const event: RendererMetricEvent = {
    id: createEventId(input.operation),
    at: new Date().toISOString(),
    ...input,
  };
  pushEvent('metrics', event);
  return event;
}

export function categorizeRendererFailure(error: unknown, fallback: RendererFailureCategory = 'unknown'): RendererFailure {
  const message = error instanceof Error ? error.message : String(error || 'Unknown renderer failure');
  const status = statusFromMessage(message);
  const lower = message.toLowerCase();

  if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    return { category: 'rate_limited', retryable: true, status, message };
  }
  if (status === 401 || status === 403 || lower.includes('not connected') || lower.includes('unauthorized')) {
    return { category: 'auth', retryable: false, status, message };
  }
  if (status === 404 || lower.includes('template') && lower.includes('not available')) {
    return { category: 'missing_template', retryable: false, status, message };
  }
  if (status === 422 || lower.includes('blocked by template policy')) {
    return { category: fallback === 'export_failed' ? 'export_failed' : 'policy_blocked', retryable: false, status, message };
  }
  if (status && status >= 500) {
    return { category: 'provider_unavailable', retryable: true, status, message };
  }
  return { category: fallback, retryable: false, status, message };
}

export function recentRendererObservability() {
  const store = getStore();
  return {
    decisions: [...store.decisions],
    metrics: [...store.metrics],
  };
}

function pushEvent<T extends keyof ObservabilityStore>(key: T, event: ObservabilityStore[T][number]) {
  const store = getStore();
  store[key] = [event as never, ...store[key]].slice(0, MAX_EVENTS) as ObservabilityStore[T];

  if (event && typeof event === 'object' && 'status' in event && event.status === 'failed') {
    console.warn('[renderer-observability]', event);
  } else {
    console.info('[renderer-observability]', event);
  }
}

function getStore(): ObservabilityStore {
  const globalStore = globalThis as typeof globalThis & { [STORE_KEY]?: ObservabilityStore };
  globalStore[STORE_KEY] ??= { decisions: [], metrics: [] };
  return globalStore[STORE_KEY];
}

function createEventId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function statusFromMessage(message: string) {
  const match = message.match(/\b(?:API|HTTP)?\s*(\d{3})\b/i);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}
