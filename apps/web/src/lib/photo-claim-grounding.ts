/**
 * Current production channel: the shipped still is the claim source.
 * Caption / headline may only keep product *variants* the photo (or tenant
 * gallery inventory) can prove. Slot job, CTA, and tone stay intact.
 *
 * Reverse channel (mission brief → generate/shoot to match) is a separate
 * product path — do not invert this helper for that.
 */

import {
  resolveGalleryPhotoMeta,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';

export type PhotoClaimId = 'early_harvest' | 'extra_virgin' | 'cold_press';

type VariantClaim = {
  id: PhotoClaimId;
  /** Global, case-insensitive. */
  pattern: RegExp;
  family: 'oil_grade';
  fallbackSurface: { tr: string; en: string };
};

const VARIANT_CLAIMS: readonly VariantClaim[] = [
  {
    id: 'early_harvest',
    pattern: /erken\s*hasat|early\s*harvest/gi,
    family: 'oil_grade',
    fallbackSurface: { tr: 'erken hasat', en: 'early harvest' },
  },
  {
    id: 'extra_virgin',
    pattern: /naturel\s*s[ıi]zma|s[ıi]zma|extra\s*virgin/gi,
    family: 'oil_grade',
    fallbackSurface: { tr: 'sızma', en: 'extra virgin' },
  },
  {
    id: 'cold_press',
    pattern: /so[ğg]uk\s*s[ıi]k[ıi]m|cold[\s-]*press(?:ed)?/gi,
    family: 'oil_grade',
    fallbackSurface: { tr: 'soğuk sıkım', en: 'cold pressed' },
  },
];

const OIL_GRADE_ORDER: PhotoClaimId[] = ['extra_virgin', 'cold_press', 'early_harvest'];

export type PhotoClaimEvidence = {
  blob: string;
  claims: Set<PhotoClaimId>;
  surfaces: Partial<Record<PhotoClaimId, string>>;
};

export type PhotoClaimGroundingResult = {
  caption: string;
  headline: string;
  changed: boolean;
  stripped: PhotoClaimId[];
  replaced: Array<{ from: PhotoClaimId; to: PhotoClaimId }>;
};

function looksEnglish(text: string): boolean {
  return /\b(the|with|our|your|early harvest|extra virgin|cold pressed)\b/i.test(text)
    && !/(ve|için|ile|bir|zeytinyağ|hasat|sızma|sizma)/i.test(text);
}

export function photoEvidenceBlob(meta: GalleryPhotoMeta | undefined): string {
  if (!meta) return '';
  return [
    meta.visibleLabelText,
    meta.primarySubject,
    meta.subjectFamily,
    ...(meta.subjectAliases ?? []),
    ...(meta.contentTags ?? []),
    meta.description,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

export function detectPhotoClaims(text: string): PhotoClaimEvidence {
  const blob = String(text ?? '');
  const claims = new Set<PhotoClaimId>();
  const surfaces: Partial<Record<PhotoClaimId, string>> = {};
  if (!blob.trim()) return { blob, claims, surfaces };
  for (const claim of VARIANT_CLAIMS) {
    const match = blob.match(claim.pattern);
    if (!match?.[0]) continue;
    claims.add(claim.id);
    surfaces[claim.id] = match[0].replace(/\s+/g, ' ').trim();
  }
  return { blob, claims, surfaces };
}

export function collectInventoryClaimEvidence(
  galleryMeta: Record<string, GalleryPhotoMeta> | undefined,
): PhotoClaimEvidence {
  const parts: string[] = [];
  if (galleryMeta) {
    for (const meta of Object.values(galleryMeta)) {
      const blob = photoEvidenceBlob(meta);
      if (blob) parts.push(blob);
    }
  }
  return detectPhotoClaims(parts.join(' '));
}

function resolvePinEvidence(
  photoUrl: string | null | undefined,
  galleryMeta: Record<string, GalleryPhotoMeta> | undefined,
): PhotoClaimEvidence {
  const url = String(photoUrl ?? '').trim();
  const meta = url && galleryMeta
    ? resolveGalleryPhotoMeta(url, galleryMeta)
    : undefined;
  const pin = detectPhotoClaims(photoEvidenceBlob(meta));
  if (pin.claims.size > 0 || pin.blob.trim().length >= 8) return pin;
  return collectInventoryClaimEvidence(galleryMeta);
}

function surfaceFor(
  id: PhotoClaimId,
  evidence: PhotoClaimEvidence,
  locale: 'tr' | 'en',
): string {
  const seen = evidence.surfaces[id];
  if (seen) return seen.toLocaleLowerCase(locale === 'tr' ? 'tr' : 'en');
  const row = VARIANT_CLAIMS.find((c) => c.id === id);
  return locale === 'en' ? (row?.fallbackSurface.en ?? id) : (row?.fallbackSurface.tr ?? id);
}

function siblingReplacement(
  unsupported: PhotoClaimId,
  evidence: PhotoClaimEvidence,
): PhotoClaimId | null {
  const row = VARIANT_CLAIMS.find((c) => c.id === unsupported);
  if (!row) return null;
  for (const id of OIL_GRADE_ORDER) {
    if (id === unsupported) continue;
    if (VARIANT_CLAIMS.find((c) => c.id === id)?.family !== row.family) continue;
    if (evidence.claims.has(id)) return id;
  }
  return null;
}

function applyClaimEdit(
  text: string,
  claim: VariantClaim,
  replacement: string,
): string {
  const flags = claim.pattern.flags.includes('g') ? claim.pattern.flags : `${claim.pattern.flags}g`;
  const rx = new RegExp(claim.pattern.source, flags);
  let out = '';
  let last = 0;
  rx.lastIndex = 0;
  let match: RegExpExecArray | null = rx.exec(text);
  while (match) {
    const start = match.index;
    out += text.slice(last, start);
    if (replacement) {
      const atStart = start === 0 || /[\n.!?]\s*$/.test(text.slice(0, start));
      out += atStart
        ? replacement.charAt(0).toLocaleUpperCase('tr') + replacement.slice(1)
        : replacement;
    }
    last = start + match[0].length;
    match = rx.exec(text);
  }
  out += text.slice(last);
  return tidyCopy(out);
}

function tidyCopy(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?]){2,}/g, '$1')
    .trim();
}

