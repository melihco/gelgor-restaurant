'use client';

/**
 * Canva Templates Screen
 *
 * Kullanıcının kendi Canva hesabında publish ettiği brand template'leri listeler.
 * Her template için:
 *  - PNG önizleme (isteğe bağlı, generate-on-demand)
 *  - Başlık, aspect ratio, içerik türü
 *  - "Autofill & Canva'da Aç" → brand içeriğiyle doldurulmuş bir tasarım Canva'da açılır
 *
 * Bağlantı yoksa: "Canva'ya Bağlan" butonu OAuth flow'u başlatır.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useTheme } from '../theme-context';
import type { T } from '../theme-context';
import { apiClient } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────

interface CanvaTemplate {
  id: string;
  title: string;
  aspectRatio?: string;
  contentKinds?: string[];
  previewUrl?: string | null;
  previewFormat?: 'png' | 'mp4';
  tones?: string[];
  objectives?: string[];
  dataset?: Record<string, { type: string; defaultText?: string }>;
}

type ViewState = 'list' | 'detail';

// ── Helpers ────────────────────────────────────────────────────────────────

const ASPECT_LABEL: Record<string, string> = {
  '9:16': '9:16 Story/Reel',
  '1:1':  '1:1 Post',
  '4:5':  '4:5 Post',
  '16:9': '16:9 Yatay',
};

const KIND_LABEL: Record<string, string> = {
  instagram_post:  '📷 Post',
  instagram_story: '📱 Story',
  instagram_reel:  '🎬 Reel',
  instagram_plan:  '📅 Plan',
  ad_campaign:     '📣 Reklam',
  review_reply:    '⭐ Yorum',
  generic:         '✦ Genel',
};

// ── Main Screen ────────────────────────────────────────────────────────────

export default function CanvaTemplatesScreen() {
  const { goBack }   = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const { t }        = useTheme();
  const S            = styles(t);

  const [connected,     setConnected]     = useState<boolean | null>(null);
  const [templates,     setTemplates]     = useState<CanvaTemplate[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [selected,      setSelected]      = useState<CanvaTemplate | null>(null);
  const [view,          setView]          = useState<ViewState>('list');
  // templateId → preview URL (populated async after list loads)
  const [previews,      setPreviews]      = useState<Record<string, string>>({});
  const [generating,    setGenerating]    = useState<Set<string>>(new Set());
  const previewAbortRef = useRef<AbortController | null>(null);

  // Filter chips
  const [filterKind, setFilterKind] = useState<string>('all');

  const fetchTemplates = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ tenantId: tenantId ?? '' });
      const res = await fetch(`/api/canva/templates?${params}`);
      const data = await res.json();

      if (res.status === 401) {
        setConnected(false);
        setTemplates([]);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'Template listesi alınamadı.');

      setConnected(true);
      const list: CanvaTemplate[] = data.templates ?? [];
      setTemplates(list);

      // Seed previews dict with any already-cached previewUrls
      const cached: Record<string, string> = {};
      list.forEach(t => { if (t.previewUrl) cached[t.id] = t.previewUrl; });
      if (Object.keys(cached).length) setPreviews(cached);
    } catch (e: any) {
      setError(e?.message?.slice(0, 160) || 'Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Auto-generate previews for templates that don't have one yet.
  // Process 3 at a time (staggered) to avoid hammering Canva API.
  useEffect(() => {
    if (!templates.length) return;
    const needsPreview = templates.filter(t => !t.previewUrl && !previews[t.id]);
    if (!needsPreview.length) return;

    previewAbortRef.current?.abort();
    const ctrl = new AbortController();
    previewAbortRef.current = ctrl;

    const CONCURRENCY = 3;
    let idx = 0;

    async function generateOne(tmpl: CanvaTemplate) {
      if (ctrl.signal.aborted) return;
      setGenerating(prev => new Set(prev).add(tmpl.id));
      try {
        const res = await fetch('/api/canva/template-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, templateId: tmpl.id }),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        const data = await res.json();
        if (data.previewUrl) {
          setPreviews(prev => ({ ...prev, [tmpl.id]: data.previewUrl }));
          // Also update previewFormat in templates state so Reel/Story detection works immediately
          setTemplates(prev => prev.map(t => {
            if (t.id !== tmpl.id) return t;
            const isVideo = data.previewFormat === 'mp4';
            const alreadyReel = t.contentKinds?.includes('instagram_reel');
            return {
              ...t,
              previewFormat: data.previewFormat ?? t.previewFormat,
              contentKinds: isVideo && !alreadyReel
                ? ['instagram_reel', ...(t.contentKinds ?? []).filter(k => k !== 'instagram_post' && k !== 'generic')]
                : t.contentKinds,
            };
          }));
        }
      } catch { /* ignore — failed previews stay as placeholder */ } finally {
        setGenerating(prev => { const s = new Set(prev); s.delete(tmpl.id); return s; });
        // Pick next item
        if (!ctrl.signal.aborted && idx < needsPreview.length) {
          void generateOne(needsPreview[idx++]!);
        }
      }
    }

    // Kick off initial batch
    const batch = needsPreview.slice(0, CONCURRENCY);
    idx = CONCURRENCY;
    batch.forEach(t => void generateOne(t));

    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, tenantId]);

  const allKinds = Array.from(new Set(
    templates.flatMap(t => t.contentKinds ?? []).filter(Boolean)
  ));
  const filtered = filterKind === 'all'
    ? templates
    : templates.filter(t => t.contentKinds?.includes(filterKind));

  if (view === 'detail' && selected) {
    return (
      <TemplateDetailView
        template={selected}
        tenantId={tenantId ?? ''}
        t={t} S={S}
        onBack={() => { setView('list'); setSelected(null); }}
        onTemplateUpdated={(updated) => {
          setTemplates(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
          setSelected(prev => prev ? { ...prev, ...updated } : prev);
        }}
      />
    );
  }

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={goBack} style={S.backBtn}>‹</button>
        <div style={{ flex: 1 }}>
          <div style={S.headerTitle}>Canva Şablonlarım</div>
          <div style={S.headerSub}>Kendi hesabınızda publish ettiğiniz brand template'ler</div>
        </div>
        {connected && (
          <div style={{ ...S.badge, background: 'rgba(0,200,130,0.15)', color: '#00c882', borderColor: 'rgba(0,200,130,0.3)' }}>
            ✓ Bağlı
          </div>
        )}
      </div>

      {/* Body */}
      <div style={S.body}>

        {/* Loading */}
        {loading && (
          <div style={S.center}>
            <span style={S.spinner} />
            <div style={{ marginTop: 12, fontSize: 13, color: t.textSecondary }}>
              Canva'dan şablonlar yükleniyor…
            </div>
          </div>
        )}

        {/* Not connected */}
        {!loading && connected === false && (
          <div style={S.center}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
              Canva hesabınızı bağlayın
            </div>
            <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: '1.6', textAlign: 'center' as const, marginBottom: 24, maxWidth: 280 }}>
              Canva'da kendiniz için ya da müşteriniz için publish ettiğiniz brand template'leri buradan görebilir ve brand verilerinizle otomatik doldurabilirsiniz.
            </div>
            <a href="/api/canva/oauth/login"
              style={{ padding: '12px 28px', background: '#7c3aed', color: '#fff', borderRadius: 12, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Canva ile Bağlan
            </a>
            <div style={{ marginTop: 16, fontSize: 11, color: t.textSecondary, textAlign: 'center' as const }}>
              Canva Connect API · OAuth 2.0 · brandtemplate:read izni
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ ...S.errorBox, margin: '20px 0' }}>
            ⚠ {error}
            <button onClick={fetchTemplates}
              style={{ marginLeft: 12, background: 'none', border: 'none', color: t.accent, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
              Yenile
            </button>
          </div>
        )}

        {/* Connected — template list */}
        {!loading && connected && templates.length === 0 && !error && (
          <div style={S.center}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
              Brand template bulunamadı
            </div>
            <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: '1.6', textAlign: 'center' as const, maxWidth: 260 }}>
              Canva'da bir tasarımı "Brand Template" olarak publish edin ve autofill alanları ekleyin. Ardından bu sayfayı yenileyin.
            </div>
          </div>
        )}

        {!loading && connected && templates.length > 0 && (
          <>
            {/* Filter chips */}
            {allKinds.length > 1 && (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const, marginBottom: 16 }}>
                <FilterChip label="Tümü" active={filterKind === 'all'} onClick={() => setFilterKind('all')} t={t} />
                {allKinds.map(k => (
                  <FilterChip key={k} label={KIND_LABEL[k] ?? k} active={filterKind === k} onClick={() => setFilterKind(k)} t={t} />
                ))}
              </div>
            )}

            <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 12 }}>
              {filtered.length} şablon · Canva Brand Templates
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingBottom: 20 }}>
              {filtered.map(tmpl => (
                <TemplateCard
                  key={tmpl.id}
                  template={{ ...tmpl, previewUrl: previews[tmpl.id] ?? tmpl.previewUrl }}
                  isGeneratingPreview={generating.has(tmpl.id)}
                  t={t}
                  onSelect={() => { setSelected({ ...tmpl, previewUrl: previews[tmpl.id] ?? tmpl.previewUrl }); setView('detail'); }}
                  onBrokenPreview={() => {
                    // Clear stale URL and regenerate
                    setPreviews(prev => { const n = { ...prev }; delete n[tmpl.id]; return n; });
                    setGenerating(prev => new Set(prev).add(tmpl.id));
                    fetch('/api/canva/template-preview', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tenantId, templateId: tmpl.id, force: true }),
                    })
                      .then(r => r.json())
                      .then(d => { if (d.previewUrl) setPreviews(prev => ({ ...prev, [tmpl.id]: d.previewUrl })); })
                      .catch(() => { /* stay as placeholder */ })
                      .finally(() => setGenerating(prev => { const s = new Set(prev); s.delete(tmpl.id); return s; }));
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Template Card ──────────────────────────────────────────────────────────

function TemplateCard({ template, isGeneratingPreview, t, onSelect, onBrokenPreview }: {
  template: CanvaTemplate;
  isGeneratingPreview: boolean;
  t: T;
  onSelect: () => void;
  onBrokenPreview?: () => void;
}) {
  // A template is a Reel if its contentKinds says so OR if its preview file is mp4
  const isReelTemplate = template.contentKinds?.includes('instagram_reel') || template.previewFormat === 'mp4';
  const isStoryTemplate = !isReelTemplate && (template.contentKinds?.includes('instagram_story') || template.aspectRatio === '9:16');
  const isPortrait = template.aspectRatio === '9:16' || template.aspectRatio === '4:5' || isReelTemplate || isStoryTemplate;
  const thumbAspect = isPortrait ? '9/16' : '1/1';
  const [imgBroken, setImgBroken] = useState(false);
  const hasPreview = Boolean(template.previewUrl) && !imgBroken;

  return (
    <button onClick={onSelect}
      style={{ background: t.surface, border: `1px solid ${t.separator}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', textAlign: 'left' as const, padding: 0, display: 'flex', flexDirection: 'column' as const, transition: 'transform 0.15s, border-color 0.15s' }}>

      {/* Preview area */}
      <div style={{ width: '100%', aspectRatio: thumbAspect, background: t.elevated, position: 'relative' as const, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {hasPreview ? (
          template.previewFormat === 'mp4'
            ? <video src={template.previewUrl!} autoPlay muted loop playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' as const }}
                onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }} />
            /* eslint-disable-next-line @next/next/no-img-element */
            : <img src={template.previewUrl!} alt={template.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' as const }}
                onError={() => {
                  setImgBroken(true);
                  onBrokenPreview?.();
                }} />
        ) : isGeneratingPreview ? (
          /* Shimmer skeleton while generating */
          <div style={{ width: '100%', height: '100%', position: 'absolute' as const, inset: 0,
            background: `linear-gradient(90deg, ${t.elevated} 25%, rgba(255,255,255,0.07) 50%, ${t.elevated} 75%)`,
            backgroundSize: '200% 100%',
            animation: 'shimmerSlide 1.4s ease-in-out infinite',
            display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, border: `2px solid rgba(167,139,250,0.3)`, borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spinSlow 0.8s linear infinite' }} />
            <div style={{ fontSize: 9, color: 'rgba(167,139,250,0.7)', letterSpacing: '0.08em' }}>ÖNIZLEME…</div>
          </div>
        ) : (
          /* No preview yet, not generating — simple placeholder */
          <div style={{ textAlign: 'center' as const, padding: 12, opacity: 0.5 }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>📐</div>
            <div style={{ fontSize: 9, color: t.textSecondary }}>{ASPECT_LABEL[template.aspectRatio ?? ''] ?? template.aspectRatio ?? '—'}</div>
          </div>
        )}

        {/* Format badge — Reel / Story / Post */}
        <div style={{ position: 'absolute' as const, top: 6, right: 6, display: 'flex', flexDirection: 'column' as const, gap: 4, alignItems: 'flex-end' }}>
          <div style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '2px 7px', fontSize: 9, color: '#fff', fontWeight: 700, letterSpacing: '0.06em' }}>
            CANVA
          </div>
          {isReelTemplate && (
            <div style={{ background: 'rgba(239,68,68,0.85)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '2px 7px', fontSize: 9, color: '#fff', fontWeight: 700, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 3 }}>
              ▶ REEL
            </div>
          )}
          {isStoryTemplate && (
            <div style={{ background: 'rgba(124,58,237,0.85)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '2px 7px', fontSize: 9, color: '#fff', fontWeight: 700, letterSpacing: '0.06em' }}>
              📱 STORY
            </div>
          )}
        </div>

        {/* Generating indicator badge */}
        {isGeneratingPreview && (
          <div style={{ position: 'absolute' as const, bottom: 6, left: '50%', transform: 'translateX(-50%)', background: 'rgba(124,58,237,0.85)', borderRadius: 8, padding: '2px 8px', fontSize: 9, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' as const }}>
            ✦ Oluşturuluyor
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 10px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary, lineHeight: '1.3', marginBottom: 5 }}>
          {template.title.length > 36 ? template.title.slice(0, 33) + '…' : template.title}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
          {template.aspectRatio && (
            <span style={{ fontSize: 9, padding: '2px 6px', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 10, color: t.textSecondary }}>
              {template.aspectRatio}
            </span>
          )}
          {isReelTemplate ? (
            <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#f87171', fontWeight: 700 }}>
              🎬 Reel
            </span>
          ) : isStoryTemplate ? (
            <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 10, color: '#a78bfa', fontWeight: 700 }}>
              📱 Story
            </span>
          ) : (template.contentKinds ?? []).slice(0, 2).map(k => (
            <span key={k} style={{ fontSize: 9, padding: '2px 6px', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 10, color: t.textSecondary }}>
              {KIND_LABEL[k] ?? k}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

// ── Template Detail View ───────────────────────────────────────────────────

function TemplateDetailView({ template, tenantId, t, S, onBack, onTemplateUpdated }: {
  template: CanvaTemplate;
  tenantId: string;
  t: T;
  S: ReturnType<typeof styles>;
  onBack: () => void;
  onTemplateUpdated?: (partial: Partial<CanvaTemplate> & { id: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [title,   setTitle]   = useState('');
  const [caption, setCaption] = useState('');
  const [cta,     setCta]     = useState('');

  // Derive actual format from both contentKinds AND previewFormat (resolved below after activeKinds state)

  // Manual type override — user can correct the detected type
  const [activeKinds, setActiveKinds]           = useState<string[]>(template.contentKinds ?? []);
  const [isSavingType, setIsSavingType]         = useState(false);

  // Derive format from local activeKinds (so changes reflect immediately)
  const resolvedIsReel  = activeKinds.includes('instagram_reel') || template.previewFormat === 'mp4';
  const resolvedIsStory = !resolvedIsReel && (activeKinds.includes('instagram_story') || template.aspectRatio === '9:16');

  const isReelTemplate  = resolvedIsReel;
  const isStoryTemplate = resolvedIsStory;
  const formatLabel = isReelTemplate ? '🎬 Reel' : isStoryTemplate ? '📱 Story' : '📷 Post';
  const formatColor = isReelTemplate ? '#f87171' : isStoryTemplate ? '#a78bfa' : 'rgba(255,255,255,0.4)';

  async function handleTypeChange(type: 'post' | 'story' | 'reel') {
    const kindMap = {
      post:  ['instagram_post', 'generic'] as string[],
      story: ['instagram_story']           as string[],
      reel:  ['instagram_reel']            as string[],
    };
    const newKinds = kindMap[type];
    setActiveKinds(newKinds);
    setIsSavingType(true);
    try {
      await fetch('/api/canva/template-meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, templateId: template.id, contentKinds: newKinds }),
      });
      onTemplateUpdated?.({ id: template.id, contentKinds: newKinds as any });
    } catch { /* ignore */ } finally {
      setIsSavingType(false);
    }
  }

  const [isAutofilling, setIsAutofilling] = useState(false);
  const [autofillResult, setAutofillResult] = useState<{
    editUrl?: string; thumbnailUrl?: string; designId?: string; templateTitle?: string;
    debug?: {
      signalKind: string; signalHasImageUrl: boolean;
      templateDatasetFields: string[]; filledFields: Array<{ field: string; type: string; filled: boolean; preview: string }>;
      unfilledFields: string[]; imageFieldsInTemplate: string[]; imageFieldsFilled: string[];
      imageFieldsMissing: string[]; autofillFieldCount: number; templateFieldCount: number; fillRate: number;
    };
  } | null>(null);
  const [autofillError, setAutofillError]  = useState<string | null>(null);
  const [savedToOutputs, setSavedToOutputs] = useState(false);
  const [showDiag, setShowDiag] = useState(false);

  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl]             = useState<string | null>(template.previewUrl ?? null);

  async function handleGeneratePreview() {
    setIsPreviewLoading(true);
    try {
      const res = await fetch('/api/canva/template-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, templateId: template.id }),
      });
      const data = await res.json();
      if (data.previewUrl) {
        setPreviewUrl(data.previewUrl);
        // Propagate to parent list — sets previewFormat so Reel/Story detection works
        const isVideo = data.previewFormat === 'mp4';
        if (isVideo && !activeKinds.includes('instagram_reel')) {
          const newKinds = ['instagram_reel', ...activeKinds.filter(k => k !== 'instagram_post' && k !== 'generic')];
          setActiveKinds(newKinds);
          onTemplateUpdated?.({ id: template.id, previewUrl: data.previewUrl, previewFormat: data.previewFormat, contentKinds: newKinds as any });
        } else {
          onTemplateUpdated?.({ id: template.id, previewUrl: data.previewUrl, previewFormat: data.previewFormat });
        }
      }
    } catch { /* ignore */ } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handleAutofill() {
    if (!title.trim() && !caption.trim()) {
      setAutofillError('En az başlık veya metin girin.');
      return;
    }
    setIsAutofilling(true); setAutofillError(null); setAutofillResult(null); setSavedToOutputs(false);

    try {
      const kind = template.contentKinds?.[0] ?? 'instagram_post';
      const signalTitle = title.trim() || caption.trim().slice(0, 60);
      const res = await fetch('/api/canva/autofill-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          templateId: template.id,
          title: signalTitle,
          signal: {
            kind,
            title: signalTitle,
            headline: title.trim(),
            caption: caption.trim(),
            summary: caption.trim().slice(0, 120),
            cta: cta.trim() || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Autofill başarısız.');
      const design = data.design;
      const editUrl: string | undefined = design?.url ?? design?.urls?.edit_url;
      const thumbnailUrl: string | undefined = design?.thumbnail?.url;
      const templateTitle: string | undefined = data.decision?.template?.title ?? template.title;

      const result = { editUrl, thumbnailUrl, designId: design?.id, templateTitle, debug: data.debug };
      setAutofillResult(result);

      // Otomatik olarak Outputs'a kaydet
      if (editUrl) {
        try {
          await apiClient.saveCreativeArtifact({
            title:       `${signalTitle} — ${templateTitle ?? 'Canva'}`,
            contentUrl:  editUrl,
            platform:    'canva',
            contentType: kind,
            content: JSON.stringify({
              canvaEditUrl: editUrl,
              canvaThumbnail: thumbnailUrl,
              canvaDesignId: design?.id,
              templateTitle,
              caption: caption.trim(),
              kind,
              source: 'canva_templates_screen',
            }),
            metadata: {
              source: 'canva_templates_screen',
              canvaEditUrl: editUrl,
              canvaDesignId: design?.id,
              templateId: template.id,
              templateTitle,
              contentKind: kind,
            },
          });
          setSavedToOutputs(true);
          queryClient.invalidateQueries({ queryKey: ['artifacts'] });
        } catch { /* save failure is non-critical */ }
      }
    } catch (e: any) {
      setAutofillError(e?.message?.slice(0, 180) || 'Canva hatası');
    } finally {
      setIsAutofilling(false);
    }
  }

  const datasetFields = Object.entries(template.dataset ?? {}).filter(([, f]) => f.type === 'text');

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {template.title}
          </div>
          <div style={{ fontSize: 11, color: t.textSecondary, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{ASPECT_LABEL[template.aspectRatio ?? ''] ?? template.aspectRatio ?? 'Canva Template'}</span>
            <span style={{ color: formatColor, fontWeight: 700 }}>{formatLabel}</span>
          </div>
        </div>
        <div style={{ ...S.badge, background: '#7c3aed22', color: '#a78bfa', borderColor: '#7c3aed44', fontSize: 10 }}>Canva</div>
      </div>

      <div style={S.body}>

        {/* Preview */}
        <div style={{ marginBottom: 20 }}>
          {previewUrl ? (
            <div style={{ borderRadius: 12, overflow: 'hidden', background: t.elevated, maxHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {template.previewFormat === 'mp4'
                ? <video src={previewUrl} autoPlay muted loop playsInline style={{ maxWidth: '100%', maxHeight: 320 }}
                    onError={e => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }} />
                /* eslint-disable-next-line @next/next/no-img-element */
                : <img src={previewUrl} alt={template.title} style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' as const }}
                    onError={e => {
                      const img = e.currentTarget as HTMLImageElement;
                      img.replaceWith(Object.assign(document.createElement('div'), {
                        style: 'height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;opacity:0.4',
                        innerHTML: '<div style="font-size:40px">◧</div><div style="font-size:11px">Önizleme yüklenemedi — Yeniden Oluştur</div>',
                      }));
                    }} />}
            </div>
          ) : (
            <div style={{ background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 12, padding: '24px', textAlign: 'center' as const }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📐</div>
              <div style={{ fontSize: 12, color: t.textSecondary, marginBottom: 12 }}>
                Bu şablon için önizleme henüz oluşturulmadı.
              </div>
              <button onClick={handleGeneratePreview} disabled={isPreviewLoading}
                style={{ padding: '8px 20px', background: t.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isPreviewLoading ? 0.7 : 1 }}>
                {isPreviewLoading ? '⏳ Oluşturuluyor…' : '✦ Önizleme Oluştur'}
              </button>
            </div>
          )}
        </div>

        {/* Manual type override */}
        <div style={{ marginBottom: 16, padding: '10px 12px', background: t.elevated, borderRadius: 12, border: `1px solid ${t.separator}` }}>
          <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' as const }}>
            <span>📌 Şablon Türü</span>
            {isSavingType && <span style={{ fontSize: 10, color: t.accent }}>Kaydediliyor…</span>}
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {([
              { key: 'post',  label: '📷 Post',  kinds: ['instagram_post', 'generic'] },
              { key: 'story', label: '📱 Story', kinds: ['instagram_story'] },
              { key: 'reel',  label: '🎬 Reel',  kinds: ['instagram_reel'] },
            ] as const).map(({ key, label, kinds }) => {
              const active = key === 'reel' ? isReelTemplate : key === 'story' ? isStoryTemplate : !isReelTemplate && !isStoryTemplate;
              return (
                <button
                  key={key}
                  onClick={() => handleTypeChange(key)}
                  disabled={isSavingType}
                  style={{
                    flex: 1, padding: '7px 0', border: `1.5px solid ${active ? (key === 'reel' ? '#f87171' : key === 'story' ? '#a78bfa' : t.accent) : t.separator}`,
                    background: active ? (key === 'reel' ? 'rgba(239,68,68,0.15)' : key === 'story' ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.15)') : 'transparent',
                    borderRadius: 8, color: active ? '#fff' : t.textSecondary, fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Autofill fields */}
        {datasetFields.length > 0 && (
          <div style={{ marginBottom: 10, fontSize: 11, color: t.textSecondary }}>
            Bu şablonda <strong style={{ color: t.textPrimary }}>{datasetFields.length}</strong> autofill alanı var:
            {datasetFields.map(([k]) => <span key={k} style={{ marginLeft: 5, padding: '1px 7px', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 8, fontSize: 10, color: t.textSecondary }}>{k}</span>)}
          </div>
        )}

        {/* Content inputs */}
        <SectionLabel label="Başlık / Manşet" t={t} />
        <input
          style={{ ...S.input, marginBottom: 10 }}
          placeholder="Gala Gecesi, Happy Hour, Yeni Menü…"
          value={title} onChange={e => setTitle(e.target.value)} maxLength={80}
        />

        <SectionLabel label="Caption / Metin" t={t} />
        <textarea
          style={{ ...S.input, minHeight: 72, resize: 'vertical' as const, marginBottom: 10 }}
          placeholder="Instagram caption veya poster metni…"
          value={caption} onChange={e => setCaption(e.target.value)} maxLength={300}
        />

        <SectionLabel label="CTA (opsiyonel)" t={t} />
        <input
          style={{ ...S.input, marginBottom: 20 }}
          placeholder="Rezervasyon için ara · Şimdi keşfet…"
          value={cta} onChange={e => setCta(e.target.value)} maxLength={50}
        />

        {autofillError && (
          <div style={{ ...S.errorBox, marginBottom: 14 }}>⚠ {autofillError}</div>
        )}

        {/* Autofill result */}
        {autofillResult && (
          <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${isReelTemplate ? 'rgba(239,68,68,0.35)' : 'rgba(124,58,237,0.3)'}`, marginBottom: 14 }}>
            {/* Thumbnail — Reel gets 9:16 portrait treatment with play overlay */}
            {autofillResult.thumbnailUrl && (
              <div style={{ position: 'relative' as const, width: '100%', aspectRatio: isReelTemplate || isStoryTemplate ? '9/16' : '1/1', maxHeight: isReelTemplate ? 380 : 260, overflow: 'hidden', background: '#000' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={autofillResult.thumbnailUrl} alt="Önizleme"
                  style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' as const }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                {/* Play overlay for Reels */}
                {isReelTemplate && (
                  <div style={{ position: 'absolute' as const, inset: 0, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(0,0,0,0.35)' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.4)' }}>
                      <span style={{ fontSize: 20, marginLeft: 3 }}>▶</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>CANVA REEL</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Canva&apos;da açarak videoyu görüntüle</div>
                  </div>
                )}
                {/* Story label */}
                {isStoryTemplate && (
                  <div style={{ position: 'absolute' as const, bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(124,58,237,0.8)', borderRadius: 8, padding: '4px 12px', fontSize: 10, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' as const }}>
                    📱 CANVA STORY
                  </div>
                )}
              </div>
            )}
            <div style={{ padding: '14px 16px', background: isReelTemplate ? 'rgba(239,68,68,0.07)' : 'rgba(124,58,237,0.07)' }}>
              {/* Status row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isReelTemplate ? '#f87171' : '#7c3aed' }}>
                    ✓ Canva {isReelTemplate ? 'Reel' : isStoryTemplate ? 'Story' : 'tasarımı'} oluşturuldu
                  </div>
                  {savedToOutputs && (
                    <div style={{ fontSize: 11, color: '#10B981', marginTop: 2, fontWeight: 600 }}>
                      ✓ Outputs&apos;a eklendi
                    </div>
                  )}
                  {autofillResult.templateTitle && (
                    <div style={{ fontSize: 10, color: 'rgba(124,58,237,0.6)', marginTop: 1 }}>
                      {autofillResult.templateTitle}
                    </div>
                  )}
                </div>
              </div>
              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {autofillResult.editUrl && (
                  <a href={autofillResult.editUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', textAlign: 'center' as const, padding: '13px', background: isReelTemplate ? '#dc2626' : '#7c3aed', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                    {isReelTemplate ? '▶ Canva\'da Reel\'i Aç' : isStoryTemplate ? '📱 Canva\'da Story\'yi Aç' : '◧ Canva\'da Düzenle'}
                  </a>
                )}
                {!savedToOutputs && autofillResult.editUrl && (
                  <button
                    onClick={async () => {
                      try {
                        const kind = template.contentKinds?.[0] ?? 'instagram_post';
                        await apiClient.saveCreativeArtifact({
                          title: `${title.trim() || caption.trim().slice(0,60)} — ${autofillResult.templateTitle ?? 'Canva'}`,
                          contentUrl: autofillResult.editUrl!,
                          platform: 'canva', contentType: kind,
                          content: JSON.stringify({ canvaEditUrl: autofillResult.editUrl, canvaThumbnail: autofillResult.thumbnailUrl, templateTitle: autofillResult.templateTitle, caption: caption.trim(), kind, source: 'canva_templates_screen' }),
                          metadata: { source: 'canva_templates_screen', canvaEditUrl: autofillResult.editUrl, templateId: template.id, templateTitle: autofillResult.templateTitle, contentKind: kind },
                        });
                        setSavedToOutputs(true);
                        queryClient.invalidateQueries({ queryKey: ['artifacts'] });
                      } catch { /* ignore */ }
                    }}
                    style={{ width: '100%', padding: '11px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, color: '#10B981', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    + Outputs&apos;a Ekle
                  </button>
                )}

                {/* Tanı Paneli toggle */}
                {autofillResult.debug && (
                  <button onClick={() => setShowDiag(d => !d)}
                    style={{ width: '100%', padding: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {showDiag ? '▲ Tanı Panelini Kapat' : '🔬 Tanı Paneli — Alanlar & Doldurma Analizi'}
                  </button>
                )}
              </div>

              {/* ── Tanı Paneli ── */}
              {showDiag && autofillResult.debug && (() => {
                const d = autofillResult.debug!;
                const fillColor = d.fillRate >= 80 ? '#10b981' : d.fillRate >= 50 ? '#f59e0b' : '#ef4444';
                return (
                  <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
                    {/* Fill Rate */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>Alan Doldurma Oranı</div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${d.fillRate}%`, background: fillColor, borderRadius: 3, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: fillColor, flexShrink: 0 }}>{d.fillRate}%</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
                      {d.autofillFieldCount}/{d.templateFieldCount} alan dolduruldu · Tür: <b style={{ color: '#a78bfa' }}>{d.signalKind}</b> · Görsel: <b style={{ color: d.signalHasImageUrl ? '#10b981' : '#ef4444' }}>{d.signalHasImageUrl ? '✓ Var' : '✗ Yok'}</b>
                    </div>

                    {/* Filled fields */}
                    {d.filledFields.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 5 }}>✓ Doldurulan Alanlar</div>
                        {d.filledFields.map(f => (
                          <div key={f.field} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: 10, color: f.filled ? '#10b981' : '#ef4444', flexShrink: 0, width: 12 }}>{f.filled ? '✓' : '✗'}</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', flexShrink: 0, width: 90, fontFamily: 'monospace' }}>{f.field}</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', flexShrink: 0, width: 36 }}>[{f.type}]</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>{f.preview}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Missing image fields — most important diagnostic */}
                    {d.imageFieldsMissing.length > 0 && (
                      <div style={{ marginBottom: 10, padding: '10px', background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 5 }}>⚠ Görsel Alanlar Boş — Template&apos;de Fotoğraf Yok</div>
                        {d.imageFieldsMissing.map(f => (
                          <div key={f} style={{ fontSize: 11, color: 'rgba(239,68,68,0.8)', fontFamily: 'monospace', marginBottom: 2 }}>✗ {f}</div>
                        ))}
                        <div style={{ fontSize: 10, color: 'rgba(239,68,68,0.6)', marginTop: 6 }}>
                          Canva tasarımında görsel alanları boş kalıyor. Signal&apos;e imageUrl eklenmesi gerekiyor.
                        </div>
                      </div>
                    )}

                    {/* Unfilled text fields */}
                    {d.unfilledFields.filter(f => d.imageFieldsInTemplate.indexOf(f) === -1).length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>⚠ Doldurulamayan Metin Alanları</div>
                        {d.unfilledFields.filter(f => !d.imageFieldsInTemplate.includes(f)).map(f => (
                          <div key={f} style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', fontFamily: 'monospace', marginBottom: 2 }}>— {f}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Autofill button */}
        {!autofillResult && (
          <button onClick={handleAutofill} disabled={isAutofilling}
            style={{ width: '100%', padding: '15px', background: '#7c3aed', border: 'none', borderRadius: 14, color: '#fff', fontSize: 14, fontWeight: 700, cursor: isAutofilling ? 'default' : 'pointer', opacity: isAutofilling ? 0.7 : 1, marginBottom: 14 }}>
            {isAutofilling
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span style={S.spinner} />Canva&apos;da oluşturuluyor…
                </span>
              : '✦ Autofill & Canva\'da Aç'}
          </button>
        )}

        {autofillResult && (
          <button onClick={() => { setAutofillResult(null); setSavedToOutputs(false); setTitle(''); setCaption(''); setCta(''); }}
            style={{ width: '100%', padding: '11px', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 12, color: t.textPrimary, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 14 }}>
            ↩ Yeni İçerik ile Tekrar Oluştur
          </button>
        )}

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}

// ── Filter Chip ────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick, t }: { label: string; active: boolean; onClick: () => void; t: T }) {
  return (
    <button onClick={onClick}
      style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: active ? t.accent : t.elevated, color: active ? '#fff' : t.textPrimary, border: `1px solid ${active ? t.accent : t.separator}` }}>
      {label}
    </button>
  );
}

function SectionLabel({ label, t }: { label: string; t: T }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: t.textSecondary, marginBottom: 7 }}>
      {label}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

function styles(t: T) {
  return {
    root:        { position: 'relative' as const, display: 'flex', flexDirection: 'column' as const, height: '100%', background: t.bg, color: t.textPrimary, fontFamily: '-apple-system,sans-serif', overflow: 'hidden' },
    header:      { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 14px', borderBottom: `1px solid ${t.separator}`, flexShrink: 0 },
    backBtn:     { background: 'none', border: 'none', color: t.textPrimary, fontSize: 28, cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
    headerTitle: { fontSize: 17, fontWeight: 700, color: t.textPrimary },
    headerSub:   { fontSize: 11, color: t.textSecondary, marginTop: 1 },
    badge:       { marginLeft: 'auto', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 20, padding: '3px 10px', fontSize: 10, color: t.textSecondary },
    body:        { flex: 1, overflowY: 'auto' as const, padding: '18px 20px 0' },
    center:      { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' as const },
    input:       { width: '100%', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 10, color: t.textPrimary, fontSize: 13, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
    errorBox:    { background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f87171' },
    spinner:     { width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spinSlow 0.8s linear infinite' },
  };
}
