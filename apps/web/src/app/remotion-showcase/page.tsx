'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BRAND_SHOWCASE_PRESETS,
  MOTION_STYLE_LABELS,
  SHOWCASE_VIBE_GROUPS,
  listShowcasePresetEntriesByGroup,
  resolveShowcaseBrandKit,
  showcaseKitIdForCatalog,
  type ShowcaseBrandContext,
} from '@/lib/brand-showcase-presets';
import { filterAgencyVibePicks, isAgencyVibePick } from '@/lib/agency-vibe-picks';
import { BrandDiversifyPanel, showcaseManifestKey } from './BrandDiversifyPanel';

interface ShowcaseItem {
  id: string;
  kind: 'video' | 'still';
  url?: string;
  headline?: string;
  error?: string;
  durationMs?: number | null;
  templateId?: string;
  kitId?: string;
  collection?: string;
}

interface CatalogTemplate {
  id: string;
  kind?: 'story' | 'poster';
  family: string;
  collection: string;
  nameTr: string;
  nameEn: string;
  tags: string[];
  formats?: string[];
  slotKey?: string;
  slotLabel?: string;
  slotNumber?: number;
  kitId?: string;
  useCase?: string;
  evaluation?: {
    font: Record<string, unknown>;
    background: Record<string, unknown>;
    design: Record<string, unknown>;
    color: Record<string, unknown>;
  };
}

interface BrandKit {
  id: string;
  name: string;
  sector: string;
  primaryColor: string;
  accentColor: string;
  headingFont: string;
  librarySlotCount?: number;
}

interface CatalogResponse {
  summary: {
    kitCount: number;
    brandLibrarySlots?: number;
    perBrandDesignCount?: number;
  };
  templates: CatalogTemplate[];
  storyTemplates?: CatalogTemplate[];
  brandKits: BrandKit[];
  workspaceId?: string;
  usesSavedLibrary?: boolean;
  brandLibrary?: { kitId: string; locked?: boolean };
}

