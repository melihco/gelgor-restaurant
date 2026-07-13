'use client';
/**
 * APPROVAL / FEEDBACK — Elegant content review experience.
 *
 * UX principles:
 * - If there's a real image: it dominates. Actions float beneath.
 * - If it's a text artifact: content fills the card, no empty space.
 * - Approve/reject are always reachable without heavy scrolling.
 * - Feedback feels like directing a creative team, not filling a form.
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { productionSnapshotToLegacyBrandContext } from '@/lib/production-snapshot-compat';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { MobileArtifactView, signalFromArtifact } from '../MobileArtifactView';
import { parseAgentSummary } from '../activity-parser';
import { resolveArtifact, parseArtifactContent, findScheduledForArtifact } from '@/lib/artifact-utils';
import { mergeMobilePlanSignal } from '../mobile-plan-signal';
import { BoostPostSheet } from '../BoostPostSheet';
import { ScheduleSheet } from '../ScheduleSheet';
import type { T } from '../theme-context';

// ─── Görsel Üretim Paneli ──────────────────────────────────────────────
function ImageGenPanel({ artifactId, caption, title, queryClient }: {
  artifactId: string; caption: string; title: string; queryClient: QueryClient;
}) {
  const { tenantId } = useWorkspaceStore();
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { data: productionSnapshot } = useQuery({
    queryKey: ['production-context-snapshot', tenantId],
    queryFn: () => apiClient.getProductionBrandContextSnapshot(tenantId),
    staleTime: 10 * 60_000,
    enabled: !!tenantId,
  });
  const brandCtx = productionSnapshotToLegacyBrandContext(productionSnapshot);

  async function generate(mode: 'post' | 'story' | 'reel') {
    setError(null);
    setGenerating(mode);
    try {
      const b = brandCtx as any;
      const { imageUrl } = await apiClient.generateInstagramImage({
        title,
        caption,
        brandName:   b?.business_name || '',
        industry:    b?.business_type || b?.industry || '',
        location:    b?.location || '',
        visualStyle: b?.visual_style || '',
        contentType: mode === 'post' ? 'post' : mode === 'story' ? 'story' : 'reel',
        referenceImageUrls: (b?.reference_image_urls ?? []).slice(0, 3),
        campaignContext: caption.slice(0, 300),
      });

      // Attach the image directly to the existing artifact — no new card created
      await apiClient.attachImageToArtifact(artifactId, imageUrl, `instagram_${mode}`);

      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['artifact', artifactId] });
      setDone(true);
    } catch (e: any) {
      setError(e?.message?.slice(0, 100) || 'Üretim başarısız');
    } finally {
      setGenerating(null);
    }
  }

  if (done) return (
    <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 16,
      background: 'rgba(16,185,129,0.06)', border: '0.5px solid rgba(16,185,129,0.2)',
      display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span style={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>
        Görsel bu içeriğe atandı — sayfayı yenile
      </span>
    </div>
  );

  const MODES = [
    { id: 'post' as const,  label: 'Gönderi', sub: '4:5', icon: '▦' },
    { id: 'story' as const, label: 'Hikaye', sub: '9:16', icon: '▨' },
    { id: 'reel' as const,  label: 'Reel',  sub: '9:16', icon: '▶' },
  ];

  return (
    <div style={{ marginBottom: 16, borderRadius: 18, overflow: 'hidden',
      background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div style={{ padding: '13px 16px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8,
          background: 'rgba(157,190,206,0.1)', border: '0.5px solid rgba(157,190,206,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9DBECE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(248,250,252,0.9)' }}>
            Görsel Üret
          </div>
          <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.55)', marginTop: 1 }}>
            Bu içerik için AI ile görsel oluştur
          </div>
        </div>
      </div>

      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
        {MODES.map(m => {
          const isLoading = generating === m.id;
          return (
            <button key={m.id} onClick={() => generate(m.id)}
              disabled={!!generating}
              style={{
                flex: 1, padding: '12px 6px', borderRadius: 14, cursor: generating ? 'default' : 'pointer',
                background: isLoading ? 'rgba(157,190,206,0.12)' : 'rgba(255,255,255,0.04)',
                border: `0.5px solid ${isLoading ? 'rgba(157,190,206,0.35)' : 'rgba(255,255,255,0.1)'}`,
                opacity: generating && !isLoading ? 0.4 : 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                transition: 'all 150ms ease',
              }}>
              {isLoading ? (
                <div style={{ width: 16, height: 16, borderRadius: '50%',
                  border: '2px solid rgba(157,190,206,0.3)', borderTop: '2px solid #9DBECE',
                  animation: 'spinSlow 0.8s linear infinite' }} />
              ) : (
                <span style={{ fontSize: 18, opacity: 0.7 }}>{m.icon}</span>
              )}
              <span style={{ fontSize: 12, fontWeight: 700,
                color: isLoading ? '#9DBECE' : 'rgba(248,250,252,0.8)' }}>{m.label}</span>
              <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)' }}>{m.sub}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: '0 16px 12px', fontSize: 11, color: '#fb7185' }}>⚠ {error}</div>
      )}
    </div>
  );
}

// ─── URL resolver ─────────────────────────────────────────────────────
function fixMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  if (path.startsWith('/api/media') || path.startsWith('/api/generate-')) return path;
  if (path.startsWith('/api/')) return '/api/nexus-backend/' + path.slice(5);
  return path;
}

// ─── Feedback chips ───────────────────────────────────────────────────
const CHIPS = [
  { id: 'luxury',   label: 'Daha Lüks'    },
  { id: 'dynamic',  label: 'Daha Dinamik' },
  { id: 'simpler',  label: 'Daha Sade'    },
  { id: 'cta',      label: 'Güçlü CTA'   },
  { id: 'text',     label: 'Metin Azalt'  },
  { id: 'image',    label: 'Renk Değiştir'},
  { id: 'template', label: 'Şablon Değiştir'},
];

// Revision scope — narrows what AI rewrites. "all" preserves existing behaviour.
type RevisionScope = 'all' | 'caption' | 'image';
type RevisionInput = RevisionScope | { scope: RevisionScope; note?: string; chips?: string[] };

const QUICK_REVISION_CHIPS: { id: string; label: string; scope: RevisionScope; note: string }[] = [
  { id: 'headline', label: 'Başlığı değiştir', scope: 'caption', note: 'Başlığı daha kısa ve net yap' },
  { id: 'photo', label: 'Farklı fotoğraf', scope: 'image', note: 'Galeriden konuya daha uygun fotoğraf seç' },
  { id: 'shorter', label: 'Daha kısa caption', scope: 'caption', note: 'Caption en fazla 2 cümle olsun' },
  { id: 'cta-strong', label: 'CTA güçlendir', scope: 'caption', note: 'Harekete geçirici CTA ekle' },
  { id: 'design', label: 'Renk / tasarım', scope: 'all', note: 'Marka renklerine daha sadık tasarım' },
];

/** "Content Agent: Content Calendar" → daha okunaklı başlık hiyerarşisi */
function splitArtifactTitle(raw: string): { agentLine: string; taskLine: string | null } {
  const t = raw.trim();
  const idx = t.indexOf(':');
  if (idx > 0 && idx < t.length - 1) {
    const a = t.slice(0, idx).trim();
    const b = t.slice(idx + 1).trim();
    if (a && b) return { agentLine: a, taskLine: b };
  }
  return { agentLine: t, taskLine: null };
}

