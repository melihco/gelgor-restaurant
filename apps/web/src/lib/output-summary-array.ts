function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function filterObjectArray(items: unknown[]): Record<string, unknown>[] {
  return items.filter(isObjectRecord);
}

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
}

function scanJsonArrayCandidates(text: string): Record<string, unknown>[][] {
  const candidates: Record<string, unknown>[][] = [];
  let searchFrom = 0;

  while (true) {
    const firstBracket = text.indexOf('[', searchFrom);
    if (firstBracket === -1) break;

    let depth = 0;
    let inStr = false;
    let escape = false;
    let end = -1;

    for (let i = firstBracket; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inStr) { escape = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '[') depth++;
      if (ch === ']') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end === -1) break;

    try {
      const parsed = JSON.parse(text.slice(firstBracket, end + 1)) as unknown;
      if (Array.isArray(parsed)) {
        const objects = filterObjectArray(parsed);
        if (objects.length > 0) candidates.push(objects);
      }
    } catch {
      /* continue */
    }

    searchFrom = end + 1;
  }

  return candidates;
}

/**
 * Recover complete top-level objects from a JSON array that may be truncated
 * (no closing `]`). The server truncates output_summary, so a large array can
 * arrive without its terminating bracket — `scanJsonArrayCandidates` then finds
 * no balanced array and returns nothing. This walks the elements directly under
 * the first `[` and parses every complete `{…}` it can, ignoring the partial
 * trailing element. Never throws.
 */
function recoverTruncatedArrayObjects(text: string): Record<string, unknown>[] {
  const firstBracket = text.indexOf('[');
  if (firstBracket === -1) return [];

  const objects: Record<string, unknown>[] = [];
  let depth = 0;
  let inStr = false;
  let escape = false;
  let objStart = -1;

  for (let i = firstBracket + 1; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inStr) { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          const parsed = JSON.parse(text.slice(objStart, i + 1)) as unknown;
          if (isObjectRecord(parsed)) objects.push(parsed);
        } catch {
          /* skip malformed element */
        }
        objStart = -1;
      }
    }
  }

  return objects;
}

export interface ParseResult {
  ideas: Record<string, unknown>[];
  parseError?: string;
  truncated?: boolean;
}

export function extractObjectArrayFromSummaryWithDiag(
  outputSummary: string | null | undefined,
  rootArrayKeys: string[] = ['ideas', 'content_ideas', 'contentIdeas'],
): ParseResult {
  if (!outputSummary?.trim()) return { ideas: [], parseError: 'empty_input' };
  const trimmed = stripCodeFences(outputSummary);

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return { ideas: filterObjectArray(parsed) };
    }
    if (isObjectRecord(parsed)) {
      for (const key of rootArrayKeys) {
        const value = parsed[key];
        if (Array.isArray(value)) {
          const objects = filterObjectArray(value);
          if (objects.length > 0) return { ideas: objects };
        }
      }
    }
  } catch {
    /* fall through to recovery */
  }

  const candidates = scanJsonArrayCandidates(trimmed);
  if (candidates.length > 0) {
    return { ideas: candidates.sort((a, b) => b.length - a.length)[0] ?? [] };
  }

  const recovered = recoverTruncatedArrayObjects(trimmed);
  if (recovered.length > 0) {
    return { ideas: recovered, truncated: true };
  }

  return { ideas: [], parseError: 'no_valid_json_array', truncated: trimmed.length > 1000 };
}

export function extractObjectArrayFromSummary(
  outputSummary: string | null | undefined,
  rootArrayKeys: string[] = ['ideas', 'content_ideas', 'contentIdeas'],
): Record<string, unknown>[] {
  return extractObjectArrayFromSummaryWithDiag(outputSummary, rootArrayKeys).ideas;
}
