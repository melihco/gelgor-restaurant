/**
 * Recent brief drafts — reuse prior New Brief form values.
 * Sources: localStorage (visual + saved submits) and Nexus API briefs.
 */
import type { Brief } from '@/types';

export type BriefOutputType = 'story' | 'reel' | 'post' | 'caption' | 'ad' | 'report';
export type BriefPriority = 'normal' | 'high' | 'urgent';

export interface RecentBriefDraft {
  id: string;
  title: string;
  extraDirection: string;
  outputType?: BriefOutputType | null;
  count?: string;
  campaign?: string;
  priority?: BriefPriority;
  photoUrls?: string[];
  savedAt: string;
  source: 'local' | 'api';
}

const STORAGE_PREFIX = 'smart-agency:recent-brief-drafts:';
const MAX_LOCAL = 24;
const OUTPUT_TYPES = new Set<BriefOutputType>(['story', 'reel', 'post', 'caption', 'ad', 'report']);
const PRIORITIES = new Set<BriefPriority>(['normal', 'high', 'urgent']);

function storageKey(workspaceId: string) {
  return `${STORAGE_PREFIX}${workspaceId}`;
}

function parseOutputType(raw: string | undefined): BriefOutputType | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return OUTPUT_TYPES.has(v as BriefOutputType) ? (v as BriefOutputType) : null;
}

function parsePriority(raw: string | undefined): BriefPriority | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  return PRIORITIES.has(v as BriefPriority) ? (v as BriefPriority) : undefined;
}

/** Reverse `NewBrief.buildDescription()` into form fields. */
export function parseBriefDescription(description: string): {
  outputType?: BriefOutputType | null;
  count?: string;
  campaign?: string;
  priority?: BriefPriority;
  extraDirection: string;
  photoUrls: string[];
} {
  const raw = description ?? '';
  const outputMatch = raw.match(/^Çıktı tipi:\s*(.+)$/m);
  const countMatch = raw.match(/^Adet:\s*(.+)$/m);
  const campaignMatch = raw.match(/^Kampanya:\s*(.+)$/m);
  const priorityMatch = raw.match(/^Öncelik:\s*(.+)$/m);

  const photoSplit = raw.split(/\n📷 Fotoğraflar:\n/i);
  const bodyBeforePhotos = photoSplit[0] ?? raw;
  const photoUrls = (photoSplit[1] ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('http') || l.startsWith('/api/'));

  const structuredLine = /^(Çıktı tipi|Adet|Kampanya|Öncelik):/m;
  const extraDirection = bodyBeforePhotos
    .split('\n')
    .filter((line) => !structuredLine.test(line.trim()))
    .join('\n')
    .trim();

  return {
    outputType: parseOutputType(outputMatch?.[1]),
    count: countMatch?.[1]?.trim(),
    campaign: campaignMatch?.[1]?.trim(),
    priority: parsePriority(priorityMatch?.[1]),
    extraDirection,
    photoUrls,
  };
}

export function briefToDraft(brief: Brief): RecentBriefDraft {
  const parsed = parseBriefDescription(brief.description ?? '');
  return {
    id: brief.id,
    title: brief.title,
    extraDirection: parsed.extraDirection || (brief.description ?? '').trim(),
    outputType: parsed.outputType,
    count: parsed.count,
    campaign: parsed.campaign,
    priority: parsed.priority,
    photoUrls: parsed.photoUrls.length > 0 ? parsed.photoUrls : undefined,
    savedAt: brief.updatedAt || brief.createdAt,
    source: 'api',
  };
}

export function loadRecentBriefDrafts(workspaceId: string): RecentBriefDraft[] {
  if (typeof window === 'undefined' || !workspaceId) return [];
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentBriefDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentBriefDraft(workspaceId: string, draft: Omit<RecentBriefDraft, 'source'>): void {
  if (typeof window === 'undefined' || !workspaceId || !draft.title.trim()) return;
  const entry: RecentBriefDraft = { ...draft, source: 'local' };
  const existing = loadRecentBriefDrafts(workspaceId).filter((d) => d.id !== entry.id);
  const deduped = existing.filter(
    (d) => !(d.title.trim().toLowerCase() === entry.title.trim().toLowerCase()
      && (d.extraDirection ?? '') === (entry.extraDirection ?? '')),
  );
  const next = [entry, ...deduped].slice(0, MAX_LOCAL);
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(next));
  } catch {
    /* quota — non-fatal */
  }
}

function draftKey(d: RecentBriefDraft): string {
  return `${d.title.trim().toLowerCase()}|${(d.extraDirection ?? '').slice(0, 80)}`;
}

/** Merge API briefs + local drafts, newest first, deduped by title+snippet. */
export function mergeRecentBriefDrafts(
  apiBriefs: Brief[],
  localDrafts: RecentBriefDraft[],
  limit = 15,
): RecentBriefDraft[] {
  const apiDrafts = apiBriefs.map(briefToDraft);
  const seen = new Set<string>();
  const merged: RecentBriefDraft[] = [];

  const sorted = [...localDrafts, ...apiDrafts].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );

  for (const draft of sorted) {
    const key = draftKey(draft);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(draft);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function formatBriefDraftAge(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  if (h < 48) return 'dün';
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function outputTypeLabel(type: BriefOutputType | null | undefined): string {
  switch (type) {
    case 'story': return 'Story';
    case 'reel': return 'Reel';
    case 'post': return 'Gönderi';
    case 'caption': return 'Caption';
    case 'ad': return 'Reklam';
    case 'report': return 'Rapor';
    default: return 'Brief';
  }
}
