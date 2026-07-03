/**
 * Instagram grid surface rotation — prevents consecutive fal slots from repeating
 * the same dominant layout (e.g. top brand-color band on every thumbnail).
 *
 * Brand primary/accent colors stay locked; only placement, intensity, and
 * background treatment rotate for feed cohesion.
 */

import type { TypographyBackgroundStyle } from '@/types/brand-theme';
import type { FalDesignChannel, FalDesignIntensityLevel } from './fal-design-intensity';
import { FAL_DESIGN_INTENSITY_LEVELS } from './fal-design-intensity';

/** Visual signature visible in the 3-column profile grid. */
export type FalGridSurfaceKind =
  | 'top_brand_panel'
  | 'bottom_scrim'
  | 'photo_dominant'
  | 'synthetic_gradient'
  | 'split_asymmetric';

export interface FalGridSurfaceRecord {
  kind: FalGridSurfaceKind;
  intensityLevel: FalDesignIntensityLevel;
  backgroundStyle: TypographyBackgroundStyle;
  archetypeId?: string;
}

const SPLIT_ARCHETYPE_RX =
  /split|diagonal|asymmetric|magazine|editorial_split|bento|collage/i;

const INTENSITY_RANK: Record<FalDesignIntensityLevel, number> = {
  photo_first: 1,
  elegant_light: 2,
  balanced: 3,
  designed: 4,
  bold_editorial: 5,
};

function parseJsonRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isFalDesignedArtifact(meta: Record<string, unknown>): boolean {
  const pipeline = String(meta.pipeline ?? '');
  const role = String(meta.production_role ?? '');
  const route = String(meta.production_route ?? '');
  if (meta.fal_designer_produced === true || meta.fal_only === true) return true;
  if (route === 'fal_ai' || route === 'fal_only') return true;
  if (/fal_(design|reel|only|story)/.test(pipeline)) return true;
  if (/fal_designed|fal_reel|fal_only|designed_typography/.test(role)) return true;
  return false;
}

function parseSurfaceKind(raw: unknown): FalGridSurfaceKind | null {
  const s = String(raw ?? '').trim();
  const allowed: FalGridSurfaceKind[] = [
    'top_brand_panel',
    'bottom_scrim',
    'photo_dominant',
    'synthetic_gradient',
    'split_asymmetric',
  ];
  return allowed.includes(s as FalGridSurfaceKind) ? (s as FalGridSurfaceKind) : null;
}

/** Classify the grid-visible layout from production config. */
export function classifyFalGridSurface(input: {
  intensityLevel: FalDesignIntensityLevel;
  backgroundStyle: TypographyBackgroundStyle;
  hasReferencePhoto: boolean;
  archetypeId?: string;
  layoutPattern?: string;
}): FalGridSurfaceKind {
  const layoutText = `${input.archetypeId ?? ''} ${input.layoutPattern ?? ''}`;
  if (SPLIT_ARCHETYPE_RX.test(layoutText)) return 'split_asymmetric';

  if (input.intensityLevel === 'photo_first') return 'photo_dominant';

  if (
    input.intensityLevel === 'designed'
    || input.intensityLevel === 'bold_editorial'
  ) {
    return 'top_brand_panel';
  }

  if (!input.hasReferencePhoto && input.backgroundStyle === 'gradient_mesh') {
    return 'synthetic_gradient';
  }

  return 'bottom_scrim';
}

export function falGridSurfaceKey(kind: FalGridSurfaceKind): string {
  return kind;
}

/** Extract recent fal grid surfaces from persisted artifact metadata (newest first). */
export function collectRecentFalGridSurfaces(
  artifacts: Record<string, unknown>[],
  opts?: { limit?: number; maxAgeDays?: number },
): FalGridSurfaceKind[] {
  const limit = opts?.limit ?? 6;
  const maxAgeMs = (opts?.maxAgeDays ?? 60) * 86_400_000;
  const cutoff = Date.now() - maxAgeMs;
  const out: FalGridSurfaceKind[] = [];

  for (const artifact of artifacts) {
    if (out.length >= limit) break;
    const meta = parseJsonRecord(artifact.metadata ?? artifact.Metadata);
    if (!isFalDesignedArtifact(meta)) continue;

    const created = String(artifact.createdAt ?? artifact.CreatedAt ?? '');
    if (created) {
      const ts = Date.parse(created);
      if (Number.isFinite(ts) && ts < cutoff) continue;
    }

    const kind = parseSurfaceKind(meta.fal_grid_surface ?? meta.falGridSurface);
    if (kind) out.push(kind);
  }

  return out;
}

