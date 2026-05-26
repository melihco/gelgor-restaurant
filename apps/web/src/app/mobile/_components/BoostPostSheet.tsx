'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from './theme-context';
import { apiClient } from '@/lib/api-client';
import type { MertcafeGoal } from '@/types/mertcafe-ads.types';

type Objective = 'reach' | 'engagement' | 'messages';

const OBJECTIVES: { id: Objective; icon: string; label: string; sub: string }[] = [
  { id: 'reach',       icon: '📢', label: 'Erişim',      sub: 'Daha fazla kişiye ulaş' },
  { id: 'engagement',  icon: '👍', label: 'Etkileşim',   sub: 'Beğeni & yorum artır' },
  { id: 'messages',    icon: '💬', label: 'Mesaj Al',    sub: 'DM odaklı hedefleme' },
];

const BUDGET_PRESETS = [50, 100, 250, 500];
const DAY_PRESETS    = [3, 7, 14, 30];
const CPM_TL = 8; // Tahmini CPM (₺)

function estimateReach(budgetTl: number): [number, number] {
  const mid = Math.round((budgetTl / CPM_TL) * 1000);
  return [Math.round(mid * 0.6), Math.round(mid * 1.4)];
}

interface Props {
  artifactId: string;
  igMediaId?: string;
  caption?: string;
  imageUrl?: string;
  isOpen: boolean;
  onClose: () => void;
}

