'use client';

import type { OutputArtifact } from '@/types';
import type { T } from './theme-context';
import {
  artifactToNativeContent,
  detectPreviewMode,
  type PreviewMode,
} from './platform-native-previews';
import {
  detectArtifactPackageFormat,
  type PackageFormat,
} from '@/lib/weekly-publish-package';
import {
  getProductionBundleStatus,
  isBundleRendering,
  resolvePosterUrl,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { SafeCoverImage } from './SafeCoverImage';

const FORMAT_LABEL: Record<PackageFormat, string> = {
  story: 'Story',
  post: 'Post',
  reel: 'Reel',
  carousel: 'Carousel',
};

const FORMAT_COLOR: Record<PackageFormat, string> = {
  story: '#9DBECE',
  post: '#8AABBD',
  reel: '#F472B6',
  carousel: '#60A5FA',
};

function aspectForFormat(fmt: PackageFormat, mode: PreviewMode): string {
  if (fmt === 'story' || fmt === 'reel' || mode === 'story' || mode === 'reel') return '9/16';
  if (mode === 'carousel') return '1/1';
  return '4/5';
}

function sortMissionPreviewArtifacts(artifacts: OutputArtifact[]): OutputArtifact[] {
  const order: PackageFormat[] = ['story', 'post', 'carousel', 'reel'];
  return [...artifacts].sort((a, b) => {
    const fa = detectArtifactPackageFormat(a);
    const fb = detectArtifactPackageFormat(b);
    const ia = order.indexOf(fa);
    const ib = order.indexOf(fb);
    if (ia !== ib) return ia - ib;
    const ai = Number((a.metadata as Record<string, unknown>)?.idea_index ?? 99);
    const bi = Number((b.metadata as Record<string, unknown>)?.idea_index ?? 99);
    return ai - bi;
  });
}

export interface MissionFeedPreviewGridProps {
  artifacts: OutputArtifact[];
  onPreview: (artifactId: string) => void;
  t: T;
  /** Max tiles before "+N more" */
  maxVisible?: number;
  title?: string;
}

export function MissionFeedPreviewGrid({
  artifacts,
  onPreview,
  t,
  maxVisible = 12,
  title = 'Feed önizleme',
}: MissionFeedPreviewGridProps) {
  const sorted = sortMissionPreviewArtifacts(artifacts);
  if (!sorted.length) return null;

  const visible = sorted.slice(0, maxVisible);
  const extra = sorted.length - visible.length;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: t.textMuted,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {title}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.textTertiary }}>
          {sorted.length} içerik · dokunarak aç
        </span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}>
        {visible.map((artifact) => (
          <MissionFeedPreviewTile
            key={artifact.id}
            artifact={artifact}
            onPreview={() => onPreview(artifact.id)}
            t={t}
          />
        ))}
      </div>
      {extra > 0 && (
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8, textAlign: 'center' }}>
          +{extra} içerik daha Feed&apos;de
        </div>
      )}
    </div>
  );
}

function MissionFeedPreviewTile({
  artifact,
  onPreview,
  t,
}: {
  artifact: OutputArtifact;
  onPreview: () => void;
  t: T;
}) {
  const fmt = detectArtifactPackageFormat(artifact);
  const native = artifactToNativeContent(artifact);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const mode = detectPreviewMode(artifact, fmt);
  const aspect = aspectForFormat(fmt, mode);
  const thumb = native.imageUrl ?? native.videoUrl;
  const thumbFallbacks = [
    resolveClientMediaUrl(resolvePosterUrl(artifact)),
    resolveClientMediaUrl(artifact.contentUrl),
    resolveClientMediaUrl(String(meta.feed_preview_url || '')),
    resolveClientMediaUrl(String(meta.reference_photo_url || '')),
  ].filter(Boolean);
  const hasVideo = Boolean(native.videoUrl);
  const rendering = isBundleRendering(artifact) && !resolveStoryVideoUrl(artifact);
  const bundleStatus = getProductionBundleStatus(artifact);
  const headline = String(meta.headline || native.headline || artifact.title || '').slice(0, 40);
  const pending = artifact.status === 'pending_review';

  return (
    <button
      type="button"
      onClick={onPreview}
      style={{
        position: 'relative',
        border: 'none',
        padding: 0,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
        aspectRatio: aspect,
        minHeight: 0,
      }}
    >
      {thumb ? (
        <SafeCoverImage
          src={thumb}
          fallbacks={thumbFallbacks}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: t.textMuted, fontSize: 11,
        }}>
          {rendering ? 'Render…' : 'Önizleme'}
        </div>
      )}

      {rendering && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.25)',
            borderTop: '2px solid #8AABBD',
            animation: 'spinSlow 0.9s linear infinite',
          }} />
        </div>
      )}

      {hasVideo && !rendering && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: 14, marginLeft: 2 }}>▶</span>
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute', top: 6, left: 6,
        fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 8,
        background: 'rgba(0,0,0,0.55)', color: FORMAT_COLOR[fmt],
        backdropFilter: 'blur(4px)',
      }}>
        {FORMAT_LABEL[fmt]}
      </div>

      {pending && (
        <div style={{
          position: 'absolute', top: 6, right: 6, width: 8, height: 8,
          borderRadius: '50%', background: '#F59E0B',
          boxShadow: '0 0 0 2px rgba(0,0,0,0.4)',
        }} />
      )}

      {bundleStatus === 'failed' && (
        <div style={{
          position: 'absolute', bottom: 6, right: 6, fontSize: 8, fontWeight: 800,
          padding: '2px 6px', borderRadius: 6,
          background: thumb ? 'rgba(245,158,11,0.9)' : 'rgba(239,68,68,0.85)',
          color: '#fff',
        }}>
          {thumb ? 'Video eksik' : 'Hata'}
        </div>
      )}

      {headline && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '20px 6px 6px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
          fontSize: 9, fontWeight: 600, color: '#fff',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textAlign: 'left',
        }}>
          {headline}
        </div>
      )}
    </button>
  );
}

/** Collect weekly package slots + publishable mission artifacts for preview. */
export function collectMissionPreviewArtifacts(
  allArtifacts: OutputArtifact[] | undefined,
  missionId: string,
  selection: {
    slots: {
      stories: OutputArtifact[];
      posts: OutputArtifact[];
      reels: OutputArtifact[];
      carousels: OutputArtifact[];
    };
    primary: OutputArtifact[];
  } | null,
  extraPublishable?: OutputArtifact[],
): OutputArtifact[] {
  if (!allArtifacts?.length && !extraPublishable?.length) return [];

  const seen = new Set<string>();
  const out: OutputArtifact[] = [];

  const push = (a: OutputArtifact) => {
    if (!a?.id || seen.has(a.id)) return;
    seen.add(a.id);
    out.push(a);
  };

  if (selection) {
    for (const a of [
      ...selection.slots.stories,
      ...selection.slots.posts,
      ...selection.slots.reels,
      ...selection.slots.carousels,
      ...selection.primary,
    ]) {
      push(a);
    }
  }

  if (out.length) return out;

  const pool = extraPublishable ?? allArtifacts ?? [];
  for (const a of pool) {
    push(a);
  }
  return out;
}