// ─── Human-readable type label ────────────────────────────────────────
function getTypeLabel(signal: ReturnType<typeof signalFromArtifact>): string {
  const k = signal.kind;
  const map: Record<string, string> = {
    instagram_post:    'Instagram Gönderisi',
    instagram_story:   'Instagram Hikayesi',
    instagram_reel:    'Instagram Reels',
    instagram_plan:    'İçerik Planı',
    ad_campaign:       'Reklam Kampanyası',
    ad_creative:       'Reklam Görseli',
    review_reply:      'Yorum Yanıtı',
    review_analysis:   'Yorum Analizi',
    analytics_report:  'Analitik Raporu',
    budget_optimization:'Bütçe Optimizasyonu',
    strategy:          'Strateji',
    generic:           'İçerik',
  };
  return map[k] ?? 'İçerik';
}

// ─── Success screen — auto-navigates back after 2s ────────────────────
function SuccessScreen({ decided, onBack }: { decided: 'approved' | 'rejected' | 'revision'; onBack: () => void }) {
  const [countdown, setCountdown] = useState(2);

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    const nav = setTimeout(onBack, 2000);
    return () => { clearInterval(t); clearTimeout(nav); };
  }, [onBack]);

  const isRevision = decided === 'rejected';

  return (
    <div style={{ height: '100dvh', background: '#07090F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%', marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: decided === 'approved' ? 'rgba(52,211,153,0.1)' : decided === 'revision' ? 'rgba(157,190,206,0.1)' : 'rgba(251,113,133,0.08)',
        border: `1px solid ${decided === 'approved' ? 'rgba(52,211,153,0.25)' : decided === 'revision' ? 'rgba(157,190,206,0.25)' : 'rgba(251,113,133,0.2)'}`,
      }}>
        <span style={{ fontSize: 32, color: decided === 'approved' ? '#34d399' : decided === 'revision' ? '#9DBECE' : '#fb7185' }}>
          {decided === 'approved' ? '✓' : decided === 'revision' ? '↺' : '×'}
        </span>
      </div>

      <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginBottom: 8, letterSpacing: '-0.02em' }}>
        {decided === 'approved' ? 'Onaylandı ✓' : decided === 'revision' ? 'Revizyon Kuyruğa Alındı' : 'Reddedildi'}
      </div>

      <div style={{ fontSize: 14, color: 'rgba(148,163,184,0.65)', textAlign: 'center', lineHeight: 1.7, marginBottom: 32, maxWidth: 280 }}>
        {decided === 'approved'
          ? 'İçerik yayın kuyruğuna alındı.'
          : decided === 'revision'
            ? 'Notlarınız kaydedildi. AI ekibiniz güncelliyor — yaklaşık 10 dakika içinde yeni versiyon İçerik sekmesinde görünür.'
            : 'İçerik reddedildi ve arşivlendi.'}
      </div>

      {/* Auto-navigate countdown */}
      <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.3)', marginBottom: 20 }}>
        {countdown > 0 ? `${countdown} saniye içinde geri dönülüyor…` : 'Yönlendiriliyor…'}
      </div>

      <button onClick={onBack} style={{
        padding: '11px 28px', borderRadius: 30, cursor: 'pointer',
        background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.55)', fontSize: 13,
      }}>
        Şimdi Geri Dön
      </button>
    </div>
  );
}

