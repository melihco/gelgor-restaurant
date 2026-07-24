/**
 * publishReady SSOT — produced ≠ feed-ready.
 *
 * Single decision for:
 * - auto-produce `publishReady` counts / metadata stamps
 * - Akış feed filters (`weekly-publish-package`)
 *
 * Multi-tenant: driven by pipeline/role/quality meta — never brand UUIDs.
 */

import { buildProductionQualityScorecard } from '@/lib/production-quality-scorecard';
import { GALLERY_THEME_MISMATCH_CODE } from '@/lib/production-slot-failures';
import type { OutputArtifact } from '@/types';

export type PublishReadyBlockCode =
  | 'ready'
  | 'publish_blocked'
  | 'quality_hard_block'
  | 'gallery_theme_mismatch'
  | 'designed_visual_required'
  | 'reel_video_required'
  | 'bundle_failed'
  | 'not_ready';

export type PublishReadyDecision = {
  ready: boolean;
  /** Hide from customer Akış when true. */
  blockFeed: boolean;
  reason: string | null;
  code: PublishReadyBlockCode;
};

function readPipelineRole(meta: Record<string, unknown>, content: Record<string, unknown>): {
  pipeline: string;
  role: string;
} {
  return {
    pipeline: String(meta.pipeline ?? content.pipeline ?? '').trim().toLowerCase(),
    role: String(meta.production_role ?? content.production_role ?? '').trim().toLowerCase(),
  };
}

/** Pipelines that must not show a raw gallery still as the final feed card. */
export function isDesignedVisualPipeline(pipeline: string, role: string): boolean {
  const p = pipeline.toLowerCase();
  const r = role.toLowerCase();
  if (
    p.includes('fal_design')
    || p === 'fal_only'
    || p === 'fal_only_post'
    || p === 'fal_only_story'
    || p === 'fal_only_reel'
    || p === 'designed_grafiker'
  ) {
    return true;
  }
  if (
    r === 'fal_designed_post'
    || r === 'designed_post'
    || r === 'designed_typography'
    || r === 'fal_only_post'
    || r === 'fal_only_story'
    || r.includes('designed')
  ) {
    return true;
  }
  return false;
}

function hasDesignedOrAgencyVisual(meta: Record<string, unknown>): boolean {
  if (meta.fal_designer_produced === true) return true;
  if (meta.fal_only === true) return true;
  if (meta.fal_video_produced === true) return true;
  if (meta.designed_poster_sync === true) return true;
  // Legacy designed posts often stamp grafiker_pass without fal_designer_produced.
  if (meta.grafiker_pass === true) return true;
  if (meta.agency_produced === true && meta.renderer_executed !== 'gallery_raw') return true;
  const route = String(meta.production_route ?? '').toLowerCase();
  if (route === 'fal_ai' || route === 'fal_only' || route === 'designed_grafiker') {
    return meta.fal_designer_produced === true
      || meta.fal_only === true
      || meta.designed_poster_sync === true
      || Boolean(meta.fal_design_engine);
  }
  return false;
}

function formatOf(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
  explicit?: string,
): string {
  if (explicit) return explicit.toLowerCase();
  return String(
    meta.contentType
    ?? content.contentType
    ?? meta.format
    ?? content.kind
    ?? '',
  ).toLowerCase().replace(/^instagram_/, '');
}

/**
 * Core publishReady decision from artifact meta/content (+ optional produce-time hints).
 */
