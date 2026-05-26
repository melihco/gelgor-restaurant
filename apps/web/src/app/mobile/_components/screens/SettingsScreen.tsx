'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { IcoBack } from '../Icons';
import { apiClient } from '@/lib/api-client';
import type { T } from '../theme-context';

// ── Helpers ───────────────────────────────────────────────────────────────────
function SLabel({ t, text }: { t: T; text: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor,
      letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
      {text}
    </div>
  );
}

function Divider({ t }: { t: T }) {
  return <div style={{ height: '0.5px', background: t.separator, margin: '0 18px' }} />;
}

function timeUntil(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return 'Süresi dolmuş';
  const days = Math.floor(diff / 86_400_000);
  if (days > 7)  return `${days} gün kaldı`;
  if (days > 1)  return `${days} gün kaldı`;
  if (days === 1) return 'Yarın doluyor';
  const hrs = Math.floor(diff / 3_600_000);
  return hrs > 0 ? `${hrs} saat kaldı` : 'Bugün doluyor';
}

// ── Meta Connection Card ──────────────────────────────────────────────────────
function MetaConnectionCard({ t, tenantId }: { t: T; tenantId: string }) {
  const queryClient = useQueryClient();
  const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Detect OAuth return params (meta_connected / meta_error)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('meta_connected');
    const error = params.get('meta_error');
    if (connected === '1') {
      const username = params.get('ig_username');
      setToastMsg({ text: `Instagram bağlandı${username ? `: @${username}` : ''}`, ok: true });
      queryClient.invalidateQueries({ queryKey: ['meta-status', tenantId] });
      // Clean URL
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
      setTimeout(() => setToastMsg(null), 4000);
    } else if (error) {
      const msg = error === 'access_denied' ? 'Bağlantı iptal edildi'
        : error === 'state_mismatch' ? 'Güvenlik hatası, tekrar deneyin'
        : 'Bağlantı başarısız';
      setToastMsg({ text: msg, ok: false });
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setToastMsg(null), 4000);
    }
  }, [tenantId, queryClient]);

  const { data: status, isLoading } = useQuery({
    queryKey: ['meta-status', tenantId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/meta/analytics`);
        if (!res.ok) return null;
        return res.json() as Promise<{
          connected: boolean;
          ig_username?: string;
          followers_count?: number;
          token_expires_at?: string;
          token_valid?: boolean;
          page_name?: string;
        }>;
      } catch { return null; }
    },
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => fetch(`/api/meta/disconnect`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: tenantId }),
    }).then(r => {
      if (!r.ok) throw new Error('Bağlantı kesilemedi');
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-status', tenantId] });
      setToastMsg({ text: 'Instagram bağlantısı kesildi', ok: false });
      setTimeout(() => setToastMsg(null), 3000);
    },
    onError: (e: Error) => setToastMsg({ text: e.message, ok: false }),
  });

  const isConnected = status?.connected ?? false;
  const tokenExpiring = isConnected && status?.token_valid === false;
  const daysLeft = timeUntil(status?.token_expires_at);

  function handleConnect() {
    const url = `/api/meta/oauth/login?workspaceId=${encodeURIComponent(tenantId)}`;
    window.location.href = url;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Toast */}
      {toastMsg && (
        <div style={{ margin: '0 0 12px', padding: '12px 16px', borderRadius: 14,
          background: toastMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.09)',
          border: `0.5px solid ${toastMsg.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>{toastMsg.ok ? '✓' : '⚠'}</span>
          <span style={{ fontSize: 13, fontWeight: 600,
            color: toastMsg.ok ? '#10B981' : '#F87171' }}>{toastMsg.text}</span>
        </div>
      )}

      <SLabel t={t} text="Meta & Instagram" />

      <div style={{ borderRadius: 20, overflow: 'hidden', background: t.isDark ? 'rgba(255,255,255,0.03)' : '#fff',
        border: `0.5px solid ${t.separator}` }}>

        {/* Main row */}
        <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Instagram icon */}
          <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: isConnected ? 'rgba(244,114,182,0.1)' : (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
            border: `0.5px solid ${isConnected ? 'rgba(244,114,182,0.3)' : t.separator}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24"
              fill={isConnected ? '#f472b6' : t.textMuted}>
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary,
              letterSpacing: '-0.01em' }}>Instagram</div>
            {isLoading ? (
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Kontrol ediliyor…</div>
            ) : isConnected ? (
              <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {status?.ig_username ? `@${status.ig_username}` : ''}
                {status?.followers_count ? ` · ${(status.followers_count / 1000).toFixed(1)}K takipçi` : ''}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Bağlı değil</div>
            )}
          </div>

          {/* Status + action */}
          {isLoading ? (
            <div style={{ width: 20, height: 20, borderRadius: '50%',
              border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.accent}`,
              animation: 'spinSlow 1s linear infinite', flexShrink: 0 }} />
          ) : isConnected ? (
            <span style={{ fontSize: 10, padding: '4px 10px', borderRadius: 20, flexShrink: 0,
              background: 'rgba(16,185,129,0.1)', color: '#10B981', fontWeight: 700 }}>
              Bağlı
            </span>
          ) : (
            <button onClick={handleConnect}
              style={{ fontSize: 13, padding: '9px 18px', borderRadius: 14, cursor: 'pointer',
                background: 'linear-gradient(135deg,#E1306C,#833AB4)',
                border: 'none', color: '#fff', fontWeight: 700, flexShrink: 0,
                boxShadow: '0 2px 12px rgba(225,48,108,0.35)' }}>
              Bağla
            </button>
          )}
        </div>

        {/* Token expiry warning */}
        {tokenExpiring && (
          <>
            <Divider t={t} />
            <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(245,158,11,0.06)' }}>
              <span style={{ fontSize: 16 }}>⏰</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>
                  Token süresi doluyor
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{daysLeft}</div>
              </div>
              <button onClick={handleConnect}
                style={{ fontSize: 11, padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(245,158,11,0.15)', border: '0.5px solid rgba(245,158,11,0.35)',
                  color: '#F59E0B', fontWeight: 700 }}>
                Yenile
              </button>
            </div>
          </>
        )}

        {/* Connected account details */}
        {isConnected && !tokenExpiring && daysLeft && (
          <>
            <Divider t={t} />
            <div style={{ padding: '10px 18px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: t.textMuted }}>Token geçerlilik</span>
              <span style={{ fontSize: 11, color: t.textTertiary, fontWeight: 500 }}>{daysLeft}</span>
            </div>
          </>
        )}

        {/* Permissions */}
        {isConnected && (
          <>
            <Divider t={t} />
            <div style={{ padding: '12px 18px' }}>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>İzinler</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Yayın', 'Analitik', 'Reklamlar', 'DM'].map(p => (
                  <span key={p} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20,
                    background: 'rgba(16,185,129,0.08)', color: '#10B981',
                    border: '0.5px solid rgba(16,185,129,0.2)', fontWeight: 500 }}>
                    ✓ {p}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Disconnect */}
        {isConnected && (
          <>
            <Divider t={t} />
            <button
              onClick={() => {
                if (window.confirm('Instagram bağlantısını kesmek istediğinizden emin misiniz?')) {
                  disconnectMutation.mutate();
                }
              }}
              disabled={disconnectMutation.isPending}
              style={{ width: '100%', padding: '14px 18px', background: 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10 }}>
              {disconnectMutation.isPending ? (
                <><div style={{ width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.danger}`,
                  animation: 'spinSlow 0.8s linear infinite' }} />
                <span style={{ fontSize: 13, color: t.textMuted }}>Kesiliyor…</span></>
              ) : (
                <><svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke={t.danger} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span style={{ fontSize: 13, color: t.danger, fontWeight: 600 }}>
                  Bağlantıyı Kes
                </span></>
              )}
            </button>
          </>
        )}
      </div>

      {/* Connect info — when not connected */}
      {!isConnected && !isLoading && (
        <div style={{ marginTop: 12, padding: '14px 16px', borderRadius: 14,
          background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          border: `0.5px solid ${t.separator}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textSecondary, marginBottom: 6 }}>
            Instagram bağlandığında:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              '📸 Onaylı içerikler direkt yayınlanır',
              '📊 Erişim, etkileşim ve analitik görünür',
              '📣 İçerikleri reklama dönüştürebilirsiniz',
              '🕐 Otomatik zamanlama aktif olur',
            ].map(item => (
              <div key={item} style={{ fontSize: 12, color: t.textTertiary }}>{item}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function SettingsScreen() {
  const { t } = useTheme();
  const { goBack } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();

  const { data: quotaData } = useQuery({
    queryKey: ['usage-quota'],
    queryFn: async () => { try { return await apiClient.getUsageQuota(); } catch { return null; } },
    staleTime: 60_000,
  });

  const quota = quotaData
    ? [
        { label: 'Ajan Çalışmaları',    used: quotaData.agentRuns?.used ?? 0,       limit: quotaData.agentRuns?.limit ?? 200,  color: '#a78bfa' },
        { label: 'Provider Aksiyonlar', used: quotaData.providerActions?.used ?? 0,  limit: quotaData.providerActions?.limit ?? 50, color: '#60a5fa' },
        { label: 'Token Kullanımı',     used: quotaData.tokens?.used ?? 0,           limit: quotaData.tokens?.limit ?? 2000,    color: '#34d399' },
      ]
    : [
        { label: 'Ajan Çalışmaları',    used: 68,  limit: 200,  color: '#a78bfa' },
        { label: 'Provider Aksiyonlar', used: 14,  limit: 50,   color: '#60a5fa' },
        { label: 'Token Kullanımı',     used: 820, limit: 2000, color: '#34d399' },
      ];

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>

      {/* Header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 20px',
        borderBottom: `0.5px solid ${t.separator}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={goBack} style={{ ...t.backBtn, width: 34, height: 34, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IcoBack color={t.textSecondary} />
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: t.textPrimary,
            letterSpacing: '-0.02em' }}>Entegrasyonlar</h1>
        </div>
      </div>

      <div style={{ padding: '24px 24px 0' }}>

        {/* Meta / Instagram */}
        <MetaConnectionCard t={t} tenantId={tenantId} />

        {/* Diğer entegrasyonlar */}
        <SLabel t={t} text="Diğer Entegrasyonlar" />
        <div style={{ ...t.surfaceGroup, marginBottom: 24 }}>
          {[
            { icon: '🔍', label: 'Google Business', sub: 'Yorum ve konum', coming: false },
            { icon: '📈', label: 'Google Analytics', sub: 'Site trafiği', coming: true },
            { icon: '💰', label: 'Google Ads', sub: 'Reklam yönetimi', coming: false },
          ].map((item, i, arr) => (
            <div key={item.label}>
              {i > 0 && <Divider t={t} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  border: `0.5px solid ${t.separator}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {item.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 1 }}>{item.sub}</div>
                </div>
                {item.coming ? (
                  <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20,
                    background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    color: t.textMuted, fontWeight: 600 }}>Yakında</span>
                ) : (
                  <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20,
                    background: 'rgba(16,185,129,0.08)', color: '#10B981', fontWeight: 600 }}>Bağlı</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Plan Kullanımı */}
        <SLabel t={t} text="Plan Kullanımı" />
        <div style={{ ...t.surfaceCard, padding: '18px', marginBottom: 24 }}>
          {quota.map((q, i) => {
            const pct = Math.min(100, Math.round((q.used / Math.max(q.limit, 1)) * 100));
            const isHigh = pct > 80;
            return (
              <div key={q.label} style={{ marginBottom: i < quota.length - 1 ? 18 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: t.textSecondary }}>{q.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600,
                    color: isHigh ? t.warning : t.textTertiary,
                    fontVariantNumeric: 'tabular-nums' }}>
                    {q.used} / {q.limit}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2,
                  background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2,
                    background: isHigh ? t.warning : q.color, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
