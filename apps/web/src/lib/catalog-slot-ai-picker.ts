/**
 * AI Catalog Slot Picker — multi-tenant, sector-agnostic.
 *
 * Matches a brief (title + direction + format) to one *enabled* catalog slot
 * using structured slot signals (design_template_type, announcement_types,
 * keywords, labels). No per-tenant UUID branches and no sector if/else trees:
 * every sector pack already stamps the same taxonomies onto slot_keys.
 *
 * Invalid / missing picks → heuristic matcher fallback.
 */
import OpenAI from 'openai';
import { serverConfig } from '@/lib/server-config';
import { detectIdeaPackageFormat } from '@/lib/weekly-publish-package';
import {
  emitAiCostLine,
  estimateOpenAiUsd,
  type OpenAiUsageLike,
} from '@/lib/ai-cost-telemetry';
import {
  catalogIntentFamiliesConflict,
  resolveIdeaIntentFamily,
  resolveSlotIntentFamily,
  type BrandActiveSlot,
  type BrandActiveSlotSet,
} from '@/lib/brand-active-slot-resolver';
import { catalogSlotPurposeKey } from '@/lib/sector-slot-pack';

export interface CatalogSlotPickerCandidate {
  slot_key: string;
  label_tr: string;
  label_en: string;
  format: string;
  /** Catalog design template taxonomy (event_special, menu_highlight, …). */
  design_template_type?: string;
  /** Intent family derived from taxonomy — sector-agnostic. */
  intent_family?: string;
  announcement_types?: string[];
  keywords?: string[];
  library_slot_key?: string | null;
  /** Brand has an active renderable design template for this slot. */
  has_template?: boolean;
  /** Compact one-line summary for prompts / logs. */
  purpose?: string;
}

export interface CatalogSlotAiPickInput {
  title: string;
  direction?: string;
  /** post | story | reel | carousel — filters candidates */
  format: string;
  candidates: CatalogSlotPickerCandidate[];
  /** Brand sector id — vocabulary context only, never used for branching. */
  sector?: string;
}

export interface CatalogSlotAiPickResult {
  catalog_slot_key: string;
  reason: string;
  picker: 'ai';
  model: string;
}

/**
 * Universal router prompt: works for all sector packs via shared taxonomies.
 * Do not encode brand or sector names as special cases.
 */
export const CATALOG_SLOT_PICKER_SYSTEM = `You are a catalog-slot router for a multi-tenant social content OS.
Your job: match BRIEF INTENT → exactly one enabled catalog slot from the candidate list.

OUTPUT (JSON only):
{"catalog_slot_key":"<exact key from candidates>","reason":"<≤12 words>"}

TAXONOMY (how to read each candidate):
- intent_family: event | product_menu | offer_ticket | venue | social_proof | hiring | brand_bts | other
- design_template_type: event_special, menu_highlight, campaign_announcement, venue_showcase, social_proof, daily_story, announcement_formal, brand_identity, seasonal_promo, reel_cover
- announcement_types: event_teaser / event_announcement / product_reveal / product_showcase / offer_campaign / venue_showcase / social_proof / hiring / behind_the_scenes / …
- keywords + labels: human language for the slot's PURPOSE

DECISION FRAMEWORK (apply in order — no sector exceptions):
1) TITLE is primary intent. Direction / mood / colors are supporting context only — never override the title's subject.
2) Classify the brief into an intent_family, then prefer candidates with the same intent_family (or matching announcement_types / design_template_type).
3) Named occasions ("X Night", "X Gecesi", party, concert, DJ, live music, wedding, launch event) → intent_family=event. Do NOT pick product_menu / cocktail / drink slots just because direction mentions drinks, tropical colors, or atmosphere.
4) Product / dish / SKU / cocktail-or-menu / gift-set / hediye paketi AS THE SUBJECT → product_menu.
5) Discount, sale, day-pass, entry ticket, membership trial → offer_ticket.
6) Place atmosphere with no named event → venue.
7) Reviews / UGC → social_proof; jobs → hiring; process / craft / BTS / farm-visit / producer-visit → brand_bts.
   Never put gift-set / SKU promo briefs on farm_visit slots (and never farm-visit briefs on gift_bundle).
8) If two slots fit, prefer the more specific purpose (dj_event over generic event; product_hero over generic campaign).
9) Prefer has_template=true when intent is equal — slots without templates cannot render.
10) Never invent keys. Never cross formats. Ignore any notion of "priority score" — semantic fit wins.
11) reason: short, names the intent match (e.g. "named night → event slot").`;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((s) => s.trim()).filter(Boolean);
}

