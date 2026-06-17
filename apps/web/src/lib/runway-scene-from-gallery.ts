/**
 * Turn gallery vision analysis into Runway image-to-video scene context.
 * Preserves the exact frame while suggesting subtle, photo-grounded motion.
 */

import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import { isVisionAnalysisDescription } from '@/lib/feed-display-caption';
import type { RendererGalleryMeta } from '@/lib/renderer-payload';

const RUNWAY_DESC_MAX = 520;
const SCENE_MOMENT_MAX = 280;

export interface RunwayGalleryScenePackage {
  /** Full vision description for director GPT (English-safe, trimmed). */
  photoDescription: string;
  /** One-line "what this frame is" for Runway fidelity. */
  sceneMoment: string;
  /** Subtle motions safe for image-to-video (steam, ripple, bokeh…). */
  microMotions: string[];
  photoTags: string[];
  photoMood?: string;
  usageContext?: string;
  pairingKeywords?: string[];
  captionHooks?: string[];
  hasPeople?: boolean;
}

/** Strip vision boilerplate prefixes; keep substantive scene text. */
export function sanitizePhotoDescriptionForRunway(raw: string): string {
  let t = raw.trim();
  if (!t) return '';

  t = t
    .replace(/^(the|this)\s+(image|photo|picture|photograph)\s+(shows|depicts|features|contains|displays)\s+/i, '')
    .replace(/^in\s+the\s+(image|photo|picture),?\s+/i, '')
    .replace(/\bthe\s+image\s+shows\s+/gi, '')
    .trim();

  if (t.length > RUNWAY_DESC_MAX) {
    const cut = t.slice(0, RUNWAY_DESC_MAX);
    const lastPeriod = cut.lastIndexOf('.');
    t = lastPeriod > 120 ? cut.slice(0, lastPeriod + 1) : `${cut.trimEnd()}…`;
  }
  return t;
}

