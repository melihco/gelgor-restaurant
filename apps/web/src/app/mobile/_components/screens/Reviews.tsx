'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { IcoBack, IcoStar, IcoGoogle, IcoInstagram, IcoSend, IcoEdit, IcoCheck } from '../Icons';
import { MobileStackHeader } from '../ui-primitives';
import { apiClient } from '@/lib/api-client';
import { createPortal } from 'react-dom';
import { useState as useLocalState, useEffect } from 'react';
import type { T } from '../theme-context';
import type { SuggestedActionDto } from '@/types';
import { formatReviewProviderLabel } from '@/lib/mobile-customer-copy';

// ─── Types ────────────────────────────────────────────────────────────
interface ReviewItem {
  id: string;
  actionType: string;
  provider: 'GoogleBusiness' | 'Instagram' | string;
  status: string;                   // Pending | Approved | Executed
  sentiment: 'positive' | 'negative' | 'neutral';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  requiresEscalation: boolean;
  summary: string;
  title: string;
  rawAnalysis: string;
  keyTopics: string[];
  replyDraft: string | null;        // from renderedPreview.caption
  createdAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function normalizeReview(action: any): ReviewItem {
  const payload = (() => {
    try { return typeof action.payload === 'string' ? JSON.parse(action.payload) : (action.payload ?? {}); }
    catch { return {}; }
  })();
  const rp = (() => {
    try { return typeof action.renderedPreview === 'string' ? JSON.parse(action.renderedPreview) : (action.renderedPreview ?? {}); }
    catch { return {}; }
  })();

  const sentiment = (payload.sentiment ?? 'neutral') as ReviewItem['sentiment'];
  const urgency   = (payload.urgency   ?? 'low')     as ReviewItem['urgency'];

  const keyTopics: string[] = Array.isArray(payload.key_topics) ? payload.key_topics : [];

  // Try to extract reply draft from caption or raw_analysis
  let replyDraft: string | null = null;
  const rawCap = rp.caption ?? '';
  if (rawCap && rawCap !== '[]' && rawCap.trim()) {
    try { const p = JSON.parse(rawCap); replyDraft = Array.isArray(p) && p[0]?.reply ? p[0].reply : null; }
    catch { replyDraft = rawCap.slice(0, 500); }
  }

  return {
    id: action.id,
    actionType: action.actionType ?? '',
    provider: action.provider ?? 'GoogleBusiness',
    status: action.status ?? 'Pending',
    sentiment,
    urgency,
    requiresEscalation: payload.requires_escalation === true,
    summary: rp.summary ?? `Duygu: ${sentiment} · Öncelik: ${urgency}`,
    title: rp.title ?? 'Müşteri Yorumu Analizi',
    rawAnalysis: payload.raw_analysis ?? '',
    keyTopics,
    replyDraft,
    createdAt: action.createdAt,
  };
}

const SENTIMENT_CFG = {
  positive: { label: 'Olumlu',  color: '#34d399', dimKey: 'successDim' as const },
  neutral:  { label: 'Nötr',    color: '#60a5fa', dimKey: 'infoDim'    as const },
  negative: { label: 'Olumsuz', color: '#fb7185', dimKey: 'dangerDim'  as const },
};
const URGENCY_CFG = {
  low:      { label: 'Düşük',   color: '#60a5fa', dimKey: 'infoDim'    as const },
  medium:   { label: 'Orta',    color: '#f59e0b', dimKey: 'warningDim' as const },
  high:     { label: 'Yüksek',  color: '#fb7185', dimKey: 'dangerDim'  as const },
  critical: { label: 'Kritik',  color: '#dc2626', dimKey: 'dangerDim'  as const },
};
const STATUS_CFG: Record<string, { label: string; color: string; dimKey: keyof T }> = {
  Pending:  { label: 'Bekliyor',      color: '#f59e0b', dimKey: 'warningDim' },
  Approved: { label: 'Onaylandı',     color: '#34d399', dimKey: 'successDim' },
  Executed: { label: 'Yanıtlandı',    color: '#60a5fa', dimKey: 'infoDim'    },
  Rejected: { label: 'Reddedildi',    color: '#fb7185', dimKey: 'dangerDim'  },
};

// ─── Reviews List ─────────────────────────────────────────────────────
type Filter = 'all' | 'pending' | 'executed' | 'negative';

export function Reviews() {
  const { t } = useTheme();
  const { navigate, goBack } = useMobileStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<ReviewItem | null>(null);

  const { data: rawActions = [], isLoading } = useQuery({
    queryKey: ['suggested-actions'],
    queryFn: async () => { try { return await apiClient.getActions(); } catch { return []; } },
    refetchInterval: 30_000, staleTime: 15_000,
  });

  const allReviews = (rawActions as any[])
    .filter((a) => a.actionType === 'log_review_analysis')
    .map(normalizeReview);

  const filtered = allReviews.filter((r) => {
    if (filter === 'all')      return true;
    if (filter === 'pending')  return r.status === 'Pending';
    if (filter === 'executed') return r.status === 'Executed' || r.status === 'Approved';
    if (filter === 'negative') return r.sentiment === 'negative';
    return true;
  });

  const counts = {
    all:      allReviews.length,
    pending:  allReviews.filter((r) => r.status === 'Pending').length,
    executed: allReviews.filter((r) => r.status === 'Executed' || r.status === 'Approved').length,
    negative: allReviews.filter((r) => r.sentiment === 'negative').length,
  };

  const avgSentiment = allReviews.length > 0
    ? ((allReviews.filter((r) => r.sentiment === 'positive').length / allReviews.length) * 100).toFixed(0)
    : '0';

  return (
    <>
      <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>
        <MobileStackHeader t={t} title="Yorumlar" onBack={goBack} />

        {/* Stats */}
        <div style={{ padding: '16px 24px 20px', borderBottom: filtered.length > 0 || !isLoading ? `0.5px solid ${t.separator}` : undefined }}>
          {!isLoading && allReviews.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'Toplam',    value: String(allReviews.length), color: t.accent },
                { label: '% Olumlu', value: `${avgSentiment}%`,        color: t.success },
                { label: 'Bekleyen', value: String(counts.pending),    color: t.warning },
                { label: 'Acil',     value: String(allReviews.filter((r) => r.urgency === 'high' || r.urgency === 'critical').length), color: t.danger },
              ].map((s) => (
                <div key={s.label} style={{ flex: 1, ...t.surfaceCard, padding: '11px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color, lineHeight: 1, marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: t.labelColor, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div style={{ padding: '14px 24px 0', display: 'flex', gap: 7, overflowX: 'auto' }}>
          {([
            { id: 'all'      as Filter, label: 'Tümü'          },
            { id: 'pending'  as Filter, label: 'Bekleyenler'   },
            { id: 'executed' as Filter, label: 'Yanıtlananlar' },
            { id: 'negative' as Filter, label: 'Olumsuzlar'    },
          ]).map((f) => {
            const isActive = filter === f.id;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: '7px 14px', borderRadius: 30, flexShrink: 0, cursor: 'pointer',
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                ...(isActive ? t.pillActive(t.accent) : t.pillIdle),
              }}>
                {f.label}
                <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.65 }}>{counts[f.id]}</span>
              </button>
            );
          })}
        </div>

