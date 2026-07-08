/**
 * Shared helper for Next.js BFF routes that proxy to the Python crew backend.
 * All routes that call Python's /api/v1/* endpoints use this to avoid duplication.
 *
 * Tenant safety: workspaceId is auto-extracted from the proxied path (UUID pattern)
 * and forwarded as X-Tenant-Id header. Python backend's verify_workspace_access
 * dependency enforces that the header matches the URL workspaceId, preventing IDOR.
 */

import { NextResponse } from 'next/server';
import { getCrewBackendBaseUrl } from '@/lib/crew-backend-url';
import { serverConfig } from '@/lib/server-config';

const CREW_BACKEND = getCrewBackendBaseUrl();
const INTERNAL_KEY = serverConfig.internal.apiKey;

// Matches a workspace UUID in the path, e.g.
// /api/v1/brand-context/fa91b75d-0392-48e9-8cd8-2406a9d2042f/analyze
const WORKSPACE_UUID_RE = /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

function extractWorkspaceId(path: string): string | null {
  const m = path.match(WORKSPACE_UUID_RE);
  return m?.[1] ?? null;
}

export interface ProxyOptions {
  body?: unknown;
  timeoutMs?: number;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Override or extend headers forwarded to the upstream backend. */
  headers?: Record<string, string>;
  /** Explicit workspaceId (skips auto-extraction). Useful when path has no UUID. */
  workspaceId?: string;
  /**
   * Correlation id to forward to the Python backend as X-Correlation-Id.
   * Pass the inbound request's header to stitch browser → Next → Python traces;
   * when omitted a fresh id is generated so the backend always logs/echoes one.
   */
  correlationId?: string;
}

function generateCorrelationId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `cid-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Resolves the correlation id to forward to Python. Prefers an explicit value,
 * then the inbound request's X-Correlation-Id (read via next/headers so no BFF
 * route needs to thread it manually), and finally a freshly generated id.
 */
async function resolveCorrelationId(explicit?: string): Promise<string> {
  if (explicit && explicit.trim()) return explicit.trim();
  try {
    const { headers } = await import('next/headers');
    const inbound = (await headers()).get('x-correlation-id');
    if (inbound && inbound.trim()) return inbound.trim();
  } catch {
    // Not in a request scope (e.g. background job) — fall through to a fresh id.
  }
  return generateCorrelationId();
}

export interface CrewBackendResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/**
 * Like {@link proxyToCrewBackend} but returns parsed JSON instead of a NextResponse.
 * Use this when a BFF route needs to compose several Python responses
 * (e.g. brand readiness aggregates brand-context + gallery-analysis + theme).
 * Never throws — failures resolve to `{ ok: false, data: null }`.
 */
export async function fetchCrewBackendJson<T = unknown>(
  path: string,
  options: ProxyOptions = {},
): Promise<CrewBackendResult<T>> {
  const { body, timeoutMs = 15_000, method, headers: extraHeaders, workspaceId, correlationId } = options;
  const url = `${CREW_BACKEND}${path}`;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  headers['X-Internal-Api-Key'] = INTERNAL_KEY;
  headers['X-Correlation-Id'] = await resolveCorrelationId(correlationId);

  const tenantId = workspaceId ?? extractWorkspaceId(path);
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  if (extraHeaders) Object.assign(headers, extraHeaders);

  try {
    const upstream = await fetch(url, {
      method: method ?? (body !== undefined ? 'POST' : 'GET'),
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await upstream.json().catch(() => null)) as T | null;
    if (!upstream.ok) {
      return { ok: false, status: upstream.status, data, error: 'upstream_error' };
    }
    return { ok: true, status: upstream.status, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 503, data: null, error: message };
  }
}

export async function proxyToCrewBackend(
  path: string,
  options: ProxyOptions = {},
): Promise<NextResponse> {
  const { body, timeoutMs = 15_000, method, headers: extraHeaders, workspaceId, correlationId } = options;
  const url = `${CREW_BACKEND}${path}`;

  // Compose headers — JSON body + tenant context + internal key + correlation.
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  headers['X-Internal-Api-Key'] = INTERNAL_KEY;
  headers['X-Correlation-Id'] = await resolveCorrelationId(correlationId);

  const tenantId = workspaceId ?? extractWorkspaceId(path);
  if (tenantId) headers['X-Tenant-Id'] = tenantId;

  if (extraHeaders) Object.assign(headers, extraHeaders);

  try {
    const upstream = await fetch(url, {
      method: method ?? (body !== undefined ? 'POST' : 'GET'),
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const data = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.detail || data?.error || 'Python backend error', detail: data },
        { status: upstream.status },
      );
    }

    if (upstream.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: 'crew_backend_unreachable',
        message: `Could not reach the brand analysis service: ${message}`,
        hint: 'Make sure the Python crew backend is running (./scripts/start-crew-backend.sh)',
      },
      { status: 503 },
    );
  }
}