function collectTags(meta: Partial<GalleryPhotoMeta>): string[] {
  const fromContent = Array.isArray(meta.contentTags) ? meta.contentTags : [];
  const legacy = Array.isArray((meta as { tags?: string[] }).tags)
    ? (meta as { tags?: string[] }).tags!
    : [];
  const merged = [...fromContent, ...legacy, ...(meta.pairingKeywords ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of merged) {
    const k = String(t).trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(String(t).trim());
    if (out.length >= 16) break;
  }
  return out;
}

function hasPeopleFlag(meta: Partial<GalleryPhotoMeta>): boolean {
  if (typeof (meta as { hasPeople?: boolean }).hasPeople === 'boolean') {
    return (meta as { hasPeople?: boolean }).hasPeople!;
  }
  const text = [
    meta.description ?? '',
    ...(meta.contentTags ?? []),
    meta.usageContext ?? '',
  ].join(' ').toLowerCase();
  return /\b(people|person|guests|crowd|patrons|diners|couple|friends|staff|bartender|chef|team|hands)\b/.test(text);
}

/** Derive safe micro-motions from visible subjects (no invented action). */
export function deriveMicroMotions(
  description: string,
  tags: string[],
  opts?: { mood?: string; hasPeople?: boolean },
): string[] {
  const blob = [description, ...tags, opts?.mood ?? ''].join(' ').toLowerCase();
  const motions: string[] = [];

  const add = (m: string) => {
    if (!motions.includes(m)) motions.push(m);
  };

  if (/steam|hot|coffee|tea|soup|plate|food|dish|kitchen|grill/.test(blob)) {
    add('gentle steam rising');
  }
  if (/cocktail|drink|glass|wine|beer|pour|liquid|bottle|ice|condensation/.test(blob)) {
    add('liquid shimmer and condensation on glass');
  }
  if (/water|sea|ocean|pool|wave|beach|coast|harbor|marina/.test(blob)) {
    add('soft water ripple and light play');
  }
  if (/candle|fire|flame|torch|bonfire/.test(blob)) {
    add('candle flame flicker');
  }
  if (/sunset|golden hour|evening|night|neon|club|bar|ambient/.test(blob)) {
    add('warm bokeh and ambient light shift');
  }
  if (/outdoor|terrace|garden|patio|rooftop|breeze|tree|palm/.test(blob)) {
    add('subtle breeze in foliage or fabric');
  }
  if (opts?.hasPeople || /\b(hands|bartender|chef|barista|mixologist|server)\b/.test(blob)) {
    add('minimal hand movement only if already visible in frame');
  }
  if (/smoke|hookah|grill/.test(blob)) {
    add('thin smoke drift');
  }

  if (motions.length === 0) {
    add('soft parallax and gentle focus breathing');
    add('subtle light shimmer on existing surfaces');
  }

  return motions.slice(0, 4);
}

function buildSceneMomentLine(
  description: string,
  meta: Partial<GalleryPhotoMeta>,
): string {
  const mood = meta.mood?.trim();
  const usage = meta.usageContext?.trim();
  const hooks = meta.captionHooks?.filter((h) => h && !isVisionAnalysisDescription(h)) ?? [];
  const hook = hooks[0]?.slice(0, 100);

  const base = description.length >= 40
    ? description.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').trim()
    : description;

  const parts = [
    base.slice(0, SCENE_MOMENT_MAX),
    mood ? `Mood: ${mood}` : '',
    usage ? `Usage: ${usage.slice(0, 80)}` : '',
    hook ? `Moment: ${hook}` : '',
  ].filter(Boolean);

  return parts.join(' ').slice(0, SCENE_MOMENT_MAX + 80);
}

/**
 * Build structured scene package from gallery_analysis entry + optional caption.
 */
export function buildRunwayGalleryScenePackage(
  meta: Partial<GalleryPhotoMeta> | undefined,
  caption?: string,
): RunwayGalleryScenePackage | null {
  const rawDesc = String(meta?.description ?? '').trim();
  if (!rawDesc && !caption?.trim()) return null;

  const photoDescription = sanitizePhotoDescriptionForRunway(
    rawDesc || caption!.trim(),
  );
  if (!photoDescription) return null;

  const photoTags = collectTags(meta ?? {});
  const hasPeople = hasPeopleFlag(meta ?? {});
  const photoMood = meta?.mood?.trim();
  const microMotions = deriveMicroMotions(photoDescription, photoTags, {
    mood: photoMood,
    hasPeople,
  });

  let sceneMoment = buildSceneMomentLine(photoDescription, meta ?? {});
  if (caption?.trim() && !isVisionAnalysisDescription(caption)) {
    const cap = caption.trim().slice(0, 120);
    if (!sceneMoment.toLowerCase().includes(cap.slice(0, 40).toLowerCase())) {
      sceneMoment = `${sceneMoment} Align motion with post message: ${cap}.`.slice(
        0,
        SCENE_MOMENT_MAX + 100,
      );
    }
  }

  return {
    photoDescription,
    sceneMoment,
    microMotions,
    photoTags,
    photoMood,
    usageContext: meta?.usageContext?.trim(),
    pairingKeywords: meta?.pairingKeywords?.slice(0, 8),
    captionHooks: meta?.captionHooks?.slice(0, 4),
    hasPeople,
  };
}

/** Map gallery meta → renderer gallery block (Runway + buildReelPayload). */
export function galleryMetaToRendererGallery(
  meta: Partial<GalleryPhotoMeta> | undefined,
  opts?: { photoUrl?: string | null; matchScore?: number; caption?: string },
): RendererGalleryMeta {
  const pkg = buildRunwayGalleryScenePackage(meta, opts?.caption);
  return {
    photoUrl: opts?.photoUrl ?? null,
    description: pkg?.photoDescription ?? meta?.description,
    tags: pkg?.photoTags ?? collectTags(meta ?? {}),
    matchScore: opts?.matchScore,
    sceneMoment: pkg?.sceneMoment,
    microMotions: pkg?.microMotions,
    photoMood: pkg?.photoMood,
    usageContext: pkg?.usageContext,
    pairingKeywords: pkg?.pairingKeywords,
    hasPeople: pkg?.hasPeople,
  };
}

/** Director-only extras derived from gallery (for generate-reel body). */
export function runwaySceneFieldsFromGallery(
  meta: Partial<GalleryPhotoMeta> | undefined,
  caption?: string,
): Pick<
  RunwayGalleryScenePackage,
  'photoDescription' | 'sceneMoment' | 'microMotions' | 'photoTags' | 'photoMood'
> | null {
  const pkg = buildRunwayGalleryScenePackage(meta, caption);
  if (!pkg) return null;
  return {
    photoDescription: pkg.photoDescription,
    sceneMoment: pkg.sceneMoment,
    microMotions: pkg.microMotions,
    photoTags: pkg.photoTags,
    photoMood: pkg.photoMood,
  };
}
