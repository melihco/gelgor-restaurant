/**
 * Context-signal copy locale — must follow brand `languages`, not TR defaults.
 * English brands must not receive Turkish season/rhythm hooks that leak into
 * mission titles and on-canvas labels.
 */

import { resolveBrandLanguageCode } from '@/lib/cta-localization';

export type SignalLanguage = 'tr' | 'en';
export type SeasonKey = 'winter' | 'spring' | 'summer' | 'autumn';
/** @deprecated Prefer SeasonKey — kept for calculators alias. */
export type CanonicalSeason = SeasonKey;

export function resolveSignalLanguage(raw?: string | null): SignalLanguage {
  return resolveBrandLanguageCode(raw);
}

/** Canonical season key from month (UTC, northern hemisphere). */
export function seasonKeyFromDate(date: Date): SeasonKey {
  const m = date.getUTCMonth(); // 0-11
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

export const resolveCanonicalSeason = seasonKeyFromDate;

/** Accept canonical keys + legacy Turkish labels from older signal meta. */
export function normalizeSeasonKey(raw?: string | null): SeasonKey | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'winter' || s === 'kış' || s === 'kis') return 'winter';
  if (s === 'spring' || s === 'ilkbahar' || s === 'bahar') return 'spring';
  if (s === 'summer' || s === 'yaz') return 'summer';
  if (s === 'autumn' || s === 'fall' || s === 'sonbahar') return 'autumn';
  return null;
}
