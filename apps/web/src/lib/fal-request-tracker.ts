/**
 * Tracks fal.ai queue request_id values per production slot.
 * Persisted on artifact metadata as `fal_requests[]` when a slot saves successfully.
 * Orphan calls (slot failed after fal succeeded) are still logged as `[fal-request]`.
 */

export type FalRequestKind = 'still' | 'video' | 'flux_sync';

export type FalRequestStatus = 'submitted' | 'completed' | 'failed';

export interface FalRequestRecord {
  requestId: string;
  model: string;
  kind: FalRequestKind;
  status: FalRequestStatus;
  submittedAt: string;
  completedAt?: string;
  outputUrl?: string;
  error?: string;
}

let activeSlotBuffer: FalRequestRecord[] | null = null;

export function beginFalRequestSlot(): void {
  activeSlotBuffer = [];
}

export function clearFalRequestSlot(): void {
  activeSlotBuffer = null;
}

export function getCapturedFalRequests(): FalRequestRecord[] {
  return activeSlotBuffer ? [...activeSlotBuffer] : [];
}

/** Enqueue rejected before fal returns a queue request_id (403 balance, 404 deprecated model, etc.). */
export function recordFalEnqueueFailed(input: {
  model: string;
  kind: FalRequestKind;
  httpStatus: number;
  error: string;
}): void {
  const entry: FalRequestRecord = {
    requestId: `enqueue-failed:${Date.now()}`,
    model: input.model,
    kind: input.kind,
    status: 'failed',
    submittedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error: `HTTP ${input.httpStatus}: ${input.error}`.slice(0, 500),
  };
  if (activeSlotBuffer) activeSlotBuffer.push(entry);
  logFalRequest(entry, 'enqueue_failed');
}

export function recordFalRequestSubmitted(input: {
  requestId: string;
  model: string;
  kind: FalRequestKind;
}): void {
  const entry: FalRequestRecord = {
    requestId: input.requestId,
    model: input.model,
    kind: input.kind,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
  };
  if (activeSlotBuffer) activeSlotBuffer.push(entry);
  logFalRequest(entry, 'submitted');
}

export function recordFalSyncRequest(input: {
  model: string;
  outputUrl: string;
  error?: string;
}): void {
  const entry: FalRequestRecord = {
    requestId: `sync:${Date.now()}`,
    model: input.model,
    kind: 'flux_sync',
    status: input.error ? 'failed' : 'completed',
    submittedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    outputUrl: input.outputUrl || undefined,
    error: input.error,
  };
  if (activeSlotBuffer) activeSlotBuffer.push(entry);
  logFalRequest(entry, input.error ? 'failed' : 'completed');
}

export function markFalRequestCompleted(requestId: string, outputUrl?: string): void {
  const entry = findTrackedRequest(requestId);
  if (!entry) return;
  entry.status = 'completed';
  entry.completedAt = new Date().toISOString();
  if (outputUrl) entry.outputUrl = outputUrl;
  logFalRequest(entry, 'completed');
}

export function markFalRequestFailed(requestId: string, error?: string): void {
  const entry = findTrackedRequest(requestId);
  if (!entry) return;
  entry.status = 'failed';
  entry.completedAt = new Date().toISOString();
  if (error) entry.error = error.slice(0, 500);
  logFalRequest(entry, 'failed');
}

function findTrackedRequest(requestId: string): FalRequestRecord | undefined {
  return activeSlotBuffer?.find((r) => r.requestId === requestId);
}

function logFalRequest(entry: FalRequestRecord, phase: string): void {
  try {
    console.log('[fal-request] ' + JSON.stringify({
      phase,
      requestId: entry.requestId,
      model: entry.model,
      kind: entry.kind,
      status: entry.status,
      outputUrl: entry.outputUrl ? entry.outputUrl.slice(0, 120) : undefined,
      error: entry.error ? entry.error.slice(0, 160) : undefined,
    }));
  } catch {
    // logging must never break production
  }
}

