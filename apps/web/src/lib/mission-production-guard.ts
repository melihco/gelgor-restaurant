/**
 * Prevents duplicate mission auto-produce runs that burn API credits.
 */
import {
  buildIdeaProductionDedupeKey,
  getProductionDedupeKey,
  parseArtifactMissionId,
} from '@/lib/production-bundle';
import { buildMissionSlotChecklist } from '@/lib/mission-slot-checklist';
import { MISSION_WEEKLY_PACKAGE_COUNTS } from '@/lib/mission-production-manifest';
import { filterFeedPublishableArtifacts } from '@/lib/weekly-publish-package';
import type { OutputArtifact } from '@/types';

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');

function parseArtifactMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

async function fetchMissionArtifacts(
  workspaceId: string,
  missionId: string,
): Promise<OutputArtifact[]> {
  try {
    const res = await fetch(`${NEXUS_API}/api/artifacts?limit=200`, {
      headers: { 'X-Tenant-Id': workspaceId },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as OutputArtifact[] | { items?: OutputArtifact[] };
    const list = Array.isArray(data) ? data : (data.items ?? []);
    return list
      .map((a) => {
        const meta = parseArtifactMetadata(a.metadata);
        return (meta === a.metadata ? a : { ...a, metadata: meta }) as OutputArtifact;
      })
      .filter((a) => parseArtifactMissionId(a) === missionId);
  } catch {
    return [];
  }
}

export async function countMissionAutoArtifacts(
  workspaceId: string,
  missionId: string,
): Promise<number> {
  const list = await fetchMissionArtifacts(workspaceId, missionId);
  return list.filter((a) => {
    const meta = parseArtifactMetadata(a.metadata);
    return meta.auto_produced === true || meta.source === 'auto-produce';
  }).length;
}

/** Feed-ready artifacts for a mission (strict publish gate). */
export async function countMissionPublishReadyArtifacts(
  workspaceId: string,
  missionId: string,
): Promise<number> {
  const list = await fetchMissionArtifacts(workspaceId, missionId);
  return filterFeedPublishableArtifacts(list).length;
}

/** Skip expensive re-runs when the full weekly package is already in Feed. */
export const MISSION_REPRODUCE_ARTIFACT_THRESHOLD = MISSION_WEEKLY_PACKAGE_COUNTS.total;

export interface MissionManifestProductionStatus {
  complete: boolean;
  readyRequired: number;
  requiredTotal: number;
  publishReady: number;
  failedCount: number;
  renderingCount: number;
}

/** Manifest slot checklist — reproduce skip için (yalnızca publish-ready sayısı yeterli değil). */
export async function loadMissionManifestProductionStatus(
  workspaceId: string,
  missionId: string,
  opts?: {
    missionType?: string;
    missionTitle?: string | null;
    assignments?: unknown;
  },
): Promise<MissionManifestProductionStatus> {
  const list = await fetchMissionArtifacts(workspaceId, missionId);
  const checklist = buildMissionSlotChecklist({
    missionId,
    missionType: opts?.missionType,
    missionTitle: opts?.missionTitle,
    assignments: opts?.assignments,
    artifacts: list,
    missionInFlight: false,
  });
  const publishReady = filterFeedPublishableArtifacts(list).length;
  const requiredTotal = checklist.requiredTotal;
  const readyRequired = checklist.readyRequired;
  return {
    complete: requiredTotal > 0 && readyRequired >= requiredTotal,
    readyRequired,
    requiredTotal,
    publishReady,
    failedCount: checklist.failedCount,
    renderingCount: checklist.renderingCount,
  };
}

const FEED_PRODUCTION_LOCK_TTL_MS = 15 * 60 * 1000;

/** Python task_graph_executor feed_production_lock — duplicate üretim önleme. */
export function isFeedProductionLockActive(
  performanceSummary: Record<string, unknown> | null | undefined,
): boolean {
  const lock = performanceSummary?.feed_production_lock as { at?: string } | undefined;
  const atRaw = String(lock?.at ?? '').trim();
  if (!atRaw) return false;
  const at = Date.parse(atRaw);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < FEED_PRODUCTION_LOCK_TTL_MS;
}

export async function loadMissionAutoArtifactDedupeKeys(
  workspaceId: string,
  missionId: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  try {
    const res = await fetch(`${NEXUS_API}/api/artifacts?limit=200`, {
      headers: { 'X-Tenant-Id': workspaceId },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return keys;
    const data = (await res.json()) as OutputArtifact[] | { items?: OutputArtifact[] };
    const list = Array.isArray(data) ? data : (data.items ?? []);
    for (const raw of list) {
      const meta = parseArtifactMetadata(raw.metadata);
      const artifact = (meta === raw.metadata ? raw : { ...raw, metadata: meta }) as OutputArtifact;
      if (parseArtifactMissionId(artifact) !== missionId) continue;
      if (meta.auto_produced !== true && meta.source !== 'auto-produce') continue;
      keys.add(getProductionDedupeKey(artifact));
    }
  } catch {
    /* best-effort */
  }
  return keys;
}

export { buildIdeaProductionDedupeKey };
