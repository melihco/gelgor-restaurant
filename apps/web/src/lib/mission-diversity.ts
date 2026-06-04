/**
 * Mission diversity (Sprint 7).
 *
 * Measures how varied the recent/proposed mission set is (type + objective angle)
 * and produces a deterministic "diversity directive" the Strategist can use to
 * avoid repeating the same campaign shape. Keeps autonomous output from
 * collapsing into one format/angle.
 */

export interface DiversityMissionLike {
  type?: string | null;
  objective?: string | null;
  title?: string | null;
  status?: string;
}

export interface MissionDiversityResult {
  /** 0..100 — variety of the considered mission set. */
  score: number;
  uniqueTypes: string[];
  /** Short signatures of recent missions (type + objective keyword). */
  recentSignatures: string[];
}

const STOP = new Set([
  've', 'ile', 'için', 'bir', 'bu', 'the', 'a', 'an', 'of', 'for', 'and', 'to',
  'kampanya', 'kampanyası', 'içerik', 'mission', 'misyon',
]);

function objectiveKeyword(objective?: string | null, title?: string | null): string {
  const text = `${objective ?? ''} ${title ?? ''}`.toLowerCase();
  const word = text
    .split(/[^a-zçğıöşü0-9]+/i)
    .find((w) => w.length > 3 && !STOP.has(w));
  return word ?? '';
}

export function computeMissionDiversity(missions: DiversityMissionLike[]): MissionDiversityResult {
  const considered = missions.filter((m) => m.status !== 'rejected' && m.status !== 'cancelled');
  if (considered.length === 0) {
    return { score: 100, uniqueTypes: [], recentSignatures: [] };
  }
  const types = considered.map((m) => (m.type || 'manual').toLowerCase());
  const uniqueTypes = Array.from(new Set(types));
  const signatures = considered.map((m) => {
    const kw = objectiveKeyword(m.objective, m.title);
    return `${(m.type || 'manual').toLowerCase()}${kw ? `:${kw}` : ''}`;
  });
  const uniqueSignatures = new Set(signatures);

  // Variety = blend of distinct types and distinct signatures over the set.
  const typeVariety = uniqueTypes.length / considered.length;
  const sigVariety = uniqueSignatures.size / considered.length;
  const score = Math.round(((typeVariety + sigVariety) / 2) * 100);

  return {
    score,
    uniqueTypes,
    recentSignatures: Array.from(uniqueSignatures).slice(0, 12),
  };
}

/**
 * Build a deterministic directive telling the Strategist what was recently done
 * so it diversifies. Appended to the propose context block.
 */
export function buildDiversityDirective(missions: DiversityMissionLike[]): string {
  const recent = missions
    .filter((m) => m.status !== 'rejected' && m.status !== 'cancelled')
    .slice(0, 8);
  if (recent.length === 0) return '';
  const lines: string[] = [];
  lines.push('=== ÇEŞİTLİLİK DİREKTİFİ ===');
  lines.push('Son/aktif misyonlar (tekrarlamaktan kaçın, farklı format & stratejik açı seç):');
  for (const m of recent) {
    const obj = (m.objective || m.title || '').slice(0, 70);
    lines.push(`- [${m.type ?? 'manual'}] ${obj}`);
  }
  lines.push('Yeni öneriler bu açılardan FARKLI olmalı; format ve içerik türünü çeşitlendir.');
  return lines.join('\n');
}