        {/* List */}
        <div style={{ padding: '16px 24px 0' }}>
          {isLoading ? (
            <div style={{ ...t.surfaceCard, padding: '48px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Yükleniyor...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 20px' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
                {allReviews.length === 0 ? 'Henüz yorum yok' : 'Bu filtre için yorum yok'}
              </div>
              {allReviews.length === 0 && (
                <>
                  <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 20, maxWidth: 280, margin: '0 auto 20px' }}>
                    Google İşletme ve Instagram bağlantısı kurulunca yorumlar burada görünür ve AI yanıt önerileri hazırlanır.
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('settings')}
                    style={{
                      padding: '11px 22px', borderRadius: 24, border: 'none', cursor: 'pointer',
                      background: `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`,
                      color: '#fff', fontSize: 13, fontWeight: 700,
                    }}
                  >
                    Entegrasyonları Bağla
                  </button>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((r) => {
                const sc_s = SENTIMENT_CFG[r.sentiment] ?? SENTIMENT_CFG.neutral;
                const sc_u = URGENCY_CFG[r.urgency]    ?? URGENCY_CFG.low;
                const sc_t = STATUS_CFG[r.status]      ?? STATUS_CFG['Pending']!;

                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    style={{
                      ...t.surfaceCard, padding: '18px', textAlign: 'left', cursor: 'pointer', width: '100%',
                      position: 'relative', overflow: 'hidden',
                      background: r.sentiment === 'negative'
                        ? (t.isDark ? 'rgba(251,113,133,0.04)' : 'rgba(251,113,133,0.02)')
                        : (t.isDark ? 'rgba(255,255,255,0.03)' : '#fff'),
                      border: r.sentiment === 'negative'
                        ? `0.5px solid ${t.danger}18`
                        : `0.5px solid ${t.separator}`,
                    }}
                  >
                    {/* Sentiment indicator — left border */}
                    <div style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: '0 2px 2px 0', background: sc_s.color }} />

                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        {r.provider === 'Instagram' ? <IcoInstagram size={14} color={t.textTertiary} /> : <IcoGoogle size={14} color={t.textTertiary} />}
                        <span style={{ fontSize: 12, color: t.textTertiary }}>{formatReviewProviderLabel(r.provider)}</span>
                      </div>
                      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 600, flexShrink: 0, background: t[sc_t.dimKey] as string, color: sc_t.color }}>
                        {sc_t.label}
                      </span>
                    </div>

                    <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {r.summary}
                    </p>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: t[sc_s.dimKey] as string, color: sc_s.color, fontWeight: 600 }}>{sc_s.label}</span>
                      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: t[sc_u.dimKey] as string, color: sc_u.color, fontWeight: 500 }}>Öncelik: {sc_u.label}</span>
                      {r.requiresEscalation && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: t.dangerDim, color: t.danger, fontWeight: 600 }}>⚑ Acil</span>}
                      {r.keyTopics.slice(0, 2).map((topic) => (
                        <span key={topic} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: t.textTertiary }}>{topic}</span>
                      ))}
                    </div>

                    {r.replyDraft && r.status === 'Pending' && (
                      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 11, color: t.accent, flexShrink: 0 }}>✦</span>
                        <p style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.45, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.replyDraft}</p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail sheet */}
      {selected && <ReviewDetailSheet review={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

// ─── Review Detail Sheet ──────────────────────────────────────────────
function ReviewDetailSheet({ review, onClose }: { review: ReviewItem; onClose: () => void }) {
  const { t } = useTheme();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(review.replyDraft ?? '');
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(false);

  const [mounted, setMounted] = useLocalState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const sc_s = SENTIMENT_CFG[review.sentiment] ?? SENTIMENT_CFG.neutral;
  const sc_u = URGENCY_CFG[review.urgency]    ?? URGENCY_CFG.low;

  const approveMutation = useMutation({
    mutationFn: () => apiClient.approveAction(review.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suggested-actions'] }); setSent(true); },
    onError: () => setSent(true),
  });

  if (sent) {
    return createPortal(
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301, background: t.isDark ? '#111116' : '#f2f2f7', borderRadius: '24px 24px 0 0', padding: '32px 24px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: t.successDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: t.success, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>Onaylandı</div>
          <div style={{ fontSize: 13, color: t.textTertiary, textAlign: 'center', lineHeight: 1.6, marginBottom: 24 }}>Yorum analizi onaylandı.</div>
          <button onClick={onClose} style={{ padding: '12px 32px', borderRadius: 14, cursor: 'pointer', ...t.pillIdle, fontSize: 14 }}>Kapat</button>
        </div>
      </>,
      document.body
    );
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', animation: 'fadeIn 200ms ease both' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301, maxHeight: '88dvh', display: 'flex', flexDirection: 'column', background: t.isDark ? '#111116' : '#f2f2f7', borderRadius: '24px 24px 0 0', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', animation: 'slideUp 280ms cubic-bezier(0.4,0,0.2,1) both', boxShadow: '0 -8px 40px rgba(0,0,0,0.3)' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 20px 16px', borderBottom: `0.5px solid ${t.separator}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                {review.provider === 'Instagram' ? <IcoInstagram size={14} color={t.textTertiary} /> : <IcoGoogle size={14} color={t.textTertiary} />}
                <span style={{ fontSize: 12, color: t.textTertiary }}>{formatReviewProviderLabel(review.provider)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: t[sc_s.dimKey] as string, color: sc_s.color, fontWeight: 600 }}>{sc_s.label}</span>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: t[sc_u.dimKey] as string, color: sc_u.color, fontWeight: 500 }}>Öncelik: {sc_u.label}</span>
                {review.requiresEscalation && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: t.dangerDim, color: t.danger, fontWeight: 600 }}>⚑ Acil</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: 'none', cursor: 'pointer', fontSize: 14, color: t.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Analysis summary */}
          <div style={{ ...t.surfaceCard, padding: '16px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Analiz Özeti</div>
            <p style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.65, margin: 0 }}>{review.summary}</p>
          </div>

          {/* Key topics */}
          {review.keyTopics.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Konular</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {review.keyTopics.map((topic) => (
                  <span key={topic} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 30, background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent }}>{topic}</span>
                ))}
              </div>
            </div>
          )}

          {/* Reply draft */}
          {(draft || review.status === 'Pending') && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {draft ? 'AI Yanıt Taslağı' : 'Yanıt Yaz'}
                </div>
                {draft && (
                  <button onClick={() => setEditing(!editing)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, cursor: 'pointer', ...(editing ? t.pillActive(t.accent) : t.pillIdle), fontSize: 11, fontWeight: 500 }}>
                    <IcoEdit size={12} color={editing ? t.accent : t.textTertiary} />
                    {editing ? 'Düzenleniyor' : 'Düzenle'}
                  </button>
                )}
              </div>

              {editing || !draft ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Müşteriye yanıt yazın..."
                  rows={4}
                  style={{ width: '100%', padding: '13px 15px', borderRadius: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.55, background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff', border: t.isDark ? `0.5px solid ${t.accentBorder}` : '0.5px solid rgba(0,0,0,0.1)', color: t.textPrimary }}
                />
              ) : (
                <div style={{ ...t.surfaceCard, padding: '14px', background: t.accentDim, border: `0.5px solid ${t.accentBorder}` }}>
                  <p style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.65, margin: 0 }}>{draft}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {review.status === 'Pending' && (
          <div style={{ padding: '12px 20px', borderTop: `0.5px solid ${t.separator}`, flexShrink: 0, display: 'flex', gap: 8 }}>
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              style={{ flex: 2, padding: '15px', borderRadius: 16, cursor: 'pointer', background: t.successDim, border: `0.5px solid ${t.success}30`, color: t.success, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <IcoCheck size={15} color={t.success} strokeWidth={2.5} />
              {approveMutation.isPending ? 'Onaylanıyor...' : 'Onayla'}
            </button>
            <button onClick={onClose} style={{ flex: 1, padding: '15px', borderRadius: 16, cursor: 'pointer', ...t.pillIdle, fontSize: 14 }}>
              İptal
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

// ─── ReviewDetail (legacy navigation compat) ─────────────────────────
export function ReviewDetail() {
  const { goBack } = useMobileStore();
  const { t } = useTheme();
  return (
    <div style={{ height: '100dvh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, color: t.textMuted }}>Reviews ekranından yorum seçin</div>
      <button onClick={goBack} style={{ padding: '10px 24px', borderRadius: 12, cursor: 'pointer', ...t.pillIdle, fontSize: 13 }}>Geri</button>
    </div>
  );
}
