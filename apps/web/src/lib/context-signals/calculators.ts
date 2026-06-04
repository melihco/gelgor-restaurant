/**
 * Universal temporal calculators (Sprint 5).
 *
 * Season, day-of-week, day-part, weekly rhythm, solstice/equinox and golden
 * hour (sunset) — all deterministic. Northern-hemisphere / Türkiye defaults.
 */

import type { SignalRecord } from './types';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Season ───────────────────────────────────────────────────────────────────

export function seasonSignal(date: Date): SignalRecord {
  const m = date.getUTCMonth(); // 0-11
  let season: string;
  let hooks: string[];
  if (m === 11 || m <= 1) {
    season = 'Kış';
    hooks = ['Sıcak içecek / kış menüsü', 'İç mekân sıcak atmosfer', 'Kış kampanyası'];
  } else if (m <= 4) {
    season = 'İlkbahar';
    hooks = ['Sezon açılışı / taze menü', 'Açık hava ilk günler', 'Bahar tazeliği teması'];
  } else if (m <= 7) {
    season = 'Yaz';
    hooks = ['Yaz sezonu / serinletici menü', 'Açık hava / sahil / teras', 'Tatil & turist içeriği'];
  } else {
    season = 'Sonbahar';
    hooks = ['Sezon kapanışı / sonbahar menüsü', 'Sıcak tonlar / hasat teması', 'Okula dönüş kampanyası'];
  }
  const year = date.getUTCFullYear();
  return {
    id: `season:${season}:${year}`,
    type: 'season',
    title: `Mevsim — ${season}`,
    windowStart: isoDate(date),
    windowEnd: isoDate(new Date(date.getTime() + 30 * 86_400_000)),
    confidence: 0.9,
    verified: true,
    contentHooks: hooks,
    applicableFormats: ['post', 'story', 'reel'],
    meta: { season },
  };
}

// ── Day of week + weekly rhythm ─────────────────────────────────────────────────

const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function dayOfWeekSignal(date: Date): SignalRecord {
  const dow = date.getUTCDay();
  const isWeekend = dow === 0 || dow === 6;
  return {
    id: `dow:${isoDate(date)}`,
    type: 'day_of_week',
    title: `${TR_DAYS[dow]}${isWeekend ? ' (hafta sonu)' : ''}`,
    windowStart: isoDate(date),
    windowEnd: isoDate(date),
    confidence: 0.6,
    verified: true,
    contentHooks: isWeekend
      ? ['Hafta sonu yoğunluğu / rezervasyon çağrısı']
      : ['Hafta içi sakin atmosfer / günlük menü'],
    applicableFormats: ['story', 'post'],
    meta: { dayOfWeek: dow, isWeekend },
  };
}

/** Sector-agnostic weekly rhythms (Friday night, Sunday brunch, quiet Monday). */
export function weeklyRhythmSignals(date: Date): SignalRecord[] {
  const dow = date.getUTCDay();
  const out: SignalRecord[] = [];
  const push = (key: string, title: string, hooks: string[], confidence: number) => {
    out.push({
      id: `weekly:${key}:${isoDate(date)}`,
      type: 'weekly_rhythm',
      title,
      windowStart: isoDate(date),
      windowEnd: isoDate(date),
      confidence,
      verified: false,
      contentHooks: hooks,
      applicableFormats: ['story', 'reel', 'post'],
      meta: { rhythm: key, dayOfWeek: dow },
    });
  };
  if (dow === 5) push('friday_night', 'Cuma akşamı ritmi', ['Cuma akşamı / hafta sonu açılışı', 'Canlı müzik / özel program'], 0.75);
  if (dow === 6) push('saturday_night', 'Cumartesi gece ritmi', ['Cumartesi gece yoğunluğu', 'DJ / etkinlik / özel menü'], 0.75);
  if (dow === 0) push('sunday_brunch', 'Pazar brunch ritmi', ['Pazar brunch daveti', 'Aile / geç kahvaltı içeriği'], 0.7);
  if (dow === 1) push('quiet_monday', 'Sakin Pazartesi', ['Pazartesi sakin atmosfer / indirim', 'Haftaya yumuşak başlangıç'], 0.5);
  return out;
}

