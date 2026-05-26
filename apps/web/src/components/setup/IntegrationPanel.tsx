'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertCircle, CheckCircle, ExternalLink, KeyRound,
  Link2, PlugZap, RefreshCw, Route, ShieldCheck, Trash2, XCircle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import type { CreateIntegrationRequest, IntegrationConnection, IntegrationProvider, IntegrationStatus } from '@/types';

const AGENT_TYPE_CODES: Record<string, number> = {
  AiCeo: 0,
  BlogWriter: 1,
  SocialMediaDesigner: 2,
  InstagramContentGenerator: 3,
  UiUxDesigner: 4,
  VideoEditor: 5,
  SeoSpecialist: 6,
  GoogleAdsAnalyst: 7,
  CustomerReviewResponder: 8,
  ChatbotManager: 9,
  AiStrategist: 10,
  AnalyticsAnalyst: 11,
};

const AGENT_LABELS: Record<string, string> = {
  InstagramContentGenerator: 'The Gram Master',
  SocialMediaDesigner: 'Social Designer',
  CustomerReviewResponder: 'Review Responder',
  GoogleAdsAnalyst: 'Ads Analyst',
  AnalyticsAnalyst: 'Analytics Analyst',
  SeoSpecialist: 'SEO Specialist',
  AiStrategist: 'AI Strategist',
};

const PROVIDERS: {
  value: IntegrationProvider;
  label: string;
  icon: string;
  color: string;
  desc: string;
  oauthScopes?: string;
  agentTypes: string[];
}[] = [
  {
    value: 'GoogleBusiness',
    label: 'Google Business',
    icon: '📍',
    color: '#4285f4',
    desc: 'Yorum yanıtlama, işletme profili ve itibar yönetimi.',
    agentTypes: ['CustomerReviewResponder'],
  },
  {
    value: 'Instagram',
    label: 'Instagram Business',
    icon: '📸',
    color: '#e1306c',
    desc: 'İçerik planı, post/reel önerisi ve yayın akışı.',
    agentTypes: ['InstagramContentGenerator', 'SocialMediaDesigner'],
  },
  {
    value: 'GoogleAds',
    label: 'Google Ads',
    icon: '📢',
    color: '#fbbc04',
    desc: 'Kampanya analizi, bütçe optimizasyonu ve reklam kreatifleri.',
    oauthScopes: 'ads',
    agentTypes: ['GoogleAdsAnalyst', 'AiStrategist'],
  },
  {
    value: 'Facebook',
    label: 'Facebook / Meta',
    icon: '👥',
    color: '#1877f2',
    desc: 'Meta sayfa, içerik ve topluluk yönetimi.',
    agentTypes: ['SocialMediaDesigner'],
  },
  {
    value: 'SearchConsole',
    label: 'Search Console',
    icon: '🔍',
    color: '#34a853',
    desc: 'SEO performansı, sorgular ve organik görünürlük.',
    oauthScopes: 'search_console',
    agentTypes: ['SeoSpecialist', 'AnalyticsAnalyst'],
  },
  {
    value: 'GoogleAnalytics',
    label: 'Google Analytics',
    icon: '📊',
    color: '#e37400',
    desc: 'Trafik, dönüşüm ve ziyaretçi davranışı analizi.',
    oauthScopes: 'analytics',
    agentTypes: ['AnalyticsAnalyst'],
  },
];

const STATUS_CONFIG: Record<IntegrationStatus, { color: string; label: string; Icon: typeof CheckCircle }> = {
  Connected: { color: '#22c55e', label: 'Bağlı', Icon: CheckCircle },
  Expired: { color: '#f59e0b', label: 'Süresi Doldu', Icon: AlertCircle },
  Error: { color: '#ef4444', label: 'Hata', Icon: XCircle },
  Disconnected: { color: '#6b7280', label: 'Bağlı Değil', Icon: XCircle },
};

type DraftConnection = {
  accountId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
};

