'use client';
/**
 * PLATFORM FEED — Platform-native content preview.
 *
 * Every piece of AI-generated content is shown exactly as it will appear
 * on the target platform. No abstract cards, no metadata tables.
 * Instagram posts look like Instagram. Stories look like stories.
 *
 * Interaction model:
 *   - Vertical scroll through content
 *   - Each card is full-platform preview with approve/revision actions
 *   - Tab bar to filter by platform/format
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { apiClient } from '@/lib/api-client';
import { resolveArtifact, parseArtifactContent } from '../artifact-utils';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { VisualReviewBadge } from '../VisualReviewSheet';

function detectKind(artifact: OutputArtifact): string {
  const ct = (artifact as any).artifactType ?? '';
  const content = (() => { try { return JSON.parse((artifact as any).content || '{}'); } catch { return {}; } })();
  const kind = (content.kind as string) ?? '';
  if (kind.includes('reel') || ct.includes('reel')) return 'reel';
  if (kind.includes('story') || ct.includes('story')) return 'story';
  if (ct.includes('ad') || kind.includes('ad')) return 'ad';
  return 'post';
}
import type { OutputArtifact } from '@/types';

type FeedFilter = 'all' | 'post' | 'story' | 'reel' | 'ad';

function resolveImg(url: string | null | undefined): string | null {
  if (!url) return null;
  // Local Next.js public paths (e.g. /generated/canva/...)
  if (url.startsWith('/')) return url;
  // External URLs — route venue/CDN images through media-proxy to avoid CORS/403
  if (url.startsWith('http')) {
    // Canva edit pages are web pages, not images
    if (url.includes('canva.com/design')) return null;
    // Known-safe CDN domains — embed directly
    const SAFE = ['oaidalleapiprodscus.blob.core', 'fal-cdn', 'storage.googleapis', 'r2.dev', 'amazonaws.com', 'cloudfront.net', 'export-download.canva.com', 'cdninstagram.com', 'fbcdn.net'];
    if (SAFE.some(d => url.includes(d))) return url;
    return `/api/media-proxy?url=${encodeURIComponent(url)}`;
  }
  return null;
}

/** Pick the best displayable image URL from an artifact's content JSON. */
function resolveArtifactImg(artifact: { contentUrl?: string | null; content?: string | null; metadata?: unknown }): string | null {
  const content = (() => { try { return JSON.parse(artifact.content ?? '{}'); } catch { return {}; } })() as Record<string, unknown>;
  const rendered = (content.renderedPreview ?? {}) as Record<string, unknown>;
  const meta    = (artifact.metadata ?? {}) as Record<string, unknown>;
  // Priority order: explicit thumbnail fields, renderedPreview.imageUrl, top-level imageUrl, contentUrl
  const candidates: Array<unknown> = [
    content.canvaThumbnail, content.canvaThumb,
    rendered.imageUrl, rendered.thumbnailUrl,
    (rendered.canvaDesign as Record<string, unknown> | undefined)?.thumbnailUrl,
    content.imageUrl,
    meta.imageUrl, meta.canvaThumbnail,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      const resolved = resolveImg(c.trim());
      if (resolved) return resolved;
    }
  }
  // contentUrl: only use if it looks like an image (skip Canva edit pages)
  const cu = artifact.contentUrl;
  if (cu && !cu.includes('canva.com/design')) return resolveImg(cu);
  return null;
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dakika`;
  if (m < 1440) return `${Math.floor(m / 60)} saat`;
  return `${Math.floor(m / 1440)} gün`;
}

// ── Instagram Post Card ──────────────────────────────────────────────────────
function IGPostCard({ artifact, onApprove, onRevision, approving, revisioning, t }: {
  artifact: OutputArtifact;
  onApprove: () => void;
  onRevision: () => void;
  approving: boolean;
  revisioning: boolean;
  t: ReturnType<typeof useTheme>['t'];
}) {
  const { openApproval } = useMobileStore();
  const resolved = (() => { try { return resolveArtifact(artifact); } catch { return null; } })();
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);

  const img = resolveArtifactImg(artifact) ?? resolveImg(resolved?.imageUrl ?? undefined);
  const caption = (content.caption as string) || (meta.caption as string) || resolved?.caption || '';
  const hashtags = ((content.hashtags ?? meta.hashtags ?? resolved?.hashtags ?? []) as string[]).slice(0, 8);
  const handle   = ((meta as any)?.brandName ?? 'marka').toLowerCase().replace(/\s+/g, '_').slice(0, 20);
  const likes    = Math.floor(100 + Math.random() * 400);  // realistic preview number
  const isApproved = artifact.status === 'approved';
  const isAutoProduced = (meta as any)?.auto_produced === true || (meta as any)?.source === 'auto-produce';
  const isGallerySourced = (meta as any)?.gallery_sourced === true || Boolean((meta as any)?.reference_photo_url);

  return (
    <div style={{
      background: t.isDark ? '#0a0a0f' : '#fff',
      borderBottom: `0.5px solid ${t.separator}`,
      marginBottom: 2,
    }}>
      {/* IG Header */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
          padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%',
            background: t.isDark ? '#0a0a0f' : '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 14, fontWeight: 800, color: t.textPrimary }}>
            {handle[0]?.toUpperCase()}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{handle}</div>
          <div style={{ fontSize: 11, color: t.textMuted }}>{timeAgo(artifact.createdAt)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isGallerySourced && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 700,
              background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>Galeri</span>
          )}
          {isAutoProduced && !isGallerySourced && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 700,
              background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>AI</span>
          )}
          {isApproved && (
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 700,
              background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>✓ Onaylı</span>
          )}
          {artifact.status === 'pending_review' && (
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 700,
              background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>Bekliyor</span>
          )}
          <button onClick={() => openApproval(artifact.id)} style={{ background: 'none', border: 'none',
            cursor: 'pointer', padding: 4, color: t.textMuted, fontSize: 16 }}>···</button>
        </div>
      </div>

      {/* Image */}
      <div style={{ width: '100%', aspectRatio: '1/1', background: t.isDark ? '#111120' : '#f0f0f0',
        overflow: 'hidden' }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" referrerPolicy="no-referrer"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 48, opacity: 0.08 }}>✦</div>
        )}
      </div>

      {/* IG Actions row */}
      <div style={{ padding: '10px 14px 4px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        <svg style={{ marginLeft: 'auto' }} width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="19 21 12 16 5 21 5 3 19 3 19 21"/>
        </svg>
      </div>

      {/* Likes */}
      <div style={{ padding: '0 14px 6px', fontSize: 13, fontWeight: 700, color: t.textPrimary }}>
        {likes.toLocaleString('tr-TR')} beğeni
      </div>

      {/* Caption */}
      {caption && (
        <div style={{ padding: '0 14px 6px', fontSize: 13, color: t.textPrimary, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700 }}>{handle}</span>{' '}
          <span style={{ color: t.textSecondary }}>{caption.slice(0, 120)}{caption.length > 120 ? '…' : ''}</span>
        </div>
      )}

      {/* Hashtags */}
      {hashtags.length > 0 && (
        <div style={{ padding: '0 14px 10px', fontSize: 13, color: '#60A5FA' }}>
          {hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}
        </div>
      )}

      {/* Visual Review badge — only when there's an image to analyze */}
      {img && (
        <div style={{ padding: '0 14px 8px' }}>
          <VisualReviewBadge
            imageUrl={img}
            thumbnailUrl={img}
            context={{
              brandName: handle,
              contentType: 'instagram_post',
              platform: 'Instagram',
              caption: caption?.slice(0, 200),
            }}
          />
        </div>
      )}

      {/* Agency action bar — same position as IG actions, different meaning */}
      {artifact.status === 'pending_review' && (
        <div style={{ margin: '0 14px 14px', display: 'flex', gap: 8 }}>
          <button onClick={onApprove} disabled={approving || revisioning}
            style={{ flex: 1, padding: '11px', borderRadius: 14, cursor: 'pointer', border: 'none',
              background: approving ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.15)',
              color: '#10B981', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {approving ? <><div style={{ width: 12, height: 12, borderRadius: '50%',
              border: '2px solid rgba(16,185,129,0.3)', borderTop: '2px solid #10B981',
              animation: 'spinSlow 0.8s linear infinite' }} />Onaylanıyor…</> : '✓ Onayla'}
          </button>
          <button onClick={onRevision} disabled={approving || revisioning}
            style={{ padding: '11px 16px', borderRadius: 14, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', border: `0.5px solid ${t.separator}`,
              color: t.textSecondary, fontSize: 13, fontWeight: 600 }}>
            ↺
          </button>
          <button onClick={() => openApproval(artifact.id)}
            style={{ padding: '11px 16px', borderRadius: 14, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${t.separator}`,
              color: t.textTertiary, fontSize: 13 }}>
            ···
          </button>
        </div>
      )}
    </div>
  );
}