function TemplateCard({
  template,
  rendered,
  kitId,
  kit,
  presetKey,
  workspaceId,
  highlighted = false,
  cardRef,
  autoPreview = false,
  autoPreviewDelayMs = 0,
  canStartAutoPreview = false,
  onAutoPreviewStart,
  onAutoPreviewEnd,
  allowFallbackPreview = true,
  onRendered,
}: {
  template: CatalogTemplate;
  rendered?: ShowcaseItem;
  kitId: string;
  kit: BrandKit;
  presetKey?: string | null;
  workspaceId?: string | null;
  highlighted?: boolean;
  cardRef?: (el: HTMLElement | null) => void;
  autoPreview?: boolean;
  autoPreviewDelayMs?: number;
  canStartAutoPreview?: boolean;
  onAutoPreviewStart?: () => void;
  onAutoPreviewEnd?: () => void;
  /** Agency katalogda 48 kart — otomatik MP4 denemesi tarayıcıyı kilitler */
  allowFallbackPreview?: boolean;
  onRendered: (id: string, url: string) => void;
}) {
  const isPoster = template.kind === 'poster' || template.id.startsWith('poster_');
  const posterFormat = template.formats?.[0] ?? 'story';
  const manifestKey = showcaseManifestKey({
    templateId: template.id,
    slotKey: template.slotKey,
    isPoster,
    posterFormat,
    workspaceId,
    presetKey,
    kitId,
    agencyMode: false,
  });
  const [videoUrl, setVideoUrl] = useState<string | null>(() => {
    const r = rendered;
    if (r?.url && !r.error) return r.url;
    return null;
  });
  const [videoFailed, setVideoFailed] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(
    rendered?.error && !rendered?.url ? rendered.error.slice(0, 120) : null,
  );

  useEffect(() => {
    if (rendered?.url) {
      setVideoUrl(rendered.url);
      setVideoFailed(false);
      setRenderError(null);
    } else if (rendered?.error) {
      setRenderError(rendered.error.slice(0, 120));
    }
  }, [rendered]);

  const tryRender = useCallback(async () => {
    setRendering(true);
    setRenderError(null);
    try {
      const res = await fetch('/api/remotion/showcase/render-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          kitId,
          slotKey: template.slotKey,
          presetKey: presetKey ?? undefined,
          workspaceId: workspaceId ?? undefined,
          kind: isPoster ? 'poster' : 'story',
          format: isPoster ? posterFormat : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Render failed');
      setVideoUrl(data.url);
      setVideoFailed(false);
      onRendered(manifestKey, data.url);
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : 'Render hatası');
    } finally {
      setRendering(false);
    }
  }, [template.id, template.slotKey, kitId, presetKey, workspaceId, onRendered, isPoster, posterFormat, manifestKey]);

  const hasManifestPreview = Boolean(rendered?.url);
  const autoSkipRef = useRef(false);

  useEffect(() => {
    if (!autoPreview || !canStartAutoPreview) return;
    if (videoUrl || hasManifestPreview) {
      if (!autoSkipRef.current) {
        autoSkipRef.current = true;
        onAutoPreviewEnd?.();
      }
      return;
    }
    autoSkipRef.current = false;
    if (rendering) return;
    const timer = window.setTimeout(() => {
      onAutoPreviewStart?.();
      void tryRender().finally(() => onAutoPreviewEnd?.());
    }, autoPreviewDelayMs);
    return () => window.clearTimeout(timer);
  }, [
    autoPreview,
    autoPreviewDelayMs,
    canStartAutoPreview,
    rendering,
    videoUrl,
    hasManifestPreview,
    tryRender,
    onAutoPreviewStart,
    onAutoPreviewEnd,
  ]);

  const ext = isPoster ? 'png' : 'mp4';
  const fallbackUrl = `/remotion-showcase/${isPoster ? `${template.id}_${posterFormat}` : template.id}.${ext}`;
  const src = videoUrl
    ?? (hasManifestPreview && !videoFailed ? rendered!.url! : null)
    ?? (allowFallbackPreview && !videoFailed ? fallbackUrl : null);
  const isStill = isPoster || rendered?.kind === 'still' || src?.endsWith('.png');

  return (
    <article
      ref={cardRef}
      style={{
        background: '#14141f',
        border: highlighted
          ? '2px solid #a78bfa'
          : '1px solid rgba(255,255,255,0.08)',
        boxShadow: highlighted ? '0 0 0 1px rgba(167,139,250,0.35)' : undefined,
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          aspectRatio: isStill ? '9/16' : '9/16',
          background: '#0a0a0f',
          position: 'relative',
          maxHeight: 420,
        }}
      >
        {src && !renderError ? (
          isStill ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={template.nameTr}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setVideoFailed(true)}
            />
          ) : (
            <video
              key={manifestKey}
              src={src.split('?')[0]}
              autoPlay
              loop
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setVideoFailed(true)}
            />
          )
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748b', fontSize: 13, padding: 16, textAlign: 'center',
          }}>
            {renderError ?? 'Önizleme yok — render edin'}
          </div>
        )}
        {template.slotNumber && (
          <span style={{
            position: 'absolute', top: 10, left: 10, fontSize: 11, fontWeight: 700,
            background: kit.primaryColor, color: '#fff', padding: '4px 8px', borderRadius: 8,
          }}>
            Slot {template.slotNumber}
          </span>
        )}
        {template.family && (
          <span style={{
            position: 'absolute', top: 10, right: 10, fontSize: 9, fontWeight: 800,
            background: 'rgba(0,0,0,0.72)', color: '#e2e8f0', padding: '4px 8px', borderRadius: 8,
            letterSpacing: '0.05em', textTransform: 'uppercase', maxWidth: '55%',
            textAlign: 'right',
          }}>
            {template.family.replace(/_/g, ' ')}
          </span>
        )}
        {isAgencyVibePick(template.id) && (
          <span style={{
            position: 'absolute', bottom: 10, right: 10, fontSize: 10, fontWeight: 800,
            background: '#f59e0b', color: '#0a0a0f', padding: '4px 8px', borderRadius: 8,
            letterSpacing: '0.04em',
          }}>
            ⭐ AJANS
          </span>
        )}
      </div>

      <div style={{ padding: '12px 14px 8px' }}>
        <div style={{ fontSize: 11, color: kit.accentColor, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {template.slotLabel ?? template.useCase ?? template.collection}
        </div>
        <h3 style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{template.nameTr}</h3>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{template.id}</p>
      </div>

      <div style={{ padding: '0 14px 14px', marginTop: 'auto' }}>
        <button
          type="button"
          onClick={tryRender}
          disabled={rendering}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', cursor: rendering ? 'wait' : 'pointer',
            background: rendering ? '#334155' : kit.accentColor, color: '#fff', fontWeight: 700, fontSize: 13,
          }}
        >
          {rendering ? 'Render…' : 'Önizleme render et'}
        </button>
      </div>
    </article>
  );
}

