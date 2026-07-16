'use client';
/**
 * MissionSlotShowcase — premium production gallery for the Plan (Mission) detail sheet.
 *
 * Renders every production slot of a mission as a 3D flip card:
 *   front  → produced visual (or elegant status placeholder) + headline + format badge
 *   back   → full slot record: slot role, pipeline, idea #, status, headline, actions
 *
 * Also exports MissionCompletedCard — the premium completed-mission list card with
 * a produced-visual filmstrip.
 *
 * Sector/tenant agnostic: everything is driven by the mission slot checklist +
 * artifact pool; no brand-specific branches.
 */
import { useMemo, useState } from 'react';
import type { T } from './theme-context';
import type { OutputArtifact, MissionSummary } from '@/types';
import type {
  MissionSlotChecklist,
  MissionSlotChecklistItem,
  SlotDeliveryStatus,
} from '@/lib/mission-slot-checklist';
import { resolveArtifactHubPreviewUrl } from '@/lib/content-calendar-artifact-link';
import { detectFeedArtifactKind, type FeedArtifactKind } from '@/lib/artifact-view-model';
import { SafeCoverImage } from './SafeCoverImage';

// ── Visual language ───────────────────────────────────────────────────────────

const GOLD = '#C9A96E';
const STEEL = '#8AABBD';

