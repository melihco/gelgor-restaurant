'use client';

/**
 * Post detail — opened from Instagram profile grid (and similar).
 * Native IG preview + clean approval dock; theme-aware, mobile WebView first.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme, type T } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { MobileStackHeader } from '../ui-primitives';
import { apiClient } from '@/lib/api-client';
import { resolveArtifact, parseArtifactContent } from '@/lib/artifact-utils';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { resolveBrandedPostUrl, resolvePosterUrl } from '@/lib/production-bundle';
import { useTenantBrandContext } from '../TenantBrandProvider';
import { useBrandStoryAudio } from '@/hooks/useBrandStoryAudio';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { BoostPostSheet } from '../BoostPostSheet';
import type { OutputArtifact } from '@/types';
import {
  artifactToNativeContent,
  detectPreviewMode,
  PlatformNativePreview,
  type PreviewMode,
  type PreviewPlatform,
} from '../platform-native-previews';
import {
  CommentsBottomSheet,
  ShareBottomSheet,
  useFeedEngagement,
} from '../feed';
import { MediaPlaybackProvider } from '../feed/media-playback-context';

type Platform = PreviewPlatform;

interface ContentData {
  imageUrl: string | null;
  videoUrl: string | null;
  caption: string;
  hashtags: string[];
  cta: string;
  headline: string;
  kind: string;
  location?: string;
}

function extractContent(artifact: OutputArtifact): ContentData {
  const resolved = resolveArtifact(artifact);
  const c = parseArtifactContent(artifact.content);
  const m = (artifact.metadata ?? {}) as Record<string, unknown>;

  const videoUrl = resolved.videoUrl
    ?? resolveClientMediaUrl(
      (c.videoUrl as string) || (m.videoUrl as string)
      || (artifact.contentUrl?.match(/\.(mp4|webm|mov)/i) ? artifact.contentUrl : null),
    );

  const imageUrl = resolved.imageUrl
    ?? resolveClientMediaUrl(resolveBrandedPostUrl(artifact))
    ?? resolveClientMediaUrl(resolvePosterUrl(artifact))
    ?? resolveClientMediaUrl(
      !videoUrl && artifact.contentUrl && !/\.(mp4|webm|mov)(\?|$)/i.test(artifact.contentUrl)
        ? artifact.contentUrl
        : null,
    );

  return {
    imageUrl,
    videoUrl,
    caption: resolved.caption || (c.caption as string) || (m.caption as string) || '',
    hashtags: (resolved.hashtags.length ? resolved.hashtags : ((c.hashtags ?? m.hashtags ?? []) as string[])).slice(0, 10),
    cta: resolved.cta || (c.cta as string) || (m.cta as string) || '',
    headline: resolved.headline || (c.headline as string) || (m.headline as string) || artifact.title || '',
    kind: resolved.contentType || (c.kind as string) || (c.contentType as string) || '',
    location: (m.location as string) || '',
  };
}

function formatTitle(mode: PreviewMode): string {
  if (mode === 'reel') return 'Reel';
  if (mode === 'story') return 'Story';
  if (mode === 'carousel') return 'Carousel';
  return 'Gönderi';
}

const REVISION_CHIPS = [
  'Daha premium',
  'Daha kısa',
  'Güçlü CTA',
  'Caption iyileştir',
  'Görsel değiştir',
  'Daha lifestyle',
];

type RevisionScope = 'all' | 'caption' | 'image';

function SheetShell({
  t,
  onClose,
  children,
}: {
  t: T;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        style={{
          flex: 1,
          border: 'none',
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          cursor: 'pointer',
        }}
      />
      <div
        style={{
          background: t.isDark ? '#0D121B' : '#fff',
          borderRadius: '24px 24px 0 0',
          border: `0.5px solid ${t.separator}`,
          borderBottom: 'none',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          maxHeight: '78dvh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: t.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
            }}
          />
        </div>
        {children}
      </div>
    </div>
  );
}

function RevisionSheet({
  t,
  onClose,
  onSubmit,
  onQuickScope,
  onSaveDraft,
  submitting,
}: {
  t: T;
  onClose: () => void;
  onSubmit: (chips: string[], note: string) => void;
  onQuickScope: (scope: RevisionScope) => void;
  onSaveDraft: () => void;
  submitting: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const canSubmit = selected.length > 0 || note.trim().length > 0;

  const quickBtnStyle: CSSProperties = {
    flex: 1,
    minHeight: 44,
    padding: '10px 8px',
    borderRadius: 14,
    cursor: submitting ? 'wait' : 'pointer',
    fontSize: 12,
    fontWeight: 700,
    background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: `0.5px solid ${t.separator}`,
    color: t.textSecondary,
  };

  return (
    <SheetShell t={t} onClose={onClose}>
      <div style={{ padding: '8px 20px 14px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: t.textPrimary }}>Revizyon iste</div>
        <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 4, lineHeight: 1.45 }}>
          Hızlı mod veya not ile yeniden üretim isteyin.
        </div>
      </div>

      <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8 }}>
        <button type="button" disabled={submitting} onClick={() => onQuickScope('caption')} style={quickBtnStyle}>
          Caption
        </button>
        <button type="button" disabled={submitting} onClick={() => onQuickScope('image')} style={quickBtnStyle}>
          Görsel
        </button>
        <button type="button" disabled={submitting} onClick={() => onQuickScope('all')} style={quickBtnStyle}>
          Tümü
        </button>
      </div>

      <div style={{ padding: '0 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {REVISION_CHIPS.map((chip) => {
          const on = selected.includes(chip);
          return (
            <button
              key={chip}
              type="button"
              onClick={() =>
                setSelected((s) => (on ? s.filter((x) => x !== chip) : [...s, chip]))
              }
              style={{
                minHeight: 40,
                padding: '8px 14px',
                borderRadius: 20,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: on ? 700 : 500,
                background: on
                  ? t.isDark
                    ? 'rgba(77,112,136,0.28)'
                    : 'rgba(77,112,136,0.12)'
                  : t.isDark
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(0,0,0,0.04)',
                border: `0.5px solid ${on ? t.accent : t.separator}`,
                color: on ? t.accent : t.textSecondary,
              }}
            >
              {chip}
            </button>
          );
        })}
      </div>
      <div style={{ padding: '0 20px 14px' }}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ek not (isteğe bağlı)"
          rows={3}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 14,
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            fontSize: 16,
            lineHeight: 1.5,
            background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            border: `0.5px solid ${t.separator}`,
            color: t.textPrimary,
          }}
        />
      </div>
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={() => onSubmit(selected, note)}
          style={{
            width: '100%',
            minHeight: 48,
            padding: '14px',
            borderRadius: 16,
            border: 'none',
            cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
            background: canSubmit ? t.gradientAccent : t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            color: canSubmit ? '#fff' : t.textMuted,
            fontSize: 15,
            fontWeight: 800,
          }}
        >
          {submitting ? 'Gönderiliyor…' : 'Revizyon gönder'}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onSaveDraft}
          style={{
            width: '100%',
            minHeight: 44,
            borderRadius: 14,
            cursor: submitting ? 'wait' : 'pointer',
            background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            border: `0.5px solid ${t.separator}`,
            color: t.textSecondary,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Taslak olarak kaydet
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            minHeight: 44,
            border: 'none',
            background: 'transparent',
            color: t.textMuted,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Vazgeç
        </button>
      </div>
    </SheetShell>
  );
}

function RejectSheet({
  t,
  onClose,
  onReject,
  submitting,
}: {
  t: T;
  onClose: () => void;
  onReject: (note: string) => void;
  submitting: boolean;
}) {
  const [note, setNote] = useState('');

  return (
    <SheetShell t={t} onClose={onClose}>
      <div style={{ padding: '8px 20px 14px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: t.textPrimary }}>İçeriği reddet</div>
        <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 4, lineHeight: 1.45 }}>
          Kısa bir gerekçe ekleyebilirsiniz (isteğe bağlı).
        </div>
      </div>
      <div style={{ padding: '0 20px 14px' }}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Red gerekçesi…"
          rows={3}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 14,
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            fontSize: 16,
            lineHeight: 1.5,
            background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            border: `0.5px solid ${t.separator}`,
            color: t.textPrimary,
          }}
        />
      </div>
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          disabled={submitting}
          onClick={() => onReject(note.trim())}
          style={{
            width: '100%',
            minHeight: 48,
            padding: '14px',
            borderRadius: 16,
            border: 'none',
            cursor: submitting ? 'wait' : 'pointer',
            background: 'linear-gradient(160deg, #f87171 0%, #dc2626 100%)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 800,
          }}
        >
          {submitting ? 'Reddediliyor…' : 'Reddet'}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            minHeight: 44,
            border: 'none',
            background: 'transparent',
            color: t.textMuted,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Vazgeç
        </button>
      </div>
    </SheetShell>
  );
}

function ApprovalDock({
  t,
  status,
  approving,
  onApprove,
  onRevise,
  onReject,
  onBoost,
}: {
  t: T;
  status: string;
  approving: boolean;
  onApprove: () => void;
  onRevise: () => void;
  onReject: () => void;
  onBoost: () => void;
}) {
  const isApproved = status === 'approved';
  const dockBg = t.isDark
    ? 'linear-gradient(to top, rgba(5,7,12,0.98) 55%, rgba(5,7,12,0.82))'
    : 'linear-gradient(to top, rgba(247,249,251,0.98) 55%, rgba(247,249,251,0.88))';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px)',
        background: dockBg,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        borderTop: `0.5px solid ${t.separator}`,
      }}
    >
      {isApproved ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={onBoost}
            style={{
              width: '100%',
              minHeight: 48,
              padding: '14px',
              borderRadius: 16,
              border: 'none',
              cursor: 'pointer',
              background: t.gradientAccent,
              color: '#fff',
              fontSize: 15,
              fontWeight: 800,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            Tanıt / reklam ver
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: t.isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)',
                border: '0.5px solid rgba(16,185,129,0.3)',
                color: t.success,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Onaylandı
            </div>
            <button
              type="button"
              onClick={onRevise}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 14,
                cursor: 'pointer',
                background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                border: `0.5px solid ${t.separator}`,
                color: t.textSecondary,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Revize et
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={onApprove}
            disabled={approving}
            style={{
              width: '100%',
              minHeight: 50,
              padding: '15px',
              borderRadius: 16,
              border: 'none',
              cursor: approving ? 'wait' : 'pointer',
              background: approving
                ? t.isDark
                  ? 'rgba(16,185,129,0.25)'
                  : 'rgba(16,185,129,0.35)'
                : 'linear-gradient(160deg, #34d399 0%, #059669 100%)',
              color: '#fff',
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: '-0.01em',
            }}
          >
            {approving ? 'Onaylanıyor…' : 'Onayla'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onRevise}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 14,
                cursor: 'pointer',
                background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                border: `0.5px solid ${t.separator}`,
                color: t.textSecondary,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Revize
            </button>
            <button
              type="button"
              onClick={onReject}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 14,
                cursor: 'pointer',
                background: t.isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)',
                border: '0.5px solid rgba(239,68,68,0.35)',
                color: t.danger,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Reddet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlatformPreviewStudio() {
  const { t } = useTheme();
  const { goBack, selectedArtifactId } = useMobileStore();
  const queryClient = useQueryClient();
  const engagementApi = useFeedEngagement();

  const [showRevision, setShowRevision] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showBoost, setShowBoost] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { data: artifact, isLoading } = useQuery({
    queryKey: ['artifact', selectedArtifactId],
    queryFn: async () => {
      if (!selectedArtifactId) return null;
      try {
        return await apiClient.getArtifact(selectedArtifactId);
      } catch {
        return null;
      }
    },
    enabled: !!selectedArtifactId,
    staleTime: 30_000,
  });

  const invalidateArtifact = () => {
    void queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    void queryClient.invalidateQueries({ queryKey: ['artifact', selectedArtifactId] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveArtifact(id, 'Approved from post detail'),
    onSuccess: () => {
      invalidateArtifact();
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveArtifact(id, '[DRAFT] Saved as draft from preview'),
    onSuccess: () => {
      invalidateArtifact();
      setShowRevision(false);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiClient.rejectArtifact(id, note || 'Rejected from post detail'),
    onSuccess: () => {
      invalidateArtifact();
      setShowReject(false);
      goBack();
    },
  });

  const revisionMutation = useMutation({
    mutationFn: ({
      id,
      chips,
      note,
      scope,
    }: {
      id: string;
      chips?: string[];
      note?: string;
      scope?: RevisionScope;
    }) => {
      const scopePrefix = scope === 'caption'
        ? '[REVISE_CAPTION_ONLY] '
        : scope === 'image'
          ? '[REVISE_IMAGE_ONLY] '
          : '';
      const body = scopePrefix
        + ([...(chips ?? []), note].filter(Boolean).join(' · ') || 'Revision requested');
      return apiClient.requestRevision(id, body);
    },
    onSuccess: () => {
      invalidateArtifact();
      setShowRevision(false);
    },
  });

  const tenantBrand = useTenantBrandContext();
  const tenantId = useActiveTenantId();
  const { storyMusicUrl } = useBrandStoryAudio(tenantId);
  const handle = tenantBrand.displayHandle;
  const logoUrl = tenantBrand.logoUrl
    ? resolveClientMediaUrl(tenantBrand.logoUrl) ?? tenantBrand.logoUrl
    : '';

  const content = useMemo(
    () => (artifact ? extractContent(artifact) : null),
    [artifact],
  );

  const nativeContent = useMemo(
    () => (artifact ? artifactToNativeContent(artifact) : null),
    [artifact],
  );

  const previewMode = useMemo((): PreviewMode => {
    if (!artifact || !content) return 'feed';
    const kind = content.kind.toLowerCase();
    return detectPreviewMode(
      artifact,
      kind.includes('reel') || content.videoUrl
        ? 'reel'
        : kind.includes('story')
          ? 'story'
          : 'post',
    );
  }, [artifact, content]);

  const platform: Platform = 'instagram';
  const isPending = artifact?.status === 'pending_review';
  const engagement = artifact ? engagementApi.get(artifact.id) : null;

  if (isLoading || !artifact || !content || !nativeContent) {
    return (
      <div
        className="sa-stack-screen"
        style={{
          minHeight: '100dvh',
          background: t.bg,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <MobileStackHeader t={t} title="Gönderi" onBack={goBack} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: `2px solid ${t.separator}`,
              borderTop: `2px solid ${t.accent}`,
              animation: 'spinSlow 0.9s linear infinite',
            }}
          />
        </div>
      </div>
    );
  }

  // Pending dock: primary + Revize/Reddet row (~50+44+gaps+safe-area)
  const dockPad = isPending || artifact.status === 'approved' ? 168 : 24;

  return (
    <MediaPlaybackProvider>
      <div
        className="sa-stack-screen"
        style={{
          minHeight: '100dvh',
          height: '100dvh',
          background: t.bg,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <MobileStackHeader
          t={t}
          title={formatTitle(previewMode)}
          onBack={goBack}
          sticky
          right={
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isPending ? t.warning : t.success,
                letterSpacing: '0.02em',
                paddingRight: 4,
              }}
            >
              {isPending ? 'Bekliyor' : artifact.status === 'approved' ? 'Onaylı' : ''}
            </span>
          }
        />

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: dockPad,
            background: t.isDark ? '#000' : t.bg,
          }}
        >
          <PlatformNativePreview
            platform={platform}
            mode={previewMode}
            content={nativeContent}
            handle={handle}
            logoUrl={logoUrl}
            isPending={isPending}
            backgroundMusicUrl={
              previewMode === 'story' && !nativeContent.videoUrl ? storyMusicUrl : undefined
            }
            inFeedScroll={false}
            igChromeDark={t.isDark}
            engagementId={artifact.id}
            engagement={engagement ?? undefined}
            onToggleLike={() => engagementApi.toggleLike(artifact.id)}
            onToggleSave={() => engagementApi.toggleSave(artifact.id)}
            onOpenComments={() => setCommentsOpen(true)}
            onOpenShare={() => setShareOpen(true)}
          />
        </div>
      </div>

      {(isPending || artifact.status === 'approved') && (
        <ApprovalDock
          t={t}
          status={artifact.status}
          approving={approveMutation.isPending}
          onApprove={() => approveMutation.mutate(artifact.id)}
          onRevise={() => setShowRevision(true)}
          onReject={() => setShowReject(true)}
          onBoost={() => setShowBoost(true)}
        />
      )}

      <BoostPostSheet
        artifactId={artifact.id}
        igMediaId={
          (artifact.metadata as Record<string, unknown> | undefined)?.ig_media_id as string
          ?? (artifact.metadata as Record<string, unknown> | undefined)?.post_id as string
        }
        caption={content.caption}
        imageUrl={content.imageUrl || resolveClientMediaUrl(artifact.contentUrl) || ''}
        isOpen={showBoost}
        onClose={() => setShowBoost(false)}
      />

      {showRevision && (
        <RevisionSheet
          t={t}
          onClose={() => setShowRevision(false)}
          submitting={revisionMutation.isPending || saveDraftMutation.isPending}
          onSubmit={(chips, note) =>
            revisionMutation.mutate({ id: artifact.id, chips, note, scope: 'all' })
          }
          onQuickScope={(scope) =>
            revisionMutation.mutate({ id: artifact.id, scope })
          }
          onSaveDraft={() => saveDraftMutation.mutate(artifact.id)}
        />
      )}

      {showReject && (
        <RejectSheet
          t={t}
          onClose={() => setShowReject(false)}
          submitting={rejectMutation.isPending}
          onReject={(note) => rejectMutation.mutate({ id: artifact.id, note })}
        />
      )}

      <CommentsBottomSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        comments={engagementApi.getComments(artifact.id)}
        onSubmit={(text) => engagementApi.addComment(artifact.id, text)}
      />

      <ShareBottomSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Paylaş"
        shareText={[content.headline, content.caption].filter(Boolean).join('\n\n')}
        shareUrl={content.imageUrl || undefined}
      />
    </MediaPlaybackProvider>
  );
}
