import {
  HubConnectionBuilder,
  HubConnection,
  ILogger,
  LogLevel,
  HubConnectionState,
} from '@microsoft/signalr';
import type { OperationsSummary, Notification } from '@/types';
import { getQueryClientBridge } from '@/lib/query-client-bridge';
import { useNotificationStore } from '@/stores/notification-store';
import { useActivityStore } from '@/stores/activity-store';
import { AGENT_COLORS } from '@/lib/mock-data';
import {
  getRequestContextHeaders,
  getSignalRHubUrl,
} from '@/lib/runtime-config';
import { getSessionToken } from '@/lib/session-token';
import { useWorkspaceStore } from '@/stores/workspace-store';

/** Always reads the live tenant/office from the persisted workspace store — never falls back to a hardcoded demo UUID. */
function getLiveTenantId(): string {
  return useWorkspaceStore.getState().tenantId;
}
function getLiveOfficeId(): string {
  return useWorkspaceStore.getState().officeId;
}

let connection: HubConnection | null = null;
let connectionPromise: Promise<HubConnection> | null = null;
let intentionalDisconnect = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;
const signalRLogger: ILogger = {
  log(logLevel, message) {
    const text = String(message);
    const isExpectedDevNoise =
      text.includes('WebSocket closed with status code: 1006') ||
      text.includes('Connection disconnected with error') ||
      text.includes('Handshake was canceled') ||
      text.includes('handshake');

    if (isExpectedDevNoise) {
      console.debug('SignalR connection closed; reconnect will continue automatically.');
      return;
    }

    if (logLevel >= LogLevel.Error) {
      console.warn(text);
    }
  },
};

interface AgentStateChangedEvent {
  agentId: string;
  agentName: string;
  newState: string;
}

interface TaskStatusChangedEvent {
  taskId: string;
  title: string;
  newStatus: string;
}

interface NewNotificationEvent {
  notificationId: string;
  /** C# `NotificationType` enum — SignalR/JSON genelde sayı (0,1,2…) gönderir */
  type: string | number;
  title: string;
  message: string;
  createdAt: string;
}

interface OutputReadyEvent {
  artifactId: string;
  taskId: string;
  artifactType: string;
  title: string;
  createdAt: string;
}

interface BriefDecomposedEvent {
  briefId: string;
  briefTitle: string;
  taskCount: number;
  decomposedAt: string;
}

interface AgentRunProgressEvent {
  runId: string;
  taskId: string;
  taskTitle: string;
  executionLogJson: string;
  at: string;
}

function normalizeAgentRunProgress(raw: unknown): AgentRunProgressEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const runId = String(o.runId ?? o.RunId ?? '');
  if (!runId) return null;
  return {
    runId,
    taskId: String(o.taskId ?? o.TaskId ?? ''),
    taskTitle: String(o.taskTitle ?? o.TaskTitle ?? ''),
    executionLogJson: String(o.executionLogJson ?? o.ExecutionLogJson ?? '{}'),
    at: String(o.at ?? o.At ?? new Date().toISOString()),
  };
}

function buildHubConnection(): HubConnection {
  const hub = new HubConnectionBuilder()
    .withUrl(getSignalRHubUrl(), {
      accessTokenFactory: () => getSessionToken() ?? '',
      headers: getRequestContextHeaders(),
      withCredentials: true,
    })
    .withAutomaticReconnect({
      nextRetryDelayInMilliseconds: () => RECONNECT_DELAY,
    })
    .configureLogging(signalRLogger)
    .build();

  hub.on('AgentStateChanged', (event: AgentStateChangedEvent) => {
    handleAgentStateChanged(event);
  });

  hub.on('TaskStatusChanged', (event: TaskStatusChangedEvent) => {
    handleTaskStatusChanged(event);
  });

  hub.on('NewNotification', (event: NewNotificationEvent) => {
    handleNewNotification(event);
  });

  hub.on('OutputReady', (event: OutputReadyEvent) => {
    handleOutputReady(event);
  });

  hub.on('BriefDecomposed', (event: BriefDecomposedEvent) => {
    handleBriefDecomposed(event);
  });

  hub.on('AgentRunProgress', (raw: unknown) => {
    const event = normalizeAgentRunProgress(raw);
    if (event) handleAgentRunProgress(event);
  });

  hub.onreconnecting(() => {
    reconnectAttempts++;
  });

  hub.onreconnected(async () => {
    reconnectAttempts = 0;
    try {
      await hub.invoke('JoinOffice', getLiveTenantId(), getLiveOfficeId());
    } catch (error) {
      console.warn('SignalR rejoin failed after reconnect', error);
    }
  });

  hub.onclose((error) => {
    connectionPromise = null;
    if (intentionalDisconnect) {
      connection = null;
      intentionalDisconnect = false;
      return;
    }
    connection = null;
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      setTimeout(() => {
        void initializeSignalR().catch((initError) => {
          if (!isTransientSignalRError(initError) && !isBackendUnavailableError(initError)) {
            console.warn('SignalR reconnect attempt failed', initError);
          }
        });
      }, RECONNECT_DELAY);
    }
    if (error && !isTransientSignalRError(error)) {
      console.warn('SignalR disconnected unexpectedly', error);
    }
  });

  return hub;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function initializeSignalR(): Promise<HubConnection> {
  if (connectionPromise) {
    return connectionPromise;
  }
  if (
    connection &&
    (connection.state === HubConnectionState.Connected ||
      connection.state === HubConnectionState.Connecting ||
      connection.state === HubConnectionState.Reconnecting)
  ) {
    return connection;
  }

  connectionPromise = (async () => {
    intentionalDisconnect = false;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (connection) {
        try {
          await connection.stop();
        } catch {
          /* stale hub from a canceled handshake */
        }
        connection = null;
      }

      connection = buildHubConnection();

      try {
        await connection.start();
        await connection.invoke('JoinOffice', getLiveTenantId(), getLiveOfficeId());
        reconnectAttempts = 0;
        return connection;
      } catch (error) {
        lastError = error;
        const transient = isTransientSignalRError(error);
        const backendDown = isBackendUnavailableError(error);
        if (backendDown || (!transient && attempt >= 2)) {
          break;
        }
        await sleep(RECONNECT_DELAY * (attempt + 1));
      }
    }

    connectionPromise = null;
    connection = null;
    throw lastError ?? new Error('SignalR connection failed');
  })();

  return connectionPromise;
}