const STATUS_META: Record<SlotDeliveryStatus, {
  label: string;
  color: string;
  bg: string;
  live?: boolean;
}> = {
  ready:     { label: 'Hazır',      color: '#10B981', bg: 'rgba(16,185,129,0.14)' },
  rendering: { label: 'Üretiliyor', color: '#8AABBD', bg: 'rgba(138,171,189,0.16)', live: true },
  failed:    { label: 'Hata',       color: '#F59E0B', bg: 'rgba(245,158,11,0.14)' },
  pending:   { label: 'Sırada',     color: '#9DBECE', bg: 'rgba(157,190,206,0.12)' },
  missing:   { label: 'Eksik',      color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
};

type SlotFormat = 'post' | 'story' | 'reel' | 'carousel' | 'ad' | 'product';

const FORMAT_META: Record<SlotFormat, { label: string; glyph: string; color: string }> = {
  post:     { label: 'Post',     glyph: '◻', color: '#8AABBD' },
  story:    { label: 'Story',    glyph: '▯', color: '#C4B5FD' },
  reel:     { label: 'Reel',     glyph: '▶', color: '#F472B6' },
  carousel: { label: 'Carousel', glyph: '⧉', color: '#F59E0B' },
  ad:       { label: 'Reklam',   glyph: '◈', color: '#60A5FA' },
  product:  { label: 'Ürün',     glyph: '◇', color: '#34D399' },
};

function slotFormat(role: string): SlotFormat {
  const r = role.toLowerCase();
  if (r.startsWith('paid_ad')) return 'ad';
  if (r.startsWith('product_showcase')) return r.includes('story') ? 'story' : 'product';
  if (r.includes('reel')) return 'reel';
  if (r.includes('story')) return 'story';
  if (r.includes('carousel')) return 'carousel';
  return 'post';
}

const PIPELINE_LABEL: Record<string, string> = {
  gallery_photo: 'Galeri fotoğrafı',
  story_still: 'Galeri story',
  carousel_gallery: 'Galeri carousel',
  fal_design: 'AI tasarım stüdyosu',
  fal_story: 'AI motion story',
  fal_reel: 'AI sinematik reel',
  fal_only_post: 'AI editorial görsel',
  fal_only_story: 'AI sinematik story',
  fal_only_reel: 'AI sinematik reel',
  product_showcase: 'Ürün showcase',
};

function pipelineLabel(pipeline: string): string {
  return PIPELINE_LABEL[pipeline] ?? pipeline.replace(/_/g, ' ');
}

// One-time injected CSS — 3D flip + shimmer for rendering states.
const SHOWCASE_CSS = `
.sa-msc-card { perspective: 1400px; -webkit-tap-highlight-color: transparent; }
.sa-msc-inner {
  position: relative; width: 100%; height: 100%;
  transform-style: preserve-3d; -webkit-transform-style: preserve-3d;
  transition: transform 0.55s cubic-bezier(0.2, 0.75, 0.25, 1);
}
.sa-msc-card[data-flipped="true"] .sa-msc-inner { transform: rotateY(180deg); }
.sa-msc-face {
  position: absolute; inset: 0; border-radius: 18px; overflow: hidden;
  backface-visibility: hidden; -webkit-backface-visibility: hidden;
}
.sa-msc-back { transform: rotateY(180deg); }
.sa-msc-shimmer {
  background: linear-gradient(100deg, rgba(138,171,189,0.06) 32%, rgba(138,171,189,0.20) 50%, rgba(138,171,189,0.06) 68%);
  background-size: 240% 100%;
  animation: saMscShimmer 1.8s ease-in-out infinite;
}
@keyframes saMscShimmer {
  0% { background-position: 130% 0; }
  100% { background-position: -110% 0; }
}
@keyframes saMscPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
`;

// ── Slot card view-model ──────────────────────────────────────────────────────

interface SlotCardVm {
  key: string;
  item: MissionSlotChecklistItem;
  format: SlotFormat;
  previewUrl: string | null;
  isVideo: boolean;
}

function buildSlotCards(
  checklist: MissionSlotChecklist,
  artifacts: OutputArtifact[],
): SlotCardVm[] {
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  return checklist.items.map((item) => {
    const artifact = item.artifactId ? byId.get(item.artifactId) ?? null : null;
    const previewUrl = artifact ? resolveArtifactHubPreviewUrl(artifact) : null;
    const format = slotFormat(item.role);
    return {
      key: `${item.role}-${item.assignmentIndex}`,
      item,
      format,
      previewUrl,
      isVideo: format === 'reel' || (format === 'story' && item.pipeline.includes('fal')),
    };
  });
}

// ── Flip card ─────────────────────────────────────────────────────────────────

function SlotFlipCard({ vm, index, onOpenArtifact, t }: {
  vm: SlotCardVm;
  index: number;
  onOpenArtifact?: (artifactId: string) => void;
  t: T;
}) {
  const [flipped, setFlipped] = useState(false);
  const { item, format, previewUrl } = vm;
  const status = STATUS_META[item.status];
  const fmt = FORMAT_META[format];
  const cardBg = t.isDark ? '#101418' : '#1A2028';

  const detailRows: Array<{ label: string; value: string; color?: string }> = [
    { label: 'Format', value: fmt.label, color: fmt.color },
    { label: 'Üretim', value: pipelineLabel(item.pipeline) },
    { label: 'Durum', value: status.label, color: status.color },
    ...(item.aiEnhanceLabel
      ? [{ label: 'AI rötuş', value: item.aiEnhanceLabel }]
      : []),
  ];

  return (
    <div
      className="sa-msc-card"
      data-flipped={flipped}
      role="button"
      tabIndex={0}
      aria-label={`${item.label} — ${status.label}. Detay için dokunun.`}
      onClick={() => setFlipped((f) => !f)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped((f) => !f); }
      }}
      style={{ aspectRatio: '4 / 5', cursor: 'pointer' }}
    >
      <div className="sa-msc-inner">
        {/* ── Front ── */}
        <div
          className={`sa-msc-face${item.status === 'rendering' && !previewUrl ? ' sa-msc-shimmer' : ''}`}
          style={{
            background: cardBg,
            border: item.status === 'ready'
              ? '1px solid rgba(16,185,129,0.30)'
              : item.status === 'failed'
                ? '1px solid rgba(245,158,11,0.35)'
                : `1px dashed ${t.isDark ? 'rgba(157,190,206,0.28)' : 'rgba(77,112,136,0.30)'}`,
          }}
        >
          {previewUrl ? (
            <SafeCoverImage
              src={previewUrl}
              alt={item.headline ?? item.label}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
              background: `radial-gradient(120% 90% at 50% 0%, rgba(138,171,189,0.10), transparent 60%), ${cardBg}`,
            }}>
              <span style={{
                fontSize: 26, color: fmt.color, opacity: 0.75,
                animation: item.status === 'rendering' ? 'saMscPulse 1.6s ease-in-out infinite' : undefined,
              }}>
                {fmt.glyph}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.05em' }}>
                {item.status === 'rendering'
                  ? 'Görsel üretiliyor…'
                  : item.status === 'pending'
                    ? 'Üretim sırasında'
                    : item.status === 'failed'
                      ? 'Üretim hatası'
                      : 'Henüz üretilmedi'}
              </span>
            </div>
          )}

          {/* Video play badge */}
          {previewUrl && vm.isVideo && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(10,12,16,0.55)', backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 15, paddingLeft: 3,
            }}>
              ▶
            </div>
          )}

          {/* Top row — slot no + status */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            padding: '9px 10px', display: 'flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(180deg, rgba(8,10,14,0.62), transparent)',
          }}>
            <span style={{
              fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.72)',
              letterSpacing: '0.08em',
            }}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span style={{
              marginLeft: 'auto', fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
              padding: '3px 8px', borderRadius: 20,
              background: status.bg, color: status.color,
              display: 'flex', alignItems: 'center', gap: 4,
              backdropFilter: 'blur(6px)',
            }}>
              {status.live && (
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: status.color,
                  animation: 'saMscPulse 1.4s ease-in-out infinite',
                }} />
              )}
              {status.label}
            </span>
          </div>

          {/* Bottom scrim — headline + format */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '26px 11px 10px',
            background: 'linear-gradient(0deg, rgba(8,10,14,0.88) 20%, rgba(8,10,14,0.45) 62%, transparent)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4,
            }}>
              <span style={{ fontSize: 9, color: fmt.color, fontWeight: 800 }}>{fmt.glyph}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: fmt.color, letterSpacing: '0.01em',
              }}>
                {fmt.label}
              </span>
              <span style={{
                fontSize: 8.5, color: 'rgba(255,255,255,0.45)', fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                · {item.label}
              </span>
            </div>
            {item.headline ? (
              <div style={{
                fontSize: 11.5, fontWeight: 700, color: '#fff', lineHeight: 1.35,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {item.headline}
              </div>
            ) : (
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                Başlık üretimde belirlenecek
              </div>
            )}
          </div>
        </div>

        {/* ── Back ── */}
        <div
          className="sa-msc-face sa-msc-back"
          style={{
            background: `linear-gradient(155deg, rgba(77,112,136,0.22), rgba(16,20,26,0.96) 55%), ${cardBg}`,
            border: `1px solid ${t.isDark ? 'rgba(138,171,189,0.30)' : 'rgba(77,112,136,0.35)'}`,
            display: 'flex', flexDirection: 'column', padding: '12px 12px 10px',
          }}
        >
          <div style={{
            fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em',
            marginBottom: 10, lineHeight: 1.3,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {item.label}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {detailRows.map((row) => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 500, color: 'rgba(157,190,206,0.70)',
                  flexShrink: 0, minWidth: 58,
                }}>
                  {row.label}
                </span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, color: row.color ?? 'rgba(255,255,255,0.92)',
                  lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {row.value}
                </span>
              </div>
            ))}
            {item.headline && (
              <div style={{
                marginTop: 2, paddingTop: 7,
                borderTop: '0.5px solid rgba(138,171,189,0.20)',
              }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 500, color: 'rgba(157,190,206,0.70)',
                  marginBottom: 3,
                }}>
                  Başlık
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {item.headline}
                </div>
              </div>
            )}
          </div>

          {item.artifactId && onOpenArtifact ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenArtifact(item.artifactId!);
              }}
              style={{
                marginTop: 8, width: '100%', padding: '9px 10px', borderRadius: 11,
                border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #4D7088, #8AABBD)',
                color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.02em',
              }}
            >
              Önizle →
            </button>
          ) : (
            <div style={{
              marginTop: 8, textAlign: 'center', fontSize: 9, fontWeight: 600,
              color: 'rgba(157,190,206,0.55)', padding: '6px 0',
            }}>
              {item.status === 'rendering' ? 'Üretim tamamlanınca önizlenebilir' : 'Çevirmek için dokunun'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Showcase (detail sheet) ───────────────────────────────────────────────────

type FormatFilter = 'all' | SlotFormat;

export function MissionSlotShowcase({ checklist, artifacts, onOpenArtifact, t, showFormatFilters = true }: {
  checklist: MissionSlotChecklist | null;
  artifacts: OutputArtifact[];
  onOpenArtifact?: (artifactId: string) => void;
  t: T;
  /** Brand-level toggle — hide the Tümü/Post/Story filter chips. */
  showFormatFilters?: boolean;
}) {
  const [filter, setFilter] = useState<FormatFilter>('all');

  const cards = useMemo(
    () => (checklist ? buildSlotCards(checklist, artifacts) : []),
    [checklist, artifacts],
  );

  const formatCounts = useMemo(() => {
    const counts = new Map<SlotFormat, number>();
    for (const c of cards) counts.set(c.format, (counts.get(c.format) ?? 0) + 1);
    return counts;
  }, [cards]);

  if (!checklist || cards.length === 0) return null;

  const visible = filter === 'all' ? cards : cards.filter((c) => c.format === filter);
  const readyCount = cards.filter((c) => c.item.status === 'ready').length;
  const filters: FormatFilter[] = ['all', ...(['post', 'story', 'reel', 'carousel', 'ad', 'product'] as const)
    .filter((f) => (formatCounts.get(f) ?? 0) > 0)];

  return (
    <div style={{
      marginBottom: 16, borderRadius: 20, overflow: 'hidden',
      background: t.isDark
        ? 'linear-gradient(170deg, rgba(138,171,189,0.07), rgba(255,255,255,0.02) 45%)'
        : 'linear-gradient(170deg, rgba(77,112,136,0.06), rgba(0,0,0,0.015) 45%)',
      border: `0.5px solid ${t.isDark ? 'rgba(138,171,189,0.22)' : 'rgba(77,112,136,0.20)'}`,
      padding: '16px 14px 14px',
    }}>
      <style>{SHOWCASE_CSS}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{
          fontSize: 15, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.01em',
        }}>
          Üretilen içerikler
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: readyCount === cards.length ? '#10B981' : STEEL }}>
          {readyCount}
          <span style={{ color: t.textMuted, fontWeight: 600 }}>/{cards.length} hazır</span>
        </span>
      </div>
      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
        Her kartı çevirerek içerik detayını görün.
      </div>

      {/* Format filter chips */}
      {showFormatFilters && filters.length > 2 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {filters.map((f) => {
            const isActive = filter === f;
            const label = f === 'all' ? `Tümü ${cards.length}` : `${FORMAT_META[f].label} ${formatCounts.get(f) ?? 0}`;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  padding: '5px 11px', borderRadius: 20, cursor: 'pointer',
                  fontSize: 10, fontWeight: isActive ? 800 : 600,
                  border: isActive
                    ? '1px solid rgba(201,169,110,0.55)'
                    : `0.5px solid ${t.separator}`,
                  background: isActive ? 'rgba(201,169,110,0.12)' : 'transparent',
                  color: isActive ? GOLD : t.textMuted,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Flip-card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {visible.map((vm) => (
          <SlotFlipCard
            key={vm.key}
            vm={vm}
            index={cards.indexOf(vm)}
            onOpenArtifact={onOpenArtifact}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

// ── Completed mission list card ───────────────────────────────────────────────

function summarizeProducedKinds(artifacts: OutputArtifact[]): string | null {
  if (artifacts.length === 0) return null;
  const counts = new Map<FeedArtifactKind, number>();
  for (const a of artifacts) {
    const kind = detectFeedArtifactKind(a);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const order: Array<[FeedArtifactKind, string]> = [
    ['post', 'post'], ['story', 'story'], ['reel', 'reel'], ['carousel', 'carousel'], ['ad', 'reklam'],
  ];
  const parts = order
    .filter(([kind]) => (counts.get(kind) ?? 0) > 0)
    .map(([kind, label]) => `${counts.get(kind)} ${label}`);
  return parts.length > 0 ? parts.join(' · ') : `${artifacts.length} içerik`;
}

export function MissionCompletedCard({
  mission,
  artifacts,
  onTap,
  t,
  typeLabel,
  timeLabel,
  summaryFallback,
}: {
  mission: MissionSummary;
  artifacts: OutputArtifact[];
  onTap: () => void;
  t: T;
  typeLabel: string;
  timeLabel: string;
  summaryFallback?: string;
}) {
  const thumbs = useMemo(() => {
    const out: Array<{ id: string; url: string }> = [];
    for (const a of artifacts) {
      const url = resolveArtifactHubPreviewUrl(a);
      if (url) out.push({ id: a.id, url });
      if (out.length >= 5) break;
    }
    return out;
  }, [artifacts]);

  const producedSummary = summarizeProducedKinds(artifacts) ?? summaryFallback ?? null;
  const rate = mission.total_nodes > 0
    ? Math.round((mission.completed_nodes / mission.total_nodes) * 100)
    : 0;
  const clean = rate >= 80 && mission.failed_nodes === 0;
  const extraCount = Math.max(0, artifacts.length - thumbs.length);

  return (
    <button
      onClick={onTap}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: 0, borderRadius: 18, overflow: 'hidden',
        background: t.isDark ? 'rgba(255,255,255,0.035)' : '#fff',
        border: `0.5px solid ${t.separator}`,
      }}
    >
      {/* Filmstrip — produced visuals */}
      {thumbs.length > 0 && (
        <div style={{ display: 'flex', gap: 2, height: 74, background: t.isDark ? '#0C0F13' : '#101418' }}>
          {thumbs.map((th, i) => (
            <div key={th.id} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
              <SafeCoverImage
                src={th.url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {i === thumbs.length - 1 && extraCount > 0 && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'rgba(8,10,14,0.62)',
                  color: '#fff', fontSize: 13, fontWeight: 800,
                }}>
                  +{extraCount}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '12px 14px 13px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: clean ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.10)',
          border: clean ? '0.5px solid rgba(16,185,129,0.30)' : '0.5px solid rgba(245,158,11,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, color: clean ? '#10B981' : '#F59E0B',
        }}>
          {clean ? '✓' : '◔'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: t.textPrimary, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 3,
          }}>
            {mission.title}
          </div>
          {producedSummary && (
            <div style={{
              fontSize: 11, fontWeight: 600, marginBottom: 2,
              color: clean ? '#10B981' : t.textSecondary,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {producedSummary}
            </div>
          )}
          <div style={{ fontSize: 10, color: t.textMuted }}>
            {typeLabel} · {timeLabel}
          </div>
        </div>

        <span style={{ fontSize: 14, color: t.accent, flexShrink: 0 }}>›</span>
      </div>
    </button>
  );
}
