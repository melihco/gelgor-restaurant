import type { StudioFeedPack, StudioPaintStamp } from '@smartagency/contracts';

/** Designed stills never fall back to Satori once the pack is locked. */
export function studioForbidsSatoriEscape(input: {
  forbidSatoriEscape?: boolean;
  punchlineLockSource?: string | null;
  packLocked?: boolean;
}): boolean {
  return Boolean(
    input.forbidSatoriEscape
    || input.punchlineLockSource === 'feed_slot_pack'
    || input.packLocked,
  );
}

export function paintPolicyStamp(input: {
  engine: string;
  imageUrl?: string;
  pack: StudioFeedPack;
  satoriEscapeUsed?: boolean;
}): { ok: true; paint: StudioPaintStamp } | { ok: false; paint: StudioPaintStamp; error: string } {
  const satoriEscapeUsed = Boolean(input.satoriEscapeUsed);
  const paint: StudioPaintStamp = {
    engine: input.engine,
    imageUrl: input.imageUrl,
    satoriEscapeUsed,
  };
  if (satoriEscapeUsed) {
    return { ok: false, paint, error: 'Satori kaçış boyası kapalı' };
  }
  if (!input.imageUrl?.trim()) {
    return { ok: false, paint, error: 'Boya çıktısı yok' };
  }
  return { ok: true, paint };
}

/** Rematch after bind is forbidden — the pack photo is the pin. */
export function shouldSkipPaintRematch(packLocked: boolean): boolean {
  return packLocked;
}
