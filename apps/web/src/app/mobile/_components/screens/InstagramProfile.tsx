'use client';
/**
 * InstagramProfile — pixel-faithful Instagram profile clone for /mobile.
 *
 * Purpose (customer benefit): show the brand ONLY the content that was
 * approved + published through Smart Agency's own Akış (feed), laid out
 * exactly like a real Instagram profile grid. This lets the customer see how
 * the content WE produce looks together as a cohesive, on-brand whole —
 * separate from their real Instagram (which also holds their manual posts).
 *
 * Sector/tenant agnostic: everything is driven by the tenant brand context +
 * the approved artifact pool. No brand-specific branches.
 */
import React, { useMemo, useState } from 'react';
import { useTheme } from '../theme-context';
import { useTenantBrandContext } from '../TenantBrandProvider';
import { useMobileStore } from '../mobile-store';
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';
import { MOBILE_ARTIFACT_MISSION_POOL_LIMIT } from '../../_lib/mobile-artifacts';
import { filterFeedDisplayArtifacts } from '@/lib/weekly-publish-package';
import { isOrganicFeedArtifact } from '@/lib/ad-publish-utils';
import {
  detectFeedArtifactKind,
  resolveFeedProducedStillUrl,
  type FeedArtifactKind,
} from '@/lib/artifact-view-model';
import { resolveArtifactHubPreviewUrl } from '@/lib/content-calendar-artifact-link';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { SafeCoverImage } from '../SafeCoverImage';
import type { OutputArtifact } from '@/types';
import type { T } from '../theme-context';

type ProfileTab = 'grid' | 'reels' | 'tagged';

interface ProfileCardVm {
  artifact: OutputArtifact;
  kind: FeedArtifactKind;
  previewUrl: string | null;
  stillUrl: string | null;
}

function buildCard(artifact: OutputArtifact): ProfileCardVm {
  const still = resolveFeedProducedStillUrl(artifact);
  const hub = resolveArtifactHubPreviewUrl(artifact);
  return {
    artifact,
    kind: detectFeedArtifactKind(artifact),
    previewUrl: hub ?? still,
    stillUrl: still,
  };
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}b`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}b`;
  return String(n);
}

// ── Icons (Instagram-authentic stroke set) ─────────────────────────────────────
function GridIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="1.5" stroke={color} strokeWidth="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke={color} strokeWidth="2" />
    </svg>
  );
}
function ReelIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" stroke={color} strokeWidth="2" />
      <path d="M3 8h18M8 3l3 5M14 3l3 5" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M10.5 11.5v5l4.5-2.5-4.5-2.5z" fill={color} />
    </svg>
  );
}
function TaggedIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11z" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="10" r="2.4" stroke={color} strokeWidth="2" />
      <path d="M8 17c.6-2 2.1-3 4-3s3.4 1 4 3" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function MenuBarsIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 6h18M3 12h18M3 18h18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function PlusBoxIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke={color} strokeWidth="2" />
      <path d="M12 8v8M8 12h8" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── Grid cell ──────────────────────────────────────────────────────────────────
function GridCell({
  vm,
  aspect,
  onOpen,
}: {
  vm: ProfileCardVm;
  aspect: string;
  onOpen: (id: string) => void;
}) {
  const isReel = vm.kind === 'reel';
  const isCarousel = vm.kind === 'carousel';
  return (
    <button
      type="button"
      onClick={() => onOpen(vm.artifact.id)}
      style={{
        position: 'relative',
        aspectRatio: aspect,
        width: '100%',
        padding: 0,
        border: 'none',
        background: '#0d0d0d',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'block',
      }}
    >
      {vm.previewUrl ? (
        <SafeCoverImage
          src={vm.previewUrl}
          fallbacks={[vm.stillUrl]}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg,#1a1f26,#0d1116)', color: 'rgba(255,255,255,0.28)', fontSize: 24,
        }}>
          ◻
        </div>
      )}

      {(isReel || isCarousel) && (
        <div style={{ position: 'absolute', top: 6, right: 6, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))' }}>
          {isReel ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 8h18M8 3l3 5M14 3l3 5" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
              <path d="M10.5 10.5v6l5-3-5-3z" fill="#fff" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="7" y="3" width="14" height="14" rx="2.5" stroke="#fff" strokeWidth="2" />
              <rect x="3" y="7" width="14" height="14" rx="2.5" fill="#0d0d0d" stroke="#fff" strokeWidth="2" />
            </svg>
          )}
        </div>
      )}
    </button>
  );
}

function StatColumn({ value, label, t }: { value: string; label: string; t: T }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 17, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      <span style={{ fontSize: 13, color: t.textSecondary, fontWeight: 400 }}>{label}</span>
    </div>
  );
}

