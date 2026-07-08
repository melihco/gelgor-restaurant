/**
 * Brand dynamics — sector + location + date contextual opportunities as
 * mandatory diversity angles (not optional LLM fluff).
 *
 * Wraps the Context Signal Engine and adds:
 *  - mandatory angles the Strategist / ideation MUST cover
 *  - avoid-theme clusters from recent production history
 *  - deterministic prompt blocks for propose + plan-phase
 */

import { buildActiveSignals, buildStrategistSignalBlock } from '@/lib/context-signals';
import type { SignalRecord, SignalType } from '@/lib/context-signals/types';
import { resolveSectorPack } from '@/lib/context-signals/sector-packs';
import {
  resolveBrandOperatingProfile,
  buildBrandOperatingProfileDirective,
  type BrandOperatingProfile,
} from '@/lib/brand-operating-profile';
import {
  burnedThemeClusterIds,
  buildThemeClusterCounts,
  inferThemeClustersFromHook,
  themeClusterLabel,
} from '@/lib/headline-theme-clusters';
import type { DiversityMissionLike } from '@/lib/mission-diversity';

const MANDATORY_SIGNAL_TYPES: SignalType[] = [
  'sector',
  'lunar',
  'weekly_rhythm',
  'season',
  'holiday',
  'golden_hour',
];

const COASTAL_LOCATION_RE =
  /sahil|plaj|beach|deniz|coast|marina|kıyı|kiyi|waterfront|adalar|bodrum|antalya|muğla|mugla|çeşme|cesme|fethiye|kaş|kas|alanya|side|kemer|datça|datca/i;

export interface BrandDynamicsAngle {
  id: string;
  signalType: SignalType;
  title: string;
  hooks: string[];
  confidence: number;
  mandatory: true;
  /** Why this angle applies (sector / season / location). */
  reason: string;
}

export interface BrandDynamicsInput {
  date?: Date;
  region?: string;
  businessType?: string;
  brandName?: string;
  brandDescription?: string;
  brandTone?: string;
  visualDna?: string;
  brandTheme?: Record<string, unknown> | null;
  location?: string;
  lat?: number;
  lng?: number;
  horizonDays?: number;
  recentMissions?: DiversityMissionLike[];
  /** Recent artifact / ideation headlines for theme-cluster dedup. */
  recentHeadlines?: string[];
  /** Precomputed theme cluster counts (e.g. from artifact history). */
  themeClusterCounts?: Record<string, number>;
  /** Theme cluster burn threshold (default 2 uses in window). */
  themeBurnThreshold?: number;
  /** Pre-resolved operating profile (optional). */
  operatingProfile?: BrandOperatingProfile;
}

export interface BrandDynamicsResult {
  generatedAt: string;
  sectorPack: { id: string; label: string };
  mandatoryAngles: BrandDynamicsAngle[];
  avoidThemeClusters: string[];
  themeClusterCounts: Record<string, number>;
  signals: SignalRecord[];
  coverageScore: number;
  strategistBlock: string;
  ideationBlock: string;
}

function isCoastalLocation(location?: string): boolean {
  return Boolean(location && COASTAL_LOCATION_RE.test(location));
}

function signalToAngle(
  signal: SignalRecord,
  sectorLabel: string,
  location?: string,
): BrandDynamicsAngle {
  const locNote = location?.trim() ? ` · ${location.trim()}` : '';
  return {
    id: signal.id,
    signalType: signal.type,
    title: signal.title,
    hooks: signal.contentHooks.slice(0, 3),
    confidence: signal.confidence,
    mandatory: true,
    reason: `${sectorLabel}${locNote} · ${signal.type}`,
  };
}

function signalThemeClusters(signal: SignalRecord): string[] {
  const text = [signal.title, ...signal.contentHooks].join(' ');
  return inferThemeClustersFromHook(text);
}