/** Map shared catalog taxonomies → intent family (no sector branching). */
export function intentFamilyFromSignals(input: {
  designTemplateType?: string;
  announcementTypes?: string[];
  keywords?: string[];
  slotKey?: string;
}): string {
  const ann = (input.announcementTypes ?? []).map((a) => a.toLowerCase());
  // Purpose stem only — ignores sector-id tokens (local_products / wedding_event / …).
  const key = catalogSlotPurposeKey(String(input.slotKey ?? ''));
  const type = String(input.designTemplateType ?? '').toLowerCase();
  const kw = (input.keywords ?? []).map((k) => k.toLowerCase()).join(' ');

  if (
    ann.some((a) => a.includes('hiring') || a.includes('job'))
    || /hiring|open_role|job_posting/.test(key)
  ) {
    return 'hiring';
  }
  if (
    ann.some((a) => a.includes('event') || a.includes('wedding'))
    || type === 'event_special'
    || /(?:^|_)(event|events|dj|live_music|concert|wedding|bridal|aftermovie)(?:_|$)/.test(key)
    // Caption/keyword cues — ideas with drifted announcement labels still classify as event.
    || /\b(dj|live\s*set|live\s*music|line.?up|konser|afterparty|aftermovie|wedding|düğün)\b/.test(kw)
  ) {
    return 'event';
  }
  if (
    ann.some((a) => a.includes('social_proof') || a.includes('testimonial') || a.includes('ugc'))
    || type === 'social_proof'
    || /\b(guest\s*review|customer\s*review|testimonial|what\s*guests|misafir\s*yorum)\b/.test(kw)
  ) {
    return 'social_proof';
  }
  if (
    ann.some((a) => a.includes('behind_the_scenes') || a.includes('bts'))
    || type === 'daily_story'
    || /(?:^|_)(bts|behind|process|craft|farm_visit|orchard|grove|producer_visit)(?:_|$)/.test(key)
    || /farm.?to.?table/.test(key)
    // Origin / maker-visit cues — distinct from product SKU / gift-set promos.
    || /\b(farm\s*visit|çiftlik\s*ziyaret|ciftlik\s*ziyaret|orchard|grove|producer\s*visit|üretici\s*ziyaret)\b/.test(kw)
  ) {
    return 'brand_bts';
  }
  if (
    ann.some((a) => a.includes('product') || a.includes('menu'))
    || type === 'menu_highlight'
    || /(?:^|_)(product|menu|dish|cocktail|pastry|collection|arrival|vitrine|shelf|gift|bundle|hamper)(?:_|$)/.test(key)
    // Stem-friendly: Turkish plurals (ürünleri), shelf/vitrine, gift-set cues.
    || /(?:^|\s)(cocktail|kokteyl|ürün|product|menu|menü|tabak|dish|reçel|zeytin|vitrin|hediye|gift\s*set|gift\s*bundle|hamper)/.test(` ${kw} `)
  ) {
    return 'product_menu';
  }
  if (
    ann.some((a) => a.includes('offer') || a.includes('campaign') || a.includes('ticket'))
    || type === 'campaign_announcement'
    || type === 'seasonal_promo'
    || /(?:^|_)(offer|sale|promo|day_pass|daybed|ticket|flash|trial|membership)(?:_|$)/.test(key)
  ) {
    return 'offer_ticket';
  }
  if (
    ann.some((a) => a.includes('venue'))
    || type === 'venue_showcase'
    || type === 'brand_identity'
    || /(?:^|_)(venue|ambiance|facility|pool|room|suite|aerial)(?:_|$)/.test(key)
  ) {
    return 'venue';
  }
  return 'other';
}

