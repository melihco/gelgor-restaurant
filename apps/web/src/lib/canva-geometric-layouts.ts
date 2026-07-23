/**
 * Canva-grade geometric layout shells — brand color canvas + framed photo + type.
 *
 * Intentional color fields + photo masks are PASS (designed geometry).
 * Amateur full-bleed caption / random mustard wedges remain FAIL.
 * Multi-tenant: catalog_slot_key + slotLook + sector — never brand UUIDs.
 */

import type { SlotLookKind } from '@/lib/slot-look-directive';

export type GeometricShellId =
  | 'arch_photo_stack'
  | 'inset_frame_on_color'
  | 'split_color_photo'
  | 'circle_portrait_lockup'
  | 'editorial_overlap_card'
  | 'badge_overlap_offer';

export type GeometricPhotoMask = 'arch' | 'circle' | 'rect' | 'rounded_rect';

export type GeometricShellContract = {
  id: GeometricShellId;
  name: string;
  pitch: string;
  /** Canvas fill role from brand kit. */
  canvasRole: 'primary' | 'accent' | 'cream' | 'ink';
  photoMask: GeometricPhotoMask;
  /** Where the photo window sits (normalized 0–1). */
  photoZone: { x: number; y: number; w: number; h: number };
  /** Type lives on color field, not on busy photo mid. */
  typePlacement: 'below_photo' | 'beside_photo' | 'overlap_card' | 'top_band';
  showVerticalEyebrow: boolean;
  showOverlappingBadge: boolean;
  formats: readonly ('story' | 'post')[];
};

export const GEOMETRIC_SHELL_CATALOG: readonly GeometricShellContract[] = [
  {
    id: 'arch_photo_stack',
    name: 'Arch Photo Stack',
    pitch: 'Bauhaus-style arch photo on brand canvas + type band below',
    canvasRole: 'cream',
    photoMask: 'arch',
    photoZone: { x: 0.1, y: 0.08, w: 0.8, h: 0.52 },
    typePlacement: 'below_photo',
    showVerticalEyebrow: false,
    showOverlappingBadge: false,
    formats: ['story', 'post'],
  },
  {
    id: 'inset_frame_on_color',
    name: 'Inset Frame on Color',
    pitch: 'Solid brand field + bordered photo inset + layered type',
    canvasRole: 'primary',
    photoMask: 'rounded_rect',
    photoZone: { x: 0.12, y: 0.1, w: 0.76, h: 0.48 },
    typePlacement: 'below_photo',
    showVerticalEyebrow: true,
    showOverlappingBadge: false,
    formats: ['story', 'post'],
  },
  {
    id: 'split_color_photo',
    name: 'Split Color Photo',
    pitch: 'Top/bottom color block + photo window — intentional Canva split',
    canvasRole: 'accent',
    photoMask: 'rect',
    photoZone: { x: 0, y: 0.38, w: 1, h: 0.62 },
    typePlacement: 'top_band',
    showVerticalEyebrow: false,
    showOverlappingBadge: false,
    formats: ['story', 'post'],
  },
  {
    id: 'circle_portrait_lockup',
    name: 'Circle Portrait Lockup',
    pitch: 'Circular photo mask + accent triangle chip + script/serif hierarchy',
    canvasRole: 'cream',
    photoMask: 'circle',
    photoZone: { x: 0.18, y: 0.12, w: 0.64, h: 0.42 },
    typePlacement: 'below_photo',
    showVerticalEyebrow: false,
    showOverlappingBadge: true,
    formats: ['story', 'post'],
  },
  {
    id: 'editorial_overlap_card',
    name: 'Editorial Overlap Card',
    pitch: 'Photo with overlapping frosted type card + vertical eyebrow',
    canvasRole: 'ink',
    photoMask: 'rect',
    photoZone: { x: 0.08, y: 0.06, w: 0.84, h: 0.72 },
    typePlacement: 'overlap_card',
    showVerticalEyebrow: true,
    showOverlappingBadge: false,
    formats: ['story', 'post'],
  },
  {
    id: 'badge_overlap_offer',
    name: 'Badge Overlap Offer',
    pitch: 'Framed photo + overlapping offer badge + CTA rule — booking/offer energy',
    canvasRole: 'cream',
    photoMask: 'rounded_rect',
    photoZone: { x: 0.08, y: 0.14, w: 0.84, h: 0.55 },
    typePlacement: 'below_photo',
    showVerticalEyebrow: false,
    showOverlappingBadge: true,
    formats: ['story', 'post'],
  },
] as const;

