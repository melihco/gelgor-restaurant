import type {
  StudioDisposition,
  StudioFeedPack,
  StudioGateStamp,
  StudioPaintStamp,
} from '@smartagency/contracts';
import { parseFeedSlotPack } from '@/lib/feed-slot-pack';
import { GRAFIKER_HARD_FLOOR } from '@/lib/grafiker-quality';
import {
  resolveArtifactPublishReady,
  type PublishReadyDecision,
} from '@/lib/artifact-publish-ready';

export function gateFromPublishDecision(
  decision: PublishReadyDecision,
  extras?: { grafikerScore?: number | null },
): StudioGateStamp {
  let blockCode = decision.code === 'ready' ? null : decision.code;
  let blockFeed = decision.blockFeed;
  let ready = decision.ready;
  let reason = decision.reason;
  const score = extras?.grafikerScore;
  if (typeof score === 'number' && score < GRAFIKER_HARD_FLOOR) {
    ready = false;
    blockFeed = true;
    blockCode = 'quality_hard_block';
    reason = reason ?? 'Tasarım kalitesi onay için yeterli değil';
  }
  return {
    publishReady: ready,
    blockFeed,
    blockCode,
    reason,
  };
}

export function gateSlot(input: {
  pipeline: string;
  slotRole: string;
  format: 'post' | 'story' | 'reel' | 'carousel';
  pack: Record<string, unknown> | StudioFeedPack;
  paint: StudioPaintStamp;
  videoUrl?: string;
  grafikerScore?: number | null;
  typographyValid?: boolean | null;
}): StudioGateStamp {
  const parsed = parseFeedSlotPack(input.pack as Partial<import('@/lib/feed-slot-pack').FeedSlotPack>);
  if (!parsed.ok) {
    return {
      publishReady: false,
      blockFeed: true,
      blockCode: 'not_ready',
      reason: 'Paket yok',
    };
  }

  const meta: Record<string, unknown> = {
    pipeline: input.pipeline,
    production_role: input.slotRole,
    feed_slot_pack: parsed.pack,
    feed_slot_pack_ok: true,
    fal_design_engine: input.paint.engine,
    fal_designer_produced: Boolean(input.paint.imageUrl) && !input.paint.satoriEscapeUsed,
    grafiker_score: input.grafikerScore ?? null,
    grafiker_pass: typeof input.grafikerScore === 'number'
      ? input.grafikerScore >= GRAFIKER_HARD_FLOOR
      : null,
    typography_text_valid: input.typographyValid ?? null,
  };
  if (input.videoUrl) {
    meta.fal_video_produced = true;
    meta.video_url = input.videoUrl;
  }

  const decision = resolveArtifactPublishReady({
    meta,
    content: {
      caption: parsed.pack.caption,
      headline: parsed.pack.headline,
      production_role: input.slotRole,
    },
    format: input.format,
    designedVisualReady: Boolean(input.paint.imageUrl) && !input.paint.satoriEscapeUsed,
    hasPlayableVideo: Boolean(input.videoUrl),
  });
  return gateFromPublishDecision(decision, { grafikerScore: input.grafikerScore });
}

export function dispositionFromGate(gate: StudioGateStamp, failedStage?: boolean): StudioDisposition {
  if (failedStage) return 'failed';
  if (gate.publishReady && !gate.blockFeed) return 'ready';
  return 'withheld';
}
