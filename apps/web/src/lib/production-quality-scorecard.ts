/**
 * Sprint 3 — normalized production quality scorecard.
 * Combines PIS, Feed Director, Grafiker, gallery match, bundle render state.
 */
import { classifyMatch, type MatchQuality, resolveArtifactMatchScore } from '@/lib/gallery-photo-matcher';
import { getProductionBundleStatus, type ProductionBundleStatus } from '@/lib/production-bundle';
import { GRAFIKER_HARD_FLOOR, GRAFIKER_PASS_THRESHOLD } from '@/lib/grafiker-quality';
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

function readBoolean(meta: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const raw = meta[key];
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  }
  return null;
}

export function buildProductionQualityScorecard(
  artifact: OutputArtifact,
  meta: Record<string, unknown>,
): ProductionQualityScorecard {
  const matchScore = resolveArtifactMatchScore(meta);
  const matchCls = matchScore != null ? classifyMatch(matchScore) : null;
  const grafikerScore = readNumber(
    meta,
    'grafiker_score',
    'grafikerScore',
    'grafiker_observed_score',
    'grafikerObservedScore',
  );
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

  const typographyTextValid = readBoolean(
    meta,
    'typography_text_valid',
    'typographyTextValid',
  );

  // The vision reviewer could not fetch the frames it was asked to judge until
  // 943649c, so almost nothing carried a score and this gate was silently off.
  // With scores flowing, blocking at the pass threshold withheld 61% of output
  // against 11% before — and the frames it withheld were not broken: a clean
  // Gel Gör story with legible type and no clipping scored 5 while an equally
  // clean post scored 9. The scorer cannot yet carry a publish decision at 8.
  //
  // So the threshold is a warning and the hard floor is the block: a 5/10 is an
  // opinion worth surfacing, a score at or below the floor is a broken render.
  // Raising this back to the pass threshold needs the scorer's agreement with
  // human review measured first.
  if (!hardBlock && grafikerScore != null && grafikerScore <= GRAFIKER_HARD_FLOOR) {
    const galleryCarousel = String(meta.pipeline ?? '').toLowerCase() === 'carousel_gallery'
      && String(meta.production_role ?? '').toLowerCase() === 'organic_carousel'
      && meta.fal_designer_produced !== true;
    if (galleryCarousel) {
      softWarnings.push('Carousel henüz kapak tasarımı olmadan galeri slaytları');
    } else {
      hardBlock = true;
      hardBlockReason = 'Tasarım kalitesi onay için yeterli değil';
    }
  }

  if (
    !hardBlock
    && grafikerScore != null
    && grafikerScore < GRAFIKER_PASS_THRESHOLD
    && grafikerPass !== true
  ) {
    softWarnings.push(`Tasarım denetimi ${grafikerScore}/10 — gözden geçirin`);
  }

  // `text_validated` = did a checker look at the painted line.
  // `false` means it did not run — not that the line is invalid.
  // `typography_text_valid` is the verdict. On gallery / premium routes it
  // often just mirrors Grafiker pass; blocking on that reimposes threshold 8.
  const textValidatorRan = readBoolean(meta, 'text_validated', 'textValidated') === true;
  if (!hardBlock && typographyTextValid === false) {
    if (textValidatorRan || grafikerScore == null) {
      hardBlock = true;
      hardBlockReason = 'Görseldeki metin doğrulanamadı veya yarım kaldı';
    } else {
      softWarnings.push('Görseldeki metin doğrulanmadı');
    }
  }

  if (!hardBlock && matchCls?.quality === 'weak' && (matchScore ?? 0) > 5) {
    softWarnings.push('Galeri fotoğrafı konuyla zayıf eşleşiyor');
  }

  const houseFidelity = readNumber(meta, 'house_fidelity_score', 'houseFidelityScore');
  const houseWarn = readBoolean(meta, 'house_fidelity_warn', 'houseFidelityWarn');
  if (!hardBlock && (houseWarn === true || (houseFidelity != null && houseFidelity < 7))) {
    softWarnings.push(
      houseFidelity != null
        ? `Ev dili sapması ${houseFidelity}/10 — font / palet / compose`
        : 'Ev dili sapması — font / palet / compose',
    );
  }

  if (bundleStatus === 'failed') {
    softWarnings.push('Üretim hatası — yeniden üretmeyi deneyin');
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
