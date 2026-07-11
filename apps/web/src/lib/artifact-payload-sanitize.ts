/**
 * Strip inline data: media from artifact list payloads.
 * Legacy carousels may only have base64 slides — callers should fall back to
 * contentUrl / gallery_photo_urls via artifact-utils.
 */

const INLINE_URL_LIST_KEYS = [
  'carousel_urls',
  'mediaUrls',
  'media_urls',
  'slides',
  'gallery_photo_urls',
] as const;

const INLINE_URL_SCALAR_KEYS = [
  'imageUrl',
  'posterUrl',
  'videoUrl',
  'thumbnailUrl',
] as const;

export function isInlineDataMediaUrl(url: unknown): boolean {
  return typeof url === 'string' && url.trim().startsWith('data:');
}

export function sanitizeMediaUrlList(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = String(raw ?? '').trim();
    if (!url || isInlineDataMediaUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function sanitizeUrlRecord(record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  for (const key of INLINE_URL_LIST_KEYS) {
    if (!(key in next)) continue;
    next[key] = sanitizeMediaUrlList(next[key]);
  }
  for (const key of INLINE_URL_SCALAR_KEYS) {
    if (isInlineDataMediaUrl(next[key])) {
      delete next[key];
    }
  }
  return next;
}

export function slimArtifactContentJson(
  content: unknown,
  contentUrl?: string,
): string | unknown {
  if (typeof content !== 'string') return content;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return content;
    const slim = sanitizeUrlRecord(parsed);
    if (contentUrl) {
      if (!slim.imageUrl || isInlineDataMediaUrl(slim.imageUrl)) {
        slim.imageUrl = contentUrl;
      }
      if (!slim.posterUrl || isInlineDataMediaUrl(slim.posterUrl)) {
        slim.posterUrl = contentUrl;
      }
    }
    const rendered = slim.renderedPreview;
    if (rendered && typeof rendered === 'object') {
      slim.renderedPreview = sanitizeUrlRecord(rendered as Record<string, unknown>);
      const rp = slim.renderedPreview as Record<string, unknown>;
      if (contentUrl && isInlineDataMediaUrl(rp.imageUrl)) {
        rp.imageUrl = contentUrl;
      }
    }
    return JSON.stringify(slim);
  } catch {
    return content;
  }
}

export function slimArtifactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return sanitizeUrlRecord(metadata);
}