function BoostSheetInner({ artifactId: _artifactId, igMediaId, caption, imageUrl, onClose }: Omit<Props, 'isOpen'>) {
  const { t } = useTheme();
  const queryClient = useQueryClient();

  const [objective,    setObjective]    = useState<Objective>('reach');
  const [budgetTl,     setBudgetTl]     = useState(100);
  const [customBudget, setCustomBudget] = useState('');
  const [showCustom,   setShowCustom]   = useState(false);
  const [durationDays, setDurationDays] = useState(7);
  const [success,      setSuccess]      = useState<string | null>(null);
  const [adsAccountId, setAdsAccountId] = useState('');

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['mertcafe-status'],
    queryFn: () => apiClient.getMertcafeStatus(),
    staleTime: 20_000,
  });
  const { data: mediaCheck, isLoading: mediaCheckLoading } = useQuery({
    queryKey: ['mertcafe-media-check', imageUrl],
    queryFn: () => apiClient.checkMertcafeMedia(imageUrl ?? '', 'image'),
    enabled: Boolean(imageUrl),
    staleTime: 20_000,
  });

  const hasInstagram = Boolean(status?.instagram_connected);
  const hasAdAccount = Boolean(status?.meta_ads_connected);
  const hasPostId = Boolean(igMediaId);
  const hasImage = Boolean(imageUrl);
  const isImagePublic = Boolean(mediaCheck?.reachable);
  const effectiveBudget = showCustom ? Number(customBudget) || 0 : budgetTl;
  const [reachLow, reachHigh] = estimateReach(effectiveBudget);
  const mappedGoal: MertcafeGoal = objective;

  const connectAdsMutation = useMutation({
    mutationFn: () => apiClient.connectMertcafeMetaAds({ adsAccountId: adsAccountId.trim() }),
    onSuccess: async () => {
      setSuccess('Meta Ads hesabı bağlandı');
      await refetchStatus();
    },
  });

  const boostMutation = useMutation({
    mutationFn: () => apiClient.boostMertcafePost({
      postId: igMediaId ?? '',
      goal: mappedGoal,
      budget: effectiveBudget,
      durationDays,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      setSuccess('Gönderi boost kuyruğuna alındı');
      setTimeout(onClose, 2200);
    },
  });

  const createAdMutation = useMutation({
    mutationFn: () => apiClient.createMertcafeAd({
      imageUrl: imageUrl ?? '',
      headline: ((caption ?? '').trim().split('\n')[0] || 'Instagram kampanya duyurusu').slice(0, 70),
      body: (caption ?? 'Hemen incele, detaylar için DM atabilirsiniz.').slice(0, 220),
      goal: mappedGoal,
      budget: effectiveBudget,
      budgetType: 'daily',
      durationDays,
      placement: 'all',
      countries: ['TR'],
      gender: 'all',
      ageMin: 18,
      ageMax: 65,
      interests: [],
      callToAction: objective === 'messages' ? 'MESSAGE_PAGE' : 'LEARN_MORE',
    }),
    onSuccess: () => {
      setSuccess('Yeni reklam kampanyası oluşturuldu');
      setTimeout(onClose, 2200);
    },
  });

  const canBoost = hasAdAccount && hasInstagram && hasPostId && effectiveBudget >= 20 && !boostMutation.isPending;
  const canCreateAd = hasAdAccount && hasInstagram && hasImage && isImagePublic && effectiveBudget >= 20 && !createAdMutation.isPending;
  const canConnectAds = adsAccountId.trim().startsWith('act_') && !connectAdsMutation.isPending;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', borderRadius: '20px 20px 0 0',
          background: t.isDark ? '#0d0d1a' : '#fff',
          border: `0.5px solid ${t.separator}`,
          padding: '20px 20px calc(env(safe-area-inset-bottom,0px) + 24px)',
          maxHeight: '90dvh', overflowY: 'auto',
        }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.textPrimary }}>📣 Bu Görseli Tanıt</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
              Mertcafe Ads endpointleri ile kampanya oluştur
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%',
            border: 'none', cursor: 'pointer', background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
            color: t.textMuted, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ×
          </button>
        </div>

        {/* Connection status */}
        <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 12,
          background: (hasInstagram && hasAdAccount) ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.08)',
          border: `0.5px solid ${(hasInstagram && hasAdAccount) ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.3)'}` }}>
          <div style={{ fontSize: 12, color: t.textSecondary, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span>{statusLoading ? '… Bağlantı kontrol ediliyor' : (hasInstagram ? '✓ Instagram bağlı' : '⚠ Instagram bağlı değil')}</span>
            <span>{statusLoading ? '' : (hasAdAccount ? '✓ Meta Ads bağlı' : '⚠ Meta Ads bağlı değil')}</span>
          </div>
        </div>

        {!hasAdAccount && (
          <div style={{ marginBottom: 20, display: 'flex', gap: 8 }}>
            <input
              value={adsAccountId}
              onChange={(e) => setAdsAccountId(e.target.value)}
              placeholder="act_1234567890"
              style={{
                flex: 1, padding: '11px 12px', borderRadius: 12, fontSize: 13,
                background: t.isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f8',
                border: `1px solid ${t.separator}`, color: t.textPrimary, outline: 'none',
              }}
            />
            <button
              onClick={() => connectAdsMutation.mutate()}
              disabled={!canConnectAds}
              style={{
                padding: '11px 12px', borderRadius: 12, border: 'none',
                cursor: canConnectAds ? 'pointer' : 'default',
                background: canConnectAds ? 'rgba(124,58,237,0.18)' : 'rgba(124,58,237,0.08)',
                color: canConnectAds ? t.accent : t.textMuted,
                fontWeight: 700, fontSize: 12,
              }}>
              {connectAdsMutation.isPending ? 'Bağlanıyor…' : 'Ads Bağla'}
            </button>
          </div>
        )}

        {/* Readiness checklist */}
        <div style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 12, border: `0.5px solid ${t.separator}`,
          background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Reklam Hazırlık Checklist
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: t.textSecondary }}>
            <span>{hasInstagram ? '✓ Instagram bağlantısı hazır' : '✗ Instagram bağlantısı gerekli'}</span>
            <span>{hasAdAccount ? '✓ Meta Ads hesabı bağlı' : '✗ Meta Ads hesabı bağlanmalı'}</span>
            <span>{hasPostId ? '✓ post_id mevcut (Boost için hazır)' : '✗ post_id yok (önce Onayla ile publish edin)'}</span>
            <span>
              {mediaCheckLoading
                ? '… Görsel public erişim kontrol ediliyor'
                : (!hasImage
                  ? '✗ Görsel URL gerekli'
                  : (isImagePublic ? '✓ Görsel URL dışarıdan erişilebilir' : `✗ Görsel URL erişimi sorunlu${mediaCheck?.error ? `: ${mediaCheck.error}` : ''}`))}
            </span>
          </div>
        </div>

        {/* Objective */}
        <p style={{ fontSize: 11, fontWeight: 700, color: t.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Kampanya Hedefi</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {OBJECTIVES.map(obj => {
            const sel = objective === obj.id;
            return (
              <button key={obj.id} onClick={() => setObjective(obj.id)} style={{
                flex: 1, padding: '12px 6px', borderRadius: 14, cursor: 'pointer',
                border: `${sel ? '1.5px' : '0.5px'} solid ${sel ? t.accent : t.separator}`,
                background: sel ? (t.isDark ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.06)') : 'transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 22 }}>{obj.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700,
                  color: sel ? t.accent : t.textSecondary }}>{obj.label}</span>
                <span style={{ fontSize: 9, color: t.textMuted, textAlign: 'center', lineHeight: 1.2 }}>
                  {obj.sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* Budget */}
        <p style={{ fontSize: 11, fontWeight: 700, color: t.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Toplam Bütçe</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: showCustom ? 10 : 20 }}>
          {BUDGET_PRESETS.map(b => (
            <button key={b} onClick={() => { setBudgetTl(b); setShowCustom(false); }} style={{
              padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
              border: `${!showCustom && budgetTl === b ? '1.5px' : '0.5px'} solid ${!showCustom && budgetTl === b ? t.accent : t.separator}`,
              background: !showCustom && budgetTl === b ? (t.isDark ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.06)') : 'transparent',
              color: !showCustom && budgetTl === b ? t.accent : t.textSecondary,
              fontSize: 13, fontWeight: 700,
            }}>{b}₺</button>
          ))}
          <button onClick={() => setShowCustom(s => !s)} style={{
            padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
            border: `${showCustom ? '1.5px' : '0.5px'} solid ${showCustom ? t.accent : t.separator}`,
            background: showCustom ? (t.isDark ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.06)') : 'transparent',
            color: showCustom ? t.accent : t.textMuted, fontSize: 13, fontWeight: 600,
          }}>Özel</button>
        </div>
        {showCustom && (
          <div style={{ marginBottom: 20 }}>
            <input
              type="number" min="20" value={customBudget}
              onChange={e => setCustomBudget(e.target.value)}
              placeholder="Min. 20₺"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12, fontSize: 14,
                background: t.isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f8',
                border: `1px solid ${t.separator}`, color: t.textPrimary, outline: 'none',
                boxSizing: 'border-box',
              }} />
          </div>
        )}

        {/* Duration */}
        <p style={{ fontSize: 11, fontWeight: 700, color: t.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Süre</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {DAY_PRESETS.map(d => (
            <button key={d} onClick={() => setDurationDays(d)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 14, cursor: 'pointer',
              border: `${durationDays === d ? '1.5px' : '0.5px'} solid ${durationDays === d ? t.accent : t.separator}`,
              background: durationDays === d ? (t.isDark ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.06)') : 'transparent',
              color: durationDays === d ? t.accent : t.textSecondary,
              fontSize: 12, fontWeight: 700,
            }}>{d} gün</button>
          ))}
        </div>

        {/* Estimated reach */}
        {effectiveBudget >= 20 && (
          <div style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 12,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            border: `0.5px solid ${t.separator}` }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary, marginBottom: 4 }}>
              ≈ {reachLow.toLocaleString('tr-TR')} – {reachHigh.toLocaleString('tr-TR')} kişiye ulaşır
            </div>
            <div style={{ fontSize: 11, color: t.textMuted }}>
              Gerçek erişim Meta'nın optimizasyonuna göre değişir · ~{effectiveBudget}₺ / {durationDays} gün
            </div>
          </div>
        )}

        {/* Error */}
        {(boostMutation.isError || createAdMutation.isError || connectAdsMutation.isError) && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.25)',
            fontSize: 12, color: '#F87171' }}>
            ⚠ {((boostMutation.error as Error)?.message || (createAdMutation.error as Error)?.message || (connectAdsMutation.error as Error)?.message || '').slice(0, 140)}
          </div>
        )}

        {/* Success */}
        {success && !boostMutation.isPending && !createAdMutation.isPending && (
          <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10,
            background: 'rgba(16,185,129,0.08)', border: '0.5px solid rgba(16,185,129,0.25)',
            fontSize: 13, color: '#10B981', fontWeight: 700, textAlign: 'center' }}>
            ✓ {success}
          </div>
        )}

        {/* CTA: Boost existing post */}
        <button
          onClick={() => boostMutation.mutate()}
          disabled={!canBoost}
          style={{
            width: '100%', padding: '14px', borderRadius: 16, border: 'none',
            cursor: canBoost ? 'pointer' : 'default',
            background: canBoost
              ? 'linear-gradient(135deg, #F59E0B, #EF4444)'
              : (t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
            color: canBoost ? '#fff' : t.textMuted,
            fontSize: 14, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: canBoost ? '0 4px 18px rgba(245,158,11,0.4)' : 'none',
            marginBottom: 8,
          }}>
          {boostMutation.isPending
            ? <><div style={{ width: 15, height: 15, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff',
                animation: 'spinSlow 0.8s linear infinite' }} />Boost hazırlanıyor…</>
            : `Gönderiyi Boost Et · ${effectiveBudget}₺ / ${durationDays} gün`
          }
        </button>

        {/* CTA: Create a fresh ad */}
        <button
          onClick={() => createAdMutation.mutate()}
          disabled={!canCreateAd}
          style={{
            width: '100%', padding: '14px', borderRadius: 16,
            cursor: canCreateAd ? 'pointer' : 'default',
            background: canCreateAd ? 'rgba(124,58,237,0.16)' : (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
            border: `0.5px solid ${canCreateAd ? 'rgba(124,58,237,0.3)' : t.separator}`,
            color: canCreateAd ? t.accent : t.textMuted,
            fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 10,
          }}>
          {createAdMutation.isPending ? 'Yeni reklam oluşturuluyor…' : 'Yeni Reklam Oluştur'}
        </button>

        {/* Fine print */}
        <p style={{ fontSize: 10, color: t.textMuted, textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
          Boost için önce içerik publish edilip post_id oluşmalıdır. Yeni Reklam butonu post_id olmadan da çalışır.
        </p>
      </div>
    </div>
  );
}

export function BoostPostSheet({ isOpen, ...rest }: Props) {
  if (!isOpen || typeof document === 'undefined') return null;
  return createPortal(<BoostSheetInner {...rest} />, document.body);
}
