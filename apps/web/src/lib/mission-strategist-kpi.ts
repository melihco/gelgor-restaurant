/**
 * Strategist KPI — unique headlines / unique photos / template coverage
 * for Mission Hub production transparency strip.
 */

import type { OutputArtifact } from '@/types';
import { parseArtifactMissionId } from '@/lib/mission-feed-package';
import {
  extractGalleryUrlsFromArtifact,
  normalizeGalleryUrl,
} from '@/lib/gallery-usage-tracker';
import { extractTemplateIdsFromArtifact } from '@/lib/template-usage-tracker';
import { strategistHeadlineKey } from '@/lib/production-pipeline-router';
import { MISSION_WEEKLY_PACKAGE_COUNTS } from '@/lib/mission-production-manifest';
import { extractHeadlineFromArtifactRecord } from '@/lib/mission-headline-history';

export interface MissionStrategistKpiSummary {
  /** Distinct normalized headlines among mission artifacts. */
  uniqueHeadlines: number;
  /** Total auto-produced artifacts counted. */
  totalArtifacts: number;
  /** Distinct gallery source URLs (non-generated). */
  uniquePhotos: number;
  /** Distinct template IDs used. */
  uniqueTemplates: number;
  /** Manifest slot target for template coverage %. */
  manifestTarget: number;
  /** uniqueTemplates / manifestTarget capped at 1. */
  templateCoverageRatio: number;
}

function isProductionArtifact(artifact: OutputArtifact): boolean {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  return meta.auto_produced === true
    || meta.production_bundle === true
    || Boolean(meta.production_role)
    || meta.source === 'auto-produce';
}

export function summarizeMissionStrategistKpi(input: {
  artifacts: OutputArtifact[];
  missionId: string;
  manifestTarget?: number;
}): MissionStrategistKpiSummary {
  const manifestTarget = input.manifestTarget ?? MISSION_WEEKLY_PACKAGE_COUNTS.total;
  const missionArtifacts = input.artifacts.filter((a) => {
    if (parseArtifactMissionId(a) !== input.missionId) return false;
    return isProductionArtifact(a);
  });

  const headlineKeys = new Set<string>();
  const photoUrls = new Set<string>();
  const templateIds = new Set<string>();

  for (const artifact of missionArtifacts) {
    const rec = artifact as unknown as Record<string, unknown>;
    const headline = extractHeadlineFromArtifactRecord(rec);
    const key = strategistHeadlineKey({ headline });
    if (key) headlineKeys.add(key);

    const gallery = extractGalleryUrlsFromArtifact(rec);
    if (gallery) {
      for (const url of gallery.urls) {
        photoUrls.add(normalizeGalleryUrl(url));
      }
    }

    for (const id of extractTemplateIdsFromArtifact(rec)) {
      templateIds.add(id);
    }
  }

  const uniqueTemplates = templateIds.size;
  const templateCoverageRatio = manifestTarget > 0
    ? Math.min(1, uniqueTemplates / manifestTarget)
    : 0;

  return {
    uniqueHeadlines: headlineKeys.size,
    totalArtifacts: missionArtifacts.length,
    uniquePhotos: photoUrls.size,
    uniqueTemplates,
    manifestTarget,
    templateCoverageRatio,
  };
}
