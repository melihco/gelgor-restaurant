'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from './theme-context';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';

/**
 * ScheduleSheet — pick a future date/time and schedule the artifact to publish.
 *
 * Backwards compatible: existing publish flow is untouched. This is a separate path.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  publishType: 'feed' | 'reel' | 'story';
  imageUrl?: string;
  videoUrl?: string;
  caption?: string;
  hashtags?: string[];
  artifactTitle?: string;
}

// Generates quick-pick options relative to now
function quickPicks(): { label: string; iso: string }[] {
  const now = new Date();
  const mk = (mins: number) => new Date(now.getTime() + mins * 60_000).toISOString();
  // Round next hour
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  // Tomorrow 9am
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  // Tomorrow 18:00
  const tomorrow18 = new Date(now);
  tomorrow18.setDate(tomorrow18.getDate() + 1);
  tomorrow18.setHours(18, 0, 0, 0);
  // Next Monday 9am
  const nextMon = new Date(now);
  const diff = (8 - nextMon.getDay()) % 7 || 7;
  nextMon.setDate(nextMon.getDate() + diff);
  nextMon.setHours(9, 0, 0, 0);

  return [
    { label: '+1 saat',      iso: mk(60) },
    { label: 'Bu akşam 19:00', iso: (() => { const d = new Date(now); d.setHours(19, 0, 0, 0); return (d > now ? d : nextHour).toISOString(); })() },
    { label: 'Yarın 09:00',   iso: tomorrow9.toISOString() },
    { label: 'Yarın 18:00',   iso: tomorrow18.toISOString() },
    { label: 'Pzt 09:00',     iso: nextMon.toISOString() },
  ];
}

function pad(n: number) { return n.toString().padStart(2, '0'); }
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToISO(local: string): string {
  // local is "YYYY-MM-DDTHH:mm" in user's tz — convert to ISO with tz offset
  const d = new Date(local);
  return d.toISOString();
}
function formatPreview(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  };
  return d.toLocaleDateString('tr-TR', opts);
}

function SheetBody({ onClose, publishType, imageUrl, videoUrl, caption, hashtags, artifactTitle }: Omit<Props, 'isOpen'>) {
  const { t } = useTheme();
  const { tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();
  const picks = quickPicks();

  const [selectedISO, setSelectedISO] = useState<string>(picks[2]!.iso); // default: Yarın 09:00
  const [customMode, setCustomMode] = useState(false);
  const [success, setSuccess] = useState(false);

  const scheduleMutation = useMutation({
    mutationFn: () => apiClient.schedulePost({
      workspaceId: tenantId,
      publishType,
      scheduledAt: selectedISO,
      imageUrl,
      videoUrl,
      caption,
      hashtags,
      artifactTitle,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts', tenantId] });
      setSuccess(true);
      setTimeout(onClose, 1800);
    },
  });

  const isValid = (() => {
    try { return new Date(selectedISO).getTime() > Date.now(); } catch { return false; }
  })();

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', borderRadius: '20px 20px 0 0',
          background: t.isDark ? '#0d0d1a' : '#fff',
          border: `0.5px solid ${t.separator}`,
          padding: '20px 20px calc(env(safe-area-inset-bottom,0px) + 24px)',
          maxHeight: '90dvh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2,
          background: t.separator, margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.textPrimary }}>
              🕐 Yayını Zamanla
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
              Gönderiyi belirli bir tarih ve saatte yayınla
            </div>
          </div>
          <button onClick={onClose} aria-label="Kapat"
            style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
              color: t.textMuted, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Quick picks */}
        {!customMode && (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Hızlı Seçim
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {picks.map(p => {
                const sel = selectedISO === p.iso;
                return (
                  <button key={p.label} onClick={() => setSelectedISO(p.iso)}
                    style={{ padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
                      border: `${sel ? '1.5px' : '0.5px'} solid ${sel ? t.accent : t.separator}`,
                      background: sel ? (t.isDark ? 'rgba(77,112,136,0.1)' : 'rgba(77,112,136,0.06)') : 'transparent',
                      color: sel ? t.accent : t.textSecondary,
                      fontSize: 13, fontWeight: 600 }}>
                    {p.label}
                  </button>
                );
              })}
              <button onClick={() => setCustomMode(true)}
                style={{ padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
                  border: `0.5px solid ${t.separator}`, background: 'transparent',
                  color: t.textMuted, fontSize: 13, fontWeight: 600 }}>
                Özel…
              </button>
            </div>
          </>
        )}

        {/* Custom input */}
        {customMode && (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Özel Tarih & Saat
            </p>
            <input type="datetime-local"
              value={isoToLocalInput(selectedISO)}
              onChange={e => { if (e.target.value) setSelectedISO(localInputToISO(e.target.value)); }}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, fontSize: 14,
                background: t.isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f8',
                border: `1px solid ${t.separator}`, color: t.textPrimary, outline: 'none',
                boxSizing: 'border-box', marginBottom: 8 }} />
            <button onClick={() => setCustomMode(false)}
              style={{ fontSize: 12, padding: 0, background: 'none',
                border: 'none', color: t.accent, cursor: 'pointer', marginBottom: 16 }}>
              ← Hızlı seçeneklere dön
            </button>
          </>
        )}

        {/* Preview */}
        <div style={{ padding: '12px 14px', borderRadius: 12, marginBottom: 16,
          background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: `0.5px solid ${t.separator}` }}>
          <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4,
            textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Yayın zamanı
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: isValid ? t.textPrimary : t.danger }}>
            {isValid ? formatPreview(selectedISO) : 'Geçmiş bir tarih — ileri bir zaman seç'}
          </div>
        </div>

        {scheduleMutation.isError && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.25)',
            fontSize: 12, color: '#F87171' }}>
            ⚠ {(scheduleMutation.error as Error)?.message?.slice(0, 120)}
          </div>
        )}

        {success && (
          <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10,
            background: 'rgba(16,185,129,0.08)', border: '0.5px solid rgba(16,185,129,0.25)',
            fontSize: 13, color: '#10B981', fontWeight: 700, textAlign: 'center' }}>
            ✓ Yayın kuyruğa alındı
          </div>
        )}

        <button onClick={() => scheduleMutation.mutate()}
          disabled={!isValid || scheduleMutation.isPending || success}
          style={{ width: '100%', padding: '14px', borderRadius: 16, border: 'none',
            cursor: isValid && !scheduleMutation.isPending ? 'pointer' : 'default',
            background: isValid && !scheduleMutation.isPending
              ? 'linear-gradient(135deg, #4D7088, #5A82A0)'
              : (t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
            color: isValid && !scheduleMutation.isPending ? '#fff' : t.textMuted,
            fontSize: 14, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: isValid && !scheduleMutation.isPending ? '0 4px 18px rgba(77,112,136,0.35)' : 'none',
            marginBottom: 10 }}>
          {scheduleMutation.isPending
            ? <><div style={{ width: 14, height: 14, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff',
                animation: 'spinSlow 0.8s linear infinite' }} />Zamanlanıyor…</>
            : '🕐 Yayını Zamanla'
          }
        </button>

        <p style={{ fontSize: 10, color: t.textMuted, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
          Gönderi seçilen zamanda Instagram'a otomatik yayınlanır. İptal etmek için Çıktılar ekranından eriş.
        </p>
      </div>
    </div>
  );
}

export function ScheduleSheet({ isOpen, ...rest }: Props) {
  if (!isOpen || typeof document === 'undefined') return null;
  return createPortal(<SheetBody {...rest} />, document.body);
}
