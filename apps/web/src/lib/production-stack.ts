/**
 * Production Stack — sequential enrichment for Mission Hub → auto-produce.
 * Galeri → Feed Art Director → Scene Brief → Render routing → bundle metadata.
 */
import type { RemotionLayoutFamily } from './remotion-template-types';
import type { ProductionAssignment, ProductionSlotRole } from './mission-production-manifest';
import type { FeedArtDirectorReport } from './weekly-publish-package';
import { LAYOUT_FAMILY_IDS } from './creative-director-routing';
import { detectIdeaPackageFormat, preselectPrimaryIdeaIndices } from './weekly-publish-package';

const CREW = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';

export interface ProductSceneBrief {
  sector_archetype?: string;
  background_concept?: string;
  lighting_style?: string;
  mood_words?: string[];
  gpt_image2_prompt?: string;
  quality_rationale?: string;
}

export interface ProductionStackContext {
  feedDirectorReport?: FeedArtDirectorReport | null;
  heroReelIndex: number | null;
  layoutFamilyUsage: Map<RemotionLayoutFamily, number>;
  maxSameLayoutFamily: number;
}

export interface CreativeTraceMetadata {
  production_stack: true;
  feed_director_score: number | null;
  feed_director_source: 'feed_art_director' | 'heuristic';
  hero_reel: boolean;
  scene_brief_used: boolean;
  layout_family_hint?: RemotionLayoutFamily;
  scene_mood?: string;
  scene_lighting?: string;
}

export function createProductionStackContext(
  report?: FeedArtDirectorReport | null,
  opts?: {
    assignments?: Array<{ idea_index: number; slot_role: string }>;
    ideas?: Record<string, unknown>[];
  },
): ProductionStackContext {
  return {
    feedDirectorReport: report ?? null,
    heroReelIndex: resolveHeroReelIndex(report, opts?.assignments, opts?.ideas),
    layoutFamilyUsage: new Map(),
    maxSameLayoutFamily: 2,
  };
}

export function resolveHeroReelIndex(report?: FeedArtDirectorReport | null): number | null {
  if (typeof report?.hero_reel_index === 'number' && report.hero_reel_index >= 0) {
    return report.hero_reel_index;
  }
  const order = report?.recommended_order ?? [];
  for (const idx of order) {
    // Prefer first reel in recommended order
    if (typeof idx === 'number') return idx;
  }
  return null;
}

export function shouldSkipIdeaForProduction(
  ideaIndex: number,
  report?: FeedArtDirectorReport | null,
  opts?: { missionProduction?: boolean },
): boolean {
  const flag = report?.flagged_ideas?.find((f) => f.index === ideaIndex);
  if (!flag || flag.severity !== 'error') return false;
  // Mission Hub: produce anyway; Feed can still surface with review status
  if (opts?.missionProduction) return false;
  return true;
}

export function resolveMaxRunwayReelsPerMission(
  brandTheme?: Record<string, unknown> | null,
): number {
  const raw = brandTheme?.max_runway_reels_per_mission ?? brandTheme?.maxRunwayReelsPerMission;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n >= 1) return Math.min(3, Math.floor(n));
  const tier = String(brandTheme?.quality_tier ?? brandTheme?.qualityTier ?? '').toLowerCase();
  return tier === 'agency' ? 2 : 1;
}

export function shouldProduceRunwayForIdea(
  ideaIndex: number,
  format: string,
  ctx: ProductionStackContext,
  opts?: {
    reelsProducedInMission?: number;
    maxReelsPerMission?: number;
    slotRole?: ProductionSlotRole;
    /** Batch includes an organic_reel assignment — campaign reel uses 2nd budget slot. */
    hasOrganicReelAssignment?: boolean;
  },
): boolean {
  if (!format.toLowerCase().includes('reel')) return false;
  const max = opts?.maxReelsPerMission ?? 1;
  const produced = opts?.reelsProducedInMission ?? 0;
  if (produced >= max) return false;

  const role = opts?.slotRole;
  const hasOrganic = opts?.hasOrganicReelAssignment !== false;

  if (role === 'campaign_reel_motion') {
    if (max >= 2) return !hasOrganic || produced >= 1;
    return ctx.heroReelIndex === ideaIndex;
  }

  if (role === 'organic_reel') {
    if (max >= 2) return produced === 0;
    if (ctx.heroReelIndex !== null) return ctx.heroReelIndex === ideaIndex;
    return produced === 0;
  }

  if (max > 1) return true;
  if (ctx.heroReelIndex === null) return true;
  return ctx.heroReelIndex === ideaIndex;
}

/** APO-6 — prefer organic reel as hero when FD did not set hero_reel_index. */
export function resolveHeroReelIndexFromAssignments(
  assignments: Array<{ idea_index: number; slot_role: string }>,
  ideas: Record<string, unknown>[],
): number | null {
  const organic = assignments.find((a) => a.slot_role === 'organic_reel');
  if (organic && Number.isFinite(organic.idea_index)) return organic.idea_index;
  const campaign = assignments.find((a) => a.slot_role === 'campaign_reel_motion');
  if (campaign && Number.isFinite(campaign.idea_index)) return campaign.idea_index;
  return inferHeroReelIndex(ideas);
}

