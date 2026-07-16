/**
 * Production Stack — sequential enrichment for Mission Hub → auto-produce.
 * Galeri → Feed Art Director → Scene Brief → Render routing → bundle metadata.
 */
import type { StoryLayoutFamily } from './story-template-types';
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

/**
 * Story-specific brief extension (Sprint 4 — Brief Split).
 * Adds panel-level narrative context that Reel rendering doesn't need.
 */
export interface StorySceneBrief extends ProductSceneBrief {
  /** How visual content should flow across hook → proof → CTA cards. */
  panel_narrative?: string;
  /** Shared color-grade direction for the full story set (warm/cool/neutral/vibrant). */
  color_grade?: 'warm' | 'cool' | 'neutral' | 'vibrant';
  /** Hint for Ken Burns direction per card role. */
  ken_burns_hint?: 'slow_zoom_in' | 'slow_zoom_out' | 'gentle_drift' | 'static';
  /** Visual sequence note for the Creative Director (e.g. "wide → detail → invitation"). */
  visual_sequence_note?: string;
}

/**
 * Reel-specific brief extension (Sprint 4 — Brief Split).
 * Adds cinematic direction that Story rendering doesn't use.
 */
export interface ReelSceneBrief extends ProductSceneBrief {
  /** Description of the opening 1-second moment to maximise scroll-stop. */
  opening_moment?: string;
  /** Pacing descriptor for camera/cut timing. */
  pacing?: 'slow_burn' | 'mid_tempo' | 'fast_cut';
  /** Ordered camera movement story across clips. */
  camera_progression?: string;
  /** Whether the Reel should start with motion or a still beat. */
  open_with_motion?: boolean;
}

/**
 * Discriminated union for format-specific briefs.
 * Use `isStoryBrief` / `isReelBrief` type guards when consuming.
 */
export type TypedSceneBrief =
  | ({ _format: 'story' } & StorySceneBrief)
  | ({ _format: 'reel' } & ReelSceneBrief);

export function isStoryBrief(b: TypedSceneBrief): b is { _format: 'story' } & StorySceneBrief {
  return b._format === 'story';
}

export function isReelBrief(b: TypedSceneBrief): b is { _format: 'reel' } & ReelSceneBrief {
  return b._format === 'reel';
}

/**
 * Coerce a plain `ProductSceneBrief` into a `TypedSceneBrief` for a Story.
 * Adds derived panel-narrative and visual-sequence hints from available fields.
 */
export function toStorySceneBrief(
  base: ProductSceneBrief | null | undefined,
  opts?: {
    colorGrade?: 'warm' | 'cool' | 'neutral' | 'vibrant';
    narrativeArc?: string;
  },
): ({ _format: 'story' } & StorySceneBrief) | null {
  if (!base) return null;
  const colorGrade = opts?.colorGrade ?? 'neutral';
  const panelNarrative = opts?.narrativeArc
    ? `Arc: ${opts.narrativeArc}. Lighting: ${base.lighting_style ?? 'natural'}. Mood: ${(base.mood_words ?? []).slice(0, 3).join(', ')}.`
    : `Lighting: ${base.lighting_style ?? 'natural'}. Mood: ${(base.mood_words ?? []).slice(0, 3).join(', ')}.`;

  return {
    _format: 'story',
    ...base,
    color_grade: colorGrade,
    panel_narrative: panelNarrative,
    visual_sequence_note: base.background_concept
      ? `Open wide, pull to detail, close on invitation. ${base.background_concept}`
      : 'Open wide, pull to detail, close on invitation.',
    ken_burns_hint: colorGrade === 'vibrant' ? 'slow_zoom_in' : 'gentle_drift',
  };
}

/**
 * Coerce a plain `ProductSceneBrief` into a `TypedSceneBrief` for a Reel.
 * Adds cinematic opening and pacing hints.
 */