const SHELL_BY_ID = new Map(GEOMETRIC_SHELL_CATALOG.map((s) => [s.id, s]));

export function getGeometricShell(id: GeometricShellId): GeometricShellContract {
  const s = SHELL_BY_ID.get(id);
  if (!s) throw new Error(`Unknown geometric shell: ${id}`);
  return s;
}

/** Slot-look → preferred shell (hospitality-adapted Canva geometry). */
const SLOT_LOOK_SHELL: Record<SlotLookKind, GeometricShellId> = {
  nightlife_event: 'inset_frame_on_color',
  golden_hour: 'arch_photo_stack',
  offer_booking: 'badge_overlap_offer',
  product_hero: 'circle_portrait_lockup',
  social_proof: 'editorial_overlap_card',
  venue_ambiance: 'editorial_overlap_card',
  generic_editorial: 'split_color_photo',
};

/**
 * Resolve geometric shell from catalog slot key + slot look + format.
 * Keyword hints on slot keys beat look defaults when present.
 */
export function resolveGeometricShell(input: {
  catalogSlotKey?: string | null;
  slotLook?: SlotLookKind | null;
  format?: 'story' | 'post' | null;
  headline?: string | null;
  announcementType?: string | null;
}): GeometricShellContract {
  const key = String(input.catalogSlotKey ?? '').toLowerCase();
  const blob = `${key} ${input.headline ?? ''} ${input.announcementType ?? ''}`.toLowerCase();
  const format = input.format === 'story' ? 'story' : 'post';

  // Specific slot cues beat generic announcement types (e.g. campaign_offer).
  let id: GeometricShellId | null = null;
  if (/dj|night|gece|party|event_ticket/.test(blob)) id = 'inset_frame_on_color';
  else if (/cocktail|kokteyl|drink|bar|wine|şarap/.test(blob)) id = 'circle_portrait_lockup';
  else if (/sunset|gün bat|golden|ambiance|atmosphere/.test(blob)) id = 'arch_photo_stack';
  else if (/menu|menü|food|brunch|seafood/.test(blob)) id = 'split_color_photo';
  else if (/quote|review|social/.test(blob)) id = 'editorial_overlap_card';
  else if (/daybed|book|rezerv|promo|price|indirim|discount/.test(blob)) id = 'badge_overlap_offer';
  else if (input.slotLook) id = SLOT_LOOK_SHELL[input.slotLook] ?? null;

  if (!id) id = format === 'story' ? 'arch_photo_stack' : 'inset_frame_on_color';

  const shell = getGeometricShell(id);
  if (!shell.formats.includes(format)) {
    // Prefer a shell that supports this format.
    const alt = GEOMETRIC_SHELL_CATALOG.find((s) => s.formats.includes(format));
    return alt ?? shell;
  }
  return shell;
}

/** Resolve solid canvas hex from brand kit + shell role. */
export function resolveGeometricCanvasColor(
  shell: GeometricShellContract,
  brandColors: { primary: string; accent: string },
): { canvas: string; ink: string; accent: string; cream: string } {
  const primary = brandColors.primary?.trim() || '#212529';
  const accent = brandColors.accent?.trim() || '#E8A87C';
  const cream = '#F5EFE4';
  const ink = '#1A1A1A';

  switch (shell.canvasRole) {
    case 'primary':
      return { canvas: primary, ink: cream, accent, cream };
    case 'accent':
      return { canvas: accent, ink: ink, accent: primary, cream };
    case 'ink':
      return { canvas: ink, ink: cream, accent, cream };
    case 'cream':
    default:
      return { canvas: cream, ink: primary, accent, cream };
  }
}
