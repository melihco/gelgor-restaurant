'use client';

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MertcafeIntegrationsCard } from './MertcafeIntegrationsCard';
import { BrandSectionIntro } from './BrandSectionIntro';
import type { T } from './theme-context';
import type { BrandChatbotProfile } from '@/types/brand-chatbot';

type ChatGroup = 'info' | 'catalog' | 'ai' | 'integrations';

function ChevronRight({ color }: { color: string }) {
  return (
    <svg width="8" height="13" viewBox="0 0 9 15" fill="none" aria-hidden>
      <path d="M1.5 1.5 7.5 7.5l-6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GroupIcon({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'info':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M6 19.5c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        </svg>
      );
    case 'catalog':
      return (
        <svg {...common}>
          <path d="M5 6.5h14M5 12h14M5 17.5h14" />
          <circle cx="8" cy="6.5" r="1.2" fill={color} stroke="none" />
          <circle cx="8" cy="12" r="1.2" fill={color} stroke="none" />
          <circle cx="8" cy="17.5" r="1.2" fill={color} stroke="none" />
        </svg>
      );
    case 'ai':
      return (
        <svg {...common}>
          <path d="M12 3.5 14.8 9.2 21 10l-4.8 4.2 1.2 6.3L12 17.8 6.6 20.5l1.2-6.3L3 10l6.2-.8L12 3.5Z" />
        </svg>
      );
    case 'integrations':
      return (
        <svg {...common}>
          <path d="M8 12h8M12 8v8" />
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        </svg>
      );
    default:
      return null;
  }
}

function Field({
  t,
  label,
  value,
  onChange,
  multiline = false,
}: {
  t: T;
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const style: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: 12,
    border: `0.5px solid ${t.separator}`,
    background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
    color: t.textPrimary,
    fontSize: 14,
    fontFamily: 'inherit',
    resize: multiline ? 'vertical' : 'none',
    minHeight: multiline ? 88 : undefined,
  };
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: t.labelColor, marginBottom: 6 }}>{label}</div>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} style={style} rows={4} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} style={style} />
      )}
    </label>
  );
}

