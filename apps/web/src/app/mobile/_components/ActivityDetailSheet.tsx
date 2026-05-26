'use client';
import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from './theme-context';
import { coerceParsedActivityContent, type ParsedActivityContent, type ParsedItem } from './activity-parser';
import type { T } from './theme-context';
import { humanizeAgentError } from '@/lib/humanize-agent-error';

interface ActivityItemFull {
  title: string;
  agent: string;
  agentType: string;
  agentColor: string;
  status: 'running' | 'completed' | 'failed';
  time: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: string | null;
  durationMs: number | null;
  error: string | null;
  mode?: string | null;
  tokens?: number | null;
  model?: string | null;
  stage?: string | null;
  source: 'agent_run' | 'execution_job';
  executionLog: Record<string, unknown> | null;
  rawSummary: string | null;
}

interface Props {
  item: ActivityItemFull;
  content: ParsedActivityContent;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  running:   { label: 'Çalışıyor',  color: '#34d399' },
  completed: { label: 'Tamamlandı', color: '#60a5fa' },
  failed:    { label: 'Başarısız',  color: '#fb7185' },
};

const KIND_ICON: Record<string, string> = {
  card_designs: '🖼', content_calendar: '📅', performance_report: '📊',
  analytics_report: '📈', review_replies: '💬', action_result: '⚡', text: '✦', empty: '◎',
};

function fmtTokens(n: number | undefined | null): string {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v && typeof v === 'string' && v.trim() && v !== 'null' && v !== 'undefined') return v.trim();
  }
  return null;
}