function formatDate(value?: string) {
  if (!value) return 'Henüz kontrol edilmedi';
  return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function getTokenHealth(connection?: IntegrationConnection) {
  if (!connection) return { label: 'Bağlantı yok', detail: 'Token eklenmedi', color: '#71717a' };
  if (connection.status !== 'Connected') return { label: STATUS_CONFIG[connection.status]?.label ?? 'Kontrol gerekli', detail: 'Yeniden bağlayın', color: STATUS_CONFIG[connection.status]?.color ?? '#f59e0b' };
  if (!connection.tokenExpiresAt) return { label: 'Token aktif', detail: 'Süre bilgisi yok', color: '#22c55e' };

  const daysLeft = Math.ceil((new Date(connection.tokenExpiresAt).getTime() - Date.now()) / 86_400_000);
  if (daysLeft <= 0) return { label: 'Token süresi doldu', detail: 'Yenileme gerekli', color: '#ef4444' };
  if (daysLeft <= 7) return { label: `${daysLeft} gün kaldı`, detail: 'Yakında yenileyin', color: '#f59e0b' };
  return { label: `${daysLeft} gün geçerli`, detail: 'Sağlıklı', color: '#22c55e' };
}

function normalizeAgentType(value: unknown) {
  const token = String(value ?? '');
  const named = Object.entries(AGENT_TYPE_CODES).find(([, code]) => String(code) === token);
  return named?.[0] ?? token;
}

export default function IntegrationPanel() {
  const queryClient = useQueryClient();
  const [activeProvider, setActiveProvider] = useState<IntegrationProvider>('Instagram');
  const [draft, setDraft] = useState<DraftConnection>({ accountId: '', displayName: '', accessToken: '', refreshToken: '' });
  const { data: dashboardData } = useDashboardSnapshot();

  const { data: connections = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiClient.getIntegrations(),
  });

  const { data: mappings = [] } = useQuery({
    queryKey: ['provider-mappings'],
    queryFn: () => apiClient.getProviderMappings(),
  });

  const connectionByProvider = useMemo(() => {
    const map = new Map<IntegrationProvider, IntegrationConnection>();
    for (const connection of connections) {
      if (!map.has(connection.provider)) map.set(connection.provider, connection);
    }
    return map;
  }, [connections]);

  const activeConfig = PROVIDERS.find((provider) => provider.value === activeProvider) ?? PROVIDERS[0]!;
  const activeConnection = connectionByProvider.get(activeProvider);
  const activeHealth = getTokenHealth(activeConnection);
  const supportedAgents = activeConfig.agentTypes.map((agentType) => {
    const agent = dashboardData?.agents.find((item) => item.backendAgentType === agentType);
    const mapped = mappings.find((mapping) =>
      normalizeAgentType(mapping.agentType) === agentType &&
      (!activeConnection || mapping.integrationConnectionId === activeConnection.id)
    );
    return { agentType, agent, mapped };
  });

  const selectProvider = (provider: IntegrationProvider) => {
    const connection = connectionByProvider.get(provider);
    setActiveProvider(provider);
    setDraft({
      accountId: connection?.accountId ?? '',
      displayName: connection?.displayName ?? '',
      accessToken: '',
      refreshToken: '',
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (activeConnection) {
        return apiClient.updateIntegration(activeConnection.id, {
          displayName: draft.displayName || activeConnection.displayName,
          accessToken: draft.accessToken || undefined,
          refreshToken: draft.refreshToken || undefined,
        });
      }

      const data: CreateIntegrationRequest = {
        provider: activeProvider,
        accountId: draft.accountId,
        displayName: draft.displayName,
        accessToken: draft.accessToken,
        refreshToken: draft.refreshToken,
        scopes: activeConfig.oauthScopes ? 'oauth' : 'read,write',
      };
      return apiClient.createIntegration(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['integrations'] }),
        queryClient.invalidateQueries({ queryKey: ['onboarding-status'] }),
      ]);
      setDraft((prev) => ({ ...prev, accessToken: '', refreshToken: '' }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteIntegration(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['integrations'] }),
        queryClient.invalidateQueries({ queryKey: ['provider-mappings'] }),
        queryClient.invalidateQueries({ queryKey: ['onboarding-status'] }),
      ]);
    },
  });

  const mappingMutation = useMutation({
    mutationFn: ({ agentType, connectionId }: { agentType: string; connectionId: string }) =>
      apiClient.setProviderMapping(AGENT_TYPE_CODES[agentType] ?? agentType, connectionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['provider-mappings'] }),
        queryClient.invalidateQueries({ queryKey: ['onboarding-status'] }),
      ]);
    },
  });

  const handleOAuth = async (scopes: string) => {
    try {
      const { authUrl } = await apiClient.getGoogleAuthUrl(scopes);
      window.location.href = authUrl;
    } catch {
      alert('OAuth yapılandırması eksik. Google:OAuth:ClientId ayarlayın.');
    }
  };

  const handleHealthCheck = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['integrations'] }),
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] }),
    ]);
  };

  const disableSave = activeConnection
    ? saveMutation.isPending || (!draft.displayName && !draft.accessToken && !draft.refreshToken)
    : saveMutation.isPending || !draft.displayName || !draft.accountId || !draft.accessToken;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h2 className="text-xl font-bold text-white">Hesap Bağlantıları</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">
            Bu alan gerçek provider erişimini yönetir. Marka bağlamı için girilen kullanıcı adı ayrı, burada bağlanan token/account ise live action ve yayınlama yetkisi içindir.
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <p className="text-xs font-semibold text-white">Live action readiness</p>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-zinc-500">
            İçerik üretimi marka profiliyle çalışır. Platforma uygulama/schedule için bağlı hesap, sağlıklı token ve agent mapping gerekir.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {PROVIDERS.map((provider) => {
          const connection = connectionByProvider.get(provider.value);
          const status = connection ? STATUS_CONFIG[connection.status] ?? STATUS_CONFIG.Disconnected : STATUS_CONFIG.Disconnected;
          const health = getTokenHealth(connection);
          const mappedCount = mappings.filter((mapping) =>
            connection && mapping.integrationConnectionId === connection.id
          ).length;
          const active = activeProvider === provider.value;
          const StatusIcon = status.Icon;

          return (
            <button
              key={provider.value}
              type="button"
              onClick={() => selectProvider(provider.value)}
              className="rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5"
              style={{
                background: active ? `${provider.color}12` : 'rgba(255,255,255,0.018)',
                border: active ? `1px solid ${provider.color}55` : '1px solid rgba(255,255,255,0.07)',
                boxShadow: active ? `0 18px 55px -30px ${provider.color}` : 'none',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg" style={{ background: `${provider.color}18` }}>
                    {provider.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{provider.label}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">{provider.oauthScopes ? 'OAuth + manuel' : 'Manuel token'}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold" style={{ color: status.color, background: `${status.color}15`, border: `1px solid ${status.color}25` }}>
                  <StatusIcon className="h-3 w-3" />
                  {status.label}
                </span>
              </div>
              <p className="mt-3 min-h-10 text-[11px] leading-5 text-zinc-500">{provider.desc}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-black/20 px-2.5 py-2">
                  <p className="text-[8px] uppercase tracking-[0.14em] text-zinc-700">Hesap</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-zinc-300">{connection?.displayName || 'Bağlı değil'}</p>
                </div>
                <div className="rounded-xl bg-black/20 px-2.5 py-2">
                  <p className="text-[8px] uppercase tracking-[0.14em] text-zinc-700">Token</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold" style={{ color: health.color }}>{health.label}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-600">
                <span>{mappedCount > 0 ? `${mappedCount} agent bağlı` : 'Agent mapping yok'}</span>
                <span>{connection ? `ID: ${connection.accountId || '-'}` : 'Bağla / kur'}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_0.95fr]">
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">{activeConfig.icon}</span>
                <h3 className="text-sm font-semibold text-white">{activeConfig.label} bağlantısı</h3>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">{activeConfig.desc}</p>
            </div>
            {activeConnection && (
              <button
                type="button"
                onClick={() => deleteMutation.mutate(activeConnection.id)}
                className="rounded-xl border border-red-400/15 bg-red-500/[0.06] p-2 text-red-300 transition-colors hover:bg-red-500/[0.1]"
                title="Bağlantıyı sil"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {activeConfig.oauthScopes && (
            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              <div className="flex items-center gap-2">
                <PlugZap className="h-4 w-4" style={{ color: activeConfig.color }} />
                <p className="text-xs font-semibold text-white">OAuth hızlı bağlantı</p>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">Google izin ekranı ile token ve hesap bilgisi otomatik oluşturulur.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleOAuth(activeConfig.oauthScopes!)}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold text-white transition-all hover:brightness-110"
                  style={{ background: `${activeConfig.color}24`, border: `1px solid ${activeConfig.color}40` }}
                >
                  {activeConfig.label} OAuth ile bağla <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('ads,analytics,search_console')}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-[11px] font-semibold text-indigo-200"
                >
                  Tüm Google servislerini bağla <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label="Görünen Ad"
              value={draft.displayName}
              onChange={(value) => setDraft((prev) => ({ ...prev, displayName: value }))}
              placeholder="@cafebosphorus veya Google Ads hesabı"
            />
            <Field
              label="Hesap ID"
              value={draft.accountId}
              onChange={(value) => setDraft((prev) => ({ ...prev, accountId: value }))}
              placeholder="Platform hesap kimliği"
              disabled={Boolean(activeConnection)}
            />
            <Field
              label={activeConnection ? 'Yeni Access Token' : 'Access Token'}
              value={draft.accessToken}
              onChange={(value) => setDraft((prev) => ({ ...prev, accessToken: value }))}
              placeholder={activeConnection ? 'Boş bırakırsanız değişmez' : 'OAuth token veya API key'}
              type="password"
            />
            <Field
              label="Refresh Token"
              value={draft.refreshToken}
              onChange={(value) => setDraft((prev) => ({ ...prev, refreshToken: value }))}
              placeholder="Varsa refresh token"
              type="password"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={disableSave}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-45"
              style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }}
            >
              <KeyRound className="h-4 w-4" />
              {saveMutation.isPending ? 'Kaydediliyor...' : activeConnection ? 'Token / ad güncelle' : 'Hesabı bağla'}
            </button>
            <button
              type="button"
              onClick={handleHealthCheck}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.04]"
            >
              <RefreshCw className="h-4 w-4" />
              Test et / durumu yenile
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Bağlantı sağlığı</p>
                <p className="mt-1 text-[11px] text-zinc-500">Token, hesap ve son kontrol bilgisi.</p>
              </div>
              <Activity className="h-4 w-4" style={{ color: activeHealth.color }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <HealthStat label="Durum" value={activeConnection ? STATUS_CONFIG[activeConnection.status]?.label ?? activeConnection.status : 'Bağlı değil'} color={activeHealth.color} />
              <HealthStat label="Token" value={activeHealth.label} color={activeHealth.color} />
              <HealthStat label="Hesap" value={activeConnection?.accountId || '-'} />
              <HealthStat label="Son kontrol" value={formatDate(activeConnection?.lastHealthCheck)} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-indigo-300" />
              <p className="text-sm font-semibold text-white">Agent mapping</p>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">
              Bu hesap hangi agent tarafından kullanılacak? Live action sırasında doğru account buradan seçilir.
            </p>
            <div className="mt-4 space-y-2">
              {supportedAgents.map(({ agentType, agent, mapped }) => {
                const mappedToThis = Boolean(mapped);
              return (
                  <div key={agentType} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-200">{agent?.name ?? AGENT_LABELS[agentType] ?? agentType}</p>
                      <p className="text-[9px] text-zinc-600">{agentType}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!activeConnection || mappingMutation.isPending || mappedToThis}
                      onClick={() => activeConnection && mappingMutation.mutate({ agentType, connectionId: activeConnection.id })}
                      className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-colors disabled:opacity-50"
                      style={{
                        color: mappedToThis ? '#34d399' : '#c4b5fd',
                        background: mappedToThis ? 'rgba(52,211,153,0.1)' : 'rgba(99,102,241,0.1)',
                        border: mappedToThis ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(99,102,241,0.2)',
                      }}
                    >
                      {mappedToThis ? 'Bağlı' : 'Bu hesaba bağla'}
                    </button>
                  </div>
                );
              })}
              {!activeConnection && (
                <div className="rounded-xl border border-dashed border-white/[0.08] p-4 text-center">
                  <Link2 className="mx-auto h-5 w-5 text-zinc-700" />
                  <p className="mt-2 text-[11px] text-zinc-600">Önce hesabı bağlayın, sonra agent mapping açılır.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-700 outline-none transition-colors focus:border-indigo-400/35 disabled:cursor-not-allowed disabled:opacity-45"
      />
    </label>
  );
}

function HealthStat({ label, value, color = '#d4d4d8' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl bg-black/20 px-3 py-2.5">
      <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-700">{label}</p>
      <p className="mt-1 truncate text-[11px] font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}