function SCard({ t, title, accent, children }: { t: T; title: string; accent?: string; children: ReactNode }) {
  return (
    <div style={{
      borderRadius: 18, padding: '16px 16px 14px', marginBottom: 14,
      background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      border: `0.5px solid ${accent ? `${accent}33` : t.separator}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: accent ?? t.labelColor, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SaveButton({ t, pending, onClick }: { t: T; pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      style={{
        width: '100%', padding: '12px 14px', borderRadius: 12, cursor: pending ? 'wait' : 'pointer',
        background: t.accent, color: '#fff', fontWeight: 700, fontSize: 14, border: 'none',
      }}
    >
      {pending ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
    </button>
  );
}

function profileToForm(p: BrandChatbotProfile | null | undefined) {
  return {
    businessDisplayName: p?.businessDisplayName ?? '',
    businessHours: p?.businessHours ?? '',
    address: p?.address ?? '',
    phone: p?.phone ?? '',
    menuSummary: p?.menuSummary ?? '',
    shippingPolicy: p?.shippingPolicy ?? '',
    orderProcess: p?.orderProcess ?? '',
    operatorNotes: p?.operatorNotes ?? '',
    agentContextMarkdown: p?.agentContextMarkdown ?? '',
  };
}

export function BrandChatbotProfileCard({
  t,
  workspaceId,
  brandName,
  saveThemePatch,
}: {
  t: T;
  workspaceId: string;
  brandName: string;
  saveThemePatch: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(profileToForm(null));
  const [message, setMessage] = useState<string | null>(null);
  const [showAgentContext, setShowAgentContext] = useState(false);
  const [chatGroup, setChatGroup] = useState<ChatGroup | null>(null);

  const openChatGroup = useCallback((g: ChatGroup | null) => {
    setChatGroup(g);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['brand-chatbot-profile', workspaceId],
    queryFn: () => apiClient.getBrandChatbotProfile(workspaceId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data?.profile) {
      setForm(profileToForm(data.profile));
    }
  }, [data?.profile]);

  const analyzeMutation = useMutation({
    mutationFn: () => apiClient.analyzeBrandChatbotProfile(workspaceId),
    onSuccess: async (res) => {
      setForm(profileToForm(res.profile));
      setMessage('Marka analizi tamamlandı — chatbot profili güncellendi');
      await queryClient.invalidateQueries({ queryKey: ['brand-chatbot-profile', workspaceId] });
    },
    onError: (e: unknown) => {
      setMessage(e instanceof Error ? e.message : 'Analiz başarısız');
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => apiClient.patchBrandChatbotProfile(workspaceId, form),
    onSuccess: async () => {
      setMessage('Chatbot profili kaydedildi');
      await queryClient.invalidateQueries({ queryKey: ['brand-chatbot-profile', workspaceId] });
    },
    onError: (e: unknown) => {
      setMessage(e instanceof Error ? e.message : 'Kayıt başarısız');
    },
  });

  const syncMertcafeMutation = useMutation({
    mutationFn: () => apiClient.syncMertcafeBusinessSetup({
      workspaceId,
      businessName: form.businessDisplayName || brandName || 'İşletme',
      menu: form.menuSummary || 'Menü — chatbot profilinden',
      hours: form.businessHours || '09:00 - 18:00',
      address: form.address,
      phone: form.phone,
      notes: form.operatorNotes || form.agentContextMarkdown?.slice(0, 500) || 'SmartAgency chatbot profili',
    }),
    onSuccess: () => setMessage('Mertcafe chatbot\'a senkronize edildi'),
    onError: (e: unknown) => setMessage(e instanceof Error ? e.message : 'Mertcafe sync başarısız'),
  });

  const profile = data?.profile;
  const confidence = profile?.analysisConfidence ?? 0;
  const faqCount = profile?.faqs?.length ?? 0;

  const CHAT_GROUPS: { key: ChatGroup; label: string; hint: string; accent: string }[] = [
    { key: 'info', label: 'İşletme Bilgisi', hint: form.businessDisplayName || 'Ad, saat, adres, telefon', accent: '#5AA0D6' },
    { key: 'catalog', label: 'Menü & Politikalar', hint: form.menuSummary.trim() ? 'Menü tanımlı' : 'Menü ve sipariş akışı', accent: '#4FB597' },
    { key: 'ai', label: 'AI Analiz & SSS', hint: profile ? `%${confidence} güven · ${faqCount} SSS` : 'Profil oluştur', accent: '#A985E0' },
    { key: 'integrations', label: 'Entegrasyonlar', hint: 'Mertcafe bağlantısı', accent: '#818cf8' },
  ];
  const activeChatGroup = CHAT_GROUPS.find((g) => g.key === chatGroup);

  if (isLoading) {
    return <p style={{ fontSize: 13, color: t.textTertiary }}>Chatbot profili yükleniyor…</p>;
  }

  return (
    <>
      {message && (
        <div style={{
          marginBottom: 14, padding: '10px 12px', borderRadius: 12, fontSize: 12, lineHeight: 1.45,
          color: t.textSecondary, background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: `0.5px solid ${t.separator}`,
        }}>
          {message}
        </div>
      )}

      {chatGroup === null && (
        <>
          <BrandSectionIntro
            t={t}
            title="Instagram Chatbot"
            description="DM chatbot ve agent/voice aramaları için marka bilgisi. Analiz mevcut marka verisinden otomatik üretilir."
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CHAT_GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => openChatGroup(g.key)}
                style={{
                  position: 'relative', textAlign: 'left', padding: 15, borderRadius: 18, cursor: 'pointer',
                  ...t.surfaceGroup, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                <div style={{ position: 'absolute', top: -24, left: -24, width: 80, height: 80, borderRadius: '50%', background: g.accent, opacity: t.isDark ? 0.14 : 0.09, filter: 'blur(16px)', pointerEvents: 'none' }} />
                <div style={{
                  position: 'relative', width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `linear-gradient(135deg, ${g.accent}2e, ${g.accent}14)`, border: `0.5px solid ${g.accent}3d`,
                }}>
                  <GroupIcon name={g.key} color={g.accent} />
                </div>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>{g.label}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{g.hint}</div>
                </div>
                <ChevronRight color={t.textTertiary} />
              </button>
            ))}
          </div>
        </>
      )}

      {chatGroup !== null && (
        <button
          type="button"
          onClick={() => openChatGroup(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', color: t.accent, fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 16 }}
        >
          <svg width="8" height="13" viewBox="0 0 9 15" fill="none" aria-hidden><path d="M7.5 1.5 1.5 7.5l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Chatbot · <span style={{ color: t.textPrimary }}>{activeChatGroup?.label}</span>
        </button>
      )}

      {chatGroup === 'info' && (
        <>
          <BrandSectionIntro
            t={t}
            title="İşletme Bilgisi"
            description="Chatbot'un müşteriye gösterdiği temel iletişim bilgileri."
          />
          <SCard t={t} title="İletişim" accent="#5AA0D6">
            <Field t={t} label="Görünen işletme adı" value={form.businessDisplayName}
              onChange={(v) => setForm((f) => ({ ...f, businessDisplayName: v }))} />
            <Field t={t} label="Çalışma saatleri" value={form.businessHours}
              onChange={(v) => setForm((f) => ({ ...f, businessHours: v }))} />
            <Field t={t} label="Adres" value={form.address}
              onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
            <Field t={t} label="Telefon" value={form.phone}
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
            <SaveButton t={t} pending={saveMutation.isPending} onClick={() => saveMutation.mutate()} />
          </SCard>
        </>
      )}

      {chatGroup === 'catalog' && (
        <>
          <BrandSectionIntro
            t={t}
            title="Menü & Politikalar"
            description="Ürün özeti, kargo ve sipariş süreci. Chatbot bu bilgilerle müşteri sorularını yanıtlar."
          />
          <SCard t={t} title="Katalog & Süreç" accent="#4FB597">
            <Field t={t} label="Menü / ürün özeti" value={form.menuSummary} multiline
              onChange={(v) => setForm((f) => ({ ...f, menuSummary: v }))} />
            <Field t={t} label="Kargo politikası" value={form.shippingPolicy} multiline
              onChange={(v) => setForm((f) => ({ ...f, shippingPolicy: v }))} />
            <Field t={t} label="Sipariş süreci" value={form.orderProcess} multiline
              onChange={(v) => setForm((f) => ({ ...f, orderProcess: v }))} />
            <Field t={t} label="Operatör notları" value={form.operatorNotes} multiline
              onChange={(v) => setForm((f) => ({ ...f, operatorNotes: v }))} />
            <SaveButton t={t} pending={saveMutation.isPending} onClick={() => saveMutation.mutate()} />
          </SCard>
        </>
      )}

      {chatGroup === 'ai' && (
        <>
          <BrandSectionIntro
            t={t}
            title="AI Analiz & SSS"
            description="Marka verisinden otomatik chatbot profili üretin. SSS ve ürün kategorileri burada görünür."
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 999,
              background: confidence >= 70 ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
              color: confidence >= 70 ? '#4ade80' : '#facc15',
            }}>
              Analiz güveni: %{confidence}
            </span>
            {data?.updatedAt && (
              <span style={{ fontSize: 12, color: t.textTertiary }}>
                {new Date(data.updatedAt).toLocaleString('tr-TR')}
              </span>
            )}
          </div>
          <SCard t={t} title="Profil Analizi" accent="#A985E0">
            {!profile && (
              <p style={{ fontSize: 13, color: t.textSecondary, marginBottom: 12, lineHeight: 1.5 }}>
                Henüz chatbot profili yok. Markayı analiz ederek oluşturun.
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                style={{
                  flex: 1, minWidth: 140, padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: t.accent, color: '#fff', fontWeight: 600, fontSize: 13,
                }}
              >
                {analyzeMutation.isPending ? 'Analiz…' : 'Markayı Analiz Et'}
              </button>
              <button
                type="button"
                onClick={() => syncMertcafeMutation.mutate()}
                disabled={syncMertcafeMutation.isPending || !form.menuSummary.trim()}
                style={{
                  flex: 1, minWidth: 140, padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                  background: 'transparent', color: '#818cf8', fontWeight: 600, fontSize: 13,
                  border: '0.5px solid rgba(129,140,248,0.35)',
                }}
              >
                {syncMertcafeMutation.isPending ? 'Sync…' : 'Mertcafe\'e Gönder'}
              </button>
            </div>

            {profile?.productCategories && profile.productCategories.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.labelColor, marginBottom: 8 }}>
                  Ürün kategorileri
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {profile.productCategories.map((cat) => (
                    <span key={cat.name} style={{
                      fontSize: 12, padding: '5px 10px', borderRadius: 999,
                      background: t.accentDim, color: t.accent,
                    }}>
                      {cat.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile?.faqs && profile.faqs.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.labelColor, marginBottom: 8 }}>
                  SSS ({profile.faqs.length})
                </div>
                {profile.faqs.slice(0, 6).map((faq) => (
                  <div key={faq.question} style={{
                    marginBottom: 8, padding: 10, borderRadius: 12,
                    border: `0.5px solid ${t.separator}`,
                    fontSize: 12, color: t.textSecondary, lineHeight: 1.45,
                  }}>
                    <strong style={{ color: t.textPrimary }}>{faq.question}</strong>
                    <div style={{ marginTop: 4 }}>{faq.answer}</div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowAgentContext((v) => !v)}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: t.accent, fontSize: 13, fontWeight: 600, marginBottom: 8,
              }}
            >
              {showAgentContext ? 'Agent bağlamını gizle' : 'Agent bağlamını göster'}
            </button>
            {showAgentContext && (
              <pre style={{
                fontSize: 11, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                padding: 12, borderRadius: 12, maxHeight: 280, overflow: 'auto',
                background: t.isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.04)',
                border: `0.5px solid ${t.separator}`, color: t.textSecondary,
              }}>
                {form.agentContextMarkdown || '—'}
              </pre>
            )}
          </SCard>
        </>
      )}

      {chatGroup === 'integrations' && (
        <>
          <BrandSectionIntro
            t={t}
            title="Entegrasyonlar"
            description="Harici chatbot platformlarına profil senkronizasyonu."
          />
          <MertcafeIntegrationsCard
            t={t}
            workspaceId={workspaceId}
            brandName={form.businessDisplayName || brandName}
            businessMenu={form.menuSummary}
            businessHours={form.businessHours}
            businessAddress={form.address}
            businessPhone={form.phone}
            saveThemePatch={saveThemePatch}
          />
        </>
      )}
    </>
  );
}