export function resolveArtifactPublishReady(input: {
  meta?: Record<string, unknown> | null;
  content?: Record<string, unknown> | null;
  artifact?: OutputArtifact | null;
  /** Produce-time: designed poster / fal still / branded still ready. */
  designedVisualReady?: boolean;
  /** Produce-time: tenant profile requires designed visuals. */
  requireDesignedVisuals?: boolean;
  format?: string;
  hasPlayableVideo?: boolean;
}): PublishReadyDecision {
  const meta = { ...(input.meta ?? {}) };
  const content = { ...(input.content ?? {}) };
  const { pipeline, role } = readPipelineRole(meta, content);
  const fmt = formatOf(meta, content, input.format);

  if (meta.publish_blocked === true) {
    const stampedCode = String(meta.publish_block_code ?? '');
    // Produce-time used to stamp not_ready when bundleReadyNow=false even after
    // fal_designer_produced/fal_only — recompute those instead of permanently hiding.
    const staleNotReady =
      stampedCode === 'not_ready' && hasDesignedOrAgencyVisual(meta);
    if (!staleNotReady) {
      return {
        ready: false,
        blockFeed: true,
        reason: String(meta.publish_block_reason ?? 'Yayın engellendi'),
        code: 'publish_blocked',
      };
    }
  }

  const mismatch =
    meta.error_code === GALLERY_THEME_MISMATCH_CODE
    || meta.gallery_theme_mismatch === true
    || String(meta.last_error ?? meta.error ?? '').toLowerCase().includes('gallery_theme_mismatch')
    || String(meta.last_error ?? meta.error ?? '').includes('Caption–görsel');
  if (mismatch) {
    return {
      ready: false,
      blockFeed: true,
      reason: 'Caption–görsel tema çatışması',
      code: 'gallery_theme_mismatch',
    };
  }

  const stub = input.artifact ?? ({
    id: 'publish-ready',
    content: JSON.stringify(content),
    metadata: meta,
  } as OutputArtifact);
  const scorecard = buildProductionQualityScorecard(stub, meta);
  if (scorecard.hardBlock) {
    return {
      ready: false,
      blockFeed: true,
      reason: scorecard.hardBlockReason ?? 'Kalite kapısı',
      code: 'quality_hard_block',
    };
  }

  if (scorecard.bundleStatus === 'failed' && isDesignedVisualPipeline(pipeline, role)) {
    return {
      ready: false,
      blockFeed: true,
      reason: 'Üretim paketi başarısız',
      code: 'bundle_failed',
    };
  }

  const needsVideo = fmt === 'reel' || role.includes('reel') || pipeline.includes('reel');
  const hasVideo = input.hasPlayableVideo === true
    || Boolean(content.videoUrl || meta.videoUrl || meta.video_url);
  if (needsVideo && !hasVideo) {
    return {
      ready: false,
      blockFeed: true,
      reason: 'Reel için video gerekli',
      code: 'reel_video_required',
    };
  }

  const designedRequired =
    input.requireDesignedVisuals === true
    || isDesignedVisualPipeline(pipeline, role)
    || String(meta.production_route ?? '') === 'designed_grafiker';

  // designedVisualReady=false must NOT override fal_designer_produced / fal_only /
  // grafiker_pass already present on meta (bundleReadyNow is a weaker signal).
  const designedReady = input.designedVisualReady === true || hasDesignedOrAgencyVisual(meta);
  if (designedRequired && !designedReady) {
    return {
      ready: false,
      blockFeed: true,
      reason: input.designedVisualReady === false
        ? 'Tasarım henüz hazır değil'
        : 'Tasarlanmış görsel gerekli — ham galeri feed’e düşmez',
      code: input.designedVisualReady === false ? 'not_ready' : 'designed_visual_required',
    };
  }

  return {
    ready: true,
    blockFeed: false,
    reason: null,
    code: 'ready',
  };
}

export function resolveArtifactPublishReadyFromArtifact(
  artifact: OutputArtifact,
): PublishReadyDecision {
  let content: Record<string, unknown> = {};
  let meta: Record<string, unknown> = {};
  try {
    content = typeof artifact.content === 'string'
      ? (JSON.parse(artifact.content || '{}') as Record<string, unknown>)
      : ((artifact.content as Record<string, unknown>) ?? {});
  } catch {
    content = {};
  }
  meta = (artifact.metadata && typeof artifact.metadata === 'object')
    ? (artifact.metadata as Record<string, unknown>)
    : {};
  return resolveArtifactPublishReady({ artifact, meta, content });
}

/** Stamp produce-time metadata so feed filters stay aligned with the run. */
export function stampPublishReadyMetadata(
  meta: Record<string, unknown>,
  decision: PublishReadyDecision,
): Record<string, unknown> {
  const next = { ...meta };
  next.publish_ready = decision.ready;
  if (decision.blockFeed) {
    next.publish_blocked = true;
    next.publish_block_reason = decision.reason;
    next.publish_block_code = decision.code;
  } else {
    next.publish_blocked = false;
    delete next.publish_block_reason;
    delete next.publish_block_code;
  }
  return next;
}
