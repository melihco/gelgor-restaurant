/**
 * Lunar phase calculator (Sprint 5).
 *
 * Deterministic moon-phase math from a known new-moon epoch and the mean
 * synodic month. Accurate to well within a day — enough to flag full-moon /
 * new-moon windows for nightlife & beach brands (the "full moon" scenario).
 */

import type { SignalRecord } from './types';

const SYNODIC_MONTH = 29.530588853; // days
// Known new moon: 2000-01-06 18:14 UTC
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14, 0);

export type MoonPhaseName =
  | 'new'
  | 'waxing_crescent'
  | 'first_quarter'
  | 'waxing_gibbous'
  | 'full'
  | 'waning_gibbous'
  | 'last_quarter'
  | 'waning_crescent';

export interface MoonPhase {
  /** 0..1 position in the synodic cycle (0/1 = new, 0.5 = full). */
  phaseFraction: number;
  /** 0..1 illuminated fraction of the disk. */
  illumination: number;
  name: MoonPhaseName;
}

/** Age of the moon in days for a given date. */
export function moonAgeDays(date: Date): number {
  const days = (date.getTime() - NEW_MOON_EPOCH) / 86_400_000;
  const age = days % SYNODIC_MONTH;
  return age < 0 ? age + SYNODIC_MONTH : age;
}

export function moonPhase(date: Date): MoonPhase {
  const age = moonAgeDays(date);
  const phaseFraction = age / SYNODIC_MONTH;
  const illumination = (1 - Math.cos(2 * Math.PI * phaseFraction)) / 2;

  let name: MoonPhaseName;
  if (phaseFraction < 0.03 || phaseFraction > 0.97) name = 'new';
  else if (phaseFraction < 0.22) name = 'waxing_crescent';
  else if (phaseFraction < 0.28) name = 'first_quarter';
  else if (phaseFraction < 0.47) name = 'waxing_gibbous';
  else if (phaseFraction < 0.53) name = 'full';
  else if (phaseFraction < 0.72) name = 'waning_gibbous';
  else if (phaseFraction < 0.78) name = 'last_quarter';
  else name = 'waning_crescent';

  return { phaseFraction, illumination, name };
}

/** Find the next full moon date (UTC midnight granularity) on/after `from`. */
export function nextFullMoon(from: Date): Date {
  const age = moonAgeDays(from);
  // Days until phaseFraction reaches 0.5 (full).
  const fullAge = 0.5 * SYNODIC_MONTH;
  let daysAhead = fullAge - age;
  if (daysAhead < -0.5) daysAhead += SYNODIC_MONTH;
  return new Date(from.getTime() + daysAhead * 86_400_000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function trDate(d: Date): string {
  return `${d.getUTCDate()} ${TR_MONTHS[d.getUTCMonth()]}`;
}

/**
 * Emit a lunar signal when a full moon is within the horizon (or tonight).
 * Nightlife / beach / rooftop brands care most; verified=true (astronomical).
 */
export function lunarSignals(date: Date, horizonDays: number): SignalRecord[] {
  const full = nextFullMoon(date);
  const daysToFull = (full.getTime() - date.getTime()) / 86_400_000;

  const signals: SignalRecord[] = [];
  if (daysToFull <= horizonDays && daysToFull >= -1) {
    // Confidence peaks on the night of the full moon.
    const confidence = Math.max(0.5, 1 - Math.abs(daysToFull) / (horizonDays + 1));
    const windowStart = new Date(full.getTime() - 86_400_000);
    const windowEnd = new Date(full.getTime() + 86_400_000);
    signals.push({
      id: `lunar:full:${isoDate(full)}`,
      type: 'lunar',
      title: `Dolunay — ${trDate(full)}`,
      windowStart: isoDate(windowStart),
      windowEnd: isoDate(windowEnd),
      confidence: Math.round(confidence * 100) / 100,
      verified: true,
      contentHooks: [
        'Dolunay temalı gece etkinliği / özel menü',
        'Gün batımı sonrası dolunay manzarası içeriği',
        'Full moon party / rooftop / sahil konsepti',
      ],
      applicableFormats: ['story', 'reel', 'post'],
      meta: { phase: 'full', daysToFull: Math.round(daysToFull * 10) / 10, fullMoonDate: isoDate(full) },
    });
  }
  return signals;
}