// ── Story Preview Card ───────────────────────────────────────────────────────
function StoryCard({ artifact, onApprove, approving, t }: {
  artifact: OutputArtifact;
  onApprove: () => void;
  approving: boolean;
  t: ReturnType<typeof useTheme>['t'];
}) {
  const { openApproval } = useMobileStore();
  const resolved = (() => { try { return resolveArtifact(artifact); } catch { return null; } })();
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const img = resolveArtifactImg(artifact) ?? resolveImg(resolved?.imageUrl ?? undefined);
  const brandRaw = String((meta as any)?.brandName ?? (content as any)?.brandName ?? 'yulabodrum');
  const handle = '@' + brandRaw.toLowerCase().replace(/\s+/g, '').slice(0, 20);
  const isApproved = artifact.status === 'approved';

  return (
    <div style={{ margin: '0', borderBottom: `0.5px solid ${t.separator}`, paddingBottom: 0 }}>
      {/* Full-width 9:16 story frame — NO caption below */}
      <div style={{
        width: '100%',
        aspectRatio: '9/16',
        maxHeight: '85vh',
        background: '#000',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Story image — covers full frame */}
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" referrerPolicy="no-referrer"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'linear-gradient(135deg,#1a1a2e,#16213e)',
            fontSize: 48, opacity: 0.3 }}>↕</div>
        )}

        {/* Top chrome: progress bar + handle */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'linear-gradient(rgba(0,0,0,0.55) 0%, transparent 100%)',
          padding: '12px 14px 28px',
          pointerEvents: 'none',
        }}>
          {/* Progress bar */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
            {[0.6, 0.4, 0.4].map((w, i) => (
              <div key={i} style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.28)', borderRadius: 2, overflow: 'hidden' }}>
                {i === 0 && <div style={{ height: '100%', width: `${w * 100}%`, background: '#fff', borderRadius: 2 }} />}
              </div>
            ))}
          </div>
          {/* Handle row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366)',
              padding: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%',
                background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: '#fff' }}>
                {brandRaw[0]?.toUpperCase()}
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>{handle}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{timeAgo(artifact.createdAt)}</span>
          </div>
        </div>

        {/* Top-right: status badge + close */}
        <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
          {(meta as any)?.auto_produced && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
              background: 'rgba(139,92,246,0.85)', color: '#fff', fontWeight: 700, letterSpacing: '0.04em' }}>AI</span>
          )}
          {isApproved && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
              background: 'rgba(16,185,129,0.85)', color: '#fff', fontWeight: 700 }}>✓</span>
          )}
          {artifact.status === 'pending_review' && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
              background: 'rgba(245,158,11,0.9)', color: '#000', fontWeight: 700 }}>Bekliyor</span>
          )}
          <button onClick={() => openApproval(artifact.id)}
            style={{ background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '50%',
              width: 24, height: 24, cursor: 'pointer', color: '#fff', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ···
          </button>
        </div>

        {/* Bottom chrome: approve action inside the frame */}
        {artifact.status === 'pending_review' && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.7) 100%)',
            padding: '32px 16px 20px',
            display: 'flex', gap: 8,
          }}>
            <button onClick={onApprove} disabled={approving}
              style={{ flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer', border: 'none',
                background: approving ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.9)',
                color: '#fff', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {approving
                ? <><div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }}/>Onaylanıyor…</>
                : '✓ Onayla'}
            </button>
            <button onClick={() => openApproval(artifact.id)} disabled={approving}
              style={{ padding: '12px 18px', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(255,255,255,0.15)', border: '0.5px solid rgba(255,255,255,0.2)',
                color: '#fff', fontSize: 13 }}>
              Sonraki →
            </button>
          </div>
        )}
      </div>
      {/* No caption, no hashtags — event info is baked into the image */}
    </div>
  );
}

