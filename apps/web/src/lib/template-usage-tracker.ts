/**
 * Tracks recently used template IDs per tenant (Remotion, announcement SVG, Canva).
 * Mirrors gallery-usage-tracker — rotation için Nexus artifact metadata okunur.
 */

const MAX_RECENT = 40;

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

function isRejectedReviewStatus(status: unknown): boolean {
  const s = String(status ?? '').toLowerCase();
  return s === '2' || s === 'rejected' || s === '3' || s.includes('revision');
}

function pushId(set: Set<string>, value: unknown): void {
  if (typeof value !== 'string' || !value.trim()) return;
  set.add(value.trim());
}

/** Extract template IDs from a production artifact. */
export function extractTemplateIdsFromArtifact(artifact: Record<string, unknown>): string[] {
  if (isRejectedReviewStatus(artifact.reviewStatus ?? artifact.ReviewStatus)) return [];

  const meta = parseJsonRecord(artifact.metadata ?? artifact.Metadata);
  const content = parseJsonRecord(artifact.content ?? artifact.Content);
  const ids = new Set<string>();

  for (const key of [
    'storyTemplateId', 'story_template_id',
    'templateId', 'template_id',
    'posterTemplateId', 'poster_template_id',
    'announcementTemplateId', 'announcement_template_id',
    'canvaTemplateId', 'canva_template_id',
  ]) {
    pushId(ids, meta[key]);
    pushId(ids, content[key]);
  }

  const bundle = parseJsonRecord(meta.productionBundle ?? content.productionBundle);
  pushId(ids, bundle.storyTemplateId);
  pushId(ids, bundle.templateId);

  return [...ids];
}

export function buildRecentTemplateIds(artifacts: Record<string, unknown>[]): string[] {
  const recent: string[] = [];
  const seen = new Set<string>();

  for (const artifact of artifacts) {
    for (const id of extractTemplateIdsFromArtifact(artifact)) {
      if (seen.has(id)) continue;
      seen.add(id);
      recent.push(id);
      if (recent.length >= MAX_RECENT) return recent;
    }
  }
  return recent;
}

/** Extract catalog_slot_key from a production artifact (brand design hard-pin trail). */
export function extractCatalogSlotKeysFromArtifact(artifact: Record<string, unknown>): string[] {
  if (isRejectedReviewStatus(artifact.reviewStatus ?? artifact.ReviewStatus)) return [];

  const meta = parseJsonRecord(artifact.metadata ?? artifact.Metadata);
  const content = parseJsonRecord(artifact.content ?? artifact.Content);
  const keys = new Set<string>();

  for (const key of [
    'catalogSlotKey', 'catalog_slot_key',
    'catalogKey', 'catalog_key',
  ]) {
    pushId(keys, meta[key]);
    pushId(keys, content[key]);
  }

  const bundle = parseJsonRecord(meta.productionBundle ?? content.productionBundle);
  pushId(keys, bundle.catalogSlotKey);
  pushId(keys, bundle.catalog_slot_key);

  const assignment = parseJsonRecord(meta.assignment ?? content.assignment);
  pushId(keys, assignment.catalog_slot_key);
  pushId(keys, assignment.catalogSlotKey);

  return [...keys];
}

export function buildRecentCatalogSlotKeys(artifacts: Record<string, unknown>[]): string[] {
  const recent: string[] = [];
  const seen = new Set<string>();

  for (const artifact of artifacts) {
    for (const key of extractCatalogSlotKeysFromArtifact(artifact)) {
      if (seen.has(key)) continue;
      seen.add(key);
      recent.push(key);
      if (recent.length >= MAX_RECENT) return recent;
    }
  }
  return recent;
}

export async function fetchRecentCatalogSlotKeys(
  workspaceId: string,
  nexusApi = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, ''),
  internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key',
): Promise<string[]> {
  try {
    const res = await fetch(`${nexusApi}/api/artifacts`, {
      headers: {
        'X-Tenant-Id': workspaceId,
        'X-Internal-Api-Key': internalKey,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const artifacts = (await res.json()) as Record<string, unknown>[];
    return buildRecentCatalogSlotKeys(Array.isArray(artifacts) ? artifacts : []);
  } catch {
    return [];
  }
}

export async function fetchRecentTemplateIds(
  workspaceId: string,
  nexusApi = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, ''),
  internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key',
): Promise<string[]> {
  try {
    const res = await fetch(`${nexusApi}/api/artifacts`, {
      headers: {
        'X-Tenant-Id': workspaceId,
        'X-Internal-Api-Key': internalKey,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const artifacts = (await res.json()) as Record<string, unknown>[];
    return buildRecentTemplateIds(Array.isArray(artifacts) ? artifacts : []);
  } catch {
    return [];
  }
}
