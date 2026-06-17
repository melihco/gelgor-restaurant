'use client';
/**
 * VisualReviewSheet
 *
 * GPT-4o "human eye" creative review of a generated design/image.
 * Shows score rings, category breakdown, issues, and suggestions.
 *
 * Usage:
 *   <VisualReviewSheet
 *     imageUrl="https://..."
 *     context={{ brandName, contentType, caption }}
 *     onClose={() => setOpen(false)}
 *   />
 */
import { useState, useEffect, useCallback } from 'react';
import type { VisualReviewResult } from '@/app/api/visual-review/route';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 8) return '#22c55e';
  if (score >= 6) return '#f59e0b';
  if (score >= 4) return '#f97316';
  return '#ef4444';
}

function scoreEmoji(score: number) {
  if (score >= 8) return '✅';
  if (score >= 6) return '🟡';
  if (score >= 4) return '🟠';
  return '🔴';
}

function verdictLabel(v: VisualReviewResult['verdict']) {
  if (v === 'excellent') return 'Mükemmel';
  if (v === 'good')      return 'İyi';
  if (v === 'needs_work') return 'Geliştirilebilir';
  return 'Zayıf';
}

const CATEGORY_LABELS: Record<keyof VisualReviewResult['categories'], string> = {
  textLegibility:  'Metin Okunabilirliği',
  visualHierarchy: 'Görsel Hiyerarşi',
  composition:     'Kompozisyon',
  brandFit:        'Marka Uyumu',
  ctaClarity:      'CTA Netliği',
};

