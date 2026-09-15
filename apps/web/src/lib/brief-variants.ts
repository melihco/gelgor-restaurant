/**
 * "+" pick-one variants — pure helpers over artifact metadata.
 *
 * Production stamps `brief_variant_group` / `brief_variant_index` /
 * `brief_variant_count` / `brief_variant_label` on sibling artifacts painted
 * from the same brief idea in different looks. The feed shows one chooser card
 * per group while ≥2 siblings are still pending; picking one keeps it and
 * dismisses the rest, after which the group collapses to a normal card.
 */
import type { OutputArtifact } from '@/types';

export interface BriefVariantTag {
  group: string;
  index: number;
  count: number;
  label: string | null;
}

export function readBriefVariantTag(
  metadata: Record<string, unknown> | null | undefined,
): BriefVariantTag | null {
  const meta = metadata ?? {};
  const group = String(meta.brief_variant_group ?? '').trim();
  if (!group) return null;
  const index = Number(meta.brief_variant_index);
  const count = Number(meta.brief_variant_count);
  const label = String(meta.brief_variant_label ?? '').trim();
  return {
    group,
    index: Number.isFinite(index) ? index : 0,
    count: Number.isFinite(count) && count > 0 ? count : 1,
    label: label || null,
  };
}

export type BriefVariantGroups = ReadonlyMap<string, OutputArtifact[]>;

/**
 * Groups still-pending siblings (≥2) by variant group, ordered by variant index.
 * Approved / dismissed siblings drop out, so a picked group stops being a chooser.
 */
export function groupPendingBriefVariants(artifacts: readonly OutputArtifact[]): BriefVariantGroups {
  const buckets = new Map<string, OutputArtifact[]>();
  for (const artifact of artifacts) {
    if (artifact.status !== 'pending_review') continue;
    const tag = readBriefVariantTag(artifact.metadata);
    if (!tag) continue;
    const list = buckets.get(tag.group) ?? [];
    list.push(artifact);
    buckets.set(tag.group, list);
  }
  const out = new Map<string, OutputArtifact[]>();
  for (const [group, list] of buckets) {
    if (list.length < 2) continue;
    list.sort((a, b) => (readBriefVariantTag(a.metadata)?.index ?? 0) - (readBriefVariantTag(b.metadata)?.index ?? 0));
    out.set(group, list);
  }
  return out;
}

/**
 * Feed list with variant siblings collapsed to the group lead (lowest index).
 * The lead is what the list iterates; the chooser swaps which sibling is shown.
 */
export function collapseBriefVariantsForFeed(
  artifacts: readonly OutputArtifact[],
  groups: BriefVariantGroups,
): OutputArtifact[] {
  const leadIds = new Set<string>();
  for (const list of groups.values()) leadIds.add(list[0]!.id);
  return artifacts.filter((artifact) => {
    const tag = readBriefVariantTag(artifact.metadata);
    if (!tag) return true;
    const list = groups.get(tag.group);
    if (!list) return true;
    return leadIds.has(artifact.id);
  });
}

/** Siblings to dismiss when the owner keeps `keepId`. */
export function briefVariantSiblingsToDismiss(list: readonly OutputArtifact[], keepId: string): string[] {
  return list.filter((a) => a.id !== keepId).map((a) => a.id);
}

/** Short tab label: "A · Marka çizgisi". */
export function briefVariantTabLabel(artifact: OutputArtifact): string {
  const tag = readBriefVariantTag(artifact.metadata);
  const letter = String.fromCharCode(65 + Math.min(Math.max(tag?.index ?? 0, 0), 25));
  return tag?.label ? `${letter} · ${tag.label}` : letter;
}
