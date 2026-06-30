/**
 * Reuse persisted raw gallery image-to-video (I2V) artifacts instead of
 * calling fal.ai again for the same source photo.
 */
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import { isPlayableVideoUrl } from '@/lib/fal-story-motion';
import { parseArtifactContent, parseArtifactMetadata } from '@/lib/artifact-utils';
import type { OutputArtifact } from '@/types';

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');

const RAW_I2V_RUNWAY_SOURCES = new Set(['kling', 'luma', 'fal_video']);

const DESIGNED_RENDERER_EXECUTED = new Set([
  'fal_designer_post',
  'fal_designer_video',
  'gpt_image_designed_post',
  'fal_only_post',
  'fal_only_reel',
  'fal_only_story',
]);

const DESIGNED_FAL_ENGINES = new Set([
  'fal_ideogram_only',
  'fal_grounded_designer',
  'fal_cinematic_motion',
  'gpt_image_designed',
]);

function strField(...values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function isPersistedMediaUrl(url: string): boolean {
  const u = url.trim();
  return u.startsWith('/api/media')
    || u.includes('r2.dev')
    || u.includes('cloudflarestorage.com');
}

function isEphemeralFalCdn(url: string): boolean {
  return /fal\.media|fal-cdn/i.test(url);
}

function videoUrlScore(url: string): number {
  if (isPersistedMediaUrl(url)) return 2;
  if (isEphemeralFalCdn(url)) return 0;
  return 1;
}

export function resolveArtifactI2vSourceKey(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
): string | null {
  const url = strField(
    meta.i2v_source_image_url,
    content.i2v_source_image_url,
    meta.reference_photo_url,
    content.reference_photo_url,
    meta.selected_gallery_url,
    content.selected_gallery_url,
  );
  return url ? normalizeGalleryUrl(url) : null;
}

export function resolveArtifactPlayableVideo(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
  contentUrl?: string | null,
): string | null {
  const candidates = [
    strField(contentUrl),
    strField(meta.videoUrl),
    strField(content.videoUrl),
  ].filter(Boolean);
  for (const url of candidates) {
    if (isPlayableVideoUrl(url)) return url;
  }
  return null;
}

function designedStillDiffersFromReference(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
): boolean {
  const reference = strField(
    meta.reference_photo_url,
    content.reference_photo_url,
    meta.selected_gallery_url,
    content.selected_gallery_url,
  );
  const image = strField(meta.imageUrl, content.imageUrl);
  if (!reference || !image) return false;
  return normalizeGalleryUrl(reference) !== normalizeGalleryUrl(image);
}

export function isRawGalleryI2vArtifact(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
  contentUrl?: string | null,
): boolean {
  const video = resolveArtifactPlayableVideo(meta, content, contentUrl);
  if (!video) return false;

  if (meta.i2v_motion_type === 'raw_gallery') return true;
  if (strField(meta.renderer_executed) === 'fal_raw_i2v') return true;
  if (meta.fal_only === true) return false;

  const renderer = strField(meta.renderer_executed);
  if (renderer && DESIGNED_RENDERER_EXECUTED.has(renderer)) {
    if (meta.i2v_motion_type !== 'raw_gallery') return false;
  }

  const engine = strField(meta.fal_design_engine);
  if (engine && DESIGNED_FAL_ENGINES.has(engine)) return false;

  if (meta.fal_designer_produced === true && designedStillDiffersFromReference(meta, content)) {
    return false;
  }

  const runwaySource = strField(meta.runway_source, meta.fal_video_model);
  if (runwaySource && RAW_I2V_RUNWAY_SOURCES.has(runwaySource)) {
    return true;
  }

  if (meta.i2v_reused === true) return true;

  if (
    meta.fal_video_produced === true
    && !engine
    && !designedStillDiffersFromReference(meta, content)
    && meta.production_track !== 'fal_only'
  ) {
    return true;
  }

  return false;
}

export async function fetchWorkspaceArtifacts(workspaceId: string): Promise<OutputArtifact[]> {
  try {
    const res = await fetch(`${NEXUS_API}/api/artifacts?limit=200`, {
      headers: { 'X-Tenant-Id': workspaceId },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as OutputArtifact[] | { items?: OutputArtifact[] };
    const list = Array.isArray(data) ? data : (data.items ?? []);
    return list.map((a) => {
      const meta = parseArtifactMetadata(a.metadata);
      return (meta === a.metadata ? a : { ...a, metadata: meta }) as OutputArtifact;
    });
  } catch {
    return [];
  }
}

export interface ReusableRawI2vVideo {
  videoUrl: string;
  artifactId: string;
  source: 'persisted' | 'fal_cdn' | 'other';
}

export async function findReusableRawI2vVideo(
  workspaceId: string,
  sourceImageUrl: string,
): Promise<ReusableRawI2vVideo | null> {
  const target = normalizeGalleryUrl(sourceImageUrl);
  if (!target) return null;

  const artifacts = await fetchWorkspaceArtifacts(workspaceId);
  const matches: ReusableRawI2vVideo[] = [];

  for (const artifact of artifacts) {
    const meta = parseArtifactMetadata(artifact.metadata);
    const content = parseArtifactContent(artifact.content);
    if (!isRawGalleryI2vArtifact(meta, content, artifact.contentUrl)) continue;

    const sourceKey = resolveArtifactI2vSourceKey(meta, content);
    if (!sourceKey || sourceKey !== target) continue;

    const videoUrl = resolveArtifactPlayableVideo(meta, content, artifact.contentUrl);
    if (!videoUrl) continue;

    matches.push({
      videoUrl,
      artifactId: artifact.id,
      source: isPersistedMediaUrl(videoUrl) ? 'persisted' : isEphemeralFalCdn(videoUrl) ? 'fal_cdn' : 'other',
    });
  }

  if (!matches.length) return null;

  matches.sort((a, b) => videoUrlScore(b.videoUrl) - videoUrlScore(a.videoUrl));
  return matches[0] ?? null;
}