// ─────────────────────────────────────────────────────────────────────────────
// Score Ring (SVG circle)
// ─────────────────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score / 10;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1)' }}
      />
      <text
        x={size / 2} y={size / 2 + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.26} fontWeight={700}
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}
      >
        {score}
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Category Bar
// ─────────────────────────────────────────────────────────────────────────────
function CategoryBar({ label, score }: { label: string; score: number }) {
  const color = scoreColor(score);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{score}/10</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${score * 10}%`, background: color,
          borderRadius: 3, transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export interface VisualReviewContext {
  brandName?: string;
  contentType?: string;
  platform?: string;
  templateTitle?: string;
  caption?: string;
}

interface Props {
  imageUrl: string;
  context?: VisualReviewContext;
  /** If provided, shows a small thumbnail at the top */
  thumbnailUrl?: string;
  onClose: () => void;
}

export function VisualReviewSheet({ imageUrl, context, thumbnailUrl, onClose }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<VisualReviewResult | null>(null);
  const [errMsg, setErrMsg] = useState('');

  const run = useCallback(async () => {
    setStatus('loading');
    setErrMsg('');
    try {
      const resp = await fetch('/api/visual-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, context }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(e.error ?? 'Analiz başarısız');
      }
      const data = await resp.json() as VisualReviewResult;
      setResult(data);
      setStatus('done');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [imageUrl, context]);

  useEffect(() => { run(); }, [run]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        style={{
          width: '100%', maxWidth: 480, maxHeight: '88vh',
          background: 'linear-gradient(180deg,#13131f 0%,#0d0d1a 100%)',
          borderRadius: '20px 20px 0 0',
          border: '1px solid rgba(255,255,255,0.1)',
          overflowY: 'auto', padding: '0 0 40px',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg,#5A82A0,#8AABBD)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>👁</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Kreatif Direktör İncelemesi</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>GPT-4o Vision · İnsan gözü kalite analizi</div>
          </div>
        </div>

        {/* Thumbnail + Score */}
        {thumbnailUrl && (
          <div style={{ padding: '0 20px', marginBottom: 16 }}>
            <img
              src={thumbnailUrl} alt="Design preview"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 12, background: '#111' }}
            />
          </div>
        )}

        {/* Loading */}
        {status === 'loading' && (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{
              width: 40, height: 40, border: '3px solid rgba(90,130,160,0.2)',
              borderTopColor: '#5A82A0', borderRadius: '50%',
              margin: '0 auto 16px',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
              Tasarım analiz ediliyor...
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
              Metin okunabilirliği, hiyerarşi, kompozisyon kontrol ediliyor
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div style={{ padding: '24px 20px' }}>
            <div style={{
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 12, padding: '16px',
            }}>
              <div style={{ fontSize: 14, color: '#ef4444', marginBottom: 8 }}>Analiz başarısız</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12, lineHeight: 1.5 }}>
                {/* Strip raw S3 signed URLs from error messages — show a clean friendly hint */}
                {errMsg.includes('export-download.canva') || errMsg.includes('X-Amz') || errMsg.includes('süresi dolmuş')
                  ? 'Canva önizleme bağlantısının süresi dolmuş. Sayfayı yenileyip şablonu tekrar açın, ardından analizi yeniden başlatın.'
                  : errMsg.length > 180
                    ? errMsg.slice(0, 180) + '…'
                    : errMsg}
              </div>
              <button
                onClick={run}
                style={{
                  background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)',
                  color: '#ef4444', borderRadius: 8, padding: '8px 16px', fontSize: 13,
                  cursor: 'pointer',
                }}
              >Tekrar Dene</button>
            </div>
          </div>
        )}

        {/* Results */}
        {status === 'done' && result && (
          <div style={{ padding: '0 20px' }}>
            {/* Main Score */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 16,
              padding: '20px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <ScoreRing score={result.score} size={72} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 18, fontWeight: 800,
                    color: scoreColor(result.score),
                  }}>
                    {verdictLabel(result.verdict)}
                  </span>
                  <span style={{ fontSize: 16 }}>{scoreEmoji(result.score)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                  {result.summary}
                </div>
              </div>
            </div>

            {/* Category breakdown */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 16,
              padding: '16px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Kategori Puanları
              </div>
              {(Object.entries(result.categories) as [keyof typeof result.categories, number][]).map(([key, val]) => (
                <CategoryBar key={key} label={CATEGORY_LABELS[key]} score={val} />
              ))}
            </div>

            {/* Issues */}
            {result.issues.length > 0 && (
              <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                borderRadius: 16, padding: '16px', marginBottom: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 10 }}>
                  ⚠ Tespit Edilen Sorunlar
                </div>
                {result.issues.map((issue, i) => (
                  <div key={i} style={{
                    fontSize: 13, color: 'rgba(255,255,255,0.7)',
                    padding: '6px 0', borderBottom: i < result.issues.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    display: 'flex', gap: 8,
                  }}>
                    <span style={{ color: '#ef4444', flexShrink: 0 }}>•</span>
                    {issue}
                  </div>
                ))}
              </div>
            )}

            {/* Suggestions */}
            {result.suggestions.length > 0 && (
              <div style={{
                background: 'rgba(90,130,160,0.06)', border: '1px solid rgba(90,130,160,0.2)',
                borderRadius: 16, padding: '16px', marginBottom: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#818cf8', marginBottom: 10 }}>
                  💡 Geliştirme Önerileri
                </div>
                {result.suggestions.map((s, i) => (
                  <div key={i} style={{
                    fontSize: 13, color: 'rgba(255,255,255,0.7)',
                    padding: '6px 0', borderBottom: i < result.suggestions.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    display: 'flex', gap: 8,
                  }}>
                    <span style={{ color: '#818cf8', flexShrink: 0 }}>→</span>
                    {s}
                  </div>
                ))}
              </div>
            )}

            {/* Retry + Close */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={run}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)', borderRadius: 12,
                  padding: '12px', fontSize: 13, cursor: 'pointer',
                }}
              >
                🔄 Yeniden Analiz
              </button>
              <button
                onClick={onClose}
                style={{
                  flex: 1, background: 'linear-gradient(135deg,#5A82A0,#8AABBD)',
                  border: 'none', color: '#fff', borderRadius: 12,
                  padding: '12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Tamam
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact badge for feed cards — shows score + opens sheet on tap
// ─────────────────────────────────────────────────────────────────────────────
export function VisualReviewBadge({
  imageUrl,
  context,
  thumbnailUrl,
}: {
  imageUrl: string;
  context?: VisualReviewContext;
  thumbnailUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [quickScore, setQuickScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const runQuick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (quickScore !== null) { setOpen(true); return; }
    setLoading(true);
    try {
      const resp = await fetch('/api/visual-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, context }),
      });
      if (resp.ok) {
        const data = await resp.json() as VisualReviewResult;
        setQuickScore(data.score);
      }
    } catch { /* ignore */ }
    setLoading(false);
    setOpen(true);
  }, [imageUrl, context, open, quickScore]);

  return (
    <>
      <button
        onClick={runQuick}
        style={{
          background: quickScore !== null
            ? `${scoreColor(quickScore)}22`
            : 'rgba(255,255,255,0.08)',
          border: `1px solid ${quickScore !== null ? scoreColor(quickScore) + '55' : 'rgba(255,255,255,0.15)'}`,
          color: quickScore !== null ? scoreColor(quickScore) : 'rgba(255,255,255,0.6)',
          borderRadius: 20, padding: '4px 10px',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
          whiteSpace: 'nowrap',
        }}
        title="Kreatif Direktör İncelemesi"
      >
        {loading
          ? <span style={{ opacity: 0.5 }}>⌛</span>
          : quickScore !== null
            ? <>{scoreEmoji(quickScore)} {quickScore}/10</>
            : <>👁 Görsel İncele</>
        }
      </button>

      {open && (
        <VisualReviewSheet
          imageUrl={imageUrl}
          context={context}
          thumbnailUrl={thumbnailUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
