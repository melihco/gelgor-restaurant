/**
 * APO-8 — Reddedilen tasarım postlarından layout family rotasyonu.
 */
import type { RemotionLayoutFamily } from './remotion-template-types';
import { LAYOUT_FAMILY_IDS } from './creative-director-routing';

function parseJsonRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isRejectedArtifact(artifact: Record<string, unknown>): boolean {
  const status = String(artifact.status ?? '').toLowerCase();
  if (status === 'rejected') return true;
  const review = String(artifact.reviewStatus ?? artifact.ReviewStatus ?? '').toLowerCase();
  return review === '2' || review === 'rejected' || review === '3' || review.includes('revision');
}

function layoutFamilyFromArtifact(artifact: Record<string, unknown>): RemotionLayoutFamily | null {
  const meta = parseJsonRecord(artifact.metadata ?? artifact.Metadata);
  const trace = parseJsonRecord(meta.creative_trace);
  const raw = String(
    meta.layout_family_hint
    ?? trace.layout_family_hint
    ?? meta.remotion_layout_family
    ?? '',
  ).trim();
  if (LAYOUT_FAMILY_IDS.includes(raw as RemotionLayoutFamily)) {
    return raw as RemotionLayoutFamily;
  }
  return null;
}

/** Son reddedilen designed/remotion artifact'lardan kaçınılmaması gereken layout'lar. */
export function collectRejectedLayoutFamilies(
  artifacts: Record<string, unknown>[],
  opts?: { maxAgeDays?: number },
): RemotionLayoutFamily[] {
  const maxAgeMs = (opts?.maxAgeDays ?? 45) * 86_400_000;
  const cutoff = Date.now() - maxAgeMs;
  const blocked = new Set<RemotionLayoutFamily>();

  for (const artifact of artifacts) {
    if (!isRejectedArtifact(artifact)) continue;
    const meta = parseJsonRecord(artifact.metadata ?? artifact.Metadata);
    const role = String(meta.production_role ?? '');
    const pipeline = String(meta.pipeline ?? '');
    const designed = role === 'designed_post' || pipeline === 'remotion_poster' || meta.ad_creative === true;
    if (!designed) continue;

    const created = String(artifact.createdAt ?? artifact.CreatedAt ?? '');
    if (created) {
      const ts = Date.parse(created);
      if (Number.isFinite(ts) && ts < cutoff) continue;
    }

    const family = layoutFamilyFromArtifact(artifact);
    if (family) blocked.add(family);
  }

  return [...blocked];
}

export async function fetchRejectedLayoutFamilies(
  workspaceId: string,
  nexusApi = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, ''),
  internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key',
): Promise<RemotionLayoutFamily[]> {
  try {
    const res = await fetch(`${nexusApi}/api/artifacts?limit=120`, {
      headers: {
        'X-Tenant-Id': workspaceId,
        'X-Internal-Api-Key': internalKey,
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const artifacts = (await res.json()) as Record<string, unknown>[];
    return collectRejectedLayoutFamilies(Array.isArray(artifacts) ? artifacts : []);
  } catch {
    return [];
  }
}
