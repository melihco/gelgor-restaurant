'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  accountDisplayLabel,
  normalizeMertcafeAccountId,
  parseMertcafeSavedAccounts,
  removeMertcafeSavedAccount,
  type MertcafeSavedAccount,
} from '@/lib/mertcafe-accounts';
import type { T } from './theme-context';

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
      padding: '6px 10px', borderRadius: 999,
      background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
      color: ok ? '#4ade80' : '#f87171',
      border: `0.5px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)'}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444' }} />
      {label}
    </span>
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
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [existingApiKey, setExistingApiKey] = useState('');
  const [showLinkKeyForm, setShowLinkKeyForm] = useState(false);
  const [oauthUrlBroken, setOauthUrlBroken] = useState(false);

  const { data: status, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mertcafe-status', workspaceId],
    queryFn: () => apiClient.getMertcafeStatus(workspaceId),
    staleTime: 10_000,
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
  const usesGlobalFallback = status?.api_key_source === 'global_fallback';

  const provisionMutation = useMutation({
    mutationFn: (force?: boolean) => apiClient.provisionMertcafeTenant(workspaceId, { force }),
    onSuccess: async (data) => {
      setOauthUrlBroken(false);
      await invalidate();
      const result = data as { message?: string; connect_ready?: boolean };
      flash(
        result.message
          || (result.connect_ready === false
            ? 'API anahtarı kaydedildi ancak OAuth URL henüz hazır değil.'
            : 'Mertcafe API anahtarı oluşturuldu. Şimdi Instagram OAuth ile bağlanın.'),
        result.connect_ready !== false,
      );
    },
    onError: (e: unknown) => {
      flash(e instanceof Error ? e.message : 'Tenant kaydı başarısız', false);
    },
  });

  const linkKeyMutation = useMutation({
    mutationFn: () => apiClient.linkMertcafeApiKey(workspaceId, existingApiKey.trim()),
    onSuccess: async (data) => {
      setExistingApiKey('');
      setShowLinkKeyForm(false);
      await invalidate();
      flash(data.message || 'Mevcut Mertcafe hesabınız bağlandı.');
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
      flash(data.message || `OAuth hesabı senkronlandı ${user}`.trim());
    },
    onError: (e: unknown) => {
      flash(e instanceof Error ? e.message : 'OAuth senkronu başarısız', false);
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

  const oauthMismatch =
    igOk && oauthId && activeId && oauthId !== activeId;

  const flash = (text: string, ok = true) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), ok ? 5000 : 4500);
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['mertcafe-status', workspaceId] });
    await queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', workspaceId] });
  };

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
        flash('Instagram OAuth açıldı. Farklı hesapla giriş yapın, sonra durumu yenileyin.');
      }
    },
    onError: (e: unknown) => {
      setOauthUrlBroken(true);
      flash(e instanceof Error ? e.message : 'OAuth URL alınamadı', false);
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

  const cardStyle = compact
    ? { borderRadius: 20, overflow: 'hidden' as const, background: t.isDark ? 'rgba(255,255,255,0.03)' : '#fff',
        border: `0.5px solid ${t.separator}` }
    : { borderRadius: 18, padding: '14px 14px 12px', marginBottom: 14,
        background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        border: `0.5px solid ${t.separator}` };

  return (
    <div style={{ marginBottom: compact ? 16 : 0 }}>
      {message && (
        <div style={{ margin: '0 0 12px', padding: '12px 16px', borderRadius: 14,
          background: message.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.09)',
          border: `0.5px solid ${message.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}` }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: message.ok ? '#10B981' : '#F87171' }}>
            {message.text}
          </span>
        </div>
      )}

      <div style={cardStyle}>
        {!compact && (
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#818cf8', marginBottom: 10 }}>
            Yayın hesabı (Mertcafe · tenant)
          </div>
        )}

        <div style={{ padding: compact ? '16px 18px' : 0 }}>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 10, lineHeight: 1.45 }}>
            Tenant: <code style={{ fontSize: 10 }}>{workspaceId}</code>
            <br />
            Her tenant kendi API anahtarı + yayın hesap ID ile çalışır.
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <StatusPill
              ok={hasApiKey}
              label={isLoading ? 'API…' : hasApiKey ? 'Tenant API anahtarı' : 'API anahtarı yok'}
            />
            <StatusPill
              ok={tenantReady}
              label={tenantReady ? 'Yayın hazır' : 'Hesap ID eksik'}
            />
            <StatusPill
              ok={igOk}
              label={isLoading ? 'OAuth…' : igOk ? 'Instagram OAuth' : 'OAuth yok'}
            />
          </div>

          {usesGlobalFallback && (
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10,
              background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.25)',
              fontSize: 11, color: '#F59E0B', lineHeight: 1.45 }}>
              Geçici global API anahtarı kullanılıyor. Üretimde her tenant için ayrı kayıt oluşturun.
            </div>
          )}

          {hasApiKey && accounts.length > 0 && igOk && !status?.use_oauth_account && (
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10,
              background: 'rgba(129,140,248,0.08)', border: '0.5px solid rgba(129,140,248,0.25)',
              fontSize: 11, color: t.textSecondary, lineHeight: 1.45 }}>
              Manuel yayın hesabı aktif. Paylaşım hatası alırsanız Mertcafe panelindeki API anahtarının
              seçili hesaba ait olduğundan emin olun — «Mevcut Mertcafe hesabımı bağla» ile güncelleyin.
            </div>
          )}

          {oauthUrlBroken && hasApiKey && (
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10,
              background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.25)',
              fontSize: 11, color: '#f87171', lineHeight: 1.45 }}>
              OAuth URL alınamadı — mevcut API anahtarı Instagram bağlantısı için uygun değil.
              Aşağıdan «API anahtarını yenile» ile sıfırlayıp yeni Instagram hesabı bağlayın.
            </div>
          )}

          {!isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {!hasApiKey && (
                <>
                  {showLinkKeyForm ? (
                    <div style={{ padding: '12px', borderRadius: 12, border: `0.5px solid ${t.separator}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary, marginBottom: 6 }}>
                        Mevcut Mertcafe hesabım var
                      </div>
                      <p style={{ fontSize: 11, color: t.textMuted, margin: '0 0 10px', lineHeight: 1.45 }}>
                        Mertcafe panelinizdeki API anahtarını yapıştırın. Yeni kayıt oluşturulmaz.
                      </p>
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
                            flex: 1, padding: '12px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                            background: '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 700,
                          }}
                        >
                          {linkKeyMutation.isPending ? 'Bağlanıyor…' : 'Hesabımı bağla'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowLinkKeyForm(false)}
                          style={{
                            padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                            background: 'transparent', border: `0.5px solid ${t.separator}`,
                            color: t.textMuted, fontSize: 12,
                          }}
                        >
                          Gizle
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowLinkKeyForm(true)}
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                        background: '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 700,
                      }}
                    >
                      Mevcut Mertcafe hesabımı bağla
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={provisionMutation.isPending}
                    onClick={() => provisionMutation.mutate(false)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                      background: 'transparent', border: `0.5px solid ${t.separator}`,
                      color: t.textTertiary, fontSize: 13,
                    }}
                  >
                    {provisionMutation.isPending ? 'Oluşturuluyor…' : 'Yeni Mertcafe API anahtarı oluştur (ilk kez)'}
                  </button>
                </>
              )}
              {hasApiKey && (
                <>
                  {!showLinkKeyForm ? (
                    <button
                      type="button"
                      onClick={() => setShowLinkKeyForm(true)}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                        background: 'transparent', border: `0.5px solid ${t.separator}`,
                        color: t.textSecondary, fontSize: 13, fontWeight: 600,
                      }}
                    >
                      Mevcut Mertcafe API anahtarımı bağla
                    </button>
                  ) : (
                    <div style={{ padding: '12px', borderRadius: 12, border: `0.5px solid ${t.separator}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary, marginBottom: 6 }}>
                        Mertcafe API anahtarını güncelle
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
                            background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700,
                          }}
                        >
                          {linkKeyMutation.isPending ? 'Bağlanıyor…' : 'Anahtarı kaydet'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowLinkKeyForm(false)}
                          style={{
                            padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                            background: 'transparent', border: `0.5px solid ${t.separator}`,
                            color: t.textMuted, fontSize: 12,
                          }}
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  )}
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
                      width: '100%', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                      background: oauthUrlBroken
                        ? 'rgba(245,158,11,0.18)'
                        : 'rgba(245,158,11,0.12)',
                      border: '0.5px solid rgba(245,158,11,0.35)',
                      color: '#F59E0B', fontSize: 13, fontWeight: 700,
                    }}
                  >
                    {provisionMutation.isPending ? 'Yenileniyor…' : 'API anahtarını yenile (yeni IG bağlantısı)'}
                  </button>
                </>
              )}
            </div>
          )}

          {activeId ? (
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 12,
              background: t.isDark ? 'rgba(129,140,248,0.08)' : 'rgba(79,70,229,0.06)',
              border: '0.5px solid rgba(129,140,248,0.25)' }}>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Şu an yayınlanan hesap</div>
              <code style={{ fontSize: 12, color: t.textPrimary, wordBreak: 'break-all' }}>{activeId}</code>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: t.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              Aktif hesap yok. OAuth ile bağlanın veya aşağıdan hesap ID seçin/kaydedin.
            </p>
          )}

          {oauthMismatch && (
            <div style={{ marginBottom: 12, padding: '12px', borderRadius: 12,
              background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.3)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 6 }}>
                OAuth farklı hesaba bağlı
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8, lineHeight: 1.45 }}>
                Mertcafe: <code style={{ fontSize: 10 }}>{oauthId}</code>
                <br />
                Yayın hedefi: <code style={{ fontSize: 10 }}>{activeId}</code>
              </div>
              <button
                type="button"
                disabled={syncOAuthMutation.isPending}
                onClick={() => syncOAuthMutation.mutate()}
                style={{
                  width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: '#F59E0B', color: '#111', fontSize: 12, fontWeight: 700,
                }}
              >
                {syncOAuthMutation.isPending ? 'Uygulanıyor…' : 'OAuth hesabını aktif yap'}
              </button>
            </div>
          )}

          {accounts.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, marginBottom: 8,
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Kayıtlı hesaplar — geçiş yap
              </div>
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
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              disabled={connectMutation.isPending || !hasApiKey}
              onClick={() => connectMutation.mutate()}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #E1306C, #833AB4)', color: '#fff',
                fontSize: 14, fontWeight: 700,
                opacity: connectMutation.isPending || !hasApiKey ? 0.55 : 1,
              }}
            >
              {connectMutation.isPending ? 'URL alınıyor…' : 'Farklı hesaba geç (OAuth)'}
            </button>

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                border: `0.5px solid ${t.separator}`, color: t.textSecondary, fontSize: 13, fontWeight: 600,
              }}
            >
              {isFetching ? 'Yenileniyor…' : 'Durumu yenile (OAuth sonrası)'}
            </button>

            <button
              type="button"
              disabled={syncOAuthMutation.isPending || !hasApiKey}
              onClick={() => syncOAuthMutation.mutate()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                background: t.isDark ? 'rgba(129,140,248,0.12)' : 'rgba(79,70,229,0.08)',
                border: '0.5px solid rgba(129,140,248,0.35)', color: t.textPrimary, fontSize: 13, fontWeight: 600,
              }}
            >
              {syncOAuthMutation.isPending ? 'Senkronize ediliyor…' : 'OAuth hesabını yayın hedefi yap'}
            </button>

            {!showAddForm ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                  background: 'transparent', border: `0.5px solid ${t.separator}`,
                  color: t.textTertiary, fontSize: 13,
                }}
              >
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
                  placeholder="6a200e8e2b2567671aae"
                  style={inputStyle(t)}
                />
                <label style={{ fontSize: 11, color: t.labelColor, display: 'block', margin: '10px 0 6px' }}>
                  Etiket (isteğe bağlı)
                </label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="ör. @kacta ana hesap"
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
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    style={{
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                      background: 'transparent', border: `0.5px solid ${t.separator}`,
                      color: t.textMuted, fontSize: 12,
                    }}
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!compact && (
        <p style={{ fontSize: 11, color: t.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          Feed Onayla, seçili hesap ID ile Mertcafe&apos;e gider. Farklı IG için OAuth ile yeni hesap bağlayın
          veya kayıtlı listeden tek tıkla geçin.
        </p>
      )}
    </div>
  );
}

function inputStyle(t: T): CSSProperties {
  return {
    width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13, boxSizing: 'border-box',
    background: t.isDark ? 'rgba(0,0,0,0.25)' : '#fff',
    border: `0.5px solid ${t.separator}`, color: t.textPrimary,
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
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12,
      background: isActive
        ? (t.isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.08)')
        : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
      border: `0.5px solid ${isActive ? 'rgba(34,197,94,0.35)' : t.separator}`,
    }}>
      <button
        type="button"
        onClick={onSelect}
        disabled={isActive || busy}
        style={{
          flex: 1, minWidth: 0, background: 'transparent', border: 'none', cursor: isActive ? 'default' : 'pointer',
          textAlign: 'left', padding: 0,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 600, color: t.textPrimary }}>
          {accountDisplayLabel(account)}
          {isActive && (
            <span style={{ marginLeft: 8, fontSize: 10, color: '#22c55e', fontWeight: 700 }}>AKTİF</span>
          )}
        </div>
        <code style={{ fontSize: 10, color: t.textMuted, wordBreak: 'break-all' }}>{account.id}</code>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: 11, fontWeight: 600,
          }}
        >
          Kaldır
        </button>
      )}
    </div>
  );
}
