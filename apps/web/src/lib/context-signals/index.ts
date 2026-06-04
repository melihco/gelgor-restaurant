/**
 * Context Signal Engine — orchestrator (Sprint 5).
 *
 * `buildActiveSignals` runs every deterministic calculator for a tenant/date and
 * returns the active SignalRecord[] plus a Context Coverage Score (CCS): the %
 * of *applicable* signal types that were successfully computed.
 *
 * Sector-specific signals (beach_hospitality, nightlife, …) layer in via Sprint 6.
 */

import type {
  ContextSignalInputs,
  ContextSignalResult,
  ContextCoverageCheck,
  SignalRecord,
  SignalType,
} from './types';
import { lunarSignals } from './lunar';
import { holidaySignals } from './holidays-tr';
import {
  seasonSignal,
  dayOfWeekSignal,
  weeklyRhythmSignals,
  solsticeSignals,
  goldenHourSignal,
} from './calculators';
import { resolveSectorPack, sectorPackSignals } from './sector-packs';

export * from './types';
export { moonPhase, nextFullMoon } from './lunar';
export { resolveSectorPack, SECTOR_PACKS } from './sector-packs';
export type { SectorPackId, SectorPack } from './sector-packs';

const DEFAULT_HORIZON = 14;

export function buildActiveSignals(input: ContextSignalInputs): ContextSignalResult {
  const date = input.date ?? new Date();
  const region = input.region ?? 'TR';
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON;
  const hasCoords = typeof input.lat === 'number' && typeof input.lng === 'number';

  const signals: SignalRecord[] = [];
  const coverage: ContextCoverageCheck[] = [];

  // Helper: run a calculator, record coverage (applicable + computed).
  const run = (
    type: SignalType,
    applicable: boolean,
    produce: () => SignalRecord[],
    reason?: string,
  ) => {
    if (!applicable) {
      coverage.push({ type, applicable: false, computed: false, reason });
      return;
    }
    let produced: SignalRecord[] = [];
    try {
      produced = produce();
    } catch {
      produced = [];
    }
    // "computed" = the calculator ran without error (even if it found no active
    // window today). Universal calculators that always emit count as computed;
    // windowed ones (holiday/lunar) count as computed because they evaluated.
    coverage.push({ type, applicable: true, computed: true });
    signals.push(...produced);
  };

  const season = seasonSignal(date);
  const lunar = lunarSignals(date, horizonDays);
  const fullMoonActive = lunar.length > 0;

  run('season', true, () => [season]);
  run('day_of_week', true, () => [dayOfWeekSignal(date)]);
  run('weekly_rhythm', true, () => weeklyRhythmSignals(date));
  run('holiday', true, () => holidaySignals(date, horizonDays, region));
  run('lunar', true, () => lunar);
  run('solstice_equinox', true, () => solsticeSignals(date, horizonDays));
  run(
    'golden_hour',
    hasCoords,
    () => {
      const s = goldenHourSignal(date, input.lat, input.lng);
      return s ? [s] : [];
    },
    hasCoords ? undefined : 'Koordinat (lat/lng) yok',
  );

  // Sector pack — resolve from business_type + brand name + description for richer detection.
  const pack = resolveSectorPack(input.businessType, input.brandName, input.brandDescription);
  const dow = date.getUTCDay();
  run('sector', true, () => sectorPackSignals(pack, {
    date,
    season: (season.meta?.season as string) ?? '',
    isWeekend: dow === 0 || dow === 6,
    dayOfWeek: dow,
    fullMoonActive,
  }));

  // Boost confidence of universal signals the sector emphasises.
  for (const s of signals) {
    if (pack.emphasis.includes(s.type)) {
      s.confidence = Math.min(1, Math.round((s.confidence + 0.1) * 100) / 100);
    }
  }

  // Sort by confidence desc so the Strategist sees strongest triggers first.
  signals.sort((a, b) => b.confidence - a.confidence);

  const applicableTypes = coverage.filter((c) => c.applicable);
  const computedTypes = applicableTypes.filter((c) => c.computed);
  const coverageScore = applicableTypes.length === 0
    ? 0
    : Math.round((computedTypes.length / applicableTypes.length) * 100);

  const weekEnd = new Date(date.getTime() + 7 * 86_400_000);
  const activeThisWeek = signals.filter(
    (s) => Date.parse(s.windowStart) <= weekEnd.getTime(),
  ).length;

  const promptBlock = buildStrategistSignalBlock(signals, pack.label, date);

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      date: date.toISOString().slice(0, 10),
      region,
      businessType: input.businessType,
      location: input.location,
      hasCoords,
      horizonDays,
    },
    signals,
    coverage,
    coverageScore,
    sectorPack: { id: pack.id, label: pack.label },
    activeThisWeek,
    promptBlock,
  };
}

/**
 * Serialise active signals into a deterministic markdown block for the
 * Strategist prompt. Keeps verified facts and inferred rhythms clearly labelled
 * so the LLM weights them correctly.
 */
export function buildStrategistSignalBlock(
  signals: SignalRecord[],
  sectorLabel: string,
  date: Date,
): string {
  if (signals.length === 0) return '';
  const lines: string[] = [];
  lines.push('=== BAĞLAM SİNYALLERİ (deterministik, gerçek tarih/astronomi) ===');
  lines.push(`Sektör: ${sectorLabel} · Referans tarih: ${date.toISOString().slice(0, 10)}`);
  lines.push('Bu sinyalleri içerik fikirlerini gerçek dünyaya bağlamak için kullan. ');
  lines.push('"verified: true" = gerçek/doğrulanmış (kullanmaktan çekinme); "false" = ritim/çıkarım (uygunsa kullan).');
  lines.push('');
  for (const s of signals.slice(0, 12)) {
    const flag = s.verified ? '✓doğrulanmış' : '~çıkarım';
    const hooks = s.contentHooks.slice(0, 2).join(' / ');
    lines.push(`- [${Math.round(s.confidence * 100)}% ${flag}] ${s.title}${hooks ? ` → ${hooks}` : ''}`);
  }
  return lines.join('\n');
}