function isTransientSignalRError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /Handshake was canceled|stopped during negotiation|AbortError|The connection was stopped/i.test(msg);
}

function isBackendUnavailableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /500|Internal Server Error|Failed to fetch|ECONNREFUSED|negotiation/i.test(msg);
}

export function getSignalRConnection(): HubConnection | null {
  return connection;
}

export async function disconnectSignalR(): Promise<void> {
  if (connection) {
    intentionalDisconnect = true;
    connectionPromise = null;
    await connection.stop();
    connection = null;
  }
}

function handleAgentStateChanged(event: AgentStateChangedEvent): void {
  const notificationStore = useNotificationStore.getState();
  const activityStore = useActivityStore.getState();
  notificationStore.addNotification({
    id: `agent-${event.agentId}-${Date.now()}`,
    tenantId: getLiveTenantId(),
    userId: '',
    type: 'agent_state_changed',
    title: `${event.agentName} is ${event.newState}`,
    message: `Agent ${event.agentName} changed state to ${event.newState}`,
    relatedEntityId: event.agentId,
    relatedEntityType: 'agent',
    read: false,
    createdAt: new Date().toISOString(),
  });
  activityStore.addActivity({
    id: `agent-state-${event.agentId}-${Date.now()}`,
    subject: event.agentName,
    action: `durumunu ${event.newState} olarak güncelledi`,
    timestamp: new Date().toISOString(),
    accentColor: AGENT_COLORS.manager ?? '#818cf8',
  });
}

function handleTaskStatusChanged(event: TaskStatusChangedEvent): void {
  const notificationStore = useNotificationStore.getState();
  const activityStore = useActivityStore.getState();
  notificationStore.addNotification({
    id: `task-${event.taskId}-${Date.now()}`,
    tenantId: getLiveTenantId(),
    userId: '',
    type: 'task_completed',
    title: `${event.title} updated to ${event.newStatus}`,
    message: `Task changed status to ${event.newStatus}`,
    relatedEntityId: event.taskId,
    relatedEntityType: 'task',
    read: false,
    createdAt: new Date().toISOString(),
  });
  activityStore.addActivity({
    id: `task-status-${event.taskId}-${Date.now()}`,
    subject: event.title,
    action: `durumu ${event.newStatus} olarak değişti`,
    timestamp: new Date().toISOString(),
    accentColor: '#818cf8',
  });
}

function handleNewNotification(event: NewNotificationEvent): void {
  const notificationStore = useNotificationStore.getState();
  const activityStore = useActivityStore.getState();
  notificationStore.addNotification({
    id: event.notificationId,
    tenantId: getLiveTenantId(),
    userId: '',
    type: mapNotificationType(event.type),
    title: event.title,
    message: event.message,
    read: false,
    createdAt: event.createdAt,
  });
  activityStore.addActivity({
    id: `notification-${event.notificationId}`,
    subject: event.title,
    action: event.message,
    timestamp: event.createdAt,
    accentColor: '#f59e0b',
  });
}

function handleOutputReady(event: OutputReadyEvent): void {
  const notificationStore = useNotificationStore.getState();
  const activityStore = useActivityStore.getState();
  notificationStore.addNotification({
    id: `artifact-${event.artifactId}-${Date.now()}`,
    tenantId: getLiveTenantId(),
    userId: '',
    type: 'review_needed',
    title: 'Output ready for review',
    message: `${event.title} is ready for review`,
    relatedEntityId: event.artifactId,
    relatedEntityType: 'artifact',
    read: false,
    createdAt: event.createdAt,
  });
  activityStore.addActivity({
    id: `output-${event.artifactId}-${Date.now()}`,
    subject: event.title,
    action: `${event.artifactType} review için hazır`,
    timestamp: event.createdAt,
    accentColor: '#34d399',
  });
}