export function candidateFromActiveSlot(slot: BrandActiveSlot): CatalogSlotPickerCandidate {
  const signals = slot.matchSignals && typeof slot.matchSignals === 'object'
    ? slot.matchSignals
    : {};
  const announcement_types = asStringArray(
    signals.announcement_types ?? signals.announcementTypes,
  ).slice(0, 6);
  const keywords = asStringArray(
    signals.keywords ?? signals.match_keywords,
  ).slice(0, 10);
  const design_template_type = slot.designTemplateType || undefined;
  const intent_family = intentFamilyFromSignals({
    designTemplateType: design_template_type,
    announcementTypes: announcement_types,
    keywords,
    slotKey: slot.slotKey,
  });
  const purpose = [
    `family=${intent_family}`,
    design_template_type ? `type=${design_template_type}` : '',
    announcement_types.length ? `ann=${announcement_types.join(',')}` : '',
    keywords.length ? `kw=${keywords.slice(0, 5).join(',')}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 160);

  return {
    slot_key: slot.slotKey,
    label_tr: slot.labelTr,
    label_en: slot.labelEn,
    format: slot.format,
    design_template_type,
    intent_family,
    announcement_types: announcement_types.length ? announcement_types : undefined,
    keywords: keywords.length ? keywords : undefined,
    library_slot_key: slot.librarySlotKey,
    has_template: slot.hasTemplate,
    purpose: purpose || undefined,
  };
}

/**
 * Enabled slots for format. When any candidate has an active template, drop
 * template-less rows so AI cannot hard-pin a non-renderable slot.
 */
export function candidatesFromActiveSlots(
  activeSlots: BrandActiveSlotSet,
  format: string,
): CatalogSlotPickerCandidate[] {
  const fmt = normalizePickerFormat(format);
  const all = activeSlots.slots
    .filter((s) => s.enabled && normalizePickerFormat(s.format) === fmt)
    .map(candidateFromActiveSlot);
  const withTemplate = all.filter((c) => c.has_template);
  return withTemplate.length > 0 ? withTemplate : all;
}

export function normalizePickerFormat(format: string): string {
  const f = String(format ?? '').trim().toLowerCase();
  if (f === 'feed' || f === 'feed_post' || f === 'instagram_post') return 'post';
  if (f === 'instagram_story') return 'story';
  if (f === 'instagram_reel') return 'reel';
  if (f === 'instagram_carousel') return 'carousel';
  return f || 'post';
}

export function ideaFormatForSlotPicker(idea: Record<string, unknown>): string {
  const explicit = String(
    idea.package_format
    ?? idea.publish_format
    ?? idea.target_format
    ?? '',
  ).trim();
  if (explicit) return normalizePickerFormat(explicit);
  return normalizePickerFormat(detectIdeaPackageFormat(idea));
}

export function parseCatalogSlotAiPick(
  raw: string,
  allowedKeys: Set<string>,
): { catalog_slot_key: string; reason: string } | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const key = String(parsed.catalog_slot_key ?? parsed.catalogSlotKey ?? '').trim();
    if (!key || !allowedKeys.has(key)) return null;
    return {
      catalog_slot_key: key,
      reason: String(parsed.reason ?? '').trim().slice(0, 120),
    };
  } catch {
    return null;
  }
}

/** Compact candidate line — structured fields the model can score against. */
export function formatPickerCandidateLine(
  candidate: CatalogSlotPickerCandidate,
  index: number,
): string {
  const label =
    candidate.label_en && candidate.label_en !== candidate.label_tr
      ? `${candidate.label_tr} / ${candidate.label_en}`
      : candidate.label_tr;
  const parts = [
    `${index + 1}. key=${candidate.slot_key}`,
    `label=${label}`,
    `family=${candidate.intent_family || 'other'}`,
  ];
  if (candidate.design_template_type) {
    parts.push(`template=${candidate.design_template_type}`);
  }
  if (candidate.announcement_types?.length) {
    parts.push(`announcement_types=[${candidate.announcement_types.join(',')}]`);
  }
  if (candidate.keywords?.length) {
    parts.push(`keywords=[${candidate.keywords.slice(0, 8).join(', ')}]`);
  }
  if (candidate.has_template != null) {
    parts.push(`has_template=${candidate.has_template ? 'true' : 'false'}`);
  }
  return parts.join(' | ');
}

export function buildCatalogSlotPickerUserPrompt(input: CatalogSlotAiPickInput): string {
  const lines = [
    `Brand sector (context only): ${input.sector || 'unknown'}`,
    `Format: ${input.format}`,
    `Brief title (PRIMARY INTENT): ${input.title.trim().slice(0, 160)}`,
    input.direction?.trim()
      ? `Direction (secondary — mood/atmosphere only): ${input.direction.trim().slice(0, 400)}`
      : '',
    '',
    'Match title intent → candidate intent_family / announcement_types / keywords.',
    'Pick exactly one key from the list below.',
    '',
    'Candidates:',
    ...input.candidates.map((c, i) => formatPickerCandidateLine(c, i)),
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * Ask the model to pick one enabled catalog slot. Returns null on any failure
 * so callers keep the heuristic matcher.
 */
export async function pickCatalogSlotWithAi(
  input: CatalogSlotAiPickInput,
): Promise<CatalogSlotAiPickResult | null> {
  const format = normalizePickerFormat(input.format);
  const candidates = input.candidates.filter(
    (c) => normalizePickerFormat(c.format) === format && String(c.slot_key).trim(),
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return {
      catalog_slot_key: candidates[0]!.slot_key,
      reason: 'single_candidate',
      picker: 'ai',
      model: 'none',
    };
  }

  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey) {
    console.warn('[catalog-slot-ai-picker] No OpenAI API key — heuristic fallback');
    return null;
  }

  const allowed = new Set(candidates.map((c) => c.slot_key));
  const model = serverConfig.ai.chatModel('standard');

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 140,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CATALOG_SLOT_PICKER_SYSTEM },
        {
          role: 'user',
          content: buildCatalogSlotPickerUserPrompt({ ...input, format, candidates }),
        },
      ],
    });

    const usage = response.usage as OpenAiUsageLike | undefined;
    if (usage) {
      emitAiCostLine({
        callType: 'catalog_slot_pick',
        usd: estimateOpenAiUsd(model, usage),
        provider: 'openai',
        model,
        promptTokens: usage.prompt_tokens ?? undefined,
        completionTokens: usage.completion_tokens ?? undefined,
        detail: 'catalog-slot-ai-picker',
        slotKey: undefined,
      });
    }

    const raw = response.choices[0]?.message?.content ?? '';
    const parsed = parseCatalogSlotAiPick(raw, allowed);
    if (!parsed) {
      console.warn(
        `[catalog-slot-ai-picker] invalid pick — heuristic fallback. raw=${raw.slice(0, 160)}`,
      );
      return null;
    }

    console.log(
      `[catalog-slot-ai-picker] ${parsed.catalog_slot_key}`
      + (parsed.reason ? ` (${parsed.reason})` : ''),
    );

    return {
      catalog_slot_key: parsed.catalog_slot_key,
      reason: parsed.reason || 'ai_pick',
      picker: 'ai',
      model,
    };
  } catch (err) {
    console.warn(
      `[catalog-slot-ai-picker] failed — heuristic fallback: `
      + `${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function briefFieldsFromIdea(idea: Record<string, unknown>): {
  title: string;
  direction: string;
} {
  const title = String(
    idea.headline
    ?? idea.concept_title
    ?? idea.title
    ?? idea.idea_title
    ?? '',
  ).trim();
  const direction = [
    idea.caption_draft,
    idea.caption,
    idea.visual_direction,
    idea.scene_hint,
    idea.strategic_purpose,
    idea.mood,
  ]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 500);
  return { title: title || 'Untitled brief', direction };
}

/**
 * For New Brief / ad-hoc ideas: AI-prefer a catalog slot before heuristic stamp.
 */
export async function preferAiCatalogSlotsOnIdeas(input: {
  ideas: Record<string, unknown>[];
  activeSlots: BrandActiveSlotSet;
  sector?: string;
}): Promise<Record<string, unknown>[]> {
  const { ideas, activeSlots, sector } = input;
  if (!ideas.length || activeSlots.slots.length === 0) return ideas;

  const out: Record<string, unknown>[] = [];
  for (const idea of ideas) {
    const format = ideaFormatForSlotPicker(idea);
    const candidates = candidatesFromActiveSlots(activeSlots, format);
    if (candidates.length === 0) {
      out.push(idea);
      continue;
    }

    const { title, direction } = briefFieldsFromIdea(idea);
    const pick = await pickCatalogSlotWithAi({
      title,
      direction,
      format,
      candidates,
      sector: sector ?? activeSlots.sectorId,
    });

    if (!pick) {
      out.push(idea);
      continue;
    }

    const slot: BrandActiveSlot | undefined = activeSlots.slots.find(
      (s) => s.slotKey === pick.catalog_slot_key,
    );
    // Reject strong intent-family mismatches (e.g. product_menu brief → events_calendar).
    // Heuristic stamp / soft rematch can recover a compatible key.
    if (slot) {
      const ideaFamily = resolveIdeaIntentFamily({
        ...idea,
        headline: title,
        caption_draft: direction,
      });
      const slotFamily = resolveSlotIntentFamily(slot);
      if (catalogIntentFamiliesConflict(ideaFamily, slotFamily)) {
        console.warn(
          `[catalog-slot-ai-picker] rejected ${pick.catalog_slot_key} `
          + `(idea=${ideaFamily} vs slot=${slotFamily}) — heuristic fallback`,
        );
        out.push(idea);
        continue;
      }
    }
    out.push({
      ...idea,
      catalog_slot_key: pick.catalog_slot_key,
      catalog_slot_label: slot?.labelTr ?? idea.catalog_slot_label,
      catalog_slot_picker: pick.picker,
      catalog_slot_picker_reason: pick.reason,
      catalog_slot_picker_model: pick.model,
      catalog_slot_picker_family: slot
        ? intentFamilyFromSignals({
          designTemplateType: slot.designTemplateType,
          announcementTypes: asStringArray(slot.matchSignals?.announcement_types),
          keywords: asStringArray(slot.matchSignals?.keywords),
          slotKey: slot.slotKey,
        })
        : undefined,
    });
  }
  return out;
}
