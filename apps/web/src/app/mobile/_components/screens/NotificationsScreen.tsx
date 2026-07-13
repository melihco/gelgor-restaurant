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

type NType = 'approval' | 'alert' | 'complete' | 'review' | 'system';

const TYPE_CFG: Record<string, { icon: string; color: string }> = {
  artifact_ready:         { icon: '✦', color: '#9DBECE' },
  action_pending:         { icon: '◎', color: '#f59e0b' },
  agent_blocked:          { icon: '⚑', color: '#fb7185' },
  agent_completed:        { icon: '✓', color: '#34d399' },
  execution_failed:       { icon: '▲', color: '#fb7185' },
  review_needed:          { icon: '★', color: '#f59e0b' },
  default:                { icon: '●', color: '#60a5fa' },
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
              borderRadius: 12,
              border: 'none',
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
        <p style={{ fontSize: 12, color: t.warning, fontWeight: 500, margin: 0, padding: '8px 24px 0' }}>
          {unread} okunmamış
        </p>
      )}

      <div style={{ padding: '12px 24px 0' }}>
        {isLoading ? (
          <div style={{ ...t.surfaceGroup, padding: '32px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Yükleniyor...</div>
        ) : items.length === 0 ? (
          <div style={{ ...t.surfaceGroup, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔔</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>Bildirim yok</div>
            <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, margin: '0 0 20px' }}>
              Onay bekleyen içerikler, yeni yorumlar ve üretim tamamlama bildirimleri burada görünür.
            </p>
            <button
              type="button"
              onClick={() => navigate('feed')}
              style={{
                padding: '11px 20px', borderRadius: 24, border: 'none', cursor: 'pointer',
                background: t.accent, color: '#fff', fontSize: 13, fontWeight: 700,
              }}
            >
              İçeriklere Git
            </button>
          </div>
        ) : (
          <>
            {grouped.unread.length > 0 && (
              <>
                <SLabel t={t} text="Yeni" />
                <div style={{ ...t.surfaceGroup, marginBottom: 16 }}>
                  {grouped.unread.map((n: any, i: number, arr: any[]) => (
                    <NotifRow key={n.id} n={n} t={t} isLast={i === arr.length - 1} onTap={() => handleTap(n)} />
                  ))}
                </div>
              </>
            )}
            {grouped.read.length > 0 && (
              <>
                <SLabel t={t} text="Önceki" />
                <div style={{ ...t.surfaceGroup }}>
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
    <button onClick={onTap} style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '15px 18px', width: '100%', textAlign: 'left', cursor: 'pointer',
      background: n.read ? 'transparent' : (t.isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.008)'),
      ...(!isLast ? t.surfaceRow : {}), position: 'relative',
    }}>
      {!n.read && <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 5, height: 5, borderRadius: '50%', background: t.accent }} />}
      <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: `${cfg.color}12`, border: `0.5px solid ${cfg.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: cfg.color, fontWeight: 600 }}>
        {cfg.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: t.textPrimary }}>{n.title}</span>
          <span style={{ fontSize: 10, color: t.textMuted, flexShrink: 0 }}>{timeAgo(n.createdAt)}</span>
        </div>
        <p style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.45, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {n.message}
        </p>
      </div>
    </button>
  );
}

function SLabel({ t, text }: { t: T; text: string }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>{text}</div>;
}
