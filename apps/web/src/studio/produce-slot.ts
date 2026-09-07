import {
  STUDIO_VERSION,
  type SlotTicket,
  type StudioPaintStamp,
  type StudioResult,
} from '@smartagency/contracts';
import { bindTicket } from './bind';
import { dispositionFromGate } from './gate';
import { gateSlot } from './gate';
import { motionPolicyStamp } from './motion';
import { paintPolicyStamp } from './paint';

export type ProduceSlotAdapters = {
  paint?: (ticket: SlotTicket) => Promise<{
    engine: string;
    imageUrl?: string;
    satoriEscapeUsed?: boolean;
    grafikerScore?: number | null;
    typographyValid?: boolean | null;
  }>;
  motion?: (ticket: SlotTicket) => Promise<{
    videoUrl?: string;
    audioMuxed?: boolean;
  }>;
};

/**
 * Four-stage slot runner. Bind fails closed. Paint must not rematch or
 * escape to Satori. Motion only for reel. Gate is format-equal.
 */
export async function produceSlot(
  ticket: SlotTicket,
  adapters: ProduceSlotAdapters = {},
): Promise<StudioResult> {
  const pinned: SlotTicket = {
    ...ticket,
    studioVersion: ticket.studioVersion || STUDIO_VERSION,
  };

  const bound = bindTicket(pinned);
  if (!bound.ok) {
    return {
      ok: false,
      studioVersion: STUDIO_VERSION,
      stage: 'bind',
      ticket: pinned,
      bind: bound,
      disposition: 'failed',
      error: bound.message,
    };
  }

  const locked = { ...pinned, pack: bound.pack };
  let paint: StudioPaintStamp;
  let grafikerScore: number | null = null;
  let typographyValid: boolean | null = null;

  if (adapters.paint) {
    const painted = await adapters.paint(locked);
    const policy = paintPolicyStamp({
      engine: painted.engine,
      imageUrl: painted.imageUrl,
      pack: bound.pack,
      satoriEscapeUsed: painted.satoriEscapeUsed,
    });
    paint = policy.paint;
    grafikerScore = painted.grafikerScore ?? null;
    typographyValid = painted.typographyValid ?? null;
    if (!policy.ok) {
      return {
        ok: false,
        studioVersion: STUDIO_VERSION,
        stage: 'paint',
        ticket: locked,
        paint,
        disposition: 'failed',
        error: policy.error,
      };
    }
  } else {
    paint = {
      engine: 'designed',
      imageUrl: bound.pack.photoUrl,
      satoriEscapeUsed: false,
    };
  }

  const moved = adapters.motion
    ? motionPolicyStamp({ format: locked.format, ...(await adapters.motion(locked)) })
    : motionPolicyStamp({ format: locked.format });
  if (!moved.ok) {
    return {
      ok: false,
      studioVersion: STUDIO_VERSION,
      stage: 'motion',
      ticket: locked,
      paint,
      motion: moved.motion,
      disposition: 'failed',
      error: moved.error,
    };
  }

  const gate = gateSlot({
    pipeline: locked.pipeline,
    slotRole: locked.slotRole,
    format: locked.format,
    pack: bound.pack,
    paint,
    videoUrl: moved.motion.videoUrl,
    grafikerScore,
    typographyValid,
  });
  const disposition = dispositionFromGate(gate);
  if (gate.blockFeed || !gate.publishReady) {
    return {
      ok: false,
      studioVersion: STUDIO_VERSION,
      stage: 'gate',
      ticket: locked,
      paint,
      motion: moved.motion,
      gate,
      disposition,
      error: gate.reason ?? 'Kapı gizledi',
    };
  }

  return {
    ok: true,
    studioVersion: STUDIO_VERSION,
    stage: 'gate',
    ticket: locked,
    pack: bound.pack,
    paint,
    motion: moved.motion,
    gate,
    disposition,
  };
}
