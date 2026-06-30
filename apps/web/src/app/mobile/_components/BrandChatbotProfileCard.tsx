'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MertcafeIntegrationsCard } from './MertcafeIntegrationsCard';
import type { T } from './theme-context';
import type { BrandChatbotProfile } from '@/types/brand-chatbot';

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

  return (
    <>
      <SCard t={t} title="Instagram Chatbot Profili" accent="#22d3ee">
        <p style={{ fontSize: 13, color: t.textSecondary, margin: '0 0 14px', lineHeight: 1.5 }}>
          DM chatbot ve ilerideki agent/voice aramaları için marka bilgisi. Analiz mevcut marka
          verisinden (web, ürün kataloğu, ton) otomatik üretilir.
        </p>

        {isLoading ? (
          <p style={{ fontSize: 13, color: t.textTertiary }}>Yükleniyor…</p>
        ) : (
          <>
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
                  Güncelleme: {new Date(data.updatedAt).toLocaleString('tr-TR')}
                </span>
              )}
              {profile?.source && (
                <span style={{ fontSize: 12, color: t.textTertiary }}>
                  Kaynak: {profile.source}
                </span>
              )}
            </div>

            {!profile && (
              <p style={{ fontSize: 13, color: t.textSecondary, marginBottom: 12 }}>
                Henüz chatbot profili yok. &quot;Markayı Analiz Et&quot; ile oluşturun.
              </p>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                style={{
                  padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: t.accent, color: '#fff', fontWeight: 600, fontSize: 13,
                }}
              >
                {analyzeMutation.isPending ? 'Analiz…' : 'Markayı Analiz Et'}
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                style={{
                  padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                  background: 'transparent', color: t.textPrimary, fontWeight: 600, fontSize: 13,
                  border: `0.5px solid ${t.separator}`,
                }}
              >
                {saveMutation.isPending ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              <button
                type="button"
                onClick={() => syncMertcafeMutation.mutate()}
                disabled={syncMertcafeMutation.isPending || !form.menuSummary.trim()}
                style={{
                  padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                  background: 'transparent', color: '#818cf8', fontWeight: 600, fontSize: 13,
                  border: '0.5px solid rgba(129,140,248,0.35)',
                }}
              >
                {syncMertcafeMutation.isPending ? 'Sync…' : 'Mertcafe\'e Gönder'}
              </button>
            </div>

            <Field t={t} label="Görünen işletme adı" value={form.businessDisplayName}
              onChange={(v) => setForm((f) => ({ ...f, businessDisplayName: v }))} />
            <Field t={t} label="Çalışma saatleri" value={form.businessHours}
              onChange={(v) => setForm((f) => ({ ...f, businessHours: v }))} />
            <Field t={t} label="Adres" value={form.address}
              onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
            <Field t={t} label="Telefon" value={form.phone}
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
            <Field t={t} label="Menü / ürün özeti (chatbot)" value={form.menuSummary} multiline
              onChange={(v) => setForm((f) => ({ ...f, menuSummary: v }))} />
            <Field t={t} label="Kargo politikası" value={form.shippingPolicy} multiline
              onChange={(v) => setForm((f) => ({ ...f, shippingPolicy: v }))} />
            <Field t={t} label="Sipariş süreci" value={form.orderProcess} multiline
              onChange={(v) => setForm((f) => ({ ...f, orderProcess: v }))} />

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
                {profile.faqs.slice(0, 4).map((faq) => (
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
              {showAgentContext ? 'Agent bağlamını gizle' : 'Agent bağlamını göster (markdown)'}
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
          </>
        )}

        {message && (
          <p style={{ fontSize: 12, color: t.textTertiary, margin: '8px 0 0' }}>{message}</p>
        )}
      </SCard>

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
  );
}