export function pickLayoutFamilyHint(
  ctx: ProductionStackContext,
  candidates: RemotionLayoutFamily[],
): RemotionLayoutFamily | undefined {
  if (!candidates.length) return undefined;
  const sorted = [...candidates].sort((a, b) => {
    const ua = ctx.layoutFamilyUsage.get(a) ?? 0;
    const ub = ctx.layoutFamilyUsage.get(b) ?? 0;
    return ua - ub;
  });
  const pick = sorted.find((f) => (ctx.layoutFamilyUsage.get(f) ?? 0) < ctx.maxSameLayoutFamily) ?? sorted[0];
  if (pick) {
    ctx.layoutFamilyUsage.set(pick, (ctx.layoutFamilyUsage.get(pick) ?? 0) + 1);
  }
  return pick;
}

/** Feed Art Director per-idea hint wins; otherwise rotate recommended_layout_families. */
export function resolveLayoutFamilyForAssignment(
  ctx: ProductionStackContext,
  assignment: ProductionAssignment,
  candidates: RemotionLayoutFamily[],
): RemotionLayoutFamily | undefined {
  const raw = assignment.layout_family_hint;
  const hint = typeof raw === 'string' && LAYOUT_FAMILY_IDS.includes(raw as RemotionLayoutFamily)
    ? (raw as RemotionLayoutFamily)
    : undefined;
  if (hint) {
    ctx.layoutFamilyUsage.set(hint, (ctx.layoutFamilyUsage.get(hint) ?? 0) + 1);
    return hint;
  }
  return pickLayoutFamilyHint(ctx, candidates);
}

export function buildSceneBriefPromptBlock(brief: ProductSceneBrief | null): string {
  if (!brief) return '';
  const parts = [
    brief.background_concept ? `Scene: ${brief.background_concept}` : '',
    brief.lighting_style ? `Lighting: ${brief.lighting_style}` : '',
    brief.mood_words?.length ? `Mood: ${brief.mood_words.join(', ')}` : '',
    brief.quality_rationale ? `Rationale: ${brief.quality_rationale}` : '',
  ].filter(Boolean);
  return parts.join(' | ');
}

export function buildRunwayDirectorExtra(brief: ProductSceneBrief | null): string {
  if (!brief) return '';
  if (brief.gpt_image2_prompt) {
    return brief.gpt_image2_prompt.slice(0, 400);
  }
  return buildSceneBriefPromptBlock(brief);
}

export async function fetchProductSceneBrief(input: {
  workspaceId: string;
  caption: string;
  productType?: string;
  sector?: string;
  mood?: string;
  enhanceLevel?: 'subtle' | 'moderate' | 'full';
  visualSubject?: 'venue_ambiance' | 'product_hero';
}): Promise<ProductSceneBrief | null> {
  try {
    const res = await fetch(`${CREW}/api/v1/product-visual/scene-brief`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': input.workspaceId,
      },
      body: JSON.stringify({
        workspace_id: input.workspaceId,
        caption: input.caption.slice(0, 1000),
        product_type: input.productType ?? '',
        enhance_level: input.enhanceLevel ?? 'moderate',
        sector: input.sector ?? '',
        mood: input.mood ?? '',
        visual_subject: input.visualSubject ?? 'venue_ambiance',
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { ok?: boolean; scene_brief?: ProductSceneBrief };
    return data.ok && data.scene_brief ? data.scene_brief : null;
  } catch {
    return null;
  }
}

export function buildCreativeTrace(
  ctx: ProductionStackContext,
  opts: {
    ideaIndex: number;
    layoutFamilyHint?: RemotionLayoutFamily;
    sceneBrief?: ProductSceneBrief | null;
    isHeroReel?: boolean;
  },
): CreativeTraceMetadata {
  const report = ctx.feedDirectorReport;
  return {
    production_stack: true,
    feed_director_score: typeof report?.feed_score === 'number' ? report.feed_score : null,
    feed_director_source: report?.recommended_order?.length ? 'feed_art_director' : 'heuristic',
    hero_reel: Boolean(opts.isHeroReel),
    scene_brief_used: Boolean(opts.sceneBrief),
    layout_family_hint: opts.layoutFamilyHint,
    scene_mood: opts.sceneBrief?.mood_words?.join(', '),
    scene_lighting: opts.sceneBrief?.lighting_style,
  };
}

export function resolvePrimaryIndicesWithReport(
  ideas: Record<string, unknown>[],
  report?: FeedArtDirectorReport | null,
): Set<number> {
  const base = preselectPrimaryIdeaIndices(ideas, report);
  for (const flag of report?.flagged_ideas ?? []) {
    if (flag.severity === 'error') base.delete(flag.index);
  }
  return base;
}

/** Infer hero reel index from ideas when Feed Art Director did not set one. */
export function inferHeroReelIndex(ideas: Record<string, unknown>[]): number | null {
  const reelIndices = ideas
    .map((idea, i) => ({ i, fmt: detectIdeaPackageFormat(idea) }))
    .filter((x) => x.fmt === 'reel')
    .map((x) => x.i);
  return reelIndices.length > 0 ? reelIndices[0]! : null;
}