export function ActivityDetailSheet({ item, content, onClose }: Props) {
  const { t } = useTheme();
  const sc = STATUS_LABEL[item.status] ?? STATUS_LABEL['completed']!;

  const [mounted, setMounted] = useState(false);
  const [showTechnicalError, setShowTechnicalError] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Extract all rich data from executionLog ──
  // (computed before early return so hook order is stable)
  const elog = item.executionLog ?? {};
  const meta = (elog.metadata ?? {}) as Record<string, unknown>;

  const artifactTitle    = pickStr(elog.artifactTitle);
  const contentLength    = typeof elog.contentLength === 'number' ? elog.contentLength : null;
  const suggestedActions = typeof elog.suggestedActionCount === 'number' ? elog.suggestedActionCount : null;
  const crewName         = pickStr(meta.crew_name);
  const fallbackContent  = meta.fallback_content === true;
  const reviewContext    = pickStr(meta.review_context);
  const errorType        = pickStr(elog.errorType);
  const logStatus        = pickStr(elog.status);
  const logStage         = pickStr(elog.stage, item.stage);
  const logSummaryRaw    = pickStr(elog.summary as string);

  // All useMemo calls BEFORE the early return ← fixes Rules of Hooks
  const displayContent = useMemo(() => {
    if (content.kind !== 'empty') return content;
    return coerceParsedActivityContent(item.agentType, item.rawSummary, logSummaryRaw);
  }, [content, item.agentType, item.rawSummary, logSummaryRaw]);

  const technicalSnippet = useMemo(() => {
    const raw = pickStr(item.rawSummary, logSummaryRaw);
    if (!raw || raw.length < 10) return null;
    return raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
  }, [item.rawSummary, logSummaryRaw]);

  const humanizedError = useMemo(() => humanizeAgentError(item.error), [item.error]);

  // Early return after all hooks
  if (!mounted) return null;

  const sheet = (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', animation: 'fadeIn 200ms ease both' }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
        background: t.isDark ? '#111116' : '#f2f2f7',
        borderRadius: '24px 24px 0 0',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        animation: 'slideUp 280ms cubic-bezier(0.4,0,0.2,1) both',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 20px 16px', borderBottom: `0.5px solid ${t.separator}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: `${item.agentColor}12`, border: `0.5px solid ${item.agentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              {KIND_ICON[displayContent.kind] ?? '✦'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary, marginBottom: 4, lineHeight: 1.2 }}>{item.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: item.agentColor, fontWeight: 600 }}>{item.agent}</span>
                <span style={{ fontSize: 10, color: t.textMuted }}>·</span>
                <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: `${sc.color}12`, color: sc.color, fontWeight: 600 }}>{sc.label}</span>
                {item.mode && (
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, background: t.infoDim, color: t.info, fontWeight: 600, textTransform: 'uppercase' }}>{item.mode}</span>
                )}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Kapat" style={{ width: 28, height: 28, borderRadius: 10, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', border: `0.5px solid ${t.separator}`, cursor: 'pointer', fontSize: 13, fontWeight: 400, color: t.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>×</button>
          </div>

          {/* Metrics strip */}
          <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
            {item.duration && <Metric t={t} label="Süre" value={item.duration} />}
            {item.tokens && item.tokens > 0 && <Metric t={t} label="Token" value={fmtTokens(item.tokens)} />}
            {contentLength && <Metric t={t} label="İçerik" value={`${contentLength} chr`} color={t.accent} />}
            {suggestedActions !== null && suggestedActions   > 0 && <Metric t={t} label="Aksiyon" value={String(suggestedActions)} color={t.info} />}
            {displayContent.previewCount && displayContent.previewCount > 0 && (
              <Metric t={t} label="Öğe" value={String(displayContent.previewCount)} color={t.accent} />
            )}
          </div>
        </div>

        {/* Error banner — kullanıcı dostu; ham JSON gizli */}
        {item.error && humanizedError && (
          <div style={{ padding: '12px 20px', background: t.dangerDim, borderBottom: `0.5px solid ${t.danger}20`, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.danger, marginBottom: 4 }}>
              {errorType ? `${humanizedError.title} · ${errorType}` : humanizedError.title}
            </div>
            <div style={{ fontSize: 13, color: t.textPrimary, lineHeight: 1.45 }}>{humanizedError.detail}</div>
            <button
              type="button"
              onClick={() => setShowTechnicalError((v) => !v)}
              style={{
                marginTop: 8, fontSize: 11, fontWeight: 600, color: t.textMuted,
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
              }}
            >
              {showTechnicalError ? 'Teknik detayı gizle' : 'Teknik detay (geliştiriciler)'}
            </button>
            {showTechnicalError && (
              <pre style={{
                marginTop: 8, padding: 10, borderRadius: 10, fontSize: 10, lineHeight: 1.35,
                background: t.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.06)',
                color: t.textMuted, overflow: 'auto', maxHeight: 160, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {humanizedError.raw}
              </pre>
            )}
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>

          {/* ── Run info block ── */}
          <div style={{ ...t.surfaceCard, padding: '16px', marginBottom: 12 }}>
            <SectionLabel t={t} text="Çalışma Detayları" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Agent Türü',    value: item.agentType                         },
                { label: 'Model',         value: item.model ?? 'crewai'                 },
                { label: 'Başlangıç',     value: fmtDate(item.startedAt)                },
                { label: 'Bitiş',         value: fmtDate(item.completedAt)              },
                crewName     && { label: 'Crew',          value: crewName                },
                logStage     && { label: 'Aşama',         value: logStage                },
                logStatus    && { label: 'Log Durumu',    value: logStatus               },
                reviewContext && { label: 'Review Ctx',   value: reviewContext           },
              ].filter(Boolean).map((m: any, i) => (
                <div key={i}>
                  <div style={{ fontSize: 10, color: t.labelColor, marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: t.textPrimary, wordBreak: 'break-word' }}>{m.value}</div>
                </div>
              ))}
            </div>
            {fallbackContent && (
              <div style={{ marginTop: 10, padding: '7px 10px', borderRadius: 8, background: t.warningDim, border: `0.5px solid ${t.warning}20`, fontSize: 12, color: t.warning }}>
                ⚠ Fallback içerik kullanıldı
              </div>
            )}
          </div>

          {/* ── Artifact info (if produced) ── */}
          {artifactTitle && (
            <div style={{ ...t.surfaceCard, padding: '16px', marginBottom: 12 }}>
              <SectionLabel t={t} text="Üretilen Artifact" />
              <div style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary, marginBottom: 6 }}>{artifactTitle}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {contentLength && <div><div style={{ fontSize: 10, color: t.labelColor }}>İçerik Uzunluğu</div><div style={{ fontSize: 13, fontWeight: 600, color: t.accent }}>{contentLength.toLocaleString()} chr</div></div>}
                {suggestedActions !== null && (
                  <div>
                    <div style={{ fontSize: 10, color: t.labelColor }}>Önerilen aksiyon</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.info }}>{suggestedActions}</div>
                  </div>
                )}
              </div>
              {suggestedActions !== null && suggestedActions > 0 && (
                <p style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.55, margin: '10px 0 0' }}>
                  Sayı, sistemde açılan <strong style={{ color: t.textSecondary }}>onay / görev / yürütme</strong> önerilerini gösterir
                  (ör. içeriği yayınla, şablon ata). Ne yapılacağını aşağıdaki fikir kartlarında veya{' '}
                  <strong style={{ color: t.textSecondary }}>Çıktılar</strong> ekranındaki artifact kaydında görebilirsiniz.
                </p>
              )}
            </div>
          )}

          {/* ── Çıktı özeti (coerce ile content ideation dahil) ── */}
          {displayContent.kind !== 'empty' && (
            <>
              <SectionLabel t={t} text={displayContent.kind === 'content_calendar' ? 'Üretilen içerik fikirleri' : 'Çıktı özeti'} />
              {displayContent.summary && (
                <div style={{ padding: '14px 16px', borderRadius: 14, marginBottom: 12, background: t.accentDim, border: `0.5px solid ${t.accentBorder}` }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.accent, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>✦ Özet</div>
                  <p style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.65, margin: 0 }}>{displayContent.summary}</p>
                </div>
              )}
              {displayContent.items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {displayContent.items.map((ci, i) => (
                    <ContentCard key={i} t={t} item={ci} index={i} kind={displayContent.kind} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Ham teknik özüt: yalnızca yapılandırılamayan çıktılar + isteğe bağlı açılır (log açısından şart değil) ── */}
          {displayContent.kind === 'empty' && technicalSnippet && (
            <div style={{ ...t.surfaceCard, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>Bu çalışma için yapılandırılmış özet üretilemedi</div>
              <p style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55, margin: '0 0 12px' }}>
                Ham veri aşağıda. Destek veya hata şüphesinde kullanılır; normal kullanımda gerekmez.
              </p>
              <details style={{ borderRadius: 12, border: `0.5px solid ${t.separator}`, overflow: 'hidden', background: t.isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.03)' }}>
                <summary style={{ padding: '12px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: t.textTertiary }}>
                  Teknik ham çıktıyı göster
                </summary>
                <pre style={{
                  margin: 0, padding: '12px 14px', fontSize: 10, lineHeight: 1.45, color: t.textSecondary,
                  overflow: 'auto', maxHeight: 220, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  borderTop: `0.5px solid ${t.separator}`,
                }}>
                  {technicalSnippet.slice(0, 12_000)}{technicalSnippet.length > 12_000 ? '\n…' : ''}
                </pre>
              </details>
            </div>
          )}

          {/* ── Hiç veri yok ── */}
          {displayContent.kind === 'empty' && !technicalSnippet && !artifactTitle && (
            <div style={{ ...t.surfaceCard, padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.6 }}>
                {item.status === 'failed'
                  ? 'Agent çalışması başarısız oldu. Hata detayı yukarıda gösterilmektedir.'
                  : item.status === 'running'
                  ? 'Agent aktif olarak çalışıyor, çıktı henüz üretilmedi.'
                  : 'Bu çalışma için ek çıktı bilgisi bulunmuyor.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}

// ─── Sub-components ──────────────────────────────────────────────────
function ContentCard({ t, item, index, kind }: { t: T; item: ParsedItem; index: number; kind: string }) {
  const isReport = kind === 'performance_report' || kind === 'analytics_report';
  return (
    <div style={{ padding: '14px 16px', background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff', border: `0.5px solid ${t.separator}`, borderRadius: 16, boxShadow: !t.isDark ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: (item.body || item.meta) ? 10 : 0 }}>
        {!isReport && (
          <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: t.labelColor }}>
            {index + 1}
          </div>
        )}
        <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, lineHeight: 1.3, flex: 1 }}>{item.title}</div>
        {item.subtitle && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: t.textTertiary, fontWeight: 500, flexShrink: 0 }}>{item.subtitle}</span>
        )}
      </div>
      {item.body && <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.6, margin: '0 0 10px', paddingLeft: isReport ? 0 : 32 }}>{item.body}</p>}
      {item.tags && item.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8, paddingLeft: isReport ? 0 : 32 }}>
          {item.tags.map((tag, ti) => (
            <span key={ti} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: t.textTertiary }}>{tag}</span>
          ))}
        </div>
      )}
      {item.meta && item.meta.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, paddingLeft: isReport ? 0 : 32, paddingTop: (item.body || item.tags) ? 10 : 0, borderTop: (item.body || item.tags) ? `0.5px solid ${t.separator}` : 'none' }}>
          {item.meta.map((m, mi) => (
            <div key={mi}>
              <div style={{ fontSize: 10, color: t.labelColor, marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ t, label, value, color }: { t: T; label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: t.labelColor, marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color ?? t.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function SectionLabel({ t, text }: { t: T; text: string }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>{text}</div>;
}
