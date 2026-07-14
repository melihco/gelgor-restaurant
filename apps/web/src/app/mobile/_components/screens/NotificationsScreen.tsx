'use client';
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { IcoCheck } from '../Icons';
import { MobileStackHeader } from '../ui-primitives';
import { apiClient } from '@/lib/api-client';
import { isMobileOperatorMode } from '../mobile-client-config';
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';
import { filterFeedPublishableArtifacts } from '@/lib/weekly-publish-package';
import type { T } from '../theme-context';

// Premium stroke icons per type — steel/gold palette, no emoji glyphs
const TYPE_CFG: Record<string, { path: string; color: string }> = {
  artifact_ready:   { path: 'M12 3l2.1 5.4 5.9.5-4.5 3.8 1.4 5.8L12 15.4l-4.9 3.1 1.4-5.8L4 8.9l5.9-.5z', color: '#9DBECE' },
  action_pending:   { path: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3.5 2', color: '#C8A86A' },
  agent_blocked:    { path: 'M4 22V4M4 4h12l-2 4 2 4H4', color: '#D46A6A' },
  agent_completed:  { path: 'M5 13l4 4L19 7', color: '#3CB87A' },
  execution_failed: { path: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01', color: '#D46A6A' },
  review_needed:    { path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', color: '#C8A86A' },
  default:          { path: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0', color: '#6AACCB' },
};

// Mock fallback
const MOCK_NOTIFICATIONS = [
  { id: 'n1', type: 'action_pending', title: 'Onay Bekliyor',        message: 'Summer Gift — 4 story tasarımı onayınızı bekliyor.',         createdAt: new Date(Date.now() - 2*60*1000).toISOString(),  read: false, relatedEntityId: 'a1' },
  { id: 'n2', type: 'review_needed',  title: 'Yeni Olumsuz Yorum',   message: 'Ali Öztürk 1★ yorum yaptı — AI yanıt taslağı hazır.',       createdAt: new Date(Date.now() - 5*60*1000).toISOString(),  read: false, relatedEntityId: 'r5' },
  { id: 'n3', type: 'execution_failed',title: 'Reklam Riski',        message: 'Fıstıklı Lokum Shopping: 72 tıklama, 0 dönüşüm.',          createdAt: new Date(Date.now() - 18*60*1000).toISOString(), read: false, relatedEntityId: null },
  { id: 'n4', type: 'artifact_ready', title: 'Story Seti Tamamlandı',message: 'Design Agent: Bayram koleksiyonu görselleri render edildi.',  createdAt: new Date(Date.now() - 35*60*1000).toISOString(), read: false, relatedEntityId: 'o4' },
  { id: 'n5', type: 'agent_completed',title: 'Rapor Hazır',          message: 'Analytics Agent: Haftalık performans raporu oluşturuldu.',   createdAt: new Date(Date.now() - 60*60*1000).toISOString(),  read: true,  relatedEntityId: 'o6' },
  { id: 'n6', type: 'action_pending', title: 'Reel Onay Bekliyor',   message: 'Antep Fıstıklı reel video onayınızı bekliyor.',              createdAt: new Date(Date.now() - 2*60*60*1000).toISOString(), read: true, relatedEntityId: 'a2' },
  { id: 'n7', type: 'agent_blocked',  title: 'Review Agent Bloke',   message: 'Google Business API bağlantısı zaman aşımına uğradı.',      createdAt: new Date(Date.now() - 3*60*60*1000).toISOString(), read: true, relatedEntityId: null },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Az önce';
  if (m < 60) return `${m} dakika önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export function NotificationsScreen() {
  const { t } = useTheme();
  const { goBack, navigate, openApproval } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();
  const operatorMode = isMobileOperatorMode();

  const { data: rawNotifs = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => { try { return await apiClient.getNotifications(); } catch { return []; } },
    refetchInterval: 30_000,
    staleTime: 15_000,
    refetchIntervalInBackground: false,
  });

  const { data: artifacts = [] } = useMobileArtifacts({
    params: { limit: 40 },
    enabled: Boolean(tenantId),
    subscribeOnly: true,
  });

  const derivedNotifs = useMemo(() => {
    const pending = filterFeedPublishableArtifacts(artifacts)
      .filter((a) => a.status === 'pending_review')
      .slice(0, 8);
    return pending.map((a) => ({
      id: `art-${a.id}`,
      type: 'action_pending',
      title: 'Onay Bekliyor',
      message: (a.title ?? 'İçerik').slice(0, 80),
      createdAt: a.createdAt,
      read: false,
      relatedEntityId: a.id,
    }));
  }, [artifacts]);

  const items = rawNotifs.length > 0
    ? rawNotifs
    : operatorMode
      ? MOCK_NOTIFICATIONS
      : derivedNotifs;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const unread = items.filter((n: any) => !n.read && !String(n.id).startsWith('art-'));
      await Promise.all(unread.map((n: any) => apiClient.markNotificationRead(n.id)));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = items.filter((n: any) => !n.read).length;

  const handleTap = (n: any) => {
    if (!n.read) markReadMutation.mutate(n.id);
    if (n.type?.includes('action') || n.type?.includes('approval') || n.type?.includes('artifact')) {
      if (n.relatedEntityId) openApproval(n.relatedEntityId);
      else navigate('feed');
    } else if (n.type?.includes('review')) {
      navigate('reviews');
    } else if (n.type?.includes('mission')) {
      navigate('missions');
    } else if (n.type?.includes('execution') || n.type?.includes('agent_blocked')) {
      navigate('settings');
    } else {
      navigate('feed');
    }
  };

  const grouped = {
    unread: items.filter((n: any) => !n.read),
    read:   items.filter((n: any) => n.read),
  };

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>
      <MobileStackHeader
        t={t}
        title="Bildirimler"
        onBack={goBack}
        right={unread > 0 ? (
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            aria-label="Tümünü okundu işaretle"
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: `0.5px solid ${t.accentBorder}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: t.accentDim,
            }}
          >
            <IcoCheck size={18} color={t.accent} strokeWidth={2.5} />
          </button>
        ) : undefined}
      />
      {unread > 0 && (
        <div style={{ padding: '12px 24px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: t.accent,
            boxShadow: `0 0 10px ${t.accentGlow}`,
          }} />
          <span className="sa-chrome-eyebrow">{unread} okunmamış bildirim</span>
        </div>
      )}

      <div style={{ padding: '12px 24px 0' }}>
        {isLoading ? (
          <div className="sa-chrome-card" style={{ padding: '32px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
            Yükleniyor…
          </div>
        ) : items.length === 0 ? (
          <div className="sa-chrome-card" style={{ padding: '52px 24px 44px', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: t.accentDim,
              border: `0.5px solid ${t.accentBorder}`,
              boxShadow: `0 0 32px ${t.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                stroke={t.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em', marginBottom: 8 }}>
              Her şey güncel
            </div>
            <p style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.6, margin: '0 auto 22px', maxWidth: 280 }}>
              Onay bekleyen içerikler, yeni yorumlar ve üretim bildirimleri burada görünür.
            </p>
            <button
              type="button"
              onClick={() => navigate('feed')}
              style={{
                padding: '13px 26px', borderRadius: 24, border: 'none', cursor: 'pointer',
                background: t.gradientAccent, color: '#fff', fontSize: 14, fontWeight: 700,
                letterSpacing: '-0.01em',
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 22px ${t.accentGlow}`,
              }}
            >
              İçeriklere Git
            </button>
          </div>
        ) : (
          <>
            {grouped.unread.length > 0 && (
              <>
                <SLabel text="Yeni" />
                <div style={{ ...t.surfaceGroup, marginBottom: 20 }}>
                  {grouped.unread.map((n: any, i: number, arr: any[]) => (
                    <NotifRow key={n.id} n={n} t={t} isLast={i === arr.length - 1} onTap={() => handleTap(n)} />
                  ))}
                </div>
              </>
            )}
            {grouped.read.length > 0 && (
              <>
                <SLabel text="Önceki" />
                <div style={{ ...t.surfaceGroup, opacity: 0.82 }}>
                  {grouped.read.map((n: any, i: number, arr: any[]) => (
                    <NotifRow key={n.id} n={n} t={t} isLast={i === arr.length - 1} onTap={() => handleTap(n)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NotifRow({ n, t, isLast, onTap }: { n: any; t: T; isLast: boolean; onTap: () => void }) {
  const cfg = TYPE_CFG[n.type] ?? TYPE_CFG['default']!;
  return (
    <button onClick={onTap} className="sa-press-row" style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '15px 18px 15px 20px', width: '100%', textAlign: 'left', cursor: 'pointer',
      background: n.read ? 'transparent' : (t.isDark ? 'rgba(157,190,206,0.03)' : 'rgba(30,63,85,0.02)'),
      ...(!isLast ? t.surfaceRow : {}), position: 'relative',
    }}>
      {!n.read && (
        <span style={{
          position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
          width: 5, height: 5, borderRadius: '50%',
          background: t.accent, boxShadow: `0 0 8px ${t.accentGlow}`,
        }} />
      )}
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: `${cfg.color}12`,
        border: `0.5px solid ${cfg.color}26`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke={cfg.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={cfg.path} />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
          <span style={{
            fontSize: 13.5, fontWeight: n.read ? 500 : 700, color: t.textPrimary,
            letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {n.title}
          </span>
          <span style={{ fontSize: 10.5, color: t.textMuted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {timeAgo(n.createdAt)}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: t.textTertiary, lineHeight: 1.5, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {n.message}
        </p>
      </div>
    </button>
  );
}

function SLabel({ text }: { text: string }) {
  return <div className="sa-chrome-eyebrow" style={{ marginBottom: 10 }}>{text}</div>;
}
