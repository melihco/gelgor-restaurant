/**
 * Brand-scoped slot creative brief — structured scene/design intent for
 * template-library generation (not a free-form prompt dump).
 *
 * Stored on tenant_slot_assignments.customization and mirrored into
 * brand_design_templates.design_spec.slot_creative_brief.
 */

export const SLOT_CREATIVE_CUSTOMIZATION_VERSION = 1 as const;

export type SlotCreativeSeedSource =
  | 'auto_onboarding'
  | 'auto_template_gen'
  | 'operator';

export interface SlotCreativeCustomization {
  version: typeof SLOT_CREATIVE_CUSTOMIZATION_VERSION;
  /** One-sentence design job for this brand×slot (TR). */
  creative_intent_tr: string;
  /** Short visual must-haves (layout/type energy — not photo invent). */
  must_show?: string[];
  /** Looks this slot must reject (vs sibling slots + generic Canva). */
  must_avoid?: string[];
  daypart?: string;
  mood?: string;
  seeded_at?: string;
  seed_source?: SlotCreativeSeedSource;
}

export type SeedSlotCreativeInput = {
  brandName: string;
  location?: string;
  visualDna?: string;
  brandTone?: string;
  slotName: string;
  slotKey: string;
  templateType: string;
  format: string;
  falUseCase?: string | null;
  seedSource?: SlotCreativeSeedSource;
  /** House anti-patterns from Brand Design Constitution. */
  antiPatterns?: string[];
  /** Real signature offerings — product slots must show these, never invent SKUs. */
  signatureOfferings?: string[];
  composeMode?: string;
  headingFont?: string;
  typeEnergy?: string;
  layoutPackId?: string;
};

export type SlotCreativeJob =
  | 'golden_hour'
  | 'event'
  | 'product'
  | 'social_proof'
  | 'offer'
  | 'reel'
  | 'story'
  | 'general';

/** Thin slot-role map — job only, not brand voice. House style supplies voice. */
export function resolveSlotCreativeJob(input: {
  templateType?: string | null;
  falUseCase?: string | null;
  slotKey?: string | null;
  slotName?: string | null;
  format?: string | null;
}): SlotCreativeJob {
  const signals = [
    input.templateType,
    input.falUseCase,
    input.slotKey,
    input.slotName,
    input.format,
  ].map((s) => String(s ?? '').toLowerCase()).join(' ');

  if (/sunset|golden|gün batım|gun batim/.test(signals)) return 'golden_hour';
  if (/dj|night|gece|party|cuba|event_announcement|event_special|etkinlik/.test(signals)) {
    return 'event';
  }
  if (/cocktail|kokteyl|bar|drink|menu_highlight|product|imza|signature|dish|harvest|sku/.test(signals)) {
    return 'product';
  }
  if (/social_proof|guest|yorum|misafir|testimonial/.test(signals)) return 'social_proof';
  if (/day.?pass|booking|rezerv|offer|teklif|daybed/.test(signals)) return 'offer';
  if (String(input.format ?? '').includes('reel') || /reel/.test(signals)) return 'reel';
  if (String(input.format ?? '').includes('story') || /story/.test(signals)) return 'story';
  return 'general';
}

