/**
 * CrewAI marka×slot art direction for the design template library.
 * Fetches a structured composition recipe and formats it for GPT Image prompts.
 */

import { getCrewBackendBaseUrl } from '@/lib/crew-backend-url';
import { serverConfig } from '@/lib/server-config';

export const SLOT_TYPE_ZONE_ANCHORS = [
  'top_left',
  'top_right',
  'bottom_left',
  'bottom_right',
  'left_rail',
  'right_rail',
  'top_band',
  'bottom_band',
  'center_stack',
  'inset_frame',
  'diagonal_split',
] as const;

export type SlotTypeZoneAnchor = (typeof SLOT_TYPE_ZONE_ANCHORS)[number];

export interface SlotArtDirection {
  layout_concept: string;
  type_zone_anchor: SlotTypeZoneAnchor;
  color_surfaces: string;
  type_hierarchy: string;
  motif_from_dna: string;
  reject_look: string;
  diversity_note: string;
}

export interface FetchSlotArtDirectionInput {
  workspaceId: string;
  brandName: string;
  sector: string;
  location?: string;
  brandTone?: string;
  visualDna?: string;
  description?: string;
  primaryColor: string;
  accentColor: string;
  catalogSlotKey: string;
  slotName: string;
  format: string;
  templateType: string;
  purposeJob: string;
  sampleHeadline?: string;
  diversitySalt?: string;
  timeoutMs?: number;
}

function isAnchor(raw: string): raw is SlotTypeZoneAnchor {
  return (SLOT_TYPE_ZONE_ANCHORS as readonly string[]).includes(raw);
}

/** Validate / normalize crew JSON (also used by unit tests). */
export function parseSlotArtDirection(raw: unknown): SlotArtDirection | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const concept = String(o.layout_concept ?? '').trim();
  const anchor = String(o.type_zone_anchor ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!concept || !isAnchor(anchor)) return null;
  return {
    layout_concept: concept.slice(0, 320),
    type_zone_anchor: anchor,
    color_surfaces: String(o.color_surfaces ?? '').trim().slice(0, 220)
      || 'Use brand primary/accent as painted craft fills — never cream panels.',
    type_hierarchy: String(o.type_hierarchy ?? '').trim().slice(0, 180)
      || 'Bold display headline; short support only if needed.',
    motif_from_dna: String(o.motif_from_dna ?? '').trim().slice(0, 160),
    reject_look: String(o.reject_look ?? '').trim().slice(0, 180)
      || 'cream/beige top-left Canva sticker reused across slots',
    diversity_note: String(o.diversity_note ?? '').trim().slice(0, 180),
  };
}

/**
 * Protected-head block for GPT Image. When present, hard LAYOUT LOCK families
 * should be softened — the agent owns composition identity.
 */
export function formatSlotArtDirectionPromptBlock(direction: SlotArtDirection): string {
  return [
    '═══ BRAND SLOT ART DIRECTION (CrewAI — mandatory for this template) ═══',
    `Layout concept: ${direction.layout_concept}`,
    `TYPE ZONE ANCHOR (mandatory): ${direction.type_zone_anchor} — place ALL headline/support craft in this zone; do NOT default to a top-left cream sticker.`,
    `Color surfaces: ${direction.color_surfaces}`,
    `Type hierarchy: ${direction.type_hierarchy}`,
    direction.motif_from_dna ? `Motif from brand DNA: ${direction.motif_from_dna}` : '',
    `Reject look: ${direction.reject_look}`,
    direction.diversity_note ? `Diversity vs other library slots: ${direction.diversity_note}` : '',
    'Execute THIS art direction — invent micro-geometry inside the anchor, never a reused hospitality corner card.',
  ].filter(Boolean).join(' ');
}

export async function fetchSlotTemplateArtDirection(
  input: FetchSlotArtDirectionInput,
): Promise<SlotArtDirection | null> {
  const crew = getCrewBackendBaseUrl();
  // Fail fast — template regenerate must not wait on a hung Crew kickoff.
  const timeoutMs = input.timeoutMs ?? 18_000;
  try {
    const res = await fetch(`${crew}/internal/v1/orchestration/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': serverConfig.internal.apiKey,
        'X-Tenant-Id': input.workspaceId,
      },
      body: JSON.stringify({
        tenant_id: input.workspaceId,
        office_id: input.workspaceId,
        agent_role: 'content_agent',
        task_type: 'slot_template_art_direction',
        input_data: {
          catalog_slot_key: input.catalogSlotKey,
          slot_name: input.slotName,
          format: input.format,
          template_type: input.templateType,
          purpose_job: input.purposeJob,
          sample_headline: input.sampleHeadline ?? '',
          primary_color: input.primaryColor,
          accent_color: input.accentColor,
          diversity_salt: input.diversitySalt ?? '',
        },
        brand_context: {
          business_name: input.brandName,
          business_type: input.sector,
          description: input.description ?? '',
          brand_tone: input.brandTone ?? 'professional',
          visual_dna: input.visualDna ?? '',
          location: input.location ?? '',
          languages: 'tr',
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(
        `[slot-art-direction] crew execute ${res.status} for ${input.catalogSlotKey}`,
      );
      return null;
    }
    const data = await res.json().catch(() => null) as {
      metadata?: { slot_art_direction?: unknown };
      content?: string;
    } | null;
    const fromMeta = parseSlotArtDirection(data?.metadata?.slot_art_direction);
    if (fromMeta) return fromMeta;
    if (typeof data?.content === 'string') {
      try {
        return parseSlotArtDirection(JSON.parse(data.content));
      } catch {
        const m = data.content.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            return parseSlotArtDirection(JSON.parse(m[0]));
          } catch { /* fall through */ }
        }
      }
    }
    return null;
  } catch (err) {
    console.warn(
      `[slot-art-direction] failed for ${input.catalogSlotKey}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