function buildShowcaseHref(base: Record<string, string>): string {
  const params = new URLSearchParams(base);
  const s = params.toString();
  return s ? `/remotion-showcase?${s}` : '/remotion-showcase';
}

function ShowcaseVibePicker({
  presetKey,
  agencyMode,
  familyFilter,
}: {
  presetKey: string | null;
  agencyMode: boolean;
  familyFilter: string | null;
}) {
  const baseParams: Record<string, string> = {};
  if (agencyMode) {
    baseParams.collection = 'Agency';
    if (familyFilter) baseParams.family = familyFilter;
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {SHOWCASE_VIBE_GROUPS.map((group) => {
        const entries = listShowcasePresetEntriesByGroup(group.id);
        if (!entries.length) return null;
        return (
          <div key={group.id} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              {group.labelTr}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {entries.map(([key, preset]) => {
                const active = presetKey === key;
                return (
                  <a
                    key={key}
                    href={buildShowcaseHref({ ...baseParams, preset: key })}
                    title={preset.vibeDesc}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: active ? preset.accentColor : '#14141f',
                      color: active ? '#fff' : '#94a3b8',
                      border: `1px solid ${active ? preset.accentColor : 'rgba(255,255,255,0.1)'}`,
                    }}
                  >
                    {preset.name}
                    <span style={{
                      fontSize: 9,
                      fontWeight: 800,
                      opacity: active ? 0.9 : 0.65,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}>
                      {MOTION_STYLE_LABELS[preset.motionStyle]}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
      {presetKey && (
        <a
          href={buildShowcaseHref(baseParams)}
          style={{ fontSize: 12, color: '#64748b', textDecoration: 'none' }}
        >
          Vibe seçimini temizle →
        </a>
      )}
    </div>
  );
}

export default function RemotionShowcasePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedKitId, setSelectedKitId] = useState<string>('');
  const [autoPreviewBusy, setAutoPreviewBusy] = useState(false);
  const [autoPreviewSlot, setAutoPreviewSlot] = useState(0);
  const slotRefs = useRef<Map<string, HTMLElement>>(new Map());

  const workspaceId = searchParams.get('workspace') ?? searchParams.get('workspaceId');
  const highlightSlot = searchParams.get('slot');

  const loadManifest = useCallback(() => {
    fetch(`/remotion-showcase/manifest.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((manifest) => setItems(manifest.items ?? []))
      .catch(() => { /* manifest opsiyonel */ });
  }, []);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  const collectionFilter = searchParams.get('collection');
  const familyFilter = searchParams.get('family');
  const vibePicksFilter = searchParams.get('vibe_picks') === '1';
  const presetKey = searchParams.get('preset');
  const agencyMode = collectionFilter === 'Agency';

  // Agency modu: tüm ajans kataloğu varsayılan; vibe_picks=1 ile editör seçkisi (22 şablon)
  useEffect(() => {
    if (!agencyMode || familyFilter || vibePicksFilter) return;
    if (searchParams.get('view') === 'featured') return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('collection', 'Agency');
    params.delete('vibe_picks');
    router.replace(`/remotion-showcase?${params.toString()}`, { scroll: false });
  }, [agencyMode, familyFilter, vibePicksFilter, searchParams, router]);

  const showcaseKit = useMemo(
    () => resolveShowcaseBrandKit({ kitId: selectedKitId, presetKey }),
    [selectedKitId, presetKey],
  );

  useEffect(() => {
    const kitFromUrl = searchParams.get('kit');
    const catalogKitId = showcaseKitIdForCatalog(presetKey, kitFromUrl ?? selectedKitId);
    const params = new URLSearchParams();
    if (agencyMode) {
      params.set('collection', 'Agency');
      params.set('kind', 'story');
      if (familyFilter) params.set('family', familyFilter);
      if (vibePicksFilter) params.set('vibe_picks', '1');
    } else {
      params.set('brand', '1');
      params.set('kitId', catalogKitId);
      params.set('evaluation', '1');
      if (workspaceId) params.set('workspace', workspaceId);
      if (presetKey) params.set('preset', presetKey);
    }
    setCatalogLoading(true);
    setCatalogError(null);
    fetch(`/api/remotion/catalog?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Katalog HTTP ${r.status}`);
        return r.json();
      })
      .then((cat) => {
        const typed = cat as CatalogResponse;
        setCatalog(typed);
        if (!agencyMode) {
          const kitFromLibrary = typed.brandLibrary?.kitId;
          if (workspaceId && kitFromLibrary) {
            setSelectedKitId(kitFromLibrary);
          } else if (!selectedKitId && !presetKey) {
            setSelectedKitId(kitFromUrl ?? typed.brandKits?.[0]?.id ?? 'kit_01_beach_club');
          }
        }
      })
      .catch((e: Error) => setCatalogError(e.message || 'Katalog yüklenemedi'))
      .finally(() => setCatalogLoading(false));
  }, [searchParams, selectedKitId, agencyMode, familyFilter, vibePicksFilter, presetKey, workspaceId]);

  const activeKit = useMemo((): BrandKit => {
    if (presetKey && BRAND_SHOWCASE_PRESETS[presetKey]) {
      const p = showcaseKit as ShowcaseBrandContext;
      return {
        id: p.id,
        name: p.name,
        sector: p.sector,
        primaryColor: p.primaryColor,
        accentColor: p.accentColor,
        headingFont: p.headingFont,
      };
    }
    const id = selectedKitId || catalog?.brandKits[0]?.id;
    return catalog?.brandKits.find((k) => k.id === id) ?? catalog?.brandKits[0] ?? {
      id: 'kit_01_beach_club',
      name: 'Beach Club',
      sector: 'beach_club',
      primaryColor: '#1a2b4a',
      accentColor: '#c9a96e',
      headingFont: 'Syne',
    };
  }, [catalog, selectedKitId, presetKey, showcaseKit]);

  const renderedById = useMemo(() => {
    const map = new Map<string, ShowcaseItem>();
    for (const item of items) {
      map.set(item.id, item);
      if (item.templateId) map.set(item.templateId, item);
    }
    return map;
  }, [items]);

  const autoPreviewEnabled = Boolean(presetKey || workspaceId) && !agencyMode;

  useEffect(() => {
    setAutoPreviewSlot(0);
    setAutoPreviewBusy(false);
  }, [presetKey, workspaceId, catalogLoading]);

  const brandTemplates = useMemo(() => {
    const raw = agencyMode ? catalog?.storyTemplates ?? catalog?.templates ?? [] : catalog?.templates ?? [];
    if (agencyMode && vibePicksFilter) {
      return filterAgencyVibePicks(raw);
    }
    return raw;
  }, [agencyMode, catalog, vibePicksFilter]);

  useEffect(() => {
    if (!highlightSlot || catalogLoading) return;
    const el = slotRefs.current.get(highlightSlot);
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [highlightSlot, catalogLoading, brandTemplates]);

  const handleRendered = useCallback((id: string, url: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      next.push({ id, templateId: id, kind: 'video', url: url.split('?')[0], headline: '' });
      return next;
    });
  }, []);

  const onKitChange = (kitId: string) => {
    setSelectedKitId(kitId);
    const url = new URL(window.location.href);
    url.searchParams.set('kit', kitId);
    url.searchParams.delete('preset');
    window.history.replaceState({}, '', url.toString());
  };

  const onWorkspaceApply = (id: string) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('workspace', id);
    else url.searchParams.delete('workspace');
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
  };

  const presetQuery = presetKey ? `&preset=${presetKey}` : '';
  const activePreset = presetKey ? BRAND_SHOWCASE_PRESETS[presetKey] : undefined;

  return (
    <div style={{ minHeight: '100%', background: '#0a0a0f', color: '#e2e8f0', padding: '24px 24px 80px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 8px', fontWeight: 800 }}>
        {agencyMode ? 'Agency Story Kataloğu' : presetKey ? `${activeKit.name} · Story Tasarımları` : 'Marka Template Kütüphanesi'}
      </h1>
      <p style={{ color: '#94a3b8', margin: '0 0 20px', fontSize: 14, maxWidth: 820 }}>
        {agencyMode ? (
          <>
            <strong style={{ color: '#e2e8f0' }}>Tüm story şablonları Ajans standardında</strong> — premium font, grain, mesh, bubble/sticker tipografi.
            {vibePicksFilter ? (
              <> · <strong style={{ color: '#fbbf24' }}>⭐ Editör seçkisi</strong> — 22 öne çıkan varyant</>
            ) : (
              <> · <strong style={{ color: '#e2e8f0' }}>Tam katalog</strong> — her kartta Önizleme render et ile MP4</>
            )}
            {presetKey ? <> · Marka: <strong style={{ color: '#e2e8f0' }}>{activeKit.name}</strong></> : null}
            {familyFilter ? ` · Filtre: ${familyFilter}` : null}
          </>
        ) : presetKey && activePreset ? (
          <>
            <strong style={{ color: '#e2e8f0' }}>{activePreset.name}</strong>
            {' · '}{activePreset.vibeLabel}
            {' · '}<span style={{ color: activePreset.accentColor }}>{MOTION_STYLE_LABELS[activePreset.motionStyle]}</span>
            {' — '}{activePreset.vibeDesc}
          </>
        ) : (
          <>
            Her markanın <strong style={{ color: '#e2e8f0' }}>5 standart tasarımı</strong> vardır.
            Mission Hub üretimi bu kütüphaneden seçim yapar — marka renkleri, font ve sektör eşleşmesi otomatik uygulanır.
          </>
        )}
      </p>

      <ShowcaseVibePicker presetKey={presetKey} agencyMode={agencyMode} familyFilter={familyFilter} />

      {autoPreviewEnabled && !catalogLoading && brandTemplates.length > 0 && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 12,
          background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
          fontSize: 13, color: '#bae6fd', lineHeight: 1.5,
        }}>
          <strong>Premium önizleme</strong> — her slot farklı layout ailesi ve foto ile sırayla render ediliyor.
          {autoPreviewBusy ? ' (render devam ediyor…)' : ' Tamamlandığında MP4/PNG burada görünür.'}
        </div>
      )}

      {agencyMode && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {[
            { label: '⭐ Editör seçkisi (22)', vibePicks: true, family: '' },
            { label: 'Tüm ajans kataloğu', vibePicks: false, family: '', viewAll: true },
            { label: 'Quote Card', vibePicks: false, family: 'quote_card' },
            { label: 'Location Pin', vibePicks: false, family: 'location_pin' },
            { label: 'Vibe Fullscreen', vibePicks: false, family: 'vibe_fullscreen' },
            { label: 'Bento', vibePicks: false, family: 'bento_story' },
            { label: 'Neon Night', vibePicks: false, family: 'neon_night' },
            { label: 'Event Ticket', vibePicks: false, family: 'event_ticket' },
            { label: 'Diptych', vibePicks: false, family: 'diptych_collage' },
            { label: 'Minimal Luxury', vibePicks: false, family: 'minimal_luxury' },
            { label: 'Mosaic', vibePicks: false, family: 'mosaic_pinterest' },
            { label: 'Asymmetric', vibePicks: false, family: 'asymmetric_editorial' },
            { label: 'Polaroid Tekli', vibePicks: false, family: 'polaroid_single' },
            { label: 'Polaroid Çoklu', vibePicks: false, family: 'polaroid_stack' },
          ].map((f) => {
            const params = new URLSearchParams({ collection: 'Agency' });
            if (f.family) params.set('family', f.family);
            if (f.vibePicks) params.set('vibe_picks', '1');
            if (f.viewAll) params.set('view', 'all');
            if (presetKey) params.set('preset', presetKey);
            const href = `/remotion-showcase?${params.toString()}`;
            const active = f.vibePicks
              ? vibePicksFilter && !familyFilter
              : f.viewAll
                ? !vibePicksFilter && !familyFilter
                : !vibePicksFilter && (familyFilter ?? '') === f.family;
            return (
              <a
                key={f.label}
                href={href}
                style={{
                  padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  textDecoration: 'none',
                  background: active ? (f.vibePicks ? '#f59e0b' : '#8B5CF6') : '#14141f',
                  color: active ? '#fff' : '#94a3b8',
                  border: `1px solid ${active ? (f.vibePicks ? '#f59e0b' : '#8B5CF6') : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                {f.label}
              </a>
            );
          })}
          <a href={presetKey ? `/remotion-showcase?preset=${presetKey}` : '/remotion-showcase'} style={{ padding: '8px 14px', fontSize: 12, color: '#64748b' }}>← 5 slot marka görünümü</a>
        </div>
      )}

      {catalogError && (
        <p style={{ color: '#fb7185', fontSize: 14, marginBottom: 16 }}>
          Katalog hatası: {catalogError} — Next.js dev sunucusunun çalıştığından emin olun (`npm run dev`).
        </p>
      )}

      {!agencyMode && !presetKey && workspaceId && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 12,
          background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.35)',
          fontSize: 13, lineHeight: 1.5, color: '#e9d5ff',
        }}>
          <strong>Kayıtlı marka kütüphanesi</strong>
          {' — '}
          {catalog?.usesSavedLibrary
            ? 'Template Kütüphanesi’ndeki kayıtlı 5 slot seçimi kullanılıyor.'
            : 'Henüz kayıtlı seçim yok; sektör varsayılanları gösteriliyor.'}
          {highlightSlot ? (
            <span style={{ display: 'block', marginTop: 4, color: '#c4b5fd', fontSize: 12 }}>
              Vurgulanan slot: {highlightSlot.replace(/_/g, ' ')}
            </span>
          ) : null}
        </div>
      )}

      {!agencyMode && activeKit && (
        <BrandDiversifyPanel
          sector={activeKit.sector}
          kitId={activeKit.id}
          workspaceId={workspaceId}
          onWorkspaceChange={onWorkspaceApply}
        />
      )}

      {!agencyMode && !presetKey && !workspaceId && (
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 24,
        padding: 16, borderRadius: 16, background: '#14141f', border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Marka seç</label>
        <select
          value={activeKit?.id ?? ''}
          onChange={(e) => onKitChange(e.target.value)}
          style={{
            flex: '1 1 240px', padding: '10px 12px', borderRadius: 10,
            background: '#0a0a0f', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {catalog?.brandKits.map((k) => (
            <option key={k.id} value={k.id}>{k.name} · {k.sector.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {activeKit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#94a3b8' }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, background: activeKit.primaryColor }} />
            <span style={{ width: 16, height: 16, borderRadius: 4, background: activeKit.accentColor }} />
            <span>{activeKit.headingFont}</span>
            <span>· 5 slot</span>
          </div>
        )}
      </div>
      )}

      {!agencyMode && activeKit && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 12,
          background: `linear-gradient(135deg, ${activeKit.primaryColor}33, transparent)`,
          border: `1px solid ${activeKit.accentColor}44`,
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>{activeKit.name}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            {activePreset
              ? `${activePreset.vibeLabel} · ${MOTION_STYLE_LABELS[activePreset.motionStyle]} · ${activePreset.location}`
              : 'Günlük story · Etkinlik · Kampanya post · Editorial · Sosyal kanıt'}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {brandTemplates.map((t, index) => {
          const posterFormat = t.formats?.[0] ?? 'story';
          const lookupKey = showcaseManifestKey({
            templateId: t.id,
            slotKey: t.slotKey,
            isPoster: t.kind === 'poster' || t.id.startsWith('poster_'),
            posterFormat,
            workspaceId,
            presetKey,
            kitId: activeKit?.id ?? 'kit',
            agencyMode,
          });
          const cardKit = activeKit;
          const slotOrder = t.slotNumber ?? index + 1;
          return (
            <TemplateCard
              key={`${cardKit.id}-${t.slotKey ?? t.id}`}
              template={t}
              rendered={renderedById.get(lookupKey) ?? renderedById.get(t.id)}
              kitId={cardKit.id}
              kit={cardKit}
              presetKey={presetKey}
              workspaceId={workspaceId}
              highlighted={Boolean(highlightSlot && t.slotKey === highlightSlot)}
              autoPreview={autoPreviewEnabled}
              autoPreviewDelayMs={slotOrder * 1200}
              canStartAutoPreview={!autoPreviewBusy && autoPreviewSlot === slotOrder - 1}
              onAutoPreviewStart={() => setAutoPreviewBusy(true)}
              onAutoPreviewEnd={() => {
                setAutoPreviewBusy(false);
                setAutoPreviewSlot((prev) => prev + 1);
              }}
              cardRef={(el) => {
                if (t.slotKey) {
                  if (el) slotRefs.current.set(t.slotKey, el);
                  else slotRefs.current.delete(t.slotKey);
                }
              }}
              onRendered={handleRendered}
            />
          );
        })}
      </div>

      {catalogLoading && (
        <p style={{ color: '#64748b', fontSize: 14 }}>Katalog yükleniyor…</p>
      )}
      {!catalogLoading && !catalogError && !brandTemplates.length && (
        <p style={{ color: '#64748b', fontSize: 14 }}>Bu filtre için şablon bulunamadı.</p>
      )}
    </div>
  );
}
