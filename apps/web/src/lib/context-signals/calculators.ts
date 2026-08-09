/**
 * Universal temporal calculators (Sprint 5).
 *
 * Season, day-of-week, day-part, weekly rhythm, solstice/equinox and golden
 * hour (sunset) — all deterministic. Copy language follows brand `languages`
 * (TR default for TR brands; EN for English content brands).
 */

import type { SignalRecord } from './types';
import {
  resolveCanonicalSeason,
  type CanonicalSeason,
  type SignalLanguage,
} from './language';
import type { BrandOperatingProfile } from '@/lib/brand-operating-profile';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const SEASON_LABEL: Record<CanonicalSeason, { tr: string; en: string }> = {
  winter: { tr: 'Kış', en: 'Winter' },
  spring: { tr: 'İlkbahar', en: 'Spring' },
  summer: { tr: 'Yaz', en: 'Summer' },
  autumn: { tr: 'Sonbahar', en: 'Autumn' },
};

const SEASON_HOOKS: Record<CanonicalSeason, { tr: string[]; en: string[] }> = {
  winter: {
    tr: ['Sıcak içecek / kış menüsü', 'İç mekân sıcak atmosfer', 'Kış kampanyası'],
    en: ['Warm drinks / winter menu', 'Cozy indoor atmosphere', 'Winter campaign'],
  },
  spring: {
    tr: ['Sezon açılışı / taze menü', 'Açık hava ilk günler', 'Bahar tazeliği teması'],
    en: ['Season opening / fresh menu', 'First outdoor days', 'Spring freshness theme'],
  },
  summer: {
    tr: ['Yaz sezonu / serinletici menü', 'Açık hava / sahil / teras', 'Tatil & turist içeriği'],
    en: ['Summer season / refreshing menu', 'Outdoor / beach / terrace', 'Holiday & visitor content'],
  },
  autumn: {
    tr: ['Sezon kapanışı / sonbahar menüsü', 'Sıcak tonlar / hasat teması', 'Okula dönüş kampanyası'],
    en: ['Season wind-down / autumn menu', 'Warm tones / harvest theme', 'Back-to-routine campaign'],
  },
};

// ── Season ───────────────────────────────────────────────────────────────────

export function seasonSignal(date: Date, language: SignalLanguage = 'tr'): SignalRecord {
  const en = language === 'en';
  const seasonKey = resolveCanonicalSeason(date);
  const seasonLabel = en ? SEASON_LABEL[seasonKey].en : SEASON_LABEL[seasonKey].tr;
  const hooks = en ? SEASON_HOOKS[seasonKey].en : SEASON_HOOKS[seasonKey].tr;
  const year = date.getUTCFullYear();
  return {
    id: `season:${seasonKey}:${year}`,
    type: 'season',
    title: en ? `Season — ${seasonLabel}` : `Mevsim — ${seasonLabel}`,
    windowStart: isoDate(date),
    windowEnd: isoDate(new Date(date.getTime() + 30 * 86_400_000)),
    confidence: 0.9,
    verified: true,
    contentHooks: hooks,
    applicableFormats: ['post', 'story', 'reel'],
    // Canonical key for sector packs; label is display-only.
    meta: { season: seasonKey, seasonLabel, language },
  };
}

// ── Day of week + weekly rhythm ─────────────────────────────────────────────────

const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayOfWeekSignal(date: Date, language: SignalLanguage = 'tr'): SignalRecord {
  const dow = date.getUTCDay();
  const isWeekend = dow === 0 || dow === 6;
  const en = language === 'en';
  const dayName = en ? EN_DAYS[dow] : TR_DAYS[dow];
  return {
    id: `dow:${isoDate(date)}`,
    type: 'day_of_week',
    title: en
      ? `${dayName}${isWeekend ? ' (weekend)' : ''}`
      : `${dayName}${isWeekend ? ' (hafta sonu)' : ''}`,
    windowStart: isoDate(date),
    windowEnd: isoDate(date),
    confidence: 0.6,
    verified: true,
    contentHooks: isWeekend
      ? (en
        ? ['Weekend energy / reservation CTA']
        : ['Hafta sonu yoğunluğu / rezervasyon çağrısı'])
      : (en
        ? ['Weekday calm atmosphere / daily menu']
        : ['Hafta içi sakin atmosfer / günlük menü']),
    applicableFormats: ['story', 'post'],
    meta: { dayOfWeek: dow, isWeekend, language },
  };
}

