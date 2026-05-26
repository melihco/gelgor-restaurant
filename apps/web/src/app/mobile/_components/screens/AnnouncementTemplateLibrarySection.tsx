'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { T } from '../theme-context';
import {
  AGENCY_TEMPLATE_CATALOG,
  DEFAULT_ANNOUNCEMENT_PREFERENCES,
  TEMPLATE_FAMILIES,
  getSectorCollection,
  getTemplateById,
  isGenericAnnouncementDefaults,
  searchTemplates,
  sectorDefaultPreferences,
  favoriteTemplateIds,
  getFavoriteTemplateIds,
  getFavoriteTemplates,
  getRecentTemplates,
  isFavoriteTemplate,
  recordTemplateUsage,
  toggleFavoriteTemplate,
  type AnnouncementContentFormat,
  type AnnouncementLibraryPreferences,
  type AnnouncementTemplateDefinition,
  type AnnouncementTemplateId,
  type AnnouncementUseCase,
  parseAnnouncementPreferences,
} from '@/lib/announcement-template-library';
import {
  resolveAnnouncementBrandKit,
  type AnnouncementBrandKit,
} from '@/lib/announcement-brand-kit';

const USE_CASES: { id: AnnouncementUseCase; label: string; sub: string }[] = [
  { id: 'event', label: 'Etkinlik', sub: 'DJ, konser, özel gün' },
  { id: 'campaign', label: 'Kampanya', sub: 'Promosyon, fırsat, indirim' },
  { id: 'announcement', label: 'Duyuru', sub: 'Genel duyuru, haber' },
];

