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

export function extractObjectArrayFromSummary(
  outputSummary: string | null | undefined,
  rootArrayKeys: string[] = ['ideas', 'content_ideas', 'contentIdeas'],
): Record<string, unknown>[] {
  if (!outputSummary?.trim()) return [];
  const trimmed = stripCodeFences(outputSummary);

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return filterObjectArray(parsed);
    }
    if (isObjectRecord(parsed)) {
      for (const key of rootArrayKeys) {
        const value = parsed[key];
        if (Array.isArray(value)) {
          const objects = filterObjectArray(value);
          if (objects.length > 0) return objects;
        }
      }
    }
  } catch {
    /* fall through */
  }

  const candidates = scanJsonArrayCandidates(trimmed);
  if (candidates.length === 0) return [];
  return candidates.sort((a, b) => b.length - a.length)[0] ?? [];
}