function handleAgentRunProgress(event: AgentRunProgressEvent): void {
  const qc = getQueryClientBridge();
  if (!qc) return;

  const runIdNorm = event.runId.toLowerCase();
  let terminal = false;

  qc.setQueryData<OperationsSummary>(['operations-summary'], (old) => {
    if (!old?.recentAgentRuns?.length) return old;
    const nextRuns = old.recentAgentRuns.map((r) => {
      if (r.id !== event.runId && r.id.toLowerCase() !== runIdNorm) return r;

      const next: OperationsSummary['recentAgentRuns'][number] = {
        ...r,
        executionLog: event.executionLogJson,
        taskTitle: event.taskTitle || r.taskTitle,
      };

      try {
        const parsed = JSON.parse(event.executionLogJson) as Record<string, unknown>;
        const rawStatus = typeof parsed.status === 'string' ? parsed.status.trim() : '';
        if (/^completed$/i.test(rawStatus)) {
          terminal = true;
          const completedAt = event.at;
          const start = Date.parse(r.startedAt);
          const end = Date.parse(completedAt);
          next.status = 'Completed';
          next.completedAt = completedAt;
          if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
            next.durationMs = end - start;
          }
          if (typeof parsed.summary === 'string' && parsed.summary) {
            next.summary = parsed.summary;
          }
          if (typeof parsed.tokensUsed === 'number' && Number.isFinite(parsed.tokensUsed)) {
            next.tokensUsed = parsed.tokensUsed;
          }
          return next;
        }
        if (/^failed$/i.test(rawStatus)) {
          terminal = true;
          const completedAt = event.at;
          const start = Date.parse(r.startedAt);
          const end = Date.parse(completedAt);
          next.status = 'Failed';
          next.completedAt = completedAt;
          if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
            next.durationMs = end - start;
          }
          if (typeof parsed.error === 'string' && parsed.error) {
            next.errorMessage = parsed.error;
          }
          return next;
        }
      } catch {
        /* kalp atışı JSON’u veya geçici log — yalnızca executionLog güncellenir */
      }
      return next;
    });
    return { ...old, recentAgentRuns: nextRuns };
  });

  if (terminal) {
    void qc.invalidateQueries({ queryKey: ['operations-summary'] });
  }
}

function handleBriefDecomposed(event: BriefDecomposedEvent): void {
  const notificationStore = useNotificationStore.getState();
  const activityStore = useActivityStore.getState();
  notificationStore.addNotification({
    id: `brief-${event.briefId}-${Date.now()}`,
    tenantId: getLiveTenantId(),
    userId: '',
    type: 'brief_decomposed',
    title: 'Brief decomposed into tasks',
    message: `${event.briefTitle} has been decomposed into ${event.taskCount} tasks`,
    relatedEntityId: event.briefId,
    relatedEntityType: 'brief',
    read: false,
    createdAt: event.decomposedAt,
  });
  activityStore.addActivity({
    id: `brief-${event.briefId}-${Date.now()}`,
    subject: event.briefTitle,
    action: `${event.taskCount} göreve ayrıldı`,
    timestamp: event.decomposedAt,
    accentColor: '#a78bfa',
  });
}

/** C# `Nexus.Domain.Enums.NotificationType` sırasıyla aynı */
const NOTIFICATION_ENUM_TO_APP: Record<number, Notification['type']> = {
  0: 'task_started', // TaskAssigned
  1: 'task_completed', // TaskCompleted
  2: 'error', // TaskFailed
  3: 'review_needed', // ApprovalRequired
  4: 'review_needed', // ApprovalDecision
  5: 'agent_state_changed', // AgentStateChanged
  6: 'brief_decomposed', // BriefDecomposed
  7: 'error', // SystemAlert
};

function mapNotificationType(type: unknown): Notification['type'] {
  if (typeof type === 'number' && Number.isFinite(type)) {
    return NOTIFICATION_ENUM_TO_APP[Math.trunc(type)] ?? 'task_started';
  }
  if (typeof type === 'string' && /^\d+$/.test(type.trim())) {
    const n = Number(type.trim());
    if (Number.isFinite(n)) {
      return NOTIFICATION_ENUM_TO_APP[Math.trunc(n)] ?? 'task_started';
    }
  }
  const token = String(type ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  switch (token) {
    case 'taskcompleted':
    case 'task_completed':
      return 'task_completed';
    case 'taskfailed':
    case 'task_failed':
    case 'systemalert':
    case 'system_alert':
      return 'error';
    case 'approvalrequired':
    case 'approval_required':
    case 'approvaldecision':
    case 'approval_decision':
      return 'review_needed';
    case 'agentstatechanged':
    case 'agent_state_changed':
      return 'agent_state_changed';
    case 'briefdecomposed':
    case 'brief_decomposed':
      return 'brief_decomposed';
    case 'taskassigned':
    case 'task_assigned':
    default:
      return 'task_started';
  }
}
