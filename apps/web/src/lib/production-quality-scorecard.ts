/**
 * Sprint 3 — normalized production quality scorecard.
 * Combines PIS, Feed Director, Grafiker, gallery match, bundle render state.
 */
import { classifyMatch, type MatchQuality, resolveArtifactMatchScore } from '@/lib/gallery-photo-matcher';
import { getProductionBundleStatus, type ProductionBundleStatus } from '@/lib/production-bundle';
import { GRAFIKER_PASS_THRESHOLD } from '@/lib/remotion-quality';
import type { OutputArtifact } from '@/types';

export type QualitySignalLevel = 'ok' | 'warn' | 'block';

export interface ProductionQualityScorecard {
  overall: QualitySignalLevel;
  hardBlock: boolean;
  hardBlockReason: string | null;
  softWarnings: string[];
  matchScore: number | null;
  matchQuality: MatchQuality | null;
  grafikerScore: number | null;
  grafikerPass: boolean | null;
  bundleStatus: ProductionBundleStatus | null;
  pisScore: number | null;
  feedDirectorScore: number | null;
  publishability: 'ready' | 'rendering' | 'failed' | 'unknown';
}

function readNumber(meta: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const raw = meta[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function buildProductionQualityScorecard(
  artifact: OutputArtifact,
  meta: Record<string, unknown>,
): ProductionQualityScorecard {
  const matchScore = resolveArtifactMatchScore(meta);
  const matchCls = matchScore != null ? classifyMatch(matchScore) : null;
  const grafikerScore = readNumber(meta, 'grafiker_score', 'grafikerScore');
  const grafikerPassRaw = meta.grafiker_pass ?? meta.grafikerPass;
  const grafikerPass = typeof grafikerPassRaw === 'boolean' ? grafikerPassRaw : null;
  const bundleStatus = getProductionBundleStatus(artifact);
  const pisScore = readNumber(
    meta,
    'production_pis',
    'productionPis',
    'pis_score',
    'pisScore',
  );
  const feedDirectorScore = readNumber(
    meta,
    'feed_director_score',
    'feedDirectorScore',
    'feed_score',
    'feedScore',
  );

  const softWarnings: string[] = [];
  let hardBlock = false;
  let hardBlockReason: string | null = null;

  if (matchCls?.quality === 'rejected') {
    hardBlock = true;
    hardBlockReason = 'Fotoğraf içerikle eşleşmiyor';
  }

  if (
    !hardBlock
    && (
      grafikerPass === false
      || (grafikerScore != null && grafikerScore < GRAFIKER_PASS_THRESHOLD && grafikerPass !== true)
    )
  ) {
    softWarnings.push(
      `Grafiker ${grafikerScore ?? '—'}/${GRAFIKER_PASS_THRESHOLD} — tasarım kalitesi düşük`,
    );
  }

  if (!hardBlock && matchCls?.quality === 'weak' && (matchScore ?? 0) > 5) {
    softWarnings.push('Galeri fotoğrafı konuyla zayıf eşleşiyor');
  }

  if (bundleStatus === 'failed') {
    softWarnings.push('Üretim hatası — yeniden render önerilir');
  }

  // PIS is surfaced in Mission Hub aggregate alerts — not approval soft-gate
  // (preserves pre-Sprint-3 approval friction).

  let publishability: ProductionQualityScorecard['publishability'] = 'unknown';
  if (bundleStatus === 'ready') publishability = 'ready';
  else if (bundleStatus === 'rendering') publishability = 'rendering';
  else if (bundleStatus === 'failed') publishability = 'failed';

  const overall: QualitySignalLevel = hardBlock
    ? 'block'
    : softWarnings.length > 0
      ? 'warn'
      : 'ok';

  return {
    overall,
    hardBlock,
    hardBlockReason,
    softWarnings,
    matchScore,
    matchQuality: matchCls?.quality ?? null,
    grafikerScore,
    grafikerPass,
    bundleStatus,
    pisScore,
    feedDirectorScore,
    publishability,
  };
}