const FAL_QUEUE_BASE = 'https://queue.fal.run';

function falAuthHeader(apiKey: string): Record<string, string> {
  return { Authorization: `Key ${apiKey}` };
}

/** Resolve fal queue result — used by reconcile script and ops tooling. */
export async function fetchFalQueueRequest(
  model: string,
  requestId: string,
  apiKey: string,
): Promise<{
  status: string;
  outputUrls: string[];
  raw: unknown;
  error?: string;
}> {
  const statusUrl = `${FAL_QUEUE_BASE}/${model}/requests/${requestId}/status`;
  const resultUrl = `${FAL_QUEUE_BASE}/${model}/requests/${requestId}`;

  const statusRes = await fetch(statusUrl, {
    headers: falAuthHeader(apiKey),
    signal: AbortSignal.timeout(20_000),
  });
  if (!statusRes.ok) {
    const body = await statusRes.text().catch(() => '');
    throw new Error(`fal status ${statusRes.status}: ${body.slice(0, 200)}`);
  }
  const statusJson = (await statusRes.json()) as { status?: string; error?: string };
  const status = String(statusJson.status ?? 'UNKNOWN');

  if (status !== 'COMPLETED') {
    return {
      status,
      outputUrls: [],
      raw: statusJson,
      error: statusJson.error,
    };
  }

  const resultRes = await fetch(resultUrl, {
    headers: falAuthHeader(apiKey),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resultRes.ok) {
    const body = await resultRes.text().catch(() => '');
    throw new Error(`fal result ${resultRes.status}: ${body.slice(0, 200)}`);
  }
  const raw = await resultRes.json();
  return {
    status,
    outputUrls: extractMediaUrls(raw),
    raw,
  };
}

function extractMediaUrls(payload: unknown): string[] {
  const urls = new Set<string>();
  const walk = (node: unknown, depth: number): void => {
    if (depth > 8 || node == null) return;
    if (typeof node === 'string') {
      if (/^https?:\/\//i.test(node) && /\.(png|jpe?g|webp|gif|mp4|mov|webm)(\?|$)/i.test(node)) {
        urls.add(node);
      }
      if (/^https?:\/\//i.test(node) && (node.includes('fal.media') || node.includes('fal.ai'))) {
        urls.add(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      for (const value of Object.values(node as Record<string, unknown>)) {
        walk(value, depth + 1);
      }
    }
  };
  walk(payload, 0);
  return [...urls];
}

export function normalizeMediaUrlForMatch(url: string): string {
  return (url.split('?')[0] ?? url).trim().toLowerCase();
}

export function artifactContainsMediaUrl(
  artifact: { contentUrl?: string | null; metadata?: unknown; content?: unknown },
  targetUrl: string,
): boolean {
  const needle = normalizeMediaUrlForMatch(targetUrl);
  if (!needle) return false;

  const haystacks: string[] = [];
  if (artifact.contentUrl) haystacks.push(artifact.contentUrl);

  const parseObj = (raw: unknown): Record<string, unknown> => {
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return typeof parsed === 'object' && parsed ? parsed as Record<string, unknown> : {};
      } catch {
        return {};
      }
    }
    return typeof raw === 'object' && raw ? raw as Record<string, unknown> : {};
  };

  const meta = parseObj(artifact.metadata);
  const content = parseObj(artifact.content);
  for (const obj of [meta, content]) {
    for (const key of ['imageUrl', 'videoUrl', 'posterUrl', 'contentUrl', 'feed_preview_url']) {
      const v = obj[key];
      if (typeof v === 'string') haystacks.push(v);
    }
    const falReqs = obj.fal_requests;
    if (Array.isArray(falReqs)) {
      for (const req of falReqs) {
        if (req && typeof req === 'object' && typeof (req as { outputUrl?: string }).outputUrl === 'string') {
          haystacks.push((req as { outputUrl: string }).outputUrl);
        }
      }
    }
  }

  return haystacks.some((h) => normalizeMediaUrlForMatch(h) === needle);
}
