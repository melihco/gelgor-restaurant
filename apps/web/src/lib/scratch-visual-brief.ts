/**
 * Idea / brief-driven scratch visual — SSOT for captionDrivenMode generation.
 *
 * Priority stack (what the camera should show):
 *   1. Idea visual layer — visual_direction, scene_hint, mood, strategic_purpose, product_type
 *   2. Slot / calendar — slot role, catalog key, FD hints, mission brief, VPS edit prompt
 *   3. Vibe / brand DNA — applied separately in generate-instagram-image
 *   4. Caption / headline — narrative meaning only (never the sole scene brief)
 */

export type ScratchBriefSource =
  | 'visual_direction'
  | 'scene_hint'
  | 'mood'
  | 'strategic_purpose'
  | 'product_type'
  | 'image_edit_prompt'
  | 'shot_type'
  | 'slot_role'
  | 'catalog_slot_key'
  | 'visual_subject_hint'
  | 'fal_design_hint'
  | 'mission_brief'
  | 'headline_fallback';

export interface ScratchVisualBrief {
  /** Primary camera/scene instruction — never caption-only when direction exists. */
  sceneBrief: string;
  visualDirection: string;
  sceneHint: string;
  mood: string;
  strategicPurpose: string;
  productType: string;
  imageEditPrompt: string;
  shotType: string;
  slotRole: string;
  catalogSlotKey: string;
  visualSubjectHint: string;
  falDesignHint: string;
  missionBrief: string;
  promptPackSummary: string;
  /** Which fields contributed to sceneBrief / prompt. */
  sources: ScratchBriefSource[];
  /** True when we only had headline/caption — weak brief. */
  briefThin: boolean;
}

function trimStr(v: unknown, max = 500): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function vpsField(
  idea: Record<string, unknown>,
  snake: string,
  camel: string,
): string {
  const vps = (idea.visual_production_spec ?? idea.visualProductionSpec) as
    | Record<string, unknown>
    | undefined;
  if (!vps || typeof vps !== 'object') return '';
  return trimStr(vps[snake] ?? vps[camel], 400);
}

export function summarizePromptPack(
  pack: Record<string, unknown> | null | undefined,
): string {
  if (!pack || typeof pack !== 'object') return '';
  const parts: string[] = [];
  for (const key of [
    'creative_intent_tr',
    'scene_hint',
    'sceneHint',
    'visual_direction',
    'visualDirection',
    'mood',
    'daypart',
    'shot_type',
    'shotType',
    'require_premium_composition',
  ] as const) {
    const v = pack[key];
    if (typeof v === 'string' && v.trim()) parts.push(`${key}: ${v.trim().slice(0, 120)}`);
    else if (typeof v === 'boolean' && v) parts.push(String(key));
  }
  return parts.join('; ').slice(0, 280);
}

export interface BuildScratchVisualBriefInput {
  idea: Record<string, unknown>;
  headline?: string;
  caption?: string;
  mood?: string;
  assignment?: {
    slot_role?: string;
    pipeline?: string;
    catalog_slot_key?: string;
    visual_subject_hint?: string;
    fal_design_hint?: string;
    prompt_pack?: Record<string, unknown> | null;
  } | null;
  missionBrief?: string | null;
  promptPack?: Record<string, unknown> | null;
}

/**
 * Build scratch visual brief from idea + assignment + mission.
 * Caption is never used as the primary scene brief.
 */