function PreviewMock({
  template,
  accent,
  t,
  active,
}: {
  template: AnnouncementTemplateDefinition;
  accent: string;
  t: T;
  active: boolean;
}) {
  const isStory = true;
  const h = isStory ? 120 : 100;
  const w = 68;

  const gradientStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: template.previewHint === 'top_center' ? undefined : 0,
    top: template.previewHint === 'top_center' ? 0 : undefined,
    height: template.previewHint === 'minimal' ? '22%' : template.previewHint === 'top_center' ? '42%' : '38%',
    background: template.previewHint === 'top_center'
      ? 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)'
      : 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
  };

  const diagonalStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(135deg, transparent 40%, rgba(0,0,0,0.65) 100%)',
  };

  const frostedStyle: React.CSSProperties = {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 12,
    height: '36%',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
  };

  const frameStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 6,
    borderRadius: 4,
    border: `1px solid ${accent}`,
    opacity: 0.55,
  };

  const badgeStyle: React.CSSProperties = {
    position: 'absolute',
    top: 10,
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: 7,
    padding: '2px 6px',
    borderRadius: 8,
    background: accent,
    color: '#fff',
    fontWeight: 700,
  };

  const bandStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '24%',
    background: accent,
    opacity: 0.9,
  };

  const colorSplitStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    background: accent,
    opacity: 0.88,
  };

  const leftPanelStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '44%',
    background: accent,
    opacity: 0.85,
  };

  const neonStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: `linear-gradient(180deg, ${accent}88 0%, rgba(0,0,0,0.55) 100%)`,
  };

  const stampStyle: React.CSSProperties = {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: accent,
    border: '1px solid rgba(255,255,255,0.35)',
  };

  const magazineStyle: React.CSSProperties = {
    position: 'absolute',
    right: 6,
    top: '28%',
    fontSize: 28,
    fontWeight: 800,
    color: accent,
    opacity: 0.2,
    lineHeight: 1,
  };

  const isPoster = ['lineup', 'festival', 'gala', 'dj_set', 'promo'].includes(template.previewHint);
  const skipGradient = ['accent_band', 'diagonal', 'frosted', 'frame', 'color_split', 'neon', 'script', ...( isPoster ? [template.previewHint] : [])].includes(template.previewHint);

  const lineupPreview = (template.previewHint === 'lineup' || template.previewHint === 'festival') ? (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 100%)' }}>
      <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 9, background: accent, opacity: 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 5, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>VENUE</span>
      </div>
      <div style={{ position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>HEADLINER</div>
        <div style={{ width: '60%', height: 1, background: accent, opacity: 0.5, margin: '3px auto' }} />
        <div style={{ fontSize: 6, fontWeight: 600, color: '#fff', opacity: 0.82 }}>Artist 2 · Artist 3</div>
        <div style={{ fontSize: 5, fontWeight: 500, color: '#fff', opacity: 0.6, marginTop: 2 }}>Artist 4 · Artist 5</div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: accent, opacity: 0.85, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 4.5, fontWeight: 600, color: '#fff', letterSpacing: 0.5 }}>TARİH · MEKAN</span>
      </div>
    </div>
  ) : null;

  const galaPreview = template.previewHint === 'gala' ? (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.55) 100%)' }}>
      <div style={{ position: 'absolute', inset: 6, border: `1px solid ${accent}`, opacity: 0.35, borderRadius: 3 }} />
      <div style={{ position: 'absolute', inset: 10, border: `0.5px solid ${accent}`, opacity: 0.22, borderRadius: 2 }} />
      {/* Corner ornament lines */}
      <div style={{ position: 'absolute', top: 5, left: 5, width: 10, height: 1, background: accent, opacity: 0.4 }} />
      <div style={{ position: 'absolute', top: 5, left: 5, width: 1, height: 10, background: accent, opacity: 0.4 }} />
      <div style={{ position: 'absolute', top: 5, right: 5, width: 10, height: 1, background: accent, opacity: 0.4 }} />
      <div style={{ position: 'absolute', top: 5, right: 5, width: 1, height: 10, background: accent, opacity: 0.4 }} />
      <div style={{ position: 'absolute', textAlign: 'center', top: '32%', left: 0, right: 0 }}>
        <div style={{ fontSize: 4.5, fontWeight: 600, color: accent, letterSpacing: 2, opacity: 0.7 }}>★ ★ ★</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', fontStyle: 'italic', marginTop: 4, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>Gala Night</div>
        <div style={{ width: '50%', height: 1, background: accent, opacity: 0.4, margin: '4px auto' }} />
        <div style={{ fontSize: 5, color: '#fff', opacity: 0.7, marginTop: 2 }}>TARİH · MEKAN</div>
      </div>
    </div>
  ) : null;

  const djPreview = template.previewHint === 'dj_set' ? (
    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${accent}99 0%, rgba(0,0,0,0.65) 100%)` }}>
      <div style={{ position: 'absolute', top: '20%', left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: '#fff', letterSpacing: 1, textShadow: `0 0 12px ${accent}` }}>DJ NAME</div>
        <div style={{ width: '55%', height: 1, background: accent, opacity: 0.5, margin: '3px auto' }} />
        <div style={{ fontSize: 5.5, fontWeight: 500, color: '#fff', opacity: 0.75, marginTop: 3 }}>SUPPORT · ACTS</div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 4.5, fontWeight: 500, color: '#fff', opacity: 0.8, letterSpacing: 0.5 }}>TARİH · MEKAN</span>
      </div>
    </div>
  ) : null;

  const promoPreview = template.previewHint === 'promo' ? (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%', background: accent, opacity: 0.9 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.3) 100%)' }} />
      <div style={{ position: 'absolute', top: '28%', left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>%50</div>
        <div style={{ fontSize: 6, fontWeight: 600, color: '#fff', marginTop: 2 }}>İNDİRİM</div>
      </div>
      <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ fontSize: 4.5, fontWeight: 600, color: '#fff', letterSpacing: 0.5 }}>DETAY · BİLGİ</span>
      </div>
    </div>
  ) : null;

  return (
    <div style={{
      width: w,
      height: h,
      borderRadius: 10,
      overflow: 'hidden',
      position: 'relative',
      background: 'linear-gradient(160deg, #4a7c9e 0%, #87CEEB 45%, #2d5016 100%)',
      border: active ? `2px solid ${t.accent}` : `1px solid ${t.separator}`,
      flexShrink: 0,
    }}>
      {lineupPreview}
      {galaPreview}
      {djPreview}
      {promoPreview}
      {template.previewHint !== 'accent_band' && !skipGradient && (
        <div style={gradientStyle} />
      )}
      {template.previewHint === 'color_split' && <div style={colorSplitStyle} />}
      {template.family === 'color_split' && template.previewHint === 'color_split' && template.nameTr.includes('Sol') && (
        <div style={leftPanelStyle} />
      )}
      {template.previewHint === 'neon' && <div style={neonStyle} />}
      {template.previewHint === 'stamp' && <div style={stampStyle} />}
      {template.previewHint === 'magazine' && <div style={magazineStyle}>15</div>}
      {template.previewHint === 'diagonal' && <div style={diagonalStyle} />}
      {template.previewHint === 'frosted' && (
        <>
          <div style={{ ...gradientStyle, height: '30%' }} />
          <div style={frostedStyle} />
        </>
      )}
      {template.previewHint === 'frame' && (
        <>
          <div style={gradientStyle} />
          <div style={frameStyle} />
        </>
      )}
      {template.previewHint === 'top_badge' && <div style={badgeStyle}>TARİH</div>}
      {template.previewHint === 'top_center' && (
        <div style={{ ...badgeStyle, top: 28, background: 'transparent', color: '#fff', fontWeight: 800 }}>BAŞLIK</div>
      )}
      {template.previewHint === 'accent_band' && <div style={bandStyle} />}
      {template.previewHint === 'vignette' && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 65%, transparent 30%, rgba(0,0,0,0.45) 100%)' }} />
      )}
      {template.previewHint === 'bottom_left' && (
        <div style={{ position: 'absolute', left: 6, bottom: 14, width: 2, height: 24, background: accent }} />
      )}
      {!isPoster && (
        <div style={{
          position: 'absolute',
          bottom: template.previewHint === 'accent_band' ? 8 : template.previewHint === 'top_center' ? undefined : 16,
          top: template.previewHint === 'top_center' ? 42 : undefined,
          left: template.previewHint === 'bottom_left' || template.previewHint === 'magazine' ? 12 : '50%',
          transform: template.previewHint === 'bottom_left' || template.previewHint === 'magazine' ? 'none' : 'translateX(-50%)',
          fontSize: template.previewHint === 'script' ? 9 : 8,
          fontWeight: 700,
          fontStyle: template.previewHint === 'script' ? 'italic' : 'normal',
          color: '#fff',
          letterSpacing: 0.5,
          textAlign: template.previewHint === 'bottom_left' || template.previewHint === 'magazine' ? 'left' : 'center',
          textShadow: template.previewHint === 'neon' ? `0 0 8px ${accent}` : '0 1px 4px rgba(0,0,0,0.5)',
        }}>
          BAŞLIK
        </div>
      )}
    </div>
  );
}

export function AnnouncementTemplateLibrarySection({
  t,
  tenantId,
  brandKit,
  samplePhotoUrl,
  sectorId,
}: {
  t: T;
  tenantId: string | null;
  brandKit: AnnouncementBrandKit;
  samplePhotoUrl?: string | null;
  sectorId?: string | null;
}) {
  const sectorPack = getSectorCollection(sectorId);
  const [prefs, setPrefs] = useState<AnnouncementLibraryPreferences>({ ...DEFAULT_ANNOUNCEMENT_PREFERENCES });
  const accentColor = brandKit.accentColor;
  const [activeUseCase, setActiveUseCase] = useState<AnnouncementUseCase>('event');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [hasCustomPrefs, setHasCustomPrefs] = useState(false);

  const [familyFilter, setFamilyFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorPackOnly, setSectorPackOnly] = useState(true);
  const [favIds, setFavIds] = useState<AnnouncementTemplateId[]>([]);
  const [showFavoritesSection, setShowFavoritesSection] = useState(true);

  useEffect(() => {
    setFavIds(getFavoriteTemplateIds(tenantId ?? undefined));
  }, [tenantId]);

  const handleToggleFavorite = useCallback((templateId: AnnouncementTemplateId) => {
    toggleFavoriteTemplate(templateId, tenantId ?? undefined);
    setFavIds(getFavoriteTemplateIds(tenantId ?? undefined));
  }, [tenantId]);

  const handleSelectTemplate = useCallback((templateId: AnnouncementTemplateId) => {
    recordTemplateUsage(templateId, tenantId ?? undefined);
    setPrefs((p) => ({ ...p, [activeUseCase]: templateId }));
  }, [tenantId, activeUseCase]);

  const favoriteTemplates = useMemo(
    () => getFavoriteTemplates(tenantId ?? undefined).filter((t) => t.useCases.includes(activeUseCase)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, activeUseCase, favIds],
  );

  const recentTemplates = useMemo(
    () => getRecentTemplates(tenantId ?? undefined).filter((t) => t.useCases.includes(activeUseCase)).slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, activeUseCase, prefs],
  );

  const loadPrefs = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/brand-context/${tenantId}/announcement-templates`, {
        headers: { 'X-Tenant-Id': tenantId },
      });
      if (r.ok) {
        const data = await r.json();
        const parsed = parseAnnouncementPreferences(data.preferences);
        const isGeneric = isGenericAnnouncementDefaults(parsed);
        if (isGeneric && sectorId) {
          const sectorDefaults = sectorDefaultPreferences(sectorId);
          setPrefs(sectorDefaults);
          setHasCustomPrefs(false);
        } else {
          setPrefs(parsed);
          setHasCustomPrefs(!isGeneric);
        }
      }
    } catch { /* defaults */ }
    setLoading(false);
  }, [tenantId, sectorId]);

  useEffect(() => { void loadPrefs(); }, [loadPrefs]);

  const savePrefs = async () => {
    if (!tenantId) return;
    setSaving(true);
    setStatus('Kaydediliyor…');
    try {
      const r = await fetch(`/api/brand-context/${tenantId}/announcement-templates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({
          event: prefs.event,
          campaign: prefs.campaign,
          announcement: prefs.announcement,
          default_format: prefs.defaultFormat,
        }),
      });
      if (r.ok) {
        setStatus('Tasarım tercihleri kaydedildi ✓');
        setHasCustomPrefs(true);
      } else {
        setStatus('Kayıt başarısız');
      }
    } catch {
      setStatus('Bağlantı hatası');
    }
    setSaving(false);
    setTimeout(() => setStatus(''), 3000);
  };

  const generatePreview = async (templateId: AnnouncementTemplateId) => {
    if (!samplePhotoUrl) {
      setStatus('Önizleme için galeriden en az bir fotoğraf gerekli');
      setTimeout(() => setStatus(''), 3000);
      return;
    }
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const r = await fetch('/api/generate-event-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrl: samplePhotoUrl,
          contentType: prefs.defaultFormat,
          templateId,
          brandName: brandKit.brandName || 'MARKA',
          artistName: 'ÖRNEK ETKİNLİK',
          date: 'CUM 15 AĞUSTOS',
          time: '22:00',
          venueArea: 'BEACH',
          tagline: 'Unutulmaz bir gece',
          enhancePhoto: false,
          workspaceId: tenantId ?? undefined,
          brandKit,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const data = await r.json();
      if (r.ok && data.imageUrl) setPreviewUrl(data.imageUrl);
      else setStatus(data.error ?? 'Önizleme üretilemedi');
    } catch {
      setStatus('Önizleme hatası');
    }
    setPreviewLoading(false);
  };

  const applySectorDefaults = () => {
    const next = sectorDefaultPreferences(sectorId);
    setPrefs(next);
    const favAdded = favoriteTemplateIds(sectorPack.templateIds, tenantId ?? undefined);
    setFavIds(getFavoriteTemplateIds(tenantId ?? undefined));
    setShowFavoritesSection(true);
    const favNote = favAdded > 0
      ? ` ${favAdded} şablon favorilere eklendi.`
      : ' Sektör paketi zaten favorilerinizde.';
    setStatus(`${sectorPack.labelTr} paketi uygulandı —${favNote} Kaydetmeyi unutmayın.`);
    setTimeout(() => setStatus(''), 4500);
  };

  const selectedId = prefs[activeUseCase];
  const sectorTemplateSet = useMemo(
    () => new Set(sectorPack.picks[activeUseCase]),
    [sectorPack, activeUseCase],
  );
  const totalForUseCase = useMemo(
    () => searchTemplates(searchQuery, activeUseCase, undefined, undefined, sectorId, sectorPackOnly).length,
    [searchQuery, activeUseCase, sectorId, sectorPackOnly],
  );
  const candidates = useMemo(
    () => searchTemplates(searchQuery, activeUseCase, familyFilter || undefined, undefined, sectorId, sectorPackOnly),
    [searchQuery, activeUseCase, familyFilter, sectorId, sectorPackOnly],
  );

  return (
    <div style={{
      padding: 16,
      borderRadius: 16,
      background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      border: `0.5px solid ${t.separator}`,
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>Duyuru Tasarım Kütüphanesi</div>
          <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 4, lineHeight: 1.4 }}>
            Ajans seviyesinde 200 overlay şablonu — 20 layout ailesi, Pinterest/Dribbble trendlerinden ilham. Konser lineup, festival afiş, gala davetiye, DJ night ve promo banner dahil.
          </div>
        </div>
        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: t.accentDim, color: t.accent, fontWeight: 600 }}>
          {AGENCY_TEMPLATE_CATALOG.length} şablon
        </span>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        marginBottom: 14,
        padding: '10px 12px',
        borderRadius: 12,
        background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        border: `0.5px solid ${t.separator}`,
      }}>
        {brandKit.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandKit.logoUrl} alt="" style={{ height: 22, maxWidth: 56, objectFit: 'contain' }} />
        )}
        <span style={{ width: 14, height: 14, borderRadius: 4, background: brandKit.primaryColor, border: `1px solid ${t.separator}` }} title="Primary" />
        <span style={{ width: 14, height: 14, borderRadius: 4, background: brandKit.accentColor, border: `1px solid ${t.separator}` }} title="Accent" />
        <span style={{ fontSize: 11, color: t.textSecondary }}>
          {brandKit.headingFontStack.split(',')[0]?.replace(/'/g, '')} · tenant renkleri
        </span>
        <span style={{ fontSize: 10, color: t.textMuted, marginLeft: 'auto' }}>{brandKit.themeSource}</span>
      </div>

      {/* Sector collection package */}
      <div style={{
        marginBottom: 14,
        padding: '12px 14px',
        borderRadius: 14,
        border: `0.5px solid ${t.accent}`,
        background: t.accentDim,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>{sectorPack.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>
              {sectorPack.labelTr} Koleksiyon Paketi
            </div>
            <div style={{ fontSize: 11, color: t.textSecondary, marginTop: 3, lineHeight: 1.4 }}>
              {sectorPack.descriptionTr}
            </div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4, fontStyle: 'italic', lineHeight: 1.35 }}>
              {sectorPack.creativeDirectionTr}
            </div>
          </div>
        </div>
        {!hasCustomPrefs && (
          <div style={{ fontSize: 10, color: t.warning, marginBottom: 8 }}>
            Henüz özelleştirilmiş tercih yok — sektör paketini uygulayıp kaydedin.
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={applySectorDefaults}
            style={{
              padding: '7px 12px',
              borderRadius: 10,
              border: 'none',
              background: t.accent,
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Sektör önerilerini uygula
          </button>
          <button
            type="button"
            onClick={() => setSectorPackOnly((v) => !v)}
            style={{
              padding: '7px 12px',
              borderRadius: 10,
              border: `0.5px solid ${sectorPackOnly ? t.accent : t.separator}`,
              background: sectorPackOnly ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: sectorPackOnly ? t.accent : t.textMuted,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {sectorPackOnly ? `Sektör paketi (${sectorPack.templateIds.length})` : 'Tüm kütüphane'}
          </button>
        </div>
      </div>

      {/* Use case tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
        {USE_CASES.map((uc) => {
          const active = activeUseCase === uc.id;
          return (
            <button
              key={uc.id}
              type="button"
              onClick={() => setActiveUseCase(uc.id)}
              style={{
                flex: '1 0 auto',
                minWidth: 100,
                padding: '10px 12px',
                borderRadius: 12,
                border: active ? `1px solid ${t.accent}` : `0.5px solid ${t.separator}`,
                background: active ? t.accentDim : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: active ? t.accent : t.textPrimary }}>{uc.label}</div>
              <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{uc.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Search + family filter */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Şablon ara (lüks, minimal, gece…)"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: `0.5px solid ${t.separator}`,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
            color: t.textPrimary,
            fontSize: 12,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          <button
            type="button"
            onClick={() => setFamilyFilter('')}
            style={{
              flex: '0 0 auto',
              padding: '6px 10px',
              borderRadius: 20,
              border: `0.5px solid ${!familyFilter ? t.accent : t.separator}`,
              background: !familyFilter ? t.accentDim : 'transparent',
              color: !familyFilter ? t.accent : t.textMuted,
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Tümü ({totalForUseCase})
          </button>
          {TEMPLATE_FAMILIES.map((fam) => (
            <button
              key={fam.id}
              type="button"
              onClick={() => setFamilyFilter(fam.id === familyFilter ? '' : fam.id)}
              style={{
                flex: '0 0 auto',
                padding: '6px 10px',
                borderRadius: 20,
                border: `0.5px solid ${familyFilter === fam.id ? t.accent : t.separator}`,
                background: familyFilter === fam.id ? t.accentDim : 'transparent',
                color: familyFilter === fam.id ? t.accent : t.textMuted,
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {fam.labelTr}
            </button>
          ))}
        </div>
      </div>

      {/* Favorites section */}
      {favoriteTemplates.length > 0 && showFavoritesSection && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary }}>
              ★ Favorileriniz ({favoriteTemplates.length})
            </div>
            <button
              type="button"
              onClick={() => setShowFavoritesSection(false)}
              style={{ background: 'none', border: 'none', fontSize: 10, color: t.textMuted, cursor: 'pointer' }}
            >
              Gizle
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
            {favoriteTemplates.map((tmpl) => (
              <div key={tmpl.id} style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  onClick={() => handleSelectTemplate(tmpl.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <PreviewMock template={tmpl} accent={accentColor} t={t} active={prefs[activeUseCase] === tmpl.id} />
                </div>
                <div style={{
                  fontSize: 8,
                  fontWeight: 600,
                  color: prefs[activeUseCase] === tmpl.id ? t.accent : t.textMuted,
                  textAlign: 'center',
                  marginTop: 3,
                  maxWidth: 68,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {tmpl.icon} {tmpl.nameTr.split(' · ')[0]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently used */}
      {recentTemplates.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
            Son kullanılanlar
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
            {recentTemplates.map((tmpl) => (
              <div key={tmpl.id} style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  onClick={() => handleSelectTemplate(tmpl.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <PreviewMock template={tmpl} accent={accentColor} t={t} active={prefs[activeUseCase] === tmpl.id} />
                </div>
                <div style={{
                  fontSize: 8,
                  fontWeight: 600,
                  color: prefs[activeUseCase] === tmpl.id ? t.accent : t.textMuted,
                  textAlign: 'center',
                  marginTop: 3,
                  maxWidth: 68,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {tmpl.icon} {tmpl.nameTr.split(' · ')[0]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Template grid — scrollable 2-column */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
        maxHeight: 420,
        overflowY: 'auto',
        paddingRight: 4,
        marginBottom: 12,
      }}>
        {candidates.map((tmpl) => {
          const selected = selectedId === tmpl.id;
          const isFav = favIds.includes(tmpl.id);
          return (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => handleSelectTemplate(tmpl.id)}
              style={{
                padding: 10,
                borderRadius: 14,
                border: selected ? `2px solid ${t.accent}` : `0.5px solid ${t.separator}`,
                background: selected ? t.accentDim : (t.isDark ? 'rgba(255,255,255,0.02)' : '#fff'),
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
              }}
            >
              {/* Favorite toggle */}
              <div
                onClick={(e) => { e.stopPropagation(); handleToggleFavorite(tmpl.id); }}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: 13,
                  opacity: isFav ? 1 : 0.35,
                  zIndex: 2,
                }}
                title={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
              >
                {isFav ? '★' : '☆'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <PreviewMock template={tmpl} accent={accentColor} t={t} active={selected} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textPrimary, lineHeight: 1.25 }}>
                {tmpl.icon} {tmpl.nameTr}
                {sectorTemplateSet.has(tmpl.id) && (
                  <span style={{
                    marginLeft: 4,
                    fontSize: 8,
                    padding: '1px 4px',
                    borderRadius: 4,
                    background: t.accentDim,
                    color: t.accent,
                    fontWeight: 700,
                    verticalAlign: 'middle',
                  }}>
                    ÖNERİ
                  </span>
                )}
                {isFav && (
                  <span style={{
                    marginLeft: 3,
                    fontSize: 8,
                    padding: '1px 4px',
                    borderRadius: 4,
                    background: '#FFD700',
                    color: '#000',
                    fontWeight: 700,
                    verticalAlign: 'middle',
                  }}>
                    FAV
                  </span>
                )}
              </div>
              <div style={{ fontSize: 9, color: t.textMuted, marginTop: 4, lineHeight: 1.3 }}>
                {tmpl.collection} · {tmpl.descriptionTr.split(' Varyant')[0]}
              </div>
            </button>
          );
        })}
      </div>

      {candidates.length === 0 && (
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12, textAlign: 'center' }}>
          Aramanızla eşleşen şablon bulunamadı.
        </div>
      )}

      {/* Default format + actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: t.textSecondary, display: 'flex', alignItems: 'center', gap: 8 }}>
          Varsayılan format
          <select
            value={prefs.defaultFormat}
            onChange={(e) => setPrefs((p) => ({ ...p, defaultFormat: e.target.value as AnnouncementContentFormat }))}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: `0.5px solid ${t.separator}`,
              background: 'transparent',
              color: t.textPrimary,
              fontSize: 12,
            }}
          >
            <option value="story">Story (9:16)</option>
            <option value="post">Post (4:5)</option>
            <option value="square">Kare (1:1)</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void generatePreview(selectedId)}
          disabled={previewLoading || !samplePhotoUrl}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            border: `0.5px solid ${t.separator}`,
            background: 'transparent',
            color: t.textSecondary,
            fontSize: 12,
            fontWeight: 600,
            cursor: samplePhotoUrl ? 'pointer' : 'not-allowed',
            opacity: samplePhotoUrl ? 1 : 0.5,
          }}
        >
          {previewLoading ? 'Önizleniyor…' : 'Canlı önizle'}
        </button>
        <button
          type="button"
          onClick={() => void savePrefs()}
          disabled={saving || loading || !tenantId}
          style={{
            padding: '8px 16px',
            borderRadius: 10,
            border: 'none',
            background: t.accent,
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          {saving ? 'Kaydediliyor…' : 'Tercihleri Kaydet'}
        </button>
      </div>

      {status && (
        <div style={{ fontSize: 12, color: status.includes('✓') ? t.success : t.warning, marginBottom: 8 }}>{status}</div>
      )}

      {previewUrl && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>Canlı önizleme — {getTemplateById(selectedId).nameTr}</div>
          <img
            src={previewUrl}
            alt="Şablon önizleme"
            style={{
              width: '100%',
              maxWidth: 280,
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
              borderRadius: 12,
              border: `0.5px solid ${t.separator}`,
            }}
          />
        </div>
      )}

      {!samplePhotoUrl && (
        <div style={{ fontSize: 11, color: t.textMuted, fontStyle: 'italic' }}>
          Canlı önizleme için Galeri sekmesinden mekan fotoğrafı yükleyin.
        </div>
      )}
    </div>
  );
}