function firstSpokenLine(caption: string, maxLen = 72): string {
  const raw = caption.replace(/[#@]\S+/g, '').trim();
  const first = raw.split(/[.!?\n]+/).map((s) => s.trim()).find((s) => s.length >= 8) ?? raw;
  return first.replace(/[.,;:]+$/g, '').slice(0, maxLen);
}

function rewriteAgainstEvidence(
  text: string,
  evidence: PhotoClaimEvidence,
  locale: 'tr' | 'en',
): { text: string; stripped: PhotoClaimId[]; replaced: Array<{ from: PhotoClaimId; to: PhotoClaimId }> } {
  const present = detectPhotoClaims(text);
  const stripped: PhotoClaimId[] = [];
  const replaced: Array<{ from: PhotoClaimId; to: PhotoClaimId }> = [];
  let next = text;
  for (const claim of VARIANT_CLAIMS) {
    if (!present.claims.has(claim.id)) continue;
    if (evidence.claims.has(claim.id)) continue;
    const swap = siblingReplacement(claim.id, evidence);
    if (swap) {
      next = applyClaimEdit(next, claim, surfaceFor(swap, evidence, locale));
      replaced.push({ from: claim.id, to: swap });
    } else {
      next = applyClaimEdit(next, claim, '');
      stripped.push(claim.id);
    }
  }
  return { text: next, stripped, replaced };
}

/**
 * Ground publish caption + headline to the pinned still, or to gallery
 * inventory when the still is generated / unbound.
 */
export function groundPublishCopyToVisual(input: {
  caption: string;
  headline?: string;
  photoUrl?: string | null;
  galleryMeta?: Record<string, GalleryPhotoMeta>;
  /** No real pin — prove claims from tenant inventory only. */
  generatedFill?: boolean;
}): PhotoClaimGroundingResult {
  const caption = String(input.caption ?? '').trim();
  const headline = String(input.headline ?? '').trim();
  const empty: PhotoClaimGroundingResult = {
    caption,
    headline,
    changed: false,
    stripped: [],
    replaced: [],
  };
  if (!caption && !headline) return empty;

  const evidence = input.generatedFill
    ? collectInventoryClaimEvidence(input.galleryMeta)
    : resolvePinEvidence(input.photoUrl, input.galleryMeta);

  const locale = looksEnglish(`${caption} ${headline}`) ? 'en' : 'tr';
  const cap = rewriteAgainstEvidence(caption, evidence, locale);
  let head = rewriteAgainstEvidence(headline, evidence, locale);
  if (head.text.length < 4 && cap.text.length >= 8) {
    head = { ...head, text: firstSpokenLine(cap.text) };
  }

  const changed = cap.text !== caption || head.text !== headline;
  return {
    caption: cap.text,
    headline: head.text,
    changed,
    stripped: [...new Set([...cap.stripped, ...head.stripped])],
    replaced: [...cap.replaced, ...head.replaced],
  };
}