export function toReelSceneBrief(
  base: ProductSceneBrief | null | undefined,
  opts?: {
    mood?: string;
    sector?: string;
  },
): ({ _format: 'reel' } & ReelSceneBrief) | null {
  if (!base) return null;
  const moodLow = (opts?.mood ?? '').toLowerCase();
  const sector = (opts?.sector ?? '').toLowerCase();

  let pacing: ReelSceneBrief['pacing'] = 'mid_tempo';
  if (/energetic|bold|vibrant|nightclub|fitness/.test(`${moodLow} ${sector}`)) pacing = 'fast_cut';
  if (/calm|serene|luxury|spa|hotel/.test(`${moodLow} ${sector}`)) pacing = 'slow_burn';

  const openWithMotion = pacing !== 'slow_burn';
  const openingMoment = base.background_concept
    ? `${base.background_concept} — capture the defining moment in frame 1.`
    : 'Lead with the most visually arresting element in frame 1.';

  return {
    _format: 'reel',
    ...base,
    opening_moment: openingMoment,
    pacing,
    open_with_motion: openWithMotion,
    camera_progression:
      pacing === 'fast_cut'
        ? 'wide → push-in → detail → wide'
        : 'slow drift right → settle on subject → gentle zoom out',
  };
}

export interface ProductionStackContext {
  feedDirectorReport?: FeedArtDirectorReport | null;
  heroReelIndex: number | null;
  layoutFamilyUsage: Map<StoryLayoutFamily, number>;
  maxSameLayoutFamily: number;
  /** APO-8 — reddedilen layout'lar bir sonraki üretimde atlanır */
  blockedLayoutFamilies: Set<StoryLayoutFamily>;
}

export interface CreativeTraceMetadata {
  production_stack: true;
  feed_director_score: number | null;
  feed_director_source: 'feed_art_director' | 'heuristic';
  hero_reel: boolean;
  scene_brief_used: boolean;
  layout_family_hint?: StoryLayoutFamily;
  scene_mood?: string;
  scene_lighting?: string;
}