// ── Solstice / equinox (approximate fixed dates) ─────────────────────────────────

const ASTRO_EVENTS: { name: string; month: number; day: number; hooks: string[] }[] = [
  { name: 'İlkbahar Ekinoksu', month: 3, day: 20, hooks: ['Bahar başlangıcı teması'] },
  { name: 'Yaz Gündönümü', month: 6, day: 21, hooks: ['Yılın en uzun günü / yaz zirvesi', 'Gün batımı geç saat içeriği'] },
  { name: 'Sonbahar Ekinoksu', month: 9, day: 22, hooks: ['Sonbahar geçişi teması'] },
  { name: 'Kış Gündönümü', month: 12, day: 21, hooks: ['Yılın en kısa günü / kış teması'] },
];

export function solsticeSignals(date: Date, horizonDays: number): SignalRecord[] {
  const out: SignalRecord[] = [];
  const year = date.getUTCFullYear();
  for (const y of [year, year + 1]) {
    for (const e of ASTRO_EVENTS) {
      const when = new Date(Date.UTC(y, e.month - 1, e.day));
      const d = (when.getTime() - date.getTime()) / 86_400_000;
      if (d < -1 || d > horizonDays) continue;
      out.push({
        id: `astro:${e.name}:${isoDate(when)}`,
        type: 'solstice_equinox',
        title: `${e.name} — ${isoDate(when)}`,
        windowStart: isoDate(new Date(when.getTime() - 86_400_000)),
        windowEnd: isoDate(new Date(when.getTime() + 86_400_000)),
        confidence: 0.5,
        verified: true,
        contentHooks: e.hooks,
        applicableFormats: ['post', 'story'],
        meta: { date: isoDate(when) },
      });
    }
  }
  return out;
}

// ── Golden hour / sunset (NOAA approximation) ────────────────────────────────────

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

/**
 * Approximate local sunset time (UTC hours) for a date + coordinates.
 * Simplified solar position; accurate to a few minutes — fine for "golden hour"
 * content timing. Returns null for polar day/night edge cases.
 */
export function sunsetUtcHours(date: Date, lat: number, lng: number): number | null {
  const n = dayOfYear(date);
  const rad = Math.PI / 180;
  // Solar declination
  const decl = 23.45 * Math.sin(rad * (360 * (284 + n) / 365));
  const latR = lat * rad;
  const declR = decl * rad;
  const cosH = -Math.tan(latR) * Math.tan(declR);
  if (cosH < -1 || cosH > 1) return null; // no sunset/sunrise (polar)
  const H = Math.acos(cosH) / rad; // hour angle in degrees
  // Equation of time (minutes), approximate
  const B = rad * (360 / 365) * (n - 81);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  // Solar noon (UTC hours) at this longitude
  const solarNoon = 12 - lng / 15 - eot / 60;
  const sunsetUtc = solarNoon + H / 15;
  return ((sunsetUtc % 24) + 24) % 24;
}

export function goldenHourSignal(date: Date, lat?: number, lng?: number): SignalRecord | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const sunset = sunsetUtcHours(date, lat, lng);
  if (sunset == null) return null;
  // Approximate local time using longitude offset (no DST handling in v1).
  const localSunset = ((sunset + lng / 15) % 24 + 24) % 24;
  const hh = Math.floor(localSunset);
  const mm = Math.round((localSunset - hh) * 60);
  const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return {
    id: `golden_hour:${isoDate(date)}`,
    type: 'golden_hour',
    title: `Altın saat / gün batımı ~${timeStr}`,
    windowStart: isoDate(date),
    windowEnd: isoDate(date),
    confidence: 0.6,
    verified: true,
    contentHooks: [
      `Gün batımı (~${timeStr}) altın saat içeriği`,
      'Teras / sahil / manzara gün batımı çekimi',
    ],
    applicableFormats: ['story', 'reel', 'post'],
    meta: { sunsetLocal: timeStr },
  };
}