/** Sector-agnostic weekly rhythms (Friday night, Sunday brunch, quiet Monday). */
export function weeklyRhythmSignals(
  date: Date,
  operatingProfile?: BrandOperatingProfile,
  language: SignalLanguage = 'tr',
): SignalRecord[] {
  const dow = date.getUTCDay();
  const out: SignalRecord[] = [];
  const rejectsNight = operatingProfile?.rejectsNightlifeThemes === true;
  const prefersBreakfast = operatingProfile?.prefersBreakfastBrunch === true;
  const en = language === 'en';
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
      meta: { rhythm: key, dayOfWeek: dow, language },
    });
  };
  if (dow === 5 && !rejectsNight) {
    push(
      'friday_night',
      en ? 'Friday night rhythm' : 'Cuma akşamı ritmi',
      en
        ? ['Friday night / weekend kickoff', 'Live music / special program']
        : ['Cuma akşamı / hafta sonu açılışı', 'Canlı müzik / özel program'],
      0.75,
    );
  }
  if (dow === 6) {
    if (prefersBreakfast || rejectsNight) {
      push(
        'saturday_brunch',
        en ? 'Saturday breakfast rhythm' : 'Cumartesi kahvaltı ritmi',
        en
          ? ['Saturday breakfast invitation', 'Weekend family table / garden breakfast']
          : ['Cumartesi serpme kahvaltı daveti', 'Hafta sonu aile masası / bahçe kahvaltı'],
        0.75,
      );
    } else {
      push(
        'saturday_night',
        en ? 'Saturday night rhythm' : 'Cumartesi gece ritmi',
        en
          ? ['Saturday night peak', 'DJ / event / special menu']
          : ['Cumartesi gece yoğunluğu', 'DJ / etkinlik / özel menü'],
        0.75,
      );
    }
  }
  if (dow === 0) {
    push(
      'sunday_brunch',
      en ? 'Sunday brunch rhythm' : 'Pazar brunch ritmi',
      en
        ? ['Sunday brunch invitation', 'Family / late breakfast content']
        : ['Pazar brunch daveti', 'Aile / geç kahvaltı içeriği'],
      0.7,
    );
  }
  if (dow === 1) {
    push(
      'quiet_monday',
      en ? 'Quiet Monday' : 'Sakin Pazartesi',
      en
        ? ['Monday calm atmosphere / soft offer', 'Gentle start to the week']
        : ['Pazartesi sakin atmosfer / indirim', 'Haftaya yumuşak başlangıç'],
      0.5,
    );
  }
  return out;
}

// ── Solstice / equinox (approximate fixed dates) ─────────────────────────────────

const ASTRO_EVENTS_TR: { name: string; month: number; day: number; hooks: string[] }[] = [
  { name: 'İlkbahar Ekinoksu', month: 3, day: 20, hooks: ['Bahar başlangıcı teması'] },
  { name: 'Yaz Gündönümü', month: 6, day: 21, hooks: ['Yılın en uzun günü / yaz zirvesi', 'Gün batımı geç saat içeriği'] },
  { name: 'Sonbahar Ekinoksu', month: 9, day: 22, hooks: ['Sonbahar geçişi teması'] },
  { name: 'Kış Gündönümü', month: 12, day: 21, hooks: ['Yılın en kısa günü / kış teması'] },
];

const ASTRO_EVENTS_EN: { name: string; month: number; day: number; hooks: string[] }[] = [
  { name: 'Spring Equinox', month: 3, day: 20, hooks: ['Spring beginning theme'] },
  { name: 'Summer Solstice', month: 6, day: 21, hooks: ['Longest day / summer peak', 'Late sunset content'] },
  { name: 'Autumn Equinox', month: 9, day: 22, hooks: ['Autumn transition theme'] },
  { name: 'Winter Solstice', month: 12, day: 21, hooks: ['Shortest day / winter theme'] },
];

export function solsticeSignals(
  date: Date,
  horizonDays: number,
  language: SignalLanguage = 'tr',
): SignalRecord[] {
  const out: SignalRecord[] = [];
  const year = date.getUTCFullYear();
  const events = language === 'en' ? ASTRO_EVENTS_EN : ASTRO_EVENTS_TR;
  for (const y of [year, year + 1]) {
    for (const e of events) {
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
        meta: { date: isoDate(when), language },
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

export function goldenHourSignal(
  date: Date,
  lat?: number,
  lng?: number,
  language: SignalLanguage = 'tr',
): SignalRecord | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const sunset = sunsetUtcHours(date, lat, lng);
  if (sunset == null) return null;
  // Approximate local time using longitude offset (no DST handling in v1).
  const localSunset = ((sunset + lng / 15) % 24 + 24) % 24;
  const hh = Math.floor(localSunset);
  const mm = Math.round((localSunset - hh) * 60);
  const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const en = language === 'en';
  return {
    id: `golden_hour:${isoDate(date)}`,
    type: 'golden_hour',
    title: en ? `Golden hour / sunset ~${timeStr}` : `Altın saat / gün batımı ~${timeStr}`,
    windowStart: isoDate(date),
    windowEnd: isoDate(date),
    confidence: 0.6,
    verified: true,
    contentHooks: en
      ? [
        `Sunset (~${timeStr}) golden-hour content`,
        'Terrace / beach / view sunset shot',
      ]
      : [
        `Gün batımı (~${timeStr}) altın saat içeriği`,
        'Teras / sahil / manzara gün batımı çekimi',
      ],
    applicableFormats: ['story', 'reel', 'post'],
    meta: { sunsetLocal: timeStr, language },
  };
}
