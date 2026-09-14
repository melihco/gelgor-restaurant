/**
 * publishReady SSOT — produced ≠ feed-ready.
 *
 * Single decision for:
 * - auto-produce `publishReady` counts / metadata stamps
 * - Akış feed filters (`weekly-publish-package`)
 *
 * Multi-tenant: driven by pipeline/role/quality meta — never brand UUIDs.
 */

import {
  buildProductionQualityScorecard,
  isBrokenGrafikerRender,
} from '@/lib/production-quality-scorecard';
import { GALLERY_THEME_MISMATCH_CODE } from '@/lib/production-slot-failures';
import {
  evaluateArtifactPublishCoherence,
  isPublishCoherenceBlock,
} from '@/lib/caption-design-post-coherence';
import { canRestageStampedPack } from '@/lib/caption-scene-fit';
import { isStampedFeedSlotPackVisible } from '@/lib/feed-slot-pack';
import type { OutputArtifact } from '@/types';

export type PublishReadyBlockCode =
  | 'ready'
  | 'publish_blocked'
  | 'quality_hard_block'
  | 'gallery_theme_mismatch'
  | 'caption_design_incoherent'
  | 'designed_visual_required'
  | 'reel_video_required'
  | 'bundle_failed'
  | 'not_ready'
  | 'incomplete_pack';

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
    || p === 'premium_editorial'
  ) {
    return true;
  }
  if (
    r === 'fal_designed_post'
    || r === 'designed_post'
    || r === 'designed_typography'
    || r === 'fal_only_post'
    || r === 'fal_only_story'
    || r === 'premium_editorial_campaign_post'
    || r === 'premium_editorial_campaign_story'
    || r.includes('designed')
    || r.includes('premium_editorial')
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
  // Premium Editorial Campaign — layered compose (may omit fal_designer_produced).
  if (meta.premium_composition === true) return true;
  const pipeline = String(meta.pipeline ?? '').toLowerCase();
  if (
    pipeline === 'premium_editorial'
    && (
      Boolean(meta.fal_design_engine)
      || Boolean(meta.final_composed_image_url)
      || meta.agency_produced === true
    )
  ) {
    return true;
  }
  if (meta.agency_produced === true && meta.renderer_executed !== 'gallery_raw') return true;
  const route = String(meta.production_route ?? '').toLowerCase();
  if (route === 'fal_ai' || route === 'fal_only' || route === 'designed_grafiker' || route === 'premium_editorial') {
    return meta.fal_designer_produced === true
      || meta.fal_only === true
      || meta.designed_poster_sync === true
      || meta.premium_composition === true
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
    // Quality stamps freeze the produce-time scorecard. Grafiker floor and
    // typography keys moved; a 9/10 post stayed hidden as "metin yarım".
    const recomputeQuality = stampedCode === 'quality_hard_block'
      || stampedCode === 'caption_design_incoherent'
      || stampedCode === 'gallery_theme_mismatch';
    if (!staleNotReady && !recomputeQuality) {
      return {
        ready: false,
        blockFeed: true,
        reason: String(meta.publish_block_reason ?? 'Yayın engellendi'),
        code: 'publish_blocked',
      };
    }
  }

  if (!isStampedFeedSlotPackVisible(meta)) {
    return {
      ready: false,
      blockFeed: true,
      reason: 'Paket yarım — vitrine düşmez',
      code: 'incomplete_pack',
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

  if (isBrokenGrafikerRender(meta)) {
    return {
      ready: false,
      blockFeed: true,
      reason: 'Tasarım kalitesi onay için yeterli değil',
      code: 'quality_hard_block',
    };
  }

  // Produce may have stamped publish_ready before the type gate was honest.
  // An explicit fail (clipped / unread / invented line) always hides the card.
  if (meta.typography_text_valid === false || meta.typographyTextValid === false) {
    return {
      ready: false,
      blockFeed: true,
      reason: 'Görseldeki metin doğrulanamadı veya yarım kaldı',
      code: 'quality_hard_block',
    };
  }

  // Produce already judged the pack. Akış only re-checks media + broken paint.
  const alreadyShipped = meta.publish_ready === true && meta.publish_blocked !== true;
  if (alreadyShipped) {
    return {
      ready: true,
      blockFeed: false,
      reason: null,
      code: 'ready',
    };
  }

  const mismatch =
    meta.error_code === GALLERY_THEME_MISMATCH_CODE
    || meta.gallery_theme_mismatch === true
    || String(meta.last_error ?? meta.error ?? '').toLowerCase().includes('gallery_theme_mismatch')
    || String(meta.last_error ?? meta.error ?? '').includes('Caption–görsel');
  // Adaptive identity + restage already closed the scene gap at look time.
  if (mismatch && !canRestageStampedPack(meta)) {
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
  const coherence = evaluateArtifactPublishCoherence(meta, content);
  if (coherence && isPublishCoherenceBlock(coherence.breaks)) {
    const photoFight = coherence.breaks.includes('photo_theme_conflict');
    return {
      ready: false,
      blockFeed: true,
      reason: photoFight
        ? 'Yazı, foto ve başlık aynı işi anlatmıyor'
        : 'Yazı, şablon ve başlık aynı işi anlatmıyor',
      code: 'caption_design_incoherent',
    };
  }

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
  try {
    if (typeof artifact.metadata === 'string') {
      meta = JSON.parse(artifact.metadata || '{}') as Record<string, unknown>;
    } else if (artifact.metadata && typeof artifact.metadata === 'object') {
      meta = artifact.metadata as Record<string, unknown>;
    }
  } catch {
    meta = {};
  }
  return resolveArtifactPublishReady({ artifact, meta, content });
}

export type PersistPublishDecision =
  | { persist: true }
  | { persist: false; error: string; errorCode: PublishReadyBlockCode };

/**
 * Customer-table persist valve. ready ⇔ persist.
 * A blocked paint must not write an OutputArtifact; the factory sees
 * error + no id and marks the job failed (quality retry) or exhausted.
 */
export function persistIfPublishReady(
  decision: PublishReadyDecision,
): PersistPublishDecision {
  if (decision.ready) {
    return { persist: true };
  }
  const errorCode: PublishReadyBlockCode =
    decision.code === 'ready' ? 'not_ready' : decision.code;
  const error = decision.reason?.trim() || errorCode;
  return { persist: false, error, errorCode };
}

/** Stamp + persist valve for side paths (story adapt, ads, story guarantee). */
export function decideArtifactPersist(input: {
  meta: Record<string, unknown>;
  content?: Record<string, unknown> | null;
  designedVisualReady?: boolean;
  requireDesignedVisuals?: boolean;
  format?: string;
  hasPlayableVideo?: boolean;
}): {
  stamped: Record<string, unknown>;
  persist: PersistPublishDecision;
} {
  const decision = resolveArtifactPublishReady(input);
  return {
    stamped: stampPublishReadyMetadata(input.meta, decision),
    persist: persistIfPublishReady(decision),
  };
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