// ── Main Feed ────────────────────────────────────────────────────────────────
export function PlatformFeed() {
  const { t } = useTheme();
  const { navigate } = useMobileStore();
  const queryClient = useQueryClient();
  const tenantId = useWorkspaceStore((s) => s.tenantId);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [showApproved, setShowApproved] = useState(true);
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});
  const [pipelineStatus, setPipelineStatus] = useState<'idle' | 'running' | 'done'>('idle');

  // Auto-trigger the mission pipeline on mount (fire-and-forget).
  // Kicks off propose → approve → task_graph_executor → content_ideation
  // → auto-produce → Feed artifacts without any manual interaction.
  // Skips silently if a mission is already active or daily cap reached.
  useEffect(() => {
    if (!tenantId) return;
    setPipelineStatus('running');
    fetch(`/api/missions/${tenantId}/auto-trigger`, { method: 'POST' })
      .then(r => r.json())
      .then((data: { triggered?: boolean; skipped?: boolean }) => {
        setPipelineStatus(data.triggered ? 'running' : 'done');
        if (data.triggered) {
          // Poll artifacts every 20s while pipeline may be producing
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['artifacts'] });
            setPipelineStatus('done');
          }, 30_000);
        }
      })
      .catch(() => setPipelineStatus('done'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const { data: rawArtifacts = [], isLoading } = useQuery({
    queryKey: ['artifacts'],
    queryFn: () => apiClient.getArtifacts(),
    refetchInterval: pipelineStatus === 'running' ? 20_000 : 30_000,
    staleTime: 15_000,
  });

  const approveMutation = useMutation({
    mutationFn: async (artifact: OutputArtifact) => {
      const resolved = (() => { try { return resolveArtifact(artifact); } catch { return null; } })();
      const content = parseArtifactContent(artifact.content);
      const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
      const kind = detectKind(artifact);

      // Stories never carry a caption — event info is baked into the image overlay
      const caption = kind === 'story'
        ? ''
        : String((content.caption as string) || (meta.caption as string) || resolved?.caption || '');
      const hashtags = kind === 'story'
        ? []
        : ((content.hashtags ?? meta.hashtags ?? resolved?.hashtags ?? []) as string[])
            .map(String)
            .filter(Boolean);
      const imageUrl = String((content.imageUrl as string) || (meta.imageUrl as string) || resolved?.imageUrl || artifact.contentUrl || '');
      const videoUrl = String((content.videoUrl as string) || (meta.videoUrl as string) || resolved?.videoUrl || '');
      const mediaUrls = (Array.isArray((content as any).mediaUrls) ? (content as any).mediaUrls : Array.isArray((meta as any).media_urls) ? (meta as any).media_urls : []) as string[];

      const postType = kind === 'story' ? 'story' : kind === 'reel' ? 'reels' : (mediaUrls.length >= 2 ? 'carousel' : 'feed');
      const publishPayload: Record<string, unknown> = {
        post_type: postType,
        workspaceId: tenantId,
        artifactId: artifact.id,
      };
      if (postType === 'story') {
        publishPayload.image_url = imageUrl;
      } else if (postType === 'feed') {
        publishPayload.image_url = imageUrl;
        publishPayload.content = caption;
        publishPayload.hashtags = hashtags;
      }
      if (postType === 'reels') {
        publishPayload.video_url = videoUrl;
        publishPayload.share_to_feed = true;
        publishPayload.content = caption;
        publishPayload.hashtags = hashtags;
      }
      if (postType === 'carousel') {
        publishPayload.media_urls = mediaUrls;
        publishPayload.content = caption;
        publishPayload.hashtags = hashtags;
      }

      const publishRes = await fetch('/api/mertcafe/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishPayload),
      });
      const publishJson = await publishRes.json().catch(() => ({}));
      if (!publishRes.ok) {
        throw new Error((publishJson as { error?: string }).error || `Paylaşım başarısız (${publishRes.status})`);
      }

      await apiClient.approveArtifact(artifact.id, 'Approved and published from feed');
      return publishJson;
    },
    onSuccess: (_data, artifact) => {
      setPublishErrors((prev) => {
        const next = { ...prev };
        delete next[artifact.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
    onError: (err, artifact) => {
      setPublishErrors((prev) => ({ ...prev, [artifact.id]: err instanceof Error ? err.message : 'Paylaşım başarısız' }));
    },
  });
  const revisionMutation = useMutation({
    mutationFn: (id: string) => apiClient.requestRevision(id, 'Revision requested from feed'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artifacts'] }),
  });

  const allArtifacts = rawArtifacts as OutputArtifact[];
  const pendingCount = allArtifacts.filter(a => a.status === 'pending_review').length;
  const approvedCount = allArtifacts.filter(a => a.status === 'approved').length;

  const artifacts = allArtifacts
    .filter(a => {
      // Galeri (approved) mode: only approved items
      if (showApproved) return a.status === 'approved';
      // Bekleyen mode: only pending_review items
      return a.status === 'pending_review';
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter(a => {
      if (filter === 'all') return true;
      const k = detectKind(a as any);
      if (filter === 'post') return k === 'post' || k === 'image';
      if (filter === 'story') return k === 'story';
      if (filter === 'reel') return k === 'reel' || k === 'video';
      if (filter === 'ad') return k === 'ad' || k === 'ad_creative';
      return true;
    })
    .slice(0, 30);

  const TABS: { id: FeedFilter; label: string; icon: string }[] = [
    { id: 'all',   label: 'Tümü',    icon: '⊞' },
    { id: 'post',  label: 'Post',    icon: '□' },
    { id: 'story', label: 'Story',   icon: '○' },
    { id: 'reel',  label: 'Reel',    icon: '▶' },
    { id: 'ad',    label: 'Reklam',  icon: '📊' },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: t.isDark ? '#0a0a0f' : '#f7f7f7',
      paddingBottom: 88 }}>

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: t.isDark ? 'rgba(10,10,15,0.95)' : 'rgba(247,247,247,0.95)',
        backdropFilter: 'blur(20px)',
        borderBottom: `0.5px solid ${t.separator}`,
        paddingTop: 'calc(env(safe-area-inset-top,0px) + 10px)',
      }}>
        <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: t.textPrimary,
              letterSpacing: '-0.02em' }}>Feed</span>
            {pendingCount > 0 && (
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontWeight: 700 }}>
                {pendingCount}
              </span>
            )}
            {pipelineStatus === 'running' && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
                background: 'rgba(16,185,129,0.12)', color: '#10B981',
                display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981',
                  animation: 'liveGlow 1.4s ease-in-out infinite' }} />
                Üretiyor
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setShowApproved(s => !s)}
              style={{
                padding: '5px 10px', borderRadius: 14, border: `0.5px solid ${t.separator}`,
                background: showApproved ? (t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : 'transparent',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                color: showApproved ? t.textPrimary : t.textMuted,
              }}
            >
              {showApproved ? `Bekleyen (${pendingCount})` : `Galeri (${approvedCount})`}
            </button>
            <button
              onClick={() => navigate('outputs')}
              style={{
                padding: '5px 10px', borderRadius: 14, border: `0.5px solid ${t.separator}`,
                background: 'transparent', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, color: t.accent,
              }}
            >
              Galeri
            </button>
          </div>
        </div>

        {/* Filter tabs — Instagram Explore style */}
        <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none',
          paddingLeft: 16, gap: 6, paddingBottom: 12 }}>
          {TABS.map(tab => {
            const active = filter === tab.id;
            return (
              <button key={tab.id} onClick={() => setFilter(tab.id)} style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                background: active
                  ? (t.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)')
                  : 'transparent',
                border: `0.5px solid ${active ? t.textSecondary : t.separator}`,
                color: active ? t.textPrimary : t.textMuted,
                fontSize: 13, fontWeight: active ? 700 : 500,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontSize: 11 }}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 200, flexDirection: 'column', gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%',
            border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.accent}`,
            animation: 'spinSlow 1s linear infinite' }} />
          <span style={{ fontSize: 13, color: t.textMuted }}>Yükleniyor…</span>
        </div>
      ) : artifacts.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.15 }}>📸</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary, marginBottom: 6 }}>
            {showApproved ? 'Galeri boş' : 'Bekleyen içerik yok'}
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 16 }}>
            {showApproved
              ? 'Onaylanan içerikler burada görünür. Feed\'den bir içeriği onaylayarak başlayın.'
              : 'Bekleyen içerik yok. Galeriye geç veya Mission Hub\'dan yeni içerik üret.'}
          </div>
          {showApproved && pendingCount > 0 && (
            <button
              onClick={() => setShowApproved(false)}
              style={{
                padding: '10px 20px', borderRadius: 20, border: 'none',
                background: `linear-gradient(135deg, ${t.accent}cc, ${t.accent}88)`,
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Bekleyenleri Gör ({pendingCount})
            </button>
          )}
          {showApproved && (
            <button
              onClick={() => navigate('missions')}
              style={{
                padding: '10px 20px', borderRadius: 20, border: 'none',
                background: `linear-gradient(135deg, ${t.accent}cc, ${t.accent}88)`,
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: 8,
              }}
            >
              Mission Hub'a Git
            </button>
          )}
        </div>
      ) : (
        <div>
          {artifacts.map(artifact => {
            const k = detectKind(artifact as any);
            const isStory = k === 'story';
            const isApproving = approveMutation.isPending && approveMutation.variables?.id === artifact.id;
            const isRevisioning = revisionMutation.isPending && revisionMutation.variables === artifact.id;

            if (isStory) {
              return (
                <StoryCard key={artifact.id} artifact={artifact} t={t}
                  approving={isApproving}
                  onApprove={() => approveMutation.mutate(artifact)} />
              );
            }
            return (
              <IGPostCard key={artifact.id} artifact={artifact} t={t}
                approving={isApproving}
                revisioning={isRevisioning}
                onApprove={() => approveMutation.mutate(artifact)}
                onRevision={() => revisionMutation.mutate(artifact.id)} />
            );
          })}
        </div>
      )}
      {Object.keys(publishErrors).length > 0 && (
        <div style={{ padding: '10px 16px 0' }}>
          {Object.entries(publishErrors).slice(-2).map(([artifactId, message]) => (
            <div key={artifactId} style={{ fontSize: 12, color: '#fb7185', marginBottom: 6 }}>
              ⚠ Paylaşım hatası: {message}
            </div>
          ))}
          {!tenantId && (
            <div style={{ fontSize: 12, color: '#fb7185' }}>
              ⚠ Tenant bilgisi bulunamadı. Tekrar giriş yapıp deneyin.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