function TabButton({ active, onClick, children, ariaLabel }: {
  active: boolean; onClick: () => void; children: React.ReactNode; ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-selected={active}
      style={{
        flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', background: 'transparent', cursor: 'pointer',
        borderTop: active ? '1px solid currentColor' : '1px solid transparent',
        marginTop: -1, transition: 'opacity 150ms ease',
      }}
    >
      {children}
    </button>
  );
}

export function InstagramProfile() {
  const { t } = useTheme();
  const brand = useTenantBrandContext();
  const { navigate, openPlatformPreview } = useMobileStore();
  const [tab, setTab] = useState<ProfileTab>('grid');

  const { data: artifacts = [], isLoading } = useMobileArtifacts({
    params: { limit: MOBILE_ARTIFACT_MISSION_POOL_LIMIT },
    subscribeOnly: true,
  });

  const { gridCards, reelCards, storyCards } = useMemo(() => {
    // Only content the customer APPROVED for publishing via our app — this is
    // the "published through Smart Agency" set the screen is meant to showcase.
    const approved = artifacts.filter((a) => a.status === 'approved');
    const display = filterFeedDisplayArtifacts(approved).filter(isOrganicFeedArtifact);
    const cards = display.map(buildCard);
    const grid = cards.filter((c) => c.kind !== 'story');
    const reels = grid.filter((c) => c.kind === 'reel');
    const stories = cards.filter((c) => c.kind === 'story');
    return { gridCards: grid, reelCards: reels, storyCards: stories };
  }, [artifacts]);

  const logoUrl = brand.logoUrl ? (resolveClientMediaUrl(brand.logoUrl) ?? brand.logoUrl) : undefined;
  const monogram = (brand.brandName || 'B').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const handle = brand.displayHandle || brand.instagramHandle || 'markam';
  const category = brand.sectorLabel || brand.businessType || '';
  const bio = (brand.description || '').trim();

  const bg = t.bg;
  const borderCol = t.separator;
  const activeTabColor = t.textPrimary;

  const openIg = () => {
    if (typeof window !== 'undefined' && handle) {
      window.open(`https://instagram.com/${handle}`, '_blank', 'noopener,noreferrer');
    }
  };

  const activeCards = tab === 'grid' ? gridCards : tab === 'reels' ? reelCards : [];
  const cellAspect = tab === 'reels' ? '9 / 16' : '1 / 1';

  return (
    <div style={{ minHeight: '100dvh', background: bg, paddingBottom: 108 }}>
      {/* ── Top bar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(env(safe-area-inset-top,0px) + 10px) 14px 10px',
        background: bg,
        borderBottom: `0.5px solid ${borderCol}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
            <rect x="5" y="10" width="14" height="10" rx="2.5" stroke={t.textPrimary} strokeWidth="2" />
            <path d="M8 10V8a4 4 0 0 1 8 0v2" stroke={t.textPrimary} strokeWidth="2" />
          </svg>
          <span style={{
            fontSize: 20, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {handle}
          </span>
        </div>
        <button type="button" onClick={() => navigate('new-brief')} aria-label="İçerik üret"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <PlusBoxIcon color={t.textPrimary} size={25} />
        </button>
        <button type="button" onClick={() => navigate('more')} aria-label="Menü"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <MenuBarsIcon color={t.textPrimary} size={25} />
        </button>
      </header>

      {/* ── Header: avatar + stats ── */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 86, height: 86, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: logoUrl ? (t.isDark ? '#000' : '#fff') : 'linear-gradient(145deg,#4D7088,#8AABBD)',
            border: `0.5px solid ${borderCol}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em' }}>{monogram}</span>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-around', gap: 4 }}>
            <StatColumn value={formatCount(gridCards.length)} label="gönderi" t={t} />
            <StatColumn value={formatCount(reelCards.length)} label="reels" t={t} />
            <StatColumn value={formatCount(storyCards.length)} label="hikaye" t={t} />
          </div>
        </div>

        {/* Name + category + bio */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.01em' }}>
            {brand.brandName || 'Markanız'}
          </div>
          {category && (
            <div style={{ fontSize: 14, color: t.textSecondary, marginTop: 1 }}>{category}</div>
          )}
          {bio && (
            <div style={{ fontSize: 14, color: t.textPrimary, marginTop: 3, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
              {bio.length > 160 ? `${bio.slice(0, 160)}…` : bio}
            </div>
          )}
          {brand.location && (
            <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" stroke={t.textSecondary} strokeWidth="2" strokeLinejoin="round" />
                <circle cx="12" cy="10" r="2.4" stroke={t.textSecondary} strokeWidth="2" />
              </svg>
              {brand.location}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" onClick={openIg} style={actionBtnStyle(t, true)}>
            Instagram'da Aç
          </button>
          <button type="button" onClick={() => navigate('missions')} style={actionBtnStyle(t, false)}>
            İçerik Planı
          </button>
        </div>

        {/* Purpose caption */}
        <div style={{
          marginTop: 14, padding: '9px 12px', borderRadius: 10,
          background: t.isDark ? 'rgba(138,171,189,0.08)' : 'rgba(77,112,136,0.06)',
          border: `0.5px solid ${t.isDark ? 'rgba(138,171,189,0.18)' : 'rgba(77,112,136,0.14)'}`,
          fontSize: 11.5, color: t.textSecondary, lineHeight: 1.45,
        }}>
          Bu galeri yalnızca Smart Agency üzerinden <strong style={{ color: t.textPrimary, fontWeight: 600 }}>onaylayıp
          yayınladığınız</strong> içeriklerden oluşur — markanızın bütünlüğünü tek ekranda gösterir.
        </div>
      </div>

      {/* Story highlights */}
      {storyCards.length > 0 && (
        <div style={{
          display: 'flex', gap: 16, overflowX: 'auto', padding: '18px 16px 6px',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        }}>
          {storyCards.slice(0, 12).map((c, i) => (
            <button
              key={c.artifact.id}
              type="button"
              onClick={() => openPlatformPreview(c.artifact.id)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, flexShrink: 0, width: 64 }}
            >
              <div style={{
                width: 64, height: 64, borderRadius: '50%', padding: 2,
                border: `1px solid ${borderCol}`, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: '#0d0d0d' }}>
                  {c.previewUrl && (
                    <SafeCoverImage src={c.previewUrl} fallbacks={[c.stillUrl]} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
              </div>
              <div style={{
                fontSize: 11, color: t.textPrimary, marginTop: 5, textAlign: 'center',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Hikaye {i + 1}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div style={{
        display: 'flex', marginTop: 12, borderTop: `0.5px solid ${borderCol}`,
        color: activeTabColor,
      }}>
        <TabButton active={tab === 'grid'} onClick={() => setTab('grid')} ariaLabel="Gönderiler">
          <GridIcon color={tab === 'grid' ? activeTabColor : t.textMuted} />
        </TabButton>
        <TabButton active={tab === 'reels'} onClick={() => setTab('reels')} ariaLabel="Reels">
          <ReelIcon color={tab === 'reels' ? activeTabColor : t.textMuted} />
        </TabButton>
        <TabButton active={tab === 'tagged'} onClick={() => setTab('tagged')} ariaLabel="Etiketli">
          <TaggedIcon color={tab === 'tagged' ? activeTabColor : t.textMuted} />
        </TabButton>
      </div>

      {/* Content */}
      {isLoading && gridCards.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '1 / 1', background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' }} />
          ))}
        </div>
      ) : activeCards.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
          {activeCards.map((c) => (
            <GridCell key={c.artifact.id} vm={c} aspect={cellAspect} onOpen={openPlatformPreview} />
          ))}
        </div>
      ) : (
        <EmptyState tab={tab} t={t} onCreate={() => navigate('new-brief')} />
      )}
    </div>
  );
}

function actionBtnStyle(t: T, primary: boolean): React.CSSProperties {
  return {
    flex: 1, height: 34, borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600,
    letterSpacing: '-0.01em',
    color: primary ? '#fff' : t.textPrimary,
    background: primary
      ? 'linear-gradient(135deg,#4D7088,#6A8EA0)'
      : (t.isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)'),
    border: primary ? 'none' : `0.5px solid ${t.separator}`,
    boxShadow: primary ? '0 4px 14px rgba(77,112,136,0.3)' : 'none',
  };
}

function EmptyState({ tab, t, onCreate }: { tab: ProfileTab; t: T; onCreate: () => void }) {
  const copy = tab === 'tagged'
    ? { title: 'Henüz etiketli içerik yok', sub: 'Etiketlendiğiniz içerikler burada görünür.' }
    : tab === 'reels'
      ? { title: 'Henüz Reels yok', sub: 'Onaylanan reels içerikleriniz burada listelenir.' }
      : { title: 'Henüz gönderi yok', sub: 'Akış sayfasından bir içeriği onaylayıp paylaşın — burada Instagram profili gibi görünür.' };
  return (
    <div style={{ padding: '54px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 68, height: 68, borderRadius: '50%',
        border: `2px solid ${t.textPrimary}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="6.5" width="18" height="13" rx="3" stroke={t.textPrimary} strokeWidth="1.6" />
          <circle cx="12" cy="13" r="3.4" stroke={t.textPrimary} strokeWidth="1.6" />
          <path d="M8.5 6.5 9.8 4h4.4l1.3 2.5" stroke={t.textPrimary} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.03em' }}>{copy.title}</div>
      <div style={{ fontSize: 13.5, color: t.textSecondary, lineHeight: 1.5, maxWidth: 280 }}>{copy.sub}</div>
      {tab === 'grid' && (
        <button type="button" onClick={onCreate} style={{
          marginTop: 8, padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 700, color: '#fff',
          background: 'linear-gradient(135deg,#4D7088,#6A8EA0)',
        }}>
          İçerik üret
        </button>
      )}
    </div>
  );
}
