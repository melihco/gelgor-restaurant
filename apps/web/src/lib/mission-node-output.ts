import { extractObjectArrayFromSummary } from '@/lib/output-summary-array';

type MissionNodeLike = {
  output_summary?: string | null;
  output_payload?: unknown;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
}

export function nodeHasOutput(node: MissionNodeLike | null | undefined): boolean {
  if (!node) return false;
  if (Array.isArray(node.output_payload)) return node.output_payload.length > 0;
  if (isObjectRecord(node.output_payload)) return Object.keys(node.output_payload).length > 0;
  return Boolean(node.output_summary?.trim());
}

export function nodeOutputText(node: MissionNodeLike | null | undefined): string {
  if (!node) return '';
  if (node.output_summary?.trim()) return node.output_summary;
  if (node.output_payload == null) return '';
  try {
    return JSON.stringify(node.output_payload, null, 2);
  } catch {
    return '';
  }
}

export function nodeOutputObject(
  node: MissionNodeLike | null | undefined,
): Record<string, unknown> | null {
  if (!node) return null;
  if (isObjectRecord(node.output_payload)) return node.output_payload;

  const text = node.output_summary?.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(stripCodeFences(text)) as unknown;
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function nodeOutputArray(
  node: MissionNodeLike | null | undefined,
  rootArrayKeys: string[] = ['ideas', 'content_ideas', 'contentIdeas'],
): Record<string, unknown>[] {
  if (!node) return [];

  if (Array.isArray(node.output_payload)) {
    return node.output_payload.filter(isObjectRecord);
  }

  if (isObjectRecord(node.output_payload)) {
    for (const key of rootArrayKeys) {
      const value = node.output_payload[key];
      if (Array.isArray(value)) {
        return value.filter(isObjectRecord);
      }
    }
  }

  return extractObjectArrayFromSummary(node.output_summary, rootArrayKeys);
}
