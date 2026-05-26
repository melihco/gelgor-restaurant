import type { OutputArtifact } from '@/types';

/**
 * Parse an OutputArtifact.content field safely.
 *
 * The content field is a free-form JSON string that may be:
 *   - a valid JSON object (most common)
 *   - a JSON array (carousel design cards)
 *   - wrapped in ```json ... ``` markdown
 *   - malformed / empty / non-string
 *
 * Returns an empty object on any error. Never throws.
 *
 * Replaces the duplicated `try { ... JSON.parse(artifact.content || '{}') ... } catch {}`
 * pattern that was scattered across 12+ files. Single source of truth for parsing.
 */
export function parseArtifactContent(
  content: string | null | undefined,
): Record<string, unknown> {
  if (!content || typeof content !== 'string') return {};
  const trimmed = content.trim();
  if (!trimmed) return {};
  // Strip markdown code fences
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
  if (!cleaned) return {};
  try {
    const v = JSON.parse(cleaned);
    // Always return an object — if it's an array, wrap with `_array` key for compat
    if (Array.isArray(v)) return { _array: v };
    if (v && typeof v === 'object') return v as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

/**
 * Find a scheduled post matching the given artifact.
 *
 * No backend linking exists yet (scheduled_posts table doesn't store artifact_id),
 * so we match heuristically:
 *   1. Exact contentUrl match
 *   2. Caption substring match (first 60 chars)
 *
 * Returns null if no match — caller renders nothing in that case.
 */
export function findScheduledForArtifact<T extends {
  image_url?: string | null;
  video_url?: string | null;
  caption?: string;
  status?: string;
}>(
  artifact: OutputArtifact,
  scheduledPosts: T[],
): T | null {
  if (!scheduledPosts.length) return null;
  // Only consider pending/scheduled, not published or failed
  const active = scheduledPosts.filter(p =>
    !p.status || ['scheduled', 'pending', 'queued'].includes(String(p.status).toLowerCase()),
  );
  if (!active.length) return null;

  // 1) URL match
  const url = artifact.contentUrl ?? '';
  if (url) {
    const byUrl = active.find(p => p.image_url === url || p.video_url === url);
    if (byUrl) return byUrl;
  }
  // 2) Caption substring match (first 60 chars)
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const cap = String((meta.caption as string) || '').slice(0, 60);
  if (cap.length >= 20) {
    const byCaption = active.find(p => (p.caption ?? '').includes(cap));
    if (byCaption) return byCaption;
  }
  return null;
}

/**
 * Resolve a media URL for use in <img> / <video> src attributes.
 *
 * URL sources in the system:
 *   /api/media?key=...        → Next.js API route (R2 proxy) — leave as-is ✅
 *   /api/<anything-else>      → .NET backend route → proxy via /api/nexus-backend/
 *   http(s)://...             → absolute URL — leave as-is ✅
 */
/** CDN domains that can be embedded directly without the media-proxy */
const DIRECT_IMAGE_DOMAINS = [
  'oaidalleapiprodscus.blob.core',  // OpenAI DALL-E
  'fal-cdn',                         // Fal.ai Flux
  'storage.googleapis.com',
  'r2.dev',
  'amazonaws.com',
  'cloudfront.net',
  'export-download.canva.com',       // Canva CDN thumbnails
  'cdninstagram.com',
  'fbcdn.net',
];

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Absolute URLs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // Skip Canva edit pages entirely — not images
    if (trimmed.includes('canva.com/design')) return null;
    // Known-safe CDN domains: embed directly
    if (DIRECT_IMAGE_DOMAINS.some(d => trimmed.includes(d))) return trimmed;
    // All other external domains: route through media-proxy to avoid CORS/403
    return `/api/media-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  // Next.js API routes — serve directly, do NOT proxy to .NET
  if (path.startsWith('/api/media') || path.startsWith('/api/generate-') || path.startsWith('/api/canva')) {
    return path;
  }
  // .NET backend routes — proxy through /api/nexus-backend/
  if (path.startsWith('/api/')) {
    return '/api/nexus-backend/' + path.slice(5);
  }
  return path;
}

/** All resolved media + content from a raw OutputArtifact */
export interface ResolvedArtifact {
  id: string;
  title: string;
  kind: 'image' | 'video' | 'text' | 'multi' | 'report' | 'ad';
  contentType: string;      // instagram_post | story | reel | etc.

  // Media
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;

  // Text content
  caption: string | null;
  headline: string | null;
  hashtags: string[];
  cta: string | null;
  summary: string | null;
  rawText: string | null;

  // Context
  postingTime: string | null;
  visualDirection: string | null;

  // Multiple ideas (instagram_plan)
  ideas: {
    headline?: string;
    caption?: string;
    hashtags?: string[];
    imageUrl?: string | null;
    cta?: string;
    contentType?: string;
    postingTime?: string;
  }[];

  // Status
  status: OutputArtifact['status'];
  createdAt: string | undefined;
  agentName: string | null;
}

function stripCodeBlock(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function pickStr(...vals: (unknown)[]): string | null {
  for (const v of vals) {
    if (v && typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function isImageUrl(u: unknown): boolean {
  if (typeof u !== 'string') return false;
  // Exclude Canva edit-page URLs — these are web pages, not images
  if (u.includes('canva.com/design')) return false;
  return /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?|$)/i.test(u)
    || u.includes('export-download.canva.com')  // Canva CDN thumbnails
    || u.includes('cloudfront') || u.includes('amazonaws');
}

function isVideoUrl(u: unknown): boolean {
  if (typeof u !== 'string') return false;
  return /\.(mp4|mov|webm|avi)(\?|$)/i.test(u) || u.includes('runway') || u.includes('video');
}

function inferContentType(artifact: OutputArtifact, data: Record<string, unknown>): string {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const candidates = [
    // Prefer explicit kind/contentType in content JSON (written by MissionContentFactory)
    data.kind, data.contentKind, data.content_kind, data.contentType,
    // Then metadata fields
    meta.kind, meta.contentKind, meta.content_kind, meta.contentType,
    // Finally artifact type token
    artifact.artifactType,
  ];
  for (const c of candidates) {
    // Skip bare numeric artifact type tokens
    if (typeof c === 'string' && c.trim() && !/^\d+$/.test(c.trim())) {
      return c.toLowerCase().replace(/_/g, ' ');
    }
  }
  // Last resort: scan the title for format keywords (catches old factory artifacts)
  const title = (artifact.title ?? '').toLowerCase();
  if (title.endsWith(' reel') || title.includes('— reel') || title.includes('- reel') || title.includes(' reel ')) return 'reel';
  if (title.endsWith(' story') || title.includes('— story') || title.includes('- story') || title.includes(' story ')) return 'instagram story';
  if (title.endsWith(' carousel') || title.includes('carousel')) return 'carousel';

  // Fallback from artifact type
  if (artifact.type === 'image') return 'instagram post';
  if (artifact.type === 'document') return 'document';
  return 'content';
}

function inferKind(contentType: string, hasVideo: boolean, hasImage: boolean, hasIdeas: boolean): ResolvedArtifact['kind'] {
  if (hasVideo) return 'video';
  if (contentType.includes('reel') || contentType.includes('video')) return 'video';
  if (hasImage || contentType.includes('story') || contentType.includes('post') || contentType.includes('image')) return 'image';
  if (contentType.includes('plan') || contentType.includes('calendar') || hasIdeas) return 'multi';
  if (contentType.includes('report') || contentType.includes('analytics') || contentType.includes('analysis')) return 'report';
  if (contentType.includes('ad') || contentType.includes('creative')) return 'ad';
  return 'text';
}

/** Main extraction function — parses real artifact data from API */
export function resolveArtifact(artifact: OutputArtifact): ResolvedArtifact {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;

  // Parse content — may be an object OR a bare array (type 2 design cards)
  const rawContent = artifact.content;
  let parsed: Record<string, unknown> | null = null;
  let parsedArray: Record<string, unknown>[] | null = null;

  if (rawContent && typeof rawContent === 'string') {
    const cleaned = stripCodeBlock(rawContent.trim());
    if (cleaned) {
      try {
        const v = JSON.parse(cleaned);
        if (Array.isArray(v)) {
          parsedArray = v.filter((x): x is Record<string, unknown> => x && typeof x === 'object');
        } else if (v && typeof v === 'object') {
          parsed = v as Record<string, unknown>;
        }
      } catch { /* ignore */ }
    }
  }

  const rendered = (parsed?.renderedPreview ?? {}) as Record<string, unknown>;
  const ideas: Record<string, unknown>[] = [];

  // If content is a bare array → use it directly as ideas
  if (parsedArray && parsedArray.length > 0) {
    ideas.push(...parsedArray);
  } else {
    // Collect ideas from nested locations
    const ideaSources = [
      parsed?.ideas, parsed?.contentIdeas, rendered?.ideas,
      parsed?.result, meta?.ideas,
    ];
    for (const src of ideaSources) {
      if (Array.isArray(src)) {
        for (const idea of src) {
          if (idea && typeof idea === 'object') ideas.push(idea as Record<string, unknown>);
        }
        break;
      }
    }
  }

  // Resolve image URL — all paths go through resolveMediaUrl to fix /api/... proxy paths
  const rawImageUrl = pickStr(
    artifact.type === 'image' ? artifact.contentUrl : null, // image type → contentUrl is the image
    rendered.imageUrl,
    rendered.thumbnailUrl,
    rendered.image_url,
    meta.imageUrl,
    meta.image_url,
    parsed?.imageUrl,
    ideas[0]?.imageUrl,
    ideas[0]?.image_url,
    artifact.contentUrl && isImageUrl(artifact.contentUrl) ? artifact.contentUrl : null,
  );
  const imageUrl = resolveMediaUrl(rawImageUrl);

  // Resolve video URL
  const rawVideoUrl = pickStr(
    artifact.contentUrl && isVideoUrl(artifact.contentUrl) ? artifact.contentUrl : null,
    rendered.videoUrl,
    rendered.video_url,
    meta.videoUrl,
    meta.video_url,
    parsed?.videoUrl,
  );
  const videoUrl = resolveMediaUrl(rawVideoUrl);

  // Thumbnail = image if available, else null
  const thumbnailUrl = imageUrl ?? resolveMediaUrl(pickStr(rendered.thumbnailUrl as string, meta.thumbnailUrl as string));

  // Caption
  const caption = pickStr(
    rendered.caption,
    parsed?.caption,
    meta.caption,
    ideas[0]?.caption,
    rendered.body,
    parsed?.body,
  );

  // Headline
  const headline = pickStr(
    rendered.headline, rendered.title,
    parsed?.headline, parsed?.title,
    meta.headline, meta.title,
    ideas[0]?.headline, ideas[0]?.title,
    artifact.title,
  );

  // Hashtags
  let hashtags: string[] = [];
  const hashSrc = rendered.hashtags ?? parsed?.hashtags ?? meta.hashtags ?? ideas[0]?.hashtags;
  if (Array.isArray(hashSrc)) hashtags = hashSrc.map(String);
  else if (typeof hashSrc === 'string') hashtags = hashSrc.split(/[\s,]+/).filter((h) => h.startsWith('#'));

  // CTA
  const cta = pickStr(
    rendered.cta, parsed?.cta, meta.cta,
    ideas[0]?.cta,
    rendered.callToAction, parsed?.callToAction,
  );

  // Summary / raw text
  const summary = pickStr(
    rendered.summary, rendered.executiveSummary,
    parsed?.summary, parsed?.executiveSummary,
    meta.summary,
  );

  const rawText = pickStr(
    typeof artifact.content === 'string' && !artifact.content.startsWith('{') ? artifact.content : null,
    caption,
    summary,
  );

  const postingTime = pickStr(rendered.postingTime, parsed?.postingTime, meta.postingTime, ideas[0]?.postingTime);
  const visualDirection = pickStr(rendered.visualDirection, parsed?.visualDirection, meta.visualDirection, meta.assetIntent);

  const contentType = inferContentType(artifact, { ...parsed, ...rendered });
  const kind = inferKind(contentType, !!videoUrl, !!imageUrl, ideas.length > 1);

  // Normalize ideas list
  const normalizedIdeas = ideas.map((idea) => ({
    headline: pickStr(idea.headline, idea.title) ?? undefined,
    caption: pickStr(idea.caption) ?? undefined,
    hashtags: Array.isArray(idea.hashtags) ? idea.hashtags.map(String) : [],
    imageUrl: pickStr(
      idea.imageUrl,
      idea.image_url,
      idea.preview_image_url,
      idea.reference_image_url,
      idea.media_url,
      idea.thumbnail_url,
      idea.hero_image_url,
      Array.isArray(idea.reference_images) && typeof idea.reference_images[0] === 'string'
        ? idea.reference_images[0]
        : undefined,
    ) ?? null,
    cta: pickStr(idea.cta) ?? undefined,
    contentType: pickStr(idea.contentKind, idea.contentType, idea.kind) ?? undefined,
    postingTime: pickStr(idea.postingTime, idea.posting_time) ?? undefined,
  }));

  return {
    id: artifact.id,
    title: headline ?? artifact.title ?? 'AI Output',
    kind,
    contentType,
    imageUrl,
    videoUrl,
    thumbnailUrl,
    caption,
    headline,
    hashtags,
    cta,
    summary,
    rawText,
    postingTime,
    visualDirection,
    ideas: normalizedIdeas,
    status: artifact.status,
    createdAt: artifact.createdAt,
    agentName: (artifact as any).agentName ?? null,
  };
}

/** Short label for content type chip */
export function contentTypeLabel(ct: string): string {
  if (ct.includes('story'))    return 'Story';
  if (ct.includes('reel'))     return 'Reel';
  if (ct.includes('post'))     return 'Post';
  if (ct.includes('plan'))     return 'Content Plan';
  if (ct.includes('ad'))       return 'Ad Creative';
  if (ct.includes('report'))   return 'Report';
  if (ct.includes('analytics'))return 'Analytics';
  if (ct.includes('review'))   return 'Review Reply';
  if (ct.includes('strategy')) return 'Strategy';
  return 'Output';
}