function trimStr(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function uniqShort(items: string[], maxItems: number, maxLen: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const s = trimStr(raw, maxLen);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Parse assignment.customization / design_spec.slot_creative_brief. */
export function parseSlotCreativeCustomization(
  raw: unknown,
): SlotCreativeCustomization | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const intent = trimStr(o.creative_intent_tr ?? o.creativeIntentTr, 220);
  if (!intent) return null;
  const mustShow = Array.isArray(o.must_show)
    ? uniqShort(o.must_show.map(String), 5, 48)
    : Array.isArray(o.mustShow)
      ? uniqShort(o.mustShow.map(String), 5, 48)
      : undefined;
  const mustAvoid = Array.isArray(o.must_avoid)
    ? uniqShort(o.must_avoid.map(String), 5, 48)
    : Array.isArray(o.mustAvoid)
      ? uniqShort(o.mustAvoid.map(String), 5, 48)
      : undefined;
  const seedSource = trimStr(o.seed_source ?? o.seedSource, 32) as SlotCreativeSeedSource;
  const validSource: SlotCreativeSeedSource | undefined =
    seedSource === 'auto_onboarding'
    || seedSource === 'auto_template_gen'
    || seedSource === 'operator'
      ? seedSource
      : undefined;
  return {
    version: SLOT_CREATIVE_CUSTOMIZATION_VERSION,
    creative_intent_tr: intent,
    ...(mustShow?.length ? { must_show: mustShow } : {}),
    ...(mustAvoid?.length ? { must_avoid: mustAvoid } : {}),
    ...(trimStr(o.daypart, 40) ? { daypart: trimStr(o.daypart, 40) } : {}),
    ...(trimStr(o.mood, 60) ? { mood: trimStr(o.mood, 60) } : {}),
    ...(trimStr(o.seeded_at ?? o.seededAt, 40)
      ? { seeded_at: trimStr(o.seeded_at ?? o.seededAt, 40) }
      : {}),
    ...(validSource ? { seed_source: validSource } : {}),
  };
}

/**
 * Keep any usable brief unless force-reseed.
 * Operator briefs always win; auto/onboarding briefs are also kept so library
 * regen does not wipe place-specific intents already stamped on the tenant.
 */
export function shouldKeepExistingSlotCreative(
  existing: SlotCreativeCustomization | null | undefined,
  opts?: { force?: boolean },
): boolean {
  if (opts?.force) return false;
  return Boolean(existing?.creative_intent_tr?.trim());
}

/**
 * Deterministic brand×slot creative brief.
 * Slot job = role. Voice = house constitution (font / compose / offerings).
 */
export function seedSlotCreativeBrief(input: SeedSlotCreativeInput): SlotCreativeCustomization {
  const place = trimStr(input.location, 48) || 'venue';
  const slot = trimStr(input.slotName, 80) || 'slot';
  const tone = trimStr(input.brandTone, 60);
  const brand = trimStr(input.brandName, 80) || 'Brand';
  const houseCue = trimStr(input.typeEnergy, 48)
    || trimStr(input.composeMode, 32)
    || trimStr(input.headingFont, 32);
  const job = resolveSlotCreativeJob(input);

  let creative_intent_tr = `${brand} için ${slot}: markaya özel, tekrar etmeyen tasarım shell'i.`;
  let daypart: string | undefined;
  let mood: string | undefined;
  const must_show: string[] = [];
  const must_avoid: string[] = [
    'krem köşe sticker',
    'generic Canva flyer',
    'aynı rail kardeş slotlarla',
  ];

  if (job === 'golden_hour') {
    creative_intent_tr =
      `${brand} ${place} — gün batımı / golden hour anı: ${houseCue || 'sıcak ışık bandı'}, sakin punchline, teras atmosferi.`;
    daypart = 'golden_hour';
    mood = 'warm, calm, elevated';
    must_show.push('sıcak ışık bandı', 'kısa punchline', 'alt güvenli tipografi');
    must_avoid.push('gece neon flash', 'agresif event bar');
  } else if (job === 'event') {
    creative_intent_tr =
      `${brand} — gece / etkinlik duyurusu: ${houseCue || 'yüksek kontrast'}, thumb-stop punchline, event afişi enerjisi.`;
    daypart = 'night';
    mood = 'energetic, bold, nightlife';
    must_show.push('yüksek kontrast bar', 'tek kelime hook', 'event CTA katmanı');
    must_avoid.push('soft sunset dil', 'menü kartı look');
  } else if (job === 'product') {
    creative_intent_tr =
      `${brand} — ürün / imza teklif vurgusu: ${houseCue || 'hero ürün'} odaklı tipografi, temiz editorial hierarchy.`;
    mood = tone || 'appetizing, boutique';
    must_show.push('ürün-öncelikli tip zonası', 'marka accent dolgu');
    must_avoid.push('turizm broşürü', 'kalabalık text stack');
  } else if (job === 'social_proof') {
    creative_intent_tr =
      `${brand} — misafir / sosyal kanıt: ${houseCue || 'alıntı tipi'} hierarchy, güven veren sakin layout.`;
    mood = 'trust, warm, human';
    must_show.push('alıntı tipografi', 'sakin margin');
    must_avoid.push('satış afişi agresyonu', 'event neon');
  } else if (job === 'offer') {
    creative_intent_tr =
      `${brand} — teklif / rezervasyon: ${houseCue || 'net fayda'} headline, CTA katmanı, satış-klaritesi.`;
    mood = 'clear, inviting, commercial';
    must_show.push('fayda headline', 'net CTA bandı');
    must_avoid.push('belirsiz lifestyle poster', 'gece club look');
  } else if (job === 'reel') {
    creative_intent_tr =
      `${brand} — reel kapak: ${houseCue || 'thumb-stop siluet'}, az kelime, dikey tip güvenli bölge.`;
    mood = 'kinetic, bold';
    must_show.push('thumb-stop siluet', 'az kelime display');
    must_avoid.push('uzun paragraf', 'feed 4:5 dil');
  } else if (job === 'story') {
    creative_intent_tr =
      `${brand} — story poster: ${houseCue || 'dikey full-bleed'} tipografi, day-part netliği, marka accent.`;
    mood = tone || 'vertical, editorial';
    must_show.push('dikey tip güvenli bölge', 'tek odak headline');
    must_avoid.push('feed crop dili', 'yoğun text block');
  } else {
    creative_intent_tr =
      `${brand} — ${slot}: ${houseCue || 'bu slotun işini'} bir bakışta okutan markaya özel tip+yüzey dili.`;
    mood = tone || 'on-brand, intentional';
    must_show.push('net tip hierarchy', 'marka primary/accent yüzey');
  }

  const dna = trimStr(input.visualDna, 120);
  if (dna) {
    const dnaCue = dna.split(/[,;]/)[0]?.trim();
    if (dnaCue && mood && !mood.toLowerCase().includes(dnaCue.toLowerCase().slice(0, 12))) {
      mood = `${mood}; ${dnaCue.slice(0, 40)}`;
    }
  }

  const offerings = uniqShort(input.signatureOfferings ?? [], 3, 40);
  if (job === 'product' && offerings[0]) {
    must_show.push(offerings[0]);
    must_avoid.push('uydurma SKU', 'jenerik ürün kartı');
  }
  const houseAnti = uniqShort(input.antiPatterns ?? [], 3, 48);
  if (houseAnti.length) {
    const genericAvoid = new Set([
      'krem köşe sticker',
      'generic Canva flyer',
      'aynı rail kardeş slotlarla',
    ]);
    must_avoid.splice(
      0,
      must_avoid.length,
      ...houseAnti,
      ...must_avoid.filter((item) => !genericAvoid.has(item)),
    );
  }
  const houseMood = [input.composeMode, input.layoutPackId, input.headingFont]
    .map((s) => trimStr(s, 24))
    .filter(Boolean);
  if (houseMood.length && mood) {
    const extra = houseMood.find((s) => !mood!.toLowerCase().includes(s.toLowerCase()));
    if (extra) mood = `${mood}; ${extra}`;
  }

  return {
    version: SLOT_CREATIVE_CUSTOMIZATION_VERSION,
    creative_intent_tr: trimStr(creative_intent_tr, 220),
    must_show: uniqShort(must_show, 5, 48),
    must_avoid: uniqShort(must_avoid, 5, 48),
    ...(daypart ? { daypart } : {}),
    ...(mood ? { mood: trimStr(mood, 72) } : {}),
    seeded_at: new Date().toISOString(),
    seed_source: input.seedSource ?? 'auto_template_gen',
  };
}

/** Resolve brief for library gen: keep operator; else (re)seed. */
export function resolveSlotCreativeForLibraryGen(input: {
  existing?: unknown;
  seed: SeedSlotCreativeInput;
  forceReseed?: boolean;
}): { brief: SlotCreativeCustomization; seeded: boolean } {
  const existing = parseSlotCreativeCustomization(input.existing);
  if (shouldKeepExistingSlotCreative(existing, { force: input.forceReseed })) {
    return { brief: existing!, seeded: false };
  }
  return {
    brief: seedSlotCreativeBrief({
      ...input.seed,
      seedSource: input.seed.seedSource ?? 'auto_template_gen',
    }),
    seeded: true,
  };
}

/** Compact block for GPT/fal template-library prompts (design craft, not photo invent). */
export function formatSlotCreativeBriefPromptBlock(
  brief: SlotCreativeCustomization | null | undefined,
): string {
  if (!brief?.creative_intent_tr?.trim()) return '';
  const lines = [
    '═══ SLOT CREATIVE BRIEF (brand×slot design intent) ═══',
    `Intent: ${brief.creative_intent_tr.trim()}`,
  ];
  if (brief.must_show?.length) {
    lines.push(`Must show (design craft): ${brief.must_show.join('; ')}.`);
  }
  if (brief.must_avoid?.length) {
    lines.push(`Must avoid: ${brief.must_avoid.join('; ')}.`);
  }
  if (brief.daypart) lines.push(`Daypart: ${brief.daypart}.`);
  if (brief.mood) lines.push(`Mood: ${brief.mood}.`);
  lines.push(
    'Apply to typography, painted surfaces, hierarchy, and silhouette — venue photo stays from gallery; do not invent a different place.',
  );
  return lines.join(' ');
}

/** True when a library template carries a usable brand×slot purpose brief. */
export function hasTemplateSlotCreativeBrief(designSpec: unknown): boolean {
  if (!designSpec || typeof designSpec !== 'object' || Array.isArray(designSpec)) {
    return false;
  }
  return parseSlotCreativeCustomization(
    (designSpec as Record<string, unknown>).slot_creative_brief,
  ) !== null;
}

/** Merge into assignment.customization JSON (preserve unknown keys). */
export function mergeSlotCreativeIntoCustomization(
  existing: Record<string, unknown> | null | undefined,
  brief: SlotCreativeCustomization,
): Record<string, unknown> {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...existing }
    : {};
  return {
    ...base,
    version: brief.version,
    creative_intent_tr: brief.creative_intent_tr,
    ...(brief.must_show ? { must_show: brief.must_show } : {}),
    ...(brief.must_avoid ? { must_avoid: brief.must_avoid } : {}),
    ...(brief.daypart ? { daypart: brief.daypart } : {}),
    ...(brief.mood ? { mood: brief.mood } : {}),
    ...(brief.seeded_at ? { seeded_at: brief.seeded_at } : {}),
    ...(brief.seed_source ? { seed_source: brief.seed_source } : {}),
  };
}