export function buildScratchVisualBrief(
  input: BuildScratchVisualBriefInput,
): ScratchVisualBrief {
  const idea = input.idea ?? {};
  const assignment = input.assignment ?? null;

  const visualDirection = trimStr(
    idea.visual_direction ?? idea.visualDirection,
    400,
  );
  const sceneHint = trimStr(
    idea.scene_hint ?? idea.sceneHint ?? vpsField(idea, 'scene_hint', 'sceneHint'),
    300,
  );
  const mood = trimStr(input.mood ?? idea.mood, 120);
  const strategicPurpose = trimStr(
    idea.strategic_purpose ?? idea.strategicPurpose,
    300,
  );
  const productType = trimStr(
    idea.product_type ?? idea.productType ?? idea.subject,
    120,
  );
  const imageEditPrompt = vpsField(idea, 'image_edit_prompt', 'imageEditPrompt');
  const shotType = vpsField(idea, 'shot_type', 'shotType');
  const slotRole = trimStr(assignment?.slot_role, 80);
  const catalogSlotKey = trimStr(
    assignment?.catalog_slot_key ?? idea.catalog_slot_key,
    120,
  );
  const visualSubjectHint = trimStr(assignment?.visual_subject_hint, 200);
  const falDesignHint = trimStr(assignment?.fal_design_hint, 200);
  const missionBrief = trimStr(input.missionBrief, 600);
  const promptPackSummary = summarizePromptPack(
    input.promptPack ?? assignment?.prompt_pack ?? null,
  );

  const sources: ScratchBriefSource[] = [];
  const sceneParts: string[] = [];

  if (visualDirection) {
    sceneParts.push(visualDirection);
    sources.push('visual_direction');
  }
  if (sceneHint && sceneHint !== visualDirection) {
    sceneParts.push(sceneHint);
    sources.push('scene_hint');
  }
  if (imageEditPrompt) {
    sceneParts.push(imageEditPrompt);
    sources.push('image_edit_prompt');
  }
  if (shotType) {
    sceneParts.push(`Shot: ${shotType}`);
    sources.push('shot_type');
  }
  if (productType) {
    sceneParts.push(`Hero subject: ${productType}`);
    sources.push('product_type');
  }
  if (mood) {
    sceneParts.push(`Mood: ${mood}`);
    sources.push('mood');
  }
  if (strategicPurpose) {
    sceneParts.push(`Purpose: ${strategicPurpose}`);
    sources.push('strategic_purpose');
  }
  if (visualSubjectHint) {
    sceneParts.push(`Must show: ${visualSubjectHint}`);
    sources.push('visual_subject_hint');
  }
  if (falDesignHint) {
    sceneParts.push(`Design note: ${falDesignHint}`);
    sources.push('fal_design_hint');
  }
  if (promptPackSummary) {
    sceneParts.push(`Slot pack: ${promptPackSummary}`);
  }
  if (slotRole) sources.push('slot_role');
  if (catalogSlotKey) sources.push('catalog_slot_key');
  if (missionBrief) {
    sceneParts.push(`Mission: ${missionBrief.slice(0, 280)}`);
    sources.push('mission_brief');
  }

  const headline = trimStr(input.headline ?? idea.headline ?? idea.title, 120);
  let briefThin = false;
  if (!sceneParts.length) {
    briefThin = true;
    if (headline) {
      sceneParts.push(headline);
      sources.push('headline_fallback');
    }
  }

  return {
    sceneBrief: sceneParts.join(' — ').slice(0, 900),
    visualDirection,
    sceneHint,
    mood,
    strategicPurpose,
    productType,
    imageEditPrompt,
    shotType,
    slotRole,
    catalogSlotKey,
    visualSubjectHint,
    falDesignHint,
    missionBrief,
    promptPackSummary,
    sources: [...new Set(sources)],
    briefThin,
  };
}

/** Prompt lines for generate-instagram-image scratch / captionDriven path. */
export function buildScratchCreativePromptLines(input: {
  brief: ScratchVisualBrief;
  headline?: string;
  caption?: string;
}): string[] {
  const { brief } = input;
  const lines: string[] = [
    'IDEA / BRIEF-DRIVEN SCENE (priority order — follow this over marketing copy)',
    `Primary scene brief: ${brief.sceneBrief || '(thin brief — use brand + vibe carefully)'}`,
  ];
  if (brief.visualDirection) {
    lines.push(`Visual direction (camera): ${brief.visualDirection}`);
  }
  if (brief.sceneHint) lines.push(`Scene hint: ${brief.sceneHint}`);
  if (brief.imageEditPrompt) lines.push(`Edit / shot prompt: ${brief.imageEditPrompt}`);
  if (brief.shotType) lines.push(`Shot type: ${brief.shotType}`);
  if (brief.productType) lines.push(`Product / subject: ${brief.productType}`);
  if (brief.mood) lines.push(`Mood: ${brief.mood}`);
  if (brief.strategicPurpose) lines.push(`Strategic purpose: ${brief.strategicPurpose}`);
  if (brief.slotRole || brief.catalogSlotKey) {
    lines.push(
      `Slot: ${[brief.slotRole, brief.catalogSlotKey].filter(Boolean).join(' / ')}`,
    );
  }
  if (brief.visualSubjectHint) lines.push(`Gallery/subject hint: ${brief.visualSubjectHint}`);
  if (brief.promptPackSummary) lines.push(`Prompt pack: ${brief.promptPackSummary}`);
  if (brief.missionBrief) {
    lines.push(`Mission brief (context only): ${brief.missionBrief.slice(0, 400)}`);
  }
  if (brief.briefThin) {
    lines.push(
      'WARNING: Thin idea brief — do not invent unrelated products or venues; stay on-brand.',
    );
  }
  const productCue = Boolean(
    brief.productType
    || /\bproduct\b/i.test(brief.visualSubjectHint)
    || /\bproduct\b/i.test(brief.slotRole)
    || /\bproduct\b/i.test(brief.catalogSlotKey),
  );
  if (productCue) {
    lines.push(
      'PACKAGING FIDELITY: NEVER invent or approximate brand logos/labels on jars or bottles.',
      'Without a real product reference photo: blank unlabeled packaging only — no fake brand text.',
      'With a real product reference: keep label/logo letter-perfect; change only the environment.',
    );
  }
  const headline = trimStr(input.headline, 120);
  const caption = trimStr(input.caption, 400);
  if (headline) lines.push(`Asset title (not text in image): ${headline}`);
  if (caption) {
    lines.push(
      `Narrative meaning to imply visually, NEVER as written text (secondary to scene brief): ${caption}`,
    );
  }
  return lines;
}

export function scratchBriefTelemetry(brief: ScratchVisualBrief): {
  scratch_visual_mode: 'idea_brief';
  scratch_brief_sources: ScratchBriefSource[];
  scratch_brief_thin: boolean;
} {
  return {
    scratch_visual_mode: 'idea_brief',
    scratch_brief_sources: brief.sources,
    scratch_brief_thin: brief.briefThin,
  };
}