// ─── Text / ideation content card ─────────────────────────────────────
function ContentCard({ signal, artifact, t }: {
  signal: ReturnType<typeof signalFromArtifact>;
  artifact: any;
  t: T;
}) {
  const parsed = parseAgentSummary(
    (artifact as any)?.agentType ?? '',
    artifact?.content ?? '',
  );

  const ideas = signal.ideas ?? [];
  const caption = signal.caption ?? signal.summary ?? '';

  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden',
      background: 'rgba(255,255,255,0.04)',
      border: '0.5px solid rgba(255,255,255,0.08)',
    }}>
      {/* Header strip */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#9DBECE', boxShadow: '0 0 8px rgba(157,190,206,0.6)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9DBECE', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          {getTypeLabel(signal)}
        </span>
        {ideas.length > 1 && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(157,190,206,0.12)', color: '#9DBECE', fontWeight: 600, marginLeft: 4 }}>
            {ideas.length} fikir
          </span>
        )}
      </div>

      {/* Summary */}
      {(parsed.summary || caption) && (
        <div style={{ padding: '14px 16px', borderBottom: ideas.length > 0 ? '0.5px solid rgba(255,255,255,0.06)' : 'none' }}>
          <p style={{ fontSize: 14, color: 'rgba(226,232,240,0.75)', lineHeight: 1.65, margin: 0 }}>
            {parsed.summary ?? caption}
          </p>
        </div>
      )}

      {/* Ideas / design cards */}
      {parsed.items.slice(0, 12).map((item, i) => (
        <div key={i} style={{ padding: '13px 16px', borderTop: i === 0 && !(parsed.summary || caption) ? 'none' : '0.5px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.5)', flexShrink: 0, marginTop: 1 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: item.body ? 5 : 0, lineHeight: 1.3 }}>
                {item.title}
              </div>
              {item.body && (
                <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.6)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.body}
                </div>
              )}
              {item.tags && item.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                  {item.tags.slice(0, 3).map((tag, ti) => (
                    <span key={ti} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.5)' }}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────
export function ApprovalFeedback() {
  const { t } = useTheme();
  const { goBack, selectedArtifactId } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();

  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [decided, setDecided] = useState<'approved' | 'rejected' | 'revision' | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showBoostSheet, setShowBoostSheet] = useState(false);
  const [showScheduleSheet, setShowScheduleSheet] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // Instagram connection status
  const { data: metaStatus } = useQuery({
    queryKey: ['meta-status-mobile', tenantId],
    queryFn: async () => {
      if (!tenantId) return { connected: false };
      const res = await fetch(`/api/meta/analytics?workspaceId=${encodeURIComponent(tenantId)}`).catch(() => null);
      if (!res?.ok) return { connected: false };
      return res.json() as Promise<{ connected: boolean; ig_username?: string }>;
    },
    enabled: Boolean(tenantId),
    staleTime: 5 * 60_000,
  });
  const igConnected = Boolean(metaStatus?.connected);

  const { data: artifact, isLoading } = useQuery({
    queryKey: ['artifact', selectedArtifactId],
    queryFn: async () => {
      if (!selectedArtifactId) return null;
      try { return await apiClient.getArtifact(selectedArtifactId); } catch { return null; }
    },
    enabled: !!selectedArtifactId,
    staleTime: 30_000,
  });

  // Scheduled posts — used to find existing schedule for this artifact + cancel
  const { data: scheduledPosts = [] } = useQuery({
    queryKey: ['scheduled-posts', tenantId],
    queryFn: () => apiClient.getScheduledPosts(tenantId),
    staleTime: 30_000,
    enabled: Boolean(tenantId),
  });
  const scheduledForThis = artifact ? findScheduledForArtifact(artifact, scheduledPosts) : null;

  const cancelScheduleMutation = useMutation({
    mutationFn: () => scheduledForThis
      ? apiClient.cancelScheduledPost(tenantId, scheduledForThis.id)
      : Promise.resolve(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduled-posts', tenantId] }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (artifact) await apiClient.approveArtifact(artifact.id, note || 'Approved from mobile');
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['artifacts'] }); setDecided('approved'); },
    onError: () => setDecided('approved'),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const fb = [note, ...selectedChips].filter(Boolean).join(', ') || 'Rejected from mobile';
      if (artifact) await apiClient.rejectArtifact(artifact.id, fb);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['artifacts'] }); setDecided('rejected'); },
    onError: () => setDecided('rejected'),
  });

  const revisionMutation = useMutation({
    mutationFn: async (input: RevisionInput = 'all') => {
      if (!artifact) return;
      const scope = typeof input === 'string' ? input : input.scope;
      const extraNote = typeof input === 'string' ? undefined : input.note;
      const extraChips = typeof input === 'string' ? undefined : input.chips;
      const scopePrefix = scope === 'caption'
        ? '[REVISE_CAPTION_ONLY] '
        : scope === 'image'
          ? '[REVISE_IMAGE_ONLY] '
          : '';
      const fb = scopePrefix + ([note, extraNote, ...selectedChips, ...(extraChips ?? [])].filter(Boolean).join(', ') || 'Revision requested');
      await apiClient.requestRevision(artifact.id, fb);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['artifacts'] }); setDecided('revision'); },
    onError: () => setDecided('revision'),
  });

  // Save draft — mark as draft without sending to AI revision queue
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!artifact) return;
      // Use existing approve endpoint with a "draft" marker in the comment field.
      // Backend artifactService preserves the comment; visible in detail view.
      await apiClient.approveArtifact(artifact.id, `[DRAFT] ${note || 'Saved as draft from mobile'}`);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['artifacts'] }); setDecided('approved'); },
    onError: () => setDecided('approved'),
  });

  // Publish to Instagram — extracts caption/hashtags from artifact metadata
  const publishMutation = useMutation({
    mutationFn: async (opts: { approveFirst?: boolean } = {}) => {
      if (!artifact) throw new Error('Artifact bulunamadı');
      const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
      const resolved = (() => { try { return resolveArtifact(artifact); } catch { return null; } })();
      const sig = resolved ? signalFromArtifact(artifact) : null;

      // Parse artifact.content JSON for additional fallback sources
      const contentJson: Record<string, unknown> = parseArtifactContent(artifact.content);

      // Multi-source caption — content JSON → metadata → signal → summary (in priority order)
      const caption =
        (contentJson.caption as string) ||
        (meta.caption as string) ||
        sig?.caption ||
        (contentJson.summary as string) ||
        sig?.summary ||
        '';

      // Multi-source hashtags
      const hashtags: string[] = (
        (Array.isArray(contentJson.hashtags) && contentJson.hashtags.length ? contentJson.hashtags as string[] : null) ||
        (Array.isArray(meta.hashtags) && (meta.hashtags as string[]).length ? meta.hashtags as string[] : null) ||
        (sig?.hashtags?.length ? sig.hashtags : null) ||
        []
      );

      // CTA — append to caption if present
      const cta = (contentJson.cta as string) || (meta.cta as string) || '';

      // Build full caption: main caption + hashtags (+ CTA if not already in caption)
      const fullCaption = [
        caption,
        cta && !caption.includes(cta) ? cta : '',
        hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' '),
      ].filter(Boolean).join('\n\n');

      const imageUrl =
        (contentJson.imageUrl as string) ||
        (meta.imageUrl as string) ||
        artifact.contentUrl ||
        resolved?.imageUrl || '';
      const videoUrl = resolved?.videoUrl || '';
      const kind = (contentJson.kind as string) || (meta.kind as string) || sig?.kind || 'instagram_post';

      if (!imageUrl && !videoUrl) throw new Error('Yayınlanacak görsel veya video bulunamadı');

      // Approve first if needed
      if (opts.approveFirst && artifact.status === 'pending_review') {
        await apiClient.approveArtifact(artifact.id, 'Approved and published from mobile');
      }

      const publishType = kind.includes('reel') ? 'reel'
        : kind.includes('story') ? (videoUrl ? 'story_video' : 'story_image')
        : 'feed_image';

      const res = await fetch('/api/meta/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: undefined, // uses session tenant
          publish_type: publishType,
          image_url: imageUrl || undefined,
          video_url: videoUrl || undefined,
          caption: fullCaption,
          hashtags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Yayınlama başarısız (${res.status})`);
      return data as { permalink?: string; post_id?: string };
    },
    onSuccess: (data, vars) => {
      setPublishedUrl(data.permalink ?? null);
      setPublishError(null);
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      if (vars?.approveFirst) setDecided('approved');
    },
    onError: (err: Error) => setPublishError(err.message.slice(0, 100)),
  });

  const toggleChip = (id: string) =>
    setSelectedChips(s => s.includes(id) ? s.filter(c => c !== id) : [...s, id]);

  if (decided) return <SuccessScreen decided={decided} onBack={goBack} />;

  if (isLoading || !artifact) {
    return (
      <div style={{ height: '100dvh', background: '#07090F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(157,190,206,0.2)', borderTop: '2px solid #9DBECE', animation: 'spinSlow 1.2s linear infinite' }} />
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>Yükleniyor</div>
      </div>
    );
  }

  const signal = signalFromArtifact(artifact);
  const resolvedForIdeas = (() => { try { return resolveArtifact(artifact); } catch { return null; } })();
  const mergedSignal = mergeMobilePlanSignal(signal, resolvedForIdeas);
  const isPending  = artifact.status === 'pending_review';

  return (
    <div style={{
      position: 'relative',
      height: '100dvh', background: '#07090F',
      display: 'flex', flexDirection: 'column',
      overflowX: 'hidden',  // only clip horizontal overflow, not vertical scroll
      fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
    }}>

      {/* ── Transparent floating back button — no background, no badge ── */}
      <div style={{
        position: 'absolute', top: 'calc(env(safe-area-inset-top,0px) + 14px)', left: 16,
        zIndex: 40,
      }}>
        <button type="button" onClick={goBack} aria-label="Geri" style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'transparent',
          border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}>
            <path d="M19 12H5M10 6l-5 6 5 6"/>
          </svg>
        </button>
      </div>

      {/* ── SCROLLABLE BODY — starts from very top, back button overlaid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0', paddingBottom: 130 }}>

        {/* ── INSTAGRAM-NATIVE PREVIEW ──────────────────────────────────────
            MobileArtifactView routes to the correct component based on kind:
            • instagram_story  → IgStoryReel (9:16, story chrome, immersive)
            • instagram_reel   → IgStoryReel (9:16, reel chrome with ▶, immersive)
            • instagram_post   → IgPost (square/4:5 with native IG chrome)
            • instagram_plan   → ContentPlanView (swipeable content cards)
            • text / report    → TextReportView
            ──────────────────────────────────────────────────────────────── */}
        <div style={{
          marginBottom: 0,
          // Edge-to-edge for story/reel/post immersive view
          width: '100%',
        }}>
          <MobileArtifactView
            artifact={artifact}
            immersiveVisual
            signal={mergedSignal}
          />
        </div>

        <div style={{ padding: '16px 16px 0' }}>

        {/* ── GÖRSEL ÜRETİM — sadece görselsiz içerik tiplerine göster ── */}
        {isPending && (() => {
          const contentJson = parseArtifactContent(artifact.content);
          const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
          const hasImage = !!(
            (contentJson.imageUrl as string) ||
            (meta.imageUrl as string) ||
            artifact.contentUrl?.match(/\.(jpg|jpeg|png|webp|gif)/i)
          );
          if (hasImage) return null;

          const cap = mergedSignal.caption || mergedSignal.summary || '';
          const idea = mergedSignal.ideas?.[0];
          const title = (idea as any)?.title || artifact.title || '';

          return (
            <ImageGenPanel
              artifactId={artifact.id}
              caption={cap}
              title={title}
              queryClient={queryClient}
            />
          );
        })()}

        {/* ── CONTENT DETAILS ─────────────────────────────────────────────── */}
        {(() => {
          const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
          const sig = mergedSignal;
          const cap = (sig.caption ?? sig.summary ?? meta.caption as string ?? '').toString();
          const tags = ((sig.hashtags ?? meta.hashtags ?? []) as string[]).slice(0, 15);
          const ctaTxt = (sig.cta ?? meta.cta as string ?? '').toString();
          const head = (sig.summary ?? meta.headline as string ?? '').toString();
          const missionBrief = (meta.mission_brief as string ?? '').toString();

          if (!cap && !tags.length && !ctaTxt && !head && !missionBrief) return null;
          return (
            <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 16,
              background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)' }}>
              {head && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(157,190,206,0.6)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Başlık</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(248,250,252,0.9)', margin: 0, lineHeight: 1.4 }}>
                    {head.slice(0, 100)}
                  </p>
                </div>
              )}
              {cap && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(157,190,206,0.6)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Caption</p>
                  <p style={{ fontSize: 13, color: 'rgba(226,232,240,0.8)', margin: 0, lineHeight: 1.65,
                    whiteSpace: 'pre-wrap' }}>
                    {cap.slice(0, 500)}{cap.length > 500 ? '…' : ''}
                  </p>
                </div>
              )}
              {ctaTxt && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(16,185,129,0.7)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>CTA</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#10B981', margin: 0 }}>{ctaTxt}</p>
                </div>
              )}
              {tags.length > 0 && (
                <div style={{ marginBottom: missionBrief ? 10 : 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(157,190,206,0.6)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Hashtag'ler</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {tags.map((h, i) => (
                      <span key={i} style={{ fontSize: 12, color: '#60A5FA', padding: '2px 8px',
                        borderRadius: 10, background: 'rgba(96,165,250,0.1)',
                        border: '0.5px solid rgba(96,165,250,0.2)' }}>
                        {h.startsWith('#') ? h : `#${h}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {missionBrief && !cap && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.4)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Mission Brief</p>
                  <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', margin: 0, lineHeight: 1.6,
                    fontStyle: 'italic' }}>
                    {missionBrief.slice(0, 200)}{missionBrief.length > 200 ? '…' : ''}
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── QUICK REVISION CHIPS ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Hızlı Revizyon
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {QUICK_REVISION_CHIPS.map(chip => (
              <button
                key={chip.id}
                type="button"
                onClick={() => revisionMutation.mutate({ scope: chip.scope, note: chip.note })}
                disabled={revisionMutation.isPending || !artifact}
                style={{
                  padding: '8px 14px', borderRadius: 30, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: 'rgba(52,211,153,0.08)',
                  border: '0.5px solid rgba(52,211,153,0.22)',
                  color: '#34d399',
                  opacity: revisionMutation.isPending ? 0.5 : 1,
                }}>
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── FEEDBACK CHIPS ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Hızlı Geri Bildirim
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {CHIPS.map(chip => {
              const on = selectedChips.includes(chip.id);
              return (
                <button key={chip.id} onClick={() => toggleChip(chip.id)} style={{
                  padding: '8px 15px', borderRadius: 30, cursor: 'pointer', fontSize: 13, fontWeight: on ? 600 : 400,
                  background: on ? 'rgba(157,190,206,0.14)' : 'rgba(255,255,255,0.05)',
                  border: `0.5px solid ${on ? 'rgba(157,190,206,0.35)' : 'rgba(255,255,255,0.09)'}`,
                  color: on ? '#9DBECE' : 'rgba(148,163,184,0.55)',
                  transition: 'all 140ms ease',
                }}>
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── NOTE (expandable) ── */}
        <button onClick={() => setShowNote(!showNote)} style={{
          width: '100%', padding: '12px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
          background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: note ? '#f8fafc' : 'rgba(148,163,184,0.4)', fontSize: 13,
        }}>
          <span>{note || 'Özel not ekle...'}</span>
          <span style={{ fontSize: 16, color: 'rgba(148,163,184,0.3)', transform: showNote ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>⌄</span>
        </button>

        {showNote && (
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="AI ekibine iletmek istediğiniz not..."
            autoFocus rows={3}
            style={{
              width: '100%', marginTop: 8, padding: '13px 15px', borderRadius: 14,
              resize: 'none', outline: 'none', boxSizing: 'border-box',
              fontSize: 14, lineHeight: 1.55,
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(157,190,206,0.25)',
              color: '#f8fafc',
            }}
          />
        )}
        </div>{/* inner padding div */}
      </div>{/* scrollable body */}

      {/* ── ACTION BAR ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '14px 16px',
        paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
        background: 'linear-gradient(0deg, rgba(5,5,8,0.99) 0%, rgba(5,5,8,0.92) 100%)',
        backdropFilter: 'blur(24px)',
        borderTop: '0.5px solid rgba(255,255,255,0.07)',
      }}>
        {isPending ? (
          /* ── Pending: Approve primary + row of secondary actions ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Published success */}
            {publishedUrl && (
              <a href={publishedUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px', borderRadius: 14, textDecoration: 'none',
                  background: 'rgba(16,185,129,0.12)', border: '0.5px solid rgba(16,185,129,0.3)',
                  color: '#34d399', fontSize: 13, fontWeight: 700 }}>
                ✓ Instagram'da Yayınlandı — Görmek için tıkla
              </a>
            )}
            {publishError && (
              <p style={{ fontSize: 12, color: '#fb7185', textAlign: 'center', margin: 0 }}>⚠ {publishError}</p>
            )}

            {/* Primary — "Onayla ve Yayınla" when IG connected, else just "Onayla" */}
            {igConnected ? (
              <button
                type="button"
                onClick={() => publishMutation.mutate({ approveFirst: true })}
                disabled={publishMutation.isPending || !artifact}
                style={{
                  width: '100%', padding: '15px', borderRadius: 18, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #E1306C 0%, #833AB4 50%, #405DE6 100%)',
                  border: 'none', color: '#fff', fontSize: 15, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 24px rgba(225,48,108,0.35)',
                  opacity: publishMutation.isPending ? 0.75 : 1,
                }}>
                {publishMutation.isPending
                  ? <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} />Instagram'a Yayınlanıyor…</>
                  : <>📸 Onayla &amp; Instagram'a Yayınla</>}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending || !artifact}
                style={{
                  width: '100%', padding: '15px', borderRadius: 18, cursor: 'pointer',
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.9) 0%, rgba(5,150,105,0.85) 100%)',
                  border: '0.5px solid rgba(52,211,153,0.4)',
                  color: '#fff', fontSize: 16, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 24px rgba(16,185,129,0.3)',
                  opacity: approveMutation.isPending ? 0.7 : 1,
                }}>
                {approveMutation.isPending
                  ? <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} />Onaylanıyor...</>
                  : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Onayla & Yayın Kuyruğuna Al</>}
              </button>
            )}

            {/* Approve without publish when IG connected */}
            {igConnected && (
              <button
                type="button"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                style={{
                  width: '100%', padding: '11px', borderRadius: 14, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Sadece Onayla (Yayınlama)
              </button>
            )}

            {/* Revision scope chips — quick narrow re-generate */}
            {!revisionMutation.isPending && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <button type="button"
                  onClick={() => revisionMutation.mutate('caption')}
                  disabled={!artifact}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    color: 'rgba(157,190,206,0.85)', fontSize: 11, fontWeight: 600 }}>
                  ✎ Sadece Caption
                </button>
                <button type="button"
                  onClick={() => revisionMutation.mutate('image')}
                  disabled={!artifact}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    color: 'rgba(157,190,206,0.85)', fontSize: 11, fontWeight: 600 }}>
                  🖼 Sadece Görsel
                </button>
                <button type="button"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending || !artifact}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    color: 'rgba(148,163,184,0.85)', fontSize: 11, fontWeight: 600 }}>
                  {saveDraftMutation.isPending ? '...' : '💾 Taslak'}
                </button>
              </div>
            )}

            {/* Secondary row: Regenerate + Reject */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => revisionMutation.mutate('all')}
                disabled={revisionMutation.isPending || !artifact}
                style={{
                  flex: 1, padding: '13px 14px', borderRadius: 16, cursor: 'pointer',
                  background: 'rgba(157,190,206,0.10)', border: '0.5px solid rgba(157,190,206,0.25)',
                  color: '#9DBECE', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: revisionMutation.isPending ? 0.6 : 1,
                }}>
                {revisionMutation.isPending ? (
                  <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(157,190,206,0.3)', borderTop: '2px solid #9DBECE', animation: 'spinSlow 0.8s linear infinite' }} />
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.68"/></svg>
                )}
                {revisionMutation.isPending ? 'Üretiliyor...' : selectedChips.length > 0 ? `Tümünü Yeniden Üret (${selectedChips.length} not)` : 'Tümünü Yeniden Üret'}
              </button>

              <button
                type="button"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || !artifact}
                style={{
                  padding: '13px 18px', borderRadius: 16, cursor: 'pointer', flexShrink: 0,
                  background: 'rgba(251,113,133,0.08)', border: '0.5px solid rgba(251,113,133,0.2)',
                  color: '#fb7185', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Reddet
              </button>
            </div>
          </div>
        ) : (<>
          {/* ── Already approved ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {publishedUrl && (
              <a href={publishedUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px', borderRadius: 14, textDecoration: 'none',
                  background: 'rgba(16,185,129,0.12)', border: '0.5px solid rgba(16,185,129,0.3)',
                  color: '#34d399', fontSize: 13, fontWeight: 700 }}>
                ✓ Instagram'da Yayınlandı — Görmek için tıkla
              </a>
            )}
            {publishError && (
              <p style={{ fontSize: 12, color: '#fb7185', textAlign: 'center', margin: 0 }}>⚠ {publishError}</p>
            )}
            {igConnected && !publishedUrl && (
              <button
                type="button"
                onClick={() => publishMutation.mutate({})}
                disabled={publishMutation.isPending}
                style={{
                  width: '100%', padding: '14px', borderRadius: 16, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #E1306C 0%, #833AB4 50%, #405DE6 100%)',
                  border: 'none', color: '#fff', fontSize: 14, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 20px rgba(225,48,108,0.3)',
                  opacity: publishMutation.isPending ? 0.75 : 1,
                }}>
                {publishMutation.isPending
                  ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} />Yayınlanıyor…</>
                  : <>📸 Instagram'a Yayınla</>}
              </button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 14px', borderRadius: 14,
              background: 'rgba(16,185,129,0.07)', border: '0.5px solid rgba(16,185,129,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>Onaylandı</span>
            </div>
            <button
              type="button"
              onClick={() => revisionMutation.mutate('all')}
              disabled={revisionMutation.isPending || !artifact}
              style={{
                flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
                color: 'rgba(226,232,240,0.7)', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.68"/></svg>
              Yeniden Üret
            </button>
          </div>{/* end flex row */}

            {/* Zamanlanmış banner — eğer bu artifact için scheduled post varsa */}
            {scheduledForThis && (
              <div style={{ padding: '12px 14px', borderRadius: 14,
                background: 'rgba(96,165,250,0.10)',
                border: '0.5px solid rgba(96,165,250,0.3)',
                display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>🕐</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    Zamanlandı
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(248,250,252,0.9)' }}>
                    {(() => {
                      try {
                        return new Date(scheduledForThis.scheduled_at).toLocaleString('tr-TR', {
                          weekday: 'short', day: 'numeric', month: 'long',
                          hour: '2-digit', minute: '2-digit',
                        });
                      } catch { return scheduledForThis.scheduled_at; }
                    })()}
                  </div>
                </div>
                <button onClick={() => cancelScheduleMutation.mutate()}
                  disabled={cancelScheduleMutation.isPending}
                  style={{ padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)',
                    color: '#F87171', fontSize: 11, fontWeight: 700 }}>
                  {cancelScheduleMutation.isPending ? '...' : 'İptal'}
                </button>
              </div>
            )}

            {/* Schedule + Reklam Ver — yan yana iki secondary aksiyon */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowScheduleSheet(true)}
                style={{
                  flex: 1, padding: '13px', borderRadius: 14, cursor: 'pointer',
                  background: 'rgba(96,165,250,0.08)',
                  border: '0.5px solid rgba(96,165,250,0.3)',
                  color: '#60A5FA', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                🕐 Zamanla
              </button>
              <button
                type="button"
                onClick={() => setShowBoostSheet(true)}
                style={{
                  flex: 1, padding: '13px', borderRadius: 14, cursor: 'pointer',
                  background: 'rgba(245,158,11,0.08)',
                  border: '0.5px solid rgba(245,158,11,0.3)',
                  color: '#F59E0B', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                📣 Tanıt
              </button>
            </div>
          </div>{/* end approved flex col */}

          {showBoostSheet && artifact && (
            <BoostPostSheet
              artifactId={artifact.id}
              igMediaId={(artifact.metadata as any)?.ig_media_id ?? (artifact.metadata as any)?.post_id}
              caption={(() => {
                const c = (parseArtifactContent(artifact.content).caption as string) ?? '';
                return c || (artifact.metadata as any)?.caption || '';
              })()}
              imageUrl={(() => {
                const parsed = parseArtifactContent(artifact.content);
                return (parsed.imageUrl as string) || ((artifact.metadata as any)?.imageUrl as string) || artifact.contentUrl || '';
              })()}
              isOpen={showBoostSheet}
              onClose={() => setShowBoostSheet(false)}
            />
          )}

          {showScheduleSheet && artifact && (() => {
            const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
            const cj = parseArtifactContent(artifact.content);
            const contentType = String(meta.contentType ?? cj.contentType ?? '').toLowerCase();
            const publishType: 'feed' | 'reel' | 'story' =
              contentType.includes('reel') ? 'reel'
              : contentType.includes('story') ? 'story'
              : 'feed';
            const imageUrl = (cj.imageUrl as string) || (meta.imageUrl as string) || artifact.contentUrl || undefined;
            const videoUrl = (cj.videoUrl as string) || (meta.videoUrl as string) || undefined;
            const cap = (cj.caption as string) || (meta.caption as string) || '';
            const hashtags = Array.isArray(meta.hashtags) ? meta.hashtags as string[]
                           : Array.isArray(cj.hashtags) ? cj.hashtags as string[]
                           : [];
            return (
              <ScheduleSheet
                isOpen={showScheduleSheet}
                onClose={() => setShowScheduleSheet(false)}
                publishType={publishType}
                imageUrl={imageUrl}
                videoUrl={videoUrl}
                caption={cap}
                hashtags={hashtags}
                artifactTitle={artifact.title}
              />
            );
          })()}
        </>)}
      </div>
    </div>
  );
}
