/**
 * Turkish holiday + commercial-day calculator (Sprint 5).
 *
 * Fixed national days + computed (Mother's/Father's day) + a small religious
 * table (Ramazan/Kurban move with the Hijri calendar, so they're tabulated).
 * Verified=true for national/religious; commercial days are verified=true too
 * (they are real calendar dates) but lower confidence as content triggers.
 */

import type { SignalRecord } from './types';

interface HolidayDef {
  name: string;
  /** Month (1-12) + day for fixed Gregorian holidays. */
  month: number;
  day: number;
  hooks: string[];
  /** Lower for purely commercial days. */
  weight?: number;
}

const FIXED_TR: HolidayDef[] = [
  { name: 'Yılbaşı', month: 1, day: 1, hooks: ['Yeni yıl menüsü / kampanya', 'Yılbaşı kutlama içeriği'] },
  { name: 'Sevgililer Günü', month: 2, day: 14, hooks: ['Çift menüsü / özel masa', 'Romantik atmosfer içeriği'], weight: 0.7 },
  { name: 'Ulusal Egemenlik ve Çocuk Bayramı', month: 4, day: 23, hooks: ['Çocuklara özel etkinlik', '23 Nisan kutlaması'] },
  { name: 'Emek ve Dayanışma Günü', month: 5, day: 1, hooks: ['1 Mayıs mesajı'], weight: 0.6 },
  { name: 'Atatürk’ü Anma, Gençlik ve Spor Bayramı', month: 5, day: 19, hooks: ['19 Mayıs kutlaması'] },
  { name: 'Demokrasi ve Milli Birlik Günü', month: 7, day: 15, hooks: ['15 Temmuz anması'], weight: 0.6 },
  { name: 'Zafer Bayramı', month: 8, day: 30, hooks: ['30 Ağustos kutlaması'] },
  { name: 'Cumhuriyet Bayramı', month: 10, day: 29, hooks: ['29 Ekim Cumhuriyet kutlaması', 'Kırmızı-beyaz temalı içerik'] },
];

/** Religious holidays — first day of each (approximate official dates). */
const RELIGIOUS_TR: { name: string; date: string; hooks: string[] }[] = [
  { name: 'Ramazan Bayramı', date: '2026-03-20', hooks: ['Bayram menüsü / tatlı ikramı', 'Bayramlaşma içeriği'] },
  { name: 'Kurban Bayramı', date: '2026-05-27', hooks: ['Bayram tatili kampanyası', 'Aile buluşması menüsü'] },
  { name: 'Ramazan Bayramı', date: '2027-03-10', hooks: ['Bayram menüsü / tatlı ikramı', 'Bayramlaşma içeriği'] },
  { name: 'Kurban Bayramı', date: '2027-05-16', hooks: ['Bayram tatili kampanyası', 'Aile buluşması menüsü'] },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Nth weekday of a month, e.g. 2nd Sunday of May (Mother's Day). */
function nthWeekdayOfMonth(year: number, month0: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month0, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month0, 1 + offset + (n - 1) * 7));
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

export function holidaySignals(date: Date, horizonDays: number, region = 'TR'): SignalRecord[] {
  if (region !== 'TR') return [];
  const out: SignalRecord[] = [];
  const year = date.getUTCFullYear();

  const consider = (name: string, when: Date, hooks: string[], weight = 1, verified = true) => {
    const d = daysBetween(date, when);
    if (d < -1 || d > horizonDays) return;
    const confidence = Math.max(0.4, weight * (1 - Math.max(0, d) / (horizonDays + 1)));
    out.push({
      id: `holiday:${name}:${isoDate(when)}`,
      type: 'holiday',
      title: `${name} — ${isoDate(when)}`,
      windowStart: isoDate(new Date(when.getTime() - 86_400_000)),
      windowEnd: isoDate(new Date(when.getTime() + 86_400_000)),
      confidence: Math.round(confidence * 100) / 100,
      verified,
      contentHooks: hooks,
      applicableFormats: ['post', 'story'],
      meta: { date: isoDate(when), daysAhead: Math.round(d) },
    });
  };

  // Fixed national/commercial — check this year and next (for horizon spanning year-end).
  for (const y of [year, year + 1]) {
    for (const h of FIXED_TR) {
      consider(h.name, new Date(Date.UTC(y, h.month - 1, h.day)), h.hooks, h.weight ?? 1);
    }
    // Mother's Day — 2nd Sunday of May
    consider("Anneler Günü", nthWeekdayOfMonth(y, 4, 0, 2), ['Anneler Günü brunch / hediye'], 0.7);
    // Father's Day — 3rd Sunday of June
    consider("Babalar Günü", nthWeekdayOfMonth(y, 5, 0, 3), ['Babalar Günü menüsü / hediye'], 0.6);
  }

  // Religious table
  for (const r of RELIGIOUS_TR) {
    consider(r.name, new Date(`${r.date}T00:00:00Z`), r.hooks, 1);
  }

  return out;
}
