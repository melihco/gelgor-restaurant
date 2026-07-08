/**
 * Context Signal Engine — types (Sprint 5).
 */

import type { BrandOperatingProfile } from '@/lib/brand-operating-profile';

export type SignalType =
  | 'season'
  | 'season_phase'
  | 'day_of_week'
  | 'day_part'
  | 'weekly_rhythm'
  | 'holiday'
  | 'lunar'
  | 'golden_hour'
  | 'solstice_equinox'
  | 'sector'; // populated by sector packs in Sprint 6

export interface SignalRecord {
  /** Stable id, e.g. "lunar:full:2026-06-09". */
  id: string;
  type: SignalType;
  /** Operator-facing label, e.g. "Dolunay — 9 Haziran". */
  title: string;
  /** Active window (ISO date or datetime). */
  windowStart: string;
  windowEnd: string;
  /** 0..1 — how strongly this applies right now. */
  confidence: number;
  /**
   * true = real, verifiable fact (national holiday, astronomical event).
   * false = inferred/heuristic (weekly rhythm, sector hunch).
   */
  verified: boolean;
  /** Concrete content angles the Strategist can use. */
  contentHooks: string[];
  /** Formats this signal suits best. */
  applicableFormats: string[];
  /** Extra structured data (illumination, sunset time, holiday date …). */
  meta?: Record<string, unknown>;
}

export interface ContextSignalInputs {
  /** Reference date (defaults to now). */
  date: Date;
  /** IANA-ish region for holidays; v1 supports 'TR'. */
  region?: string;
  businessType?: string;
  /** Brand name — used alongside businessType for richer sector detection. */
  brandName?: string;
  /** Brand description — used for sector fallback when businessType is generic. */
  brandDescription?: string;
  location?: string;
  /** Optional coordinates — required for golden-hour/sunset signals. */
  lat?: number;
  lng?: number;
  /** How many days ahead to surface upcoming signals (holidays, full moon). */
  horizonDays?: number;
  /** Pre-resolved operating profile (optional — computed from brand fields when omitted). */
  operatingProfile?: BrandOperatingProfile;
}

export interface ContextCoverageCheck {
  type: SignalType;
  applicable: boolean;
  computed: boolean;
  reason?: string;
}

export interface ContextSignalResult {
  generatedAt: string;
  inputs: {
    date: string;
    region: string;
    businessType?: string;
    location?: string;
    hasCoords: boolean;
    horizonDays: number;
  };
  signals: SignalRecord[];
  coverage: ContextCoverageCheck[];
  /** CCS — % of applicable signal types that were computed. */
  coverageScore: number;
  /** Resolved sector pack for the tenant. */
  sectorPack: { id: string; label: string };
  /** Count of signals active within the next 7 days. */
  activeThisWeek: number;
  /** Deterministic markdown block ready to inject into the Strategist prompt. */
  promptBlock: string;
}
