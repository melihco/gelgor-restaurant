/**
 * In-process auto-produce locks (single Node instance).
 * Shared so reproduce-feed can clear stale locks before retrying.
 */
const _workspaceProductionLock = new Map<string, number>();
const _missionProductionLock = new Map<string, number>();
const PRODUCTION_LOCK_TTL_MS = 12 * 60 * 1000;

export function acquireProductionLock(workspaceId: string): boolean {
  const now = Date.now();
  const expiresAt = _workspaceProductionLock.get(workspaceId);
  if (expiresAt != null && expiresAt > now) return false;
  _workspaceProductionLock.set(workspaceId, now + PRODUCTION_LOCK_TTL_MS);
  return true;
}

export function acquireMissionProductionLock(missionId: string): boolean {
  const now = Date.now();
  const expiresAt = _missionProductionLock.get(missionId);
  if (expiresAt != null && expiresAt > now) return false;
  _missionProductionLock.set(missionId, now + PRODUCTION_LOCK_TTL_MS);
  return true;
}

export function releaseProductionLock(workspaceId: string): void {
  _workspaceProductionLock.delete(workspaceId);
}

export function releaseMissionProductionLock(missionId: string): void {
  _missionProductionLock.delete(missionId);
}

export function releaseAllProductionLocks(workspaceId: string, missionId?: string | null): void {
  releaseProductionLock(workspaceId);
  if (missionId) releaseMissionProductionLock(missionId);
}