export function createProductionStackContext(
  report?: FeedArtDirectorReport | null,
  opts?: {
    assignments?: Array<{ idea_index: number; slot_role: string }>;
    ideas?: Record<string, unknown>[];
    blockedLayoutFamilies?: Iterable<StoryLayoutFamily>;
  },
): ProductionStackContext {
  return {
    feedDirectorReport: report ?? null,
    heroReelIndex: resolveHeroReelIndex(report),
    layoutFamilyUsage: new Map(),
    maxSameLayoutFamily: 2,
    blockedLayoutFamilies: new Set(opts?.blockedLayoutFamilies ?? []),
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
  _opts?: { missionProduction?: boolean },
): boolean {
  const flag = report?.flagged_ideas?.find((f) => f.index === ideaIndex);
  if (!flag || flag.severity !== 'error') return false;
  const reason = String(flag.reason || '').toLowerCase();
  // Batch-level format mix gaps are often pinned to idea 0 — not a per-idea blocker.
  // Covers both English and Turkish FAD output.
  if (
    reason.includes('format target')
    || reason.includes('reels detected')
    || reason.includes('zero reels')
    || reason.includes('no reels')
    || reason.includes('missing posts')
    || reason.includes('missing reels')
    || reason.includes('missing formats')
    || reason.includes('format variety')
    || reason.includes('format mix')
    || reason.includes('all ideas are')
    || reason.includes('format distribution')
    // Turkish: "Format eksikliği: Reels yok …"
    || reason.includes('format eksikliği')
    || reason.includes('reels yok')
    || reason.includes('format hedef')
    || reason.includes('format karışımı')
    || reason.includes('tüm fikirler')
  ) {
    return false;
  }
  return true;
}

/**
 * High-importance mission signals that warrant promoting a second hero reel slot
 * even when brand theme hasn't explicitly set max_hero_reels_per_mission ≥ 2.
 *
 * Logic: if the mission title, brief, or type contains any of these patterns,
 * the quality gate is relaxed and one additional hero reel is allowed.
 */
const HIGH_IMPORTANCE_MISSION_RE =
  /\b(launch|lansman|kampanya|campaign|promo|promotion|event|etkinlik|opening|açılı|grand.?open|yeni.?sezon|new.?season|koleksiyon|collection|festival|gala|concert|konser|indirim|sale|black.?friday|yılbaşı|new.?year|sevgili|valentine|anneler|mothers|babalar|fathers|özel.?teklif|special.?offer|limited|sınırlı)\b/i;

export function resolveMaxHeroReelsPerMission(
  brandTheme?: Record<string, unknown> | null,
  packageMonthlyReels?: number,
  /** Sprint 6 — Mission context signals for importance-based auto-promotion. */
  missionContext?: {
    missionTitle?: string | null;
    creativeBrief?: string | null;
    strategistMissionType?: string | null;
  },
): number {
  if (packageMonthlyReels === 0) return 0;
  const raw = brandTheme?.max_hero_reels_per_mission
    ?? brandTheme?.maxHeroReelsPerMission;
  const n = typeof raw === 'number' ? raw : Number(raw);
  let cap = 1;
  if (Number.isFinite(n) && n >= 1) {
    cap = Math.min(3, Math.floor(n));
  } else {
    const tier = String(brandTheme?.quality_tier ?? brandTheme?.qualityTier ?? '').toLowerCase();
    cap = tier === 'agency' ? 2 : 1;
  }

  // Auto-promote: high-importance mission signals bump cap by 1 (up to 2 max).
  // Respects packageMonthlyReels budget — promotion is capped there.
  if (cap < 2 && missionContext) {
    const missionText = [
      missionContext.missionTitle ?? '',
      missionContext.creativeBrief ?? '',
      missionContext.strategistMissionType ?? '',
    ].join(' ');
    if (HIGH_IMPORTANCE_MISSION_RE.test(missionText)) {
      cap = Math.min(2, cap + 1);
      // Log is caller's responsibility to avoid circular deps here.
    }
  }

  if (packageMonthlyReels != null && packageMonthlyReels >= 0) {
    return Math.min(cap, packageMonthlyReels);
  }
  return cap;
}

export function shouldProduceHeroReelForIdea(
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
  if (role === 'fal_reel_motion' || role === 'fal_only_reel') return false;
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

function filterLayoutCandidates(
  ctx: ProductionStackContext,
  candidates: StoryLayoutFamily[],
): StoryLayoutFamily[] {
  const blocked = ctx.blockedLayoutFamilies;
  if (!blocked.size) return candidates;
  const filtered = candidates.filter((f) => !blocked.has(f));
  return filtered.length > 0 ? filtered : candidates;
}

export function pickLayoutFamilyHint(
  ctx: ProductionStackContext,
  candidates: StoryLayoutFamily[],
): StoryLayoutFamily | undefined {
  const pool = filterLayoutCandidates(ctx, candidates);
  if (!pool.length) return undefined;
  const sorted = [...pool].sort((a, b) => {
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
  candidates: StoryLayoutFamily[],
): StoryLayoutFamily | undefined {
  const raw = assignment.layout_family_hint;
  const hint = typeof raw === 'string' && LAYOUT_FAMILY_IDS.includes(raw as StoryLayoutFamily)
    ? (raw as StoryLayoutFamily)
    : undefined;
  if (hint && !ctx.blockedLayoutFamilies.has(hint)) {
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

export function buildReelDirectorExtra(brief: ProductSceneBrief | null): string {
  if (!brief) return '';
  if (brief.gpt_image2_prompt) {
    return brief.gpt_image2_prompt.slice(0, 400);
  }
  return buildSceneBriefPromptBlock(brief);
}

/**
 * Mission-level Crew scene brief → enhance-product-photo payload.
 * Avoids duplicate /scene-brief Crew calls during auto-produce.
 */
export function sceneBriefForEnhanceApi(
  brief: ProductSceneBrief | null | undefined,
): Record<string, unknown> | undefined {
  if (!brief?.gpt_image2_prompt?.trim()) return undefined;
  return {
    gpt_image2_prompt: brief.gpt_image2_prompt,
    logo_placement: 'bottom_right',
    logo_size_pct: 12,
    logo_opacity: 0.75,
    background_concept: brief.background_concept,
    sector_archetype: brief.sector_archetype,
    _source: 'mission_scene_brief',
  };
}

export async function fetchProductSceneBrief(input: {
  workspaceId: string;
  missionId?: string;
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
        mission_id: input.missionId ?? undefined,
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
    layoutFamilyHint?: StoryLayoutFamily;
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