function resolveMandatoryAngles(
  signals: SignalRecord[],
  sectorLabel: string,
  location: string | undefined,
  avoidClusters: Set<string>,
  maxAngles = 3,
): BrandDynamicsAngle[] {
  const coastal = isCoastalLocation(location);
  const candidates = signals
    .filter((s) => MANDATORY_SIGNAL_TYPES.includes(s.type))
    .filter((s) => {
      const clusters = signalThemeClusters(s);
      return !clusters.some((c) => avoidClusters.has(c));
    })
    .map((s) => {
      let score = s.confidence;
      if (s.type === 'lunar' && coastal) score += 0.15;
      if (s.type === 'sector' && s.meta?.key === 'full_moon_party') score += 0.1;
      if (s.type === 'golden_hour' && coastal) score += 0.08;
      return { signal: s, score };
    })
    .sort((a, b) => b.score - a.score);

  const picked: BrandDynamicsAngle[] = [];
  const seenIds = new Set<string>();
  for (const { signal } of candidates) {
    if (picked.length >= maxAngles) break;
    if (seenIds.has(signal.id)) continue;
    seenIds.add(signal.id);
    picked.push(signalToAngle(signal, sectorLabel, location));
  }
  return picked;
}

function buildMandatoryAnglesBlock(angles: BrandDynamicsAngle[]): string {
  if (angles.length === 0) return '';
  const lines: string[] = [
    '=== MARKA DİNAMİKLERİ — ZORUNLU ÇEŞİTLİLİK AÇILARI ===',
    'Bu haftanın misyon / içerik önerisinde aşağıdaki açılardan EN AZ BİRİ ana tema olmalıdır (opsiyonel değil):',
  ];
  angles.forEach((a, i) => {
    const hooks = a.hooks.slice(0, 2).join(' / ');
    lines.push(
      `${i + 1}. [${Math.round(a.confidence * 100)}%] ${a.title}${hooks ? ` → ${hooks}` : ''}`,
    );
  });
  lines.push('→ trigger_signal ve creative_brief bu açılardan birine dayanmalı; genel tekrar (DJ+deniz ürünü döngüsü) kabul edilmez.');
  return lines.join('\n');
}

function buildAvoidThemesBlock(
  avoidIds: string[],
  counts: Record<string, number>,
): string {
  if (avoidIds.length === 0) return '';
  const lines: string[] = [
    '=== KAÇINILACAK TEKRAR TEMALARI (son üretimler) ===',
  ];
  for (const id of avoidIds) {
    const n = counts[id] ?? 0;
    lines.push(`- ${themeClusterLabel(id)} (${n}× kullanıldı — bu misyonda ana tema OLMASIN)`);
  }
  return lines.join('\n');
}

function buildIdeationBlock(
  angles: BrandDynamicsAngle[],
  avoidIds: string[],
): string {
  const lines: string[] = [
    '=== ÜRETİM ÇEŞİTLİLİK KURALI (deterministik) ===',
  ];
  if (angles.length > 0) {
    lines.push(
      'Her içerik fikri farklı bir zorunlu açıyı hedeflemeli:',
      ...angles.map((a, i) => `${i + 1}. ${a.title}`),
    );
  }
  if (avoidIds.length > 0) {
    lines.push(
      'Tekrar etmeyin:',
      ...avoidIds.map((id) => `- ${themeClusterLabel(id)}`),
    );
  }
  lines.push('→ Aynı headline / tema kümesi (DJ, deniz ürünü, dolunay vb.) bir haftada en fazla bir kez.');
  return lines.join('\n');
}