function stepIntensityDown(level: FalDesignIntensityLevel): FalDesignIntensityLevel {
  const idx = FAL_DESIGN_INTENSITY_LEVELS.indexOf(level);
  if (idx <= 0) return FAL_DESIGN_INTENSITY_LEVELS[0]!;
  return FAL_DESIGN_INTENSITY_LEVELS[idx - 1]!;
}

function gridRotationDirectivesForTarget(target: FalGridSurfaceKind): string[] {
  switch (target) {
    case 'photo_dominant':
      return [
        'GRID ROTATION: Prior post used a heavy brand-color header — this slot must be photo-first. Full-bleed gallery hero, tiny or no headline at bottom edge only.',
        'FORBIDDEN: top horizontal color band, upper brand panel, or poster header block.',
      ];
    case 'bottom_scrim':
      return [
        'GRID ROTATION: Do NOT repeat the previous post\'s top brand-color band. Place headline on a bottom gradient scrim (18–28% frame height) — photo stays visible in upper two-thirds.',
        'FORBIDDEN: solid opaque brand-color header covering the top 30%+ of frame.',
      ];
    case 'split_asymmetric':
      return [
        'GRID ROTATION: Use an asymmetric split or side-panel layout — brand color on ONE vertical side or diagonal panel, NOT a full-width top header strip.',
      ];
    case 'synthetic_gradient':
      return [
        'GRID ROTATION: Abstract gradient mesh background using brand colors — no duplicate top header band from the previous grid tile.',
      ];
    default:
      return [];
  }
}

const ROTATION_TARGETS: Record<FalGridSurfaceKind, FalGridSurfaceKind[]> = {
  top_brand_panel: ['bottom_scrim', 'photo_dominant', 'split_asymmetric'],
  bottom_scrim: ['photo_dominant', 'split_asymmetric', 'top_brand_panel'],
  photo_dominant: ['bottom_scrim', 'split_asymmetric', 'top_brand_panel'],
  synthetic_gradient: ['photo_dominant', 'bottom_scrim', 'split_asymmetric'],
  split_asymmetric: ['photo_dominant', 'bottom_scrim', 'top_brand_panel'],
};

function pickTargetKind(
  wouldBe: FalGridSurfaceKind,
  recent: FalGridSurfaceKind[],
): FalGridSurfaceKind {
  const last = recent[0];
  if (!last || last !== wouldBe) return wouldBe;

  const alternatives = ROTATION_TARGETS[last] ?? ROTATION_TARGETS.top_brand_panel;
  for (const alt of alternatives) {
    if (alt !== recent[1]) return alt;
  }
  return alternatives[0] ?? 'bottom_scrim';
}

function configForTargetKind(
  target: FalGridSurfaceKind,
  baseIntensity: FalDesignIntensityLevel,
  baseBackgroundStyle: TypographyBackgroundStyle,
  hasReferencePhoto: boolean,
): { intensityLevel: FalDesignIntensityLevel; backgroundStyle: TypographyBackgroundStyle } {
  switch (target) {
    case 'photo_dominant':
      return {
        intensityLevel: 'photo_first',
        backgroundStyle: hasReferencePhoto ? 'photo_overlay' : baseBackgroundStyle,
      };
    case 'bottom_scrim':
      return {
        intensityLevel: INTENSITY_RANK[baseIntensity] >= 4 ? 'elegant_light' : baseIntensity,
        backgroundStyle: hasReferencePhoto ? 'photo_overlay' : 'gradient_mesh',
      };
    case 'split_asymmetric':
      return {
        intensityLevel: baseIntensity === 'bold_editorial' ? 'designed' : baseIntensity,
        backgroundStyle: hasReferencePhoto ? 'photo_overlay' : baseBackgroundStyle,
      };
    case 'synthetic_gradient':
      return {
        intensityLevel: 'balanced',
        backgroundStyle: 'gradient_mesh',
      };
    case 'top_brand_panel':
    default:
      return {
        intensityLevel: baseIntensity,
        backgroundStyle: baseBackgroundStyle,
      };
  }
}

