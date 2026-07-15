'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  accountDisplayLabel,
  normalizeMertcafeAccountId,
  removeMertcafeSavedAccount,
  type MertcafeSavedAccount,
} from '@/lib/mertcafe-accounts';
import type { T } from './theme-context';
import { isDebugUiMode } from './mobile-client-config';

const IG_GRADIENT = 'linear-gradient(135deg, #F58529 0%, #DD2A7B 50%, #8134AF 100%)';

function InstagramGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="#fff" stroke="none" />
    </svg>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
      boxShadow: `0 0 8px ${color}90`,
    }} />
  );
}

export function MertcafeAccountSwitcher({
  t,
  workspaceId,
  saveThemePatch,
  compact = false,
}: {
  t: T;
  workspaceId: string;
  saveThemePatch?: (patch: Record<string, unknown>) => Promise<void>;
  /** Settings card — tighter layout */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const debugMode = isDebugUiMode();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [existingApiKey, setExistingApiKey] = useState('');
  const [showLinkKeyForm, setShowLinkKeyForm] = useState(false);
  const [showAccountList, setShowAccountList] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [oauthUrlBroken, setOauthUrlBroken] = useState(false);

  const { data: status, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mertcafe-status', workspaceId],
    queryFn: () => apiClient.getMertcafeStatus(workspaceId),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    enabled: Boolean(workspaceId),
  });

  const activeId = normalizeMertcafeAccountId(
    status?.publish_account_id ?? status?.instagram_account_id,
  );
  const oauthId = normalizeMertcafeAccountId(status?.oauth_account_id);
  const savedFromStatus = status?.saved_accounts ?? [];
  const igOk = Boolean(status?.instagram_connected);
  const hasApiKey = Boolean(status?.has_tenant_api_key);
  const tenantReady = Boolean(status?.is_tenant_ready);

  const flash = (text: string, ok = true) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), ok ? 5000 : 4500);
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['mertcafe-status', workspaceId] });
    await queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', workspaceId] });
  };

  const provisionMutation = useMutation({
    mutationFn: (force?: boolean) => apiClient.provisionMertcafeTenant(workspaceId, { force }),
    onSuccess: async (data) => {
      setOauthUrlBroken(false);
      await invalidate();
      const result = data as { message?: string; connect_ready?: boolean };
      flash(
        result.message
          || (result.connect_ready === false
            ? 'Hesap hazırlandı ancak Instagram bağlantısı henüz hazır değil.'
            : 'Hesap hazırlandı. Şimdi Instagram ile bağlanın.'),
        result.connect_ready !== false,
      );
    },
    onError: (e: unknown) => {
      flash(e instanceof Error ? e.message : 'Hesap hazırlanamadı', false);
    },
  });

  const linkKeyMutation = useMutation({
    mutationFn: () => apiClient.linkMertcafeApiKey(workspaceId, existingApiKey.trim()),
    onSuccess: async (data) => {
      setExistingApiKey('');
      setShowLinkKeyForm(false);
      await invalidate();
      flash(data.message || 'Hesabınız bağlandı.');
    },
    onError: (e: unknown) => {
      flash(e instanceof Error ? e.message : 'API anahtarı bağlanamadı', false);
    },
  });

  const syncOAuthMutation = useMutation({
    mutationFn: () => apiClient.syncMertcafeInstagram(workspaceId),
    onSuccess: async (data) => {
      await invalidate();
      const user = data.instagram_username ? `@${data.instagram_username}` : '';
      flash(data.message || `Instagram hesabı eşitlendi ${user}`.trim());
    },
    onError: (e: unknown) => {
      flash(e instanceof Error ? e.message : 'Eşitleme başarısız', false);
    },
  });

  const accounts = useMemo(() => {
    const merged = [...savedFromStatus];
    const seen = new Set(merged.map((a) => a.id));
    if (activeId && !seen.has(activeId)) {
      merged.unshift({ id: activeId, label: 'Aktif' });
      seen.add(activeId);
    }
    if (oauthId && oauthId !== activeId && !seen.has(oauthId)) {
      merged.unshift({ id: oauthId, label: 'OAuth' });
    }
    return merged;
  }, [savedFromStatus, activeId, oauthId]);

  const oauthMismatch = igOk && oauthId && activeId && oauthId !== activeId;

  const switchMutation = useMutation({
    mutationFn: (params: { accountId: string; label?: string }) =>
      apiClient.setMertcafeActiveAccount({
        workspaceId,
        accountId: params.accountId,
        label: params.label,
        remember: true,
      }),
    onSuccess: async (data) => {
      if (saveThemePatch && data.theme) {
        const theme = data.theme as Record<string, unknown>;
        await saveThemePatch({
          mertcafe_instagram_account_id: data.instagram_account_id,
          ...(theme.mertcafe_instagram_accounts != null
            ? { mertcafe_instagram_accounts: theme.mertcafe_instagram_accounts }
            : {}),
        }).catch(() => undefined);
      }
      await invalidate();
      flash(`Yayın hesabı değiştirildi: ${accountDisplayLabel({ id: data.instagram_account_id })}`);
    },
    onError: (e: unknown) => {
      flash(e instanceof Error ? e.message : 'Hesap kaydedilemedi', false);
    },
  });

  const connectMutation = useMutation({
    mutationFn: () => apiClient.getMertcafeInstagramConnectUrl(workspaceId),
    onSuccess: (data) => {
      if (data.auth_url) {
        setOauthUrlBroken(false);
        window.open(data.auth_url, '_blank', 'noopener,noreferrer');
        flash('Instagram girişi açıldı. Bağlantı tamamlanınca bu ekrana dönün.');
      }
    },
    onError: (e: unknown) => {
      setOauthUrlBroken(true);
      flash(e instanceof Error ? e.message : 'Instagram bağlantısı başlatılamadı', false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (accountId: string) => {
      if (!saveThemePatch) {
        throw new Error('Kayıtlı hesap listesi için marka ayarları gerekli');
      }
      const next = removeMertcafeSavedAccount(savedFromStatus, accountId);
      await saveThemePatch({ mertcafe_instagram_accounts: next });
    },
    onSuccess: async () => {
      await invalidate();
      flash('Hesap listeden kaldırıldı');
    },
    onError: (e: unknown) => {
      flash(e instanceof Error ? e.message : 'Silinemedi', false);
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const id = normalizeMertcafeAccountId(newId);
      if (!id) throw new Error('Geçerli bir hesap ID girin');
      return apiClient.setMertcafeActiveAccount({
        workspaceId,
        accountId: id,
        label: newLabel.trim() || undefined,
        remember: true,
      });
    },
    onSuccess: async (data) => {
      setNewId('');
      setNewLabel('');
      setShowAddForm(false);
      if (saveThemePatch && data.theme) {
        await saveThemePatch({
          mertcafe_instagram_account_id: data.instagram_account_id,
        }).catch(() => undefined);
      }
      await invalidate();
      flash('Hesap eklendi ve aktif yapıldı');
    },
    onError: (e: unknown) => {
      flash(e instanceof Error ? e.message : 'Eklenemedi', false);
    },
  });

  // ── Derived presentation state ──────────────────────────────────────────────
  const activeAccount = accounts.find((a) => a.id === activeId);
  const activeLabel = activeAccount ? accountDisplayLabel(activeAccount) : null;
  const otherAccounts = accounts.filter((a) => a.id !== activeId);

  const overall: { color: string; label: string } = isLoading
    ? { color: t.textMuted, label: 'Kontrol ediliyor…' }
    : tenantReady
      ? { color: '#22c55e', label: 'Yayına hazır' }
      : hasApiKey
        ? { color: '#f59e0b', label: 'Hesap seçilmedi' }
        : { color: t.textMuted, label: 'Bağlı değil' };

  return (
    <div style={{ marginBottom: compact ? 24 : 0 }}>
      {message && (
        <div style={{ margin: '0 0 12px', padding: '12px 16px', borderRadius: 14,
          background: message.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.09)',
          border: `0.5px solid ${message.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}` }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: message.ok ? '#10B981' : '#F87171' }}>
            {message.text}
          </span>
        </div>
      )}

      <div className="sa-chrome-card" style={{ overflow: 'hidden', padding: 0, marginBottom: compact ? 0 : 14 }}>

        {/* ── Header: identity + single status ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            background: IG_GRADIENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(221,42,123,0.25)',
          }}>
            <InstagramGlyph />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>
              Instagram
            </div>
            <div style={{
              fontSize: 12, color: t.textTertiary, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {activeLabel ?? 'Otomatik paylaşım için hesabınızı bağlayın'}
            </div>
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
            fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 20,
            color: overall.color,
            background: `${overall.color}14`,
            border: `0.5px solid ${overall.color}30`,
          }}>
            <StatusDot color={overall.color} />
            {overall.label}
          </span>
        </div>

        {/* ── Contextual warnings — only when action is needed ── */}
        {oauthMismatch && (
          <div style={{ margin: '0 18px 14px', padding: '12px 14px', borderRadius: 12,
            background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.3)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#F59E0B', marginBottom: 4 }}>
              Bağlanan Instagram hesabı yayın hedefinden farklı
            </div>
            <div style={{ fontSize: 11.5, color: t.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
              Az önce bağladığınız hesabı yayın hesabı yapmak için onaylayın.
            </div>
            <button
              type="button"
              disabled={syncOAuthMutation.isPending}
              onClick={() => syncOAuthMutation.mutate()}
              style={{
                width: '100%', padding: '11px', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: '#F59E0B', color: '#111', fontSize: 13, fontWeight: 700, minHeight: 44,
              }}
            >
              {syncOAuthMutation.isPending ? 'Uygulanıyor…' : 'Bu hesabı yayın hesabı yap'}
            </button>
          </div>
        )}

        {oauthUrlBroken && hasApiKey && (
          <div style={{ margin: '0 18px 14px', padding: '12px 14px', borderRadius: 12,
            background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.22)',
            fontSize: 11.5, color: '#f87171', lineHeight: 1.5 }}>
            Instagram bağlantısı başlatılamadı. Lütfen tekrar deneyin — sorun sürerse destek ekibiyle iletişime geçin.
          </div>
        )}

        {/* ── Primary action ── */}
        {!isLoading && (
          <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!hasApiKey ? (
              <>
                <button
                  type="button"
                  disabled={provisionMutation.isPending}
                  onClick={() => provisionMutation.mutate(false)}
                  style={{
                    width: '100%', padding: '13px 14px', borderRadius: 13, border: 'none', cursor: 'pointer',
                    background: IG_GRADIENT, color: '#fff', fontSize: 14.5, fontWeight: 700, minHeight: 48,
                    letterSpacing: '-0.01em', boxShadow: '0 6px 18px rgba(221,42,123,0.28)',
                  }}
                >
                  {provisionMutation.isPending ? 'Hazırlanıyor…' : 'Instagram Hesabını Bağla'}
                </button>
                {showLinkKeyForm ? (
                  <div style={{ padding: '12px 14px', borderRadius: 13, border: `0.5px solid ${t.separator}` }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
                      Mevcut yayın anahtarını bağla
                    </div>
                    <input
                      value={existingApiKey}
                      onChange={(e) => setExistingApiKey(e.target.value)}
                      placeholder="API anahtarı"
                      autoComplete="off"
                      style={inputStyle(t)}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        disabled={existingApiKey.trim().length < 8 || linkKeyMutation.isPending}
                        onClick={() => linkKeyMutation.mutate()}
                        style={{
                          flex: 1, padding: '11px', borderRadius: 11, border: 'none', cursor: 'pointer',
                          background: t.accent, color: '#fff', fontSize: 13, fontWeight: 700, minHeight: 44,
                        }}
                      >
                        {linkKeyMutation.isPending ? 'Bağlanıyor…' : 'Bağla'}
                      </button>
                      <button type="button" onClick={() => setShowLinkKeyForm(false)} style={ghostBtnStyle(t)}>
                        Vazgeç
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowLinkKeyForm(true)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0 0',
                      fontSize: 12, fontWeight: 600, color: t.textTertiary, textAlign: 'center' as const,
                    }}
                  >
                    Mevcut yayın anahtarım var
                  </button>
                )}
              </>
            ) : (
              <>
                {!igOk && !activeId && (
                  <button
                    type="button"
                    disabled={connectMutation.isPending}
                    onClick={() => connectMutation.mutate()}
                    style={{
                      width: '100%', padding: '13px 14px', borderRadius: 13, border: 'none', cursor: 'pointer',
                      background: IG_GRADIENT, color: '#fff', fontSize: 14.5, fontWeight: 700, minHeight: 48,
                      letterSpacing: '-0.01em', boxShadow: '0 6px 18px rgba(221,42,123,0.28)',
                    }}
                  >
                    {connectMutation.isPending ? 'Bağlanıyor…' : 'Instagram ile Giriş Yap'}
                  </button>
                )}

                {/* Account switcher — collapsed by default */}
                {(otherAccounts.length > 0 || activeId) && (
                  <button
                    type="button"
                    onClick={() => setShowAccountList((v) => !v)}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 13, cursor: 'pointer',
                      background: 'transparent', border: `0.5px solid ${t.separator}`,
                      color: t.textSecondary, fontSize: 13, fontWeight: 600, minHeight: 44,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    Hesap değiştir
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: showAccountList ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
                      aria-hidden>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}

                {showAccountList && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {accounts.map((acc) => {
                      const isActive = acc.id === activeId;
                      return (
                        <AccountRow
                          key={acc.id}
                          t={t}
                          account={acc}
                          isActive={isActive}
                          busy={switchMutation.isPending}
                          onSelect={() => {
                            if (!isActive) switchMutation.mutate({ accountId: acc.id, label: acc.label });
                          }}
                          onRemove={
                            saveThemePatch && !isActive && accounts.length > 1
                              ? () => {
                                  if (window.confirm(`${accountDisplayLabel(acc)} listeden kaldırılsın mı?`)) {
                                    removeMutation.mutate(acc.id);
                                  }
                                }
                              : undefined
                          }
                        />
                      );
                    })}
                    <button
                      type="button"
                      disabled={connectMutation.isPending}
                      onClick={() => connectMutation.mutate()}
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                        background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                        border: `0.5px dashed ${t.separatorStrong}`,
                        color: t.textSecondary, fontSize: 12.5, fontWeight: 600, minHeight: 44,
                      }}
                    >
                      {connectMutation.isPending ? 'Bağlanıyor…' : '+ Farklı Instagram hesabı bağla'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Advanced / diagnostics — operator & debug only ── */}
        {debugMode && (
          <div style={{ borderTop: `0.5px solid ${t.separator}` }}>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              style={{
                width: '100%', padding: '12px 18px', background: 'transparent', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                color: t.textMuted, fontSize: 11.5, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase' as const, minHeight: 44,
              }}
            >
              Gelişmiş (operatör)
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
                aria-hidden>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showAdvanced && (
              <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.6 }}>
                  Tenant: <code style={{ fontSize: 10 }}>{workspaceId}</code>
                  <br />
                  API anahtarı: {hasApiKey ? 'var' : 'yok'}
                  {status?.api_key_source === 'global_fallback' ? ' (global fallback!)' : ''}
                  {' · '}OAuth: {igOk ? 'bağlı' : 'yok'}
                  {' · '}Yayın hesabı: <code style={{ fontSize: 10 }}>{activeId || '—'}</code>
                </div>

                <button type="button" onClick={() => refetch()} disabled={isFetching} style={ghostBtnStyle(t, true)}>
                  {isFetching ? 'Yenileniyor…' : 'Durumu yenile'}
                </button>

                <button
                  type="button"
                  disabled={syncOAuthMutation.isPending || !hasApiKey}
                  onClick={() => syncOAuthMutation.mutate()}
                  style={ghostBtnStyle(t, true)}
                >
                  {syncOAuthMutation.isPending ? 'Senkronize ediliyor…' : 'OAuth hesabını yayın hedefi yap'}
                </button>

                {hasApiKey && (
                  showLinkKeyForm ? (
                    <div style={{ padding: '12px', borderRadius: 12, border: `0.5px solid ${t.separator}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary, marginBottom: 6 }}>
                        API anahtarını güncelle
                      </div>
                      <input
                        value={existingApiKey}
                        onChange={(e) => setExistingApiKey(e.target.value)}
                        placeholder="Mertcafe API anahtarı"
                        autoComplete="off"
                        style={inputStyle(t)}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          disabled={existingApiKey.trim().length < 8 || linkKeyMutation.isPending}
                          onClick={() => linkKeyMutation.mutate()}
                          style={{
                            flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: t.accent, color: '#fff', fontSize: 13, fontWeight: 700,
                          }}
                        >
                          {linkKeyMutation.isPending ? 'Bağlanıyor…' : 'Anahtarı kaydet'}
                        </button>
                        <button type="button" onClick={() => setShowLinkKeyForm(false)} style={ghostBtnStyle(t)}>
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowLinkKeyForm(true)} style={ghostBtnStyle(t, true)}>
                      Mevcut API anahtarını değiştir
                    </button>
                  )
                )}

                {hasApiKey && (
                  <button
                    type="button"
                    disabled={provisionMutation.isPending}
                    onClick={() => {
                      if (window.confirm(
                        'Mevcut API anahtarı ve kayıtlı Instagram hesapları silinir, yeni Mertcafe kaydı oluşturulur. Devam?',
                      )) {
                        provisionMutation.mutate(true);
                      }
                    }}
                    style={{
                      width: '100%', padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
                      background: 'rgba(245,158,11,0.1)', border: '0.5px solid rgba(245,158,11,0.35)',
                      color: '#F59E0B', fontSize: 12.5, fontWeight: 700, minHeight: 44,
                    }}
                  >
                    {provisionMutation.isPending ? 'Yenileniyor…' : 'API anahtarını sıfırla (yeni IG bağlantısı)'}
                  </button>
                )}

                {!showAddForm ? (
                  <button type="button" onClick={() => setShowAddForm(true)} style={ghostBtnStyle(t, true)}>
                    + Manuel hesap ID ekle
                  </button>
                ) : (
                  <div style={{ padding: '12px', borderRadius: 12, border: `0.5px solid ${t.separator}` }}>
                    <label style={{ fontSize: 11, color: t.labelColor, display: 'block', marginBottom: 6 }}>
                      Instagram hesap ID
                    </label>
                    <input
                      value={newId}
                      onChange={(e) => setNewId(e.target.value)}
                      placeholder="1784xxxxxxxxxxxx"
                      style={inputStyle(t)}
                    />
                    <label style={{ fontSize: 11, color: t.labelColor, display: 'block', margin: '10px 0 6px' }}>
                      Etiket (isteğe bağlı)
                    </label>
                    <input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="ör. @markaniz"
                      style={inputStyle(t)}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        disabled={!newId.trim() || addMutation.isPending}
                        onClick={() => addMutation.mutate()}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                          background: t.accent, color: '#fff', fontSize: 13, fontWeight: 700,
                        }}
                      >
                        {addMutation.isPending ? 'Kaydediliyor…' : 'Ekle ve aktif yap'}
                      </button>
                      <button type="button" onClick={() => setShowAddForm(false)} style={ghostBtnStyle(t)}>
                        İptal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function inputStyle(t: T): CSSProperties {
  return {
    width: '100%', padding: '11px 12px', borderRadius: 10, fontSize: 16, boxSizing: 'border-box',
    background: t.isDark ? 'rgba(0,0,0,0.25)' : '#fff',
    border: `0.5px solid ${t.separator}`, color: t.textPrimary,
  };
}

function ghostBtnStyle(t: T, fullWidth = false): CSSProperties {
  return {
    ...(fullWidth ? { width: '100%' } : {}),
    padding: '11px 14px', borderRadius: 12, cursor: 'pointer', minHeight: 44,
    background: 'transparent', border: `0.5px solid ${t.separator}`,
    color: t.textTertiary, fontSize: 12.5, fontWeight: 600,
  };
}

function AccountRow({
  t,
  account,
  isActive,
  busy,
  onSelect,
  onRemove,
}: {
  t: T;
  account: MertcafeSavedAccount;
  isActive: boolean;
  busy: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 12,
      background: isActive
        ? (t.isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)')
        : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
      border: `0.5px solid ${isActive ? 'rgba(34,197,94,0.3)' : t.separator}`,
    }}>
      <button
        type="button"
        onClick={onSelect}
        disabled={isActive || busy}
        style={{
          flex: 1, minWidth: 0, background: 'transparent', border: 'none',
          cursor: isActive ? 'default' : 'pointer',
          textAlign: 'left', padding: 0, minHeight: 32,
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: isActive ? '#22c55e' : (t.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'),
          boxShadow: isActive ? '0 0 8px rgba(34,197,94,0.6)' : 'none',
        }} />
        <span style={{
          fontSize: 13.5, fontWeight: isActive ? 700 : 600, color: t.textPrimary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {accountDisplayLabel(account)}
        </span>
        {isActive && (
          <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 800, letterSpacing: '0.04em', flexShrink: 0 }}>
            AKTİF
          </span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Hesabı kaldır"
          style={{
            width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'rgba(239,68,68,0.08)', color: '#f87171',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