export function computeBrandDynamics(input: BrandDynamicsInput): BrandDynamicsResult {
  const date = input.date ?? new Date();
  const operatingProfile = input.operatingProfile ?? resolveBrandOperatingProfile({
    businessType: input.businessType,
    brandDescription: input.brandDescription,
    visualDna: input.visualDna,
    brandTone: input.brandTone,
    brandTheme: input.brandTheme,
  });
  const signalResult = buildActiveSignals({
    date,
    region: input.region ?? 'TR',
    businessType: input.businessType,
    brandName: input.brandName,
    brandDescription: input.brandDescription,
    location: input.location,
    lat: input.lat,
    lng: input.lng,
    horizonDays: input.horizonDays,
    operatingProfile,
  });

  const threshold = input.themeBurnThreshold ?? 2;
  const headlineTexts = [
    ...(input.recentHeadlines ?? []),
    ...(input.recentMissions ?? [])
      .map((m) => `${m.title ?? ''} ${m.objective ?? ''}`)
      .filter(Boolean),
  ];
  const clusterCounts = input.themeClusterCounts
    ? new Map(Object.entries(input.themeClusterCounts))
    : buildThemeClusterCounts(headlineTexts);
  const countsObj = Object.fromEntries(clusterCounts.entries());
  const avoidThemeClusters = burnedThemeClusterIds(clusterCounts, threshold);
  const avoidSet = new Set(avoidThemeClusters);

  const mandatoryAngles = resolveMandatoryAngles(
    signalResult.signals,
    signalResult.sectorPack.label,
    input.location,
    avoidSet,
  );

  const operatingBlock = buildBrandOperatingProfileDirective(operatingProfile);
  const baseSignals = buildStrategistSignalBlock(
    signalResult.signals,
    signalResult.sectorPack.label,
    date,
  );
  const mandatoryBlock = buildMandatoryAnglesBlock(mandatoryAngles);
  const avoidBlock = buildAvoidThemesBlock(avoidThemeClusters, countsObj);
  const strategistBlock = [baseSignals, operatingBlock, mandatoryBlock, avoidBlock]
    .filter(Boolean)
    .join('\n\n');
  const ideationBlock = buildIdeationBlock(mandatoryAngles, avoidThemeClusters);

  return {
    generatedAt: new Date().toISOString(),
    sectorPack: signalResult.sectorPack,
    mandatoryAngles,
    avoidThemeClusters,
    themeClusterCounts: countsObj,
    signals: signalResult.signals,
    coverageScore: signalResult.coverageScore,
    strategistBlock,
    ideationBlock,
  };
}

/** Pick a rotation headline when a burned theme cluster is detected. */
export function rotationHeadlineForAvoidedClusters(
  avoidIds: string[],
  mandatoryAngles: BrandDynamicsAngle[],
  slotIndex: number,
): { headline: string; useCase: string; angleId?: string } {
  const unusedAngle = mandatoryAngles[slotIndex % Math.max(mandatoryAngles.length, 1)];
  if (unusedAngle?.hooks[0]) {
    return {
      headline: unusedAngle.hooks[0],
      useCase: 'brand_dynamics_angle',
      angleId: unusedAngle.id,
    };
  }
  const fallbacks: Record<string, { headline: string; useCase: string }> = {
    night_weekend: { headline: 'Hafta sonu kahvaltı', useCase: 'daily_story' },
    dj_nightlife: { headline: 'Manzara & atmosfer', useCase: 'behind_the_scenes' },
    seafood_menu: { headline: 'Signature kokteyl', useCase: 'product_highlight' },
    full_moon: { headline: 'Hafta sonu deneyimi', useCase: 'campaign_offer' },
    sunset_golden: { headline: 'Teras keyfi', useCase: 'behind_the_scenes' },
    brunch_weekend: { headline: 'Özel etkinlik duyurusu', useCase: 'campaign_offer' },
    reservation_cta: { headline: 'Mekân hikayesi', useCase: 'behind_the_scenes' },
    menu_special: { headline: 'Deneyim anları', useCase: 'social_proof' },
    spa_wellness: { headline: 'Konuk deneyimi', useCase: 'social_proof' },
  };
  for (const id of avoidIds) {
    const fb = fallbacks[id];
    if (fb) return fb;
  }
  return { headline: 'Yeni hafta deneyimi', useCase: 'behind_the_scenes' };
}