/**
 * Rotate fal surface so consecutive mission / feed tiles do not look identical.
 * Skips when recent history is empty and base config is already photo-dominant.
 */
export function rotateFalDesignSurfaceForGrid(input: {
  channel: FalDesignChannel;
  baseIntensity: FalDesignIntensityLevel;
  baseBackgroundStyle: TypographyBackgroundStyle;
  hasReferencePhoto: boolean;
  archetypeId?: string;
  layoutPattern?: string;
  /** Newest-first surface kinds (mission session + recent artifacts). */
  recentSurfaceKinds?: FalGridSurfaceKind[];
}): {
  designIntensityLevel: FalDesignIntensityLevel;
  backgroundStyle: TypographyBackgroundStyle;
  surfaceKind: FalGridSurfaceKind;
  gridRotationDirectives: string[];
  rotated: boolean;
  surfaceRecord: FalGridSurfaceRecord;
} {
  const recent = input.recentSurfaceKinds ?? [];
  const baseWouldBe = classifyFalGridSurface({
    intensityLevel: input.baseIntensity,
    backgroundStyle: input.baseBackgroundStyle,
    hasReferencePhoto: input.hasReferencePhoto,
    archetypeId: input.archetypeId,
    layoutPattern: input.layoutPattern,
  });

  const needsRotation =
    recent.length > 0
    && (recent[0] === baseWouldBe || (recent[0] === 'top_brand_panel' && baseWouldBe === 'top_brand_panel'));

  if (!needsRotation && recent[0] !== 'top_brand_panel') {
    return {
      designIntensityLevel: input.baseIntensity,
      backgroundStyle: input.baseBackgroundStyle,
      surfaceKind: baseWouldBe,
      gridRotationDirectives: [],
      rotated: false,
      surfaceRecord: {
        kind: baseWouldBe,
        intensityLevel: input.baseIntensity,
        backgroundStyle: input.baseBackgroundStyle,
        archetypeId: input.archetypeId,
      },
    };
  }

  const targetKind = pickTargetKind(baseWouldBe, recent);
  let { intensityLevel, backgroundStyle } = configForTargetKind(
    targetKind,
    input.baseIntensity,
    input.baseBackgroundStyle,
    input.hasReferencePhoto,
  );

  // Hard guard: never stack two top brand panels.
  if (recent[0] === 'top_brand_panel' && targetKind === 'top_brand_panel') {
    const forced = configForTargetKind('bottom_scrim', input.baseIntensity, input.baseBackgroundStyle, input.hasReferencePhoto);
    intensityLevel = forced.intensityLevel;
    backgroundStyle = forced.backgroundStyle;
  }

  const surfaceKind = classifyFalGridSurface({
    intensityLevel,
    backgroundStyle,
    hasReferencePhoto: input.hasReferencePhoto,
    archetypeId: input.archetypeId,
    layoutPattern: input.layoutPattern,
  });

  const directives =
    recent[0] === 'top_brand_panel' || recent[0] === baseWouldBe
      ? gridRotationDirectivesForTarget(
        recent[0] === 'top_brand_panel' && surfaceKind === 'top_brand_panel'
          ? 'bottom_scrim'
          : targetKind,
      )
      : [];

  return {
    designIntensityLevel: intensityLevel,
    backgroundStyle,
    surfaceKind,
    gridRotationDirectives: directives,
    rotated: true,
    surfaceRecord: {
      kind: surfaceKind,
      intensityLevel,
      backgroundStyle,
      archetypeId: input.archetypeId,
    },
  };
}

export async function fetchRecentFalGridSurfaces(
  workspaceId: string,
  nexusApi = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, ''),
  internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key',
): Promise<FalGridSurfaceKind[]> {
  try {
    const res = await fetch(`${nexusApi}/api/artifacts?limit=40`, {
      headers: {
        'X-Tenant-Id': workspaceId,
        'X-Internal-Api-Key': internalKey,
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const raw = await res.json();
    const artifacts: Record<string, unknown>[] = Array.isArray(raw)
      ? raw
      : (raw as { items?: unknown[] }).items ?? [];
    return collectRecentFalGridSurfaces(Array.isArray(artifacts) ? artifacts : []);
  } catch {
    return [];
  }
}
