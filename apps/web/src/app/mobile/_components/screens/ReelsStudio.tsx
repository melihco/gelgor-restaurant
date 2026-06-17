'use client';

/**
 * Reels Studio
 *
 * 2 sekme:
 *   1. Mission Briefs  — Mission Hub'ın ürettiği reel fikirleri (agent-otomatik)
 *   2. Manuel          — Kullanıcı elle fotoğraf + prompt girer
 *
 * Bir kart seçilince alt drawer açılır; içerik, fotoğraf, stil hepsi
 * agent'tan pre-fill olur. "Reels Üret" Runway Gen 4.5 çalıştırır,
 * sonra isteğe bağlı "Branded Pack" Creatomate'e gönderir.
 */

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useTheme } from '../theme-context';
import { apiClient } from '@/lib/api-client';
import { nodeOutputArray } from '@/lib/mission-node-output';
import { productionSnapshotToLegacyBrandContext } from '@/lib/production-snapshot-compat';
import type { T } from '../theme-context';
import type { MissionSummary, MissionNodeProgress } from '@/types/index';
import {
  MUSIC_CATALOG,
  getMusicTrack,
  visualStyleToMusicMood,
  type MusicMood,
} from '@/lib/music-catalog';

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'briefs' | 'manual';
type VisualStyle = 'cinematic' | 'luxury' | 'warm' | 'dramatic' | 'lifestyle' | 'minimalist' | 'energetic';
type CameraMotion = 'dolly_in' | 'slow_pan' | 'static' | 'dolly_out' | 'orbit' | 'tilt_up';
type Duration = 5 | 10;

interface ReelBrief {
  id: string;
  missionTitle: string;
  missionId: string;
  nodeKey: string;
  headline: string;
  caption: string;
  /** Agent-generated scene/visual description for Runway prompt */
  sceneConcept: string;
  hashtags: string;
  photoUrl: string | null;
  visualStyle: VisualStyle;
  cameraMotion: CameraMotion;
  duration: 5 | 10;
  contentType: string;
  suggestedDate: string;
}

interface StyleOption { key: VisualStyle; label: string; emoji: string }
interface MotionOption { key: CameraMotion; label: string; emoji: string }

const STYLES: StyleOption[] = [
  { key: 'cinematic',   label: 'Sinematik',  emoji: '🎬' },
  { key: 'luxury',      label: 'Lüks',       emoji: '✨' },
  { key: 'warm',        label: 'Sıcak',      emoji: '🌅' },
  { key: 'lifestyle',   label: 'Lifestyle',  emoji: '☀️' },
  { key: 'dramatic',    label: 'Dramatik',   emoji: '⚡' },
  { key: 'minimalist',  label: 'Minimal',    emoji: '◽' },
  { key: 'energetic',   label: 'Enerjik',    emoji: '🔥' },
];

const MOTIONS: MotionOption[] = [
  { key: 'dolly_in',  label: 'Yaklaş',   emoji: '→' },
  { key: 'slow_pan',  label: 'Yavaş Pan',emoji: '↔' },
  { key: 'static',    label: 'Sabit',    emoji: '■' },
  { key: 'dolly_out', label: 'Uzaklaş',  emoji: '←' },
  { key: 'orbit',     label: 'Etraf',    emoji: '↻' },
  { key: 'tilt_up',   label: 'Yukarı',   emoji: '↑' },
];

const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'scontent-'];
function isUsableUrl(url: string) {
  return typeof url === 'string' && url.startsWith('http') && !CDN_HOSTS.some(h => url.includes(h));
}

function parseGalleryUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) return (raw as string[]).filter(isUsableUrl);
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p.filter(isUsableUrl) : []; }
    catch { return []; }
  }
  return [];
}

/** Map content type + visual direction keywords → VisualStyle */
function guessStyle(contentType: string, visualDir?: string): VisualStyle {
  const src = ((contentType ?? '') + ' ' + (visualDir ?? '')).toLowerCase();
  if (src.includes('luxury') || src.includes('premium') || src.includes('lüks') || src.includes('elegance')) return 'luxury';
  if (src.includes('event') || src.includes('gala') || src.includes('dramatic') || src.includes('dramatik')) return 'dramatic';
  if (src.includes('food') || src.includes('menu') || src.includes('product') || src.includes('warm') || src.includes('sıcak')) return 'warm';
  if (src.includes('energy') || src.includes('promo') || src.includes('happy') || src.includes('enerjik') || src.includes('vibrant')) return 'energetic';
  if (src.includes('minimal') || src.includes('wellness') || src.includes('calm') || src.includes('clean')) return 'minimalist';
  if (src.includes('lifestyle') || src.includes('social') || src.includes('people') || src.includes('outdoor')) return 'lifestyle';
  return 'cinematic';
}

/** Map visual direction / production notes → CameraMotion */
function guessMotion(visualDir?: string, productionNotes?: string): CameraMotion {
  const src = ((visualDir ?? '') + ' ' + (productionNotes ?? '')).toLowerCase();
  if (src.includes('pan') || src.includes('sweep') || src.includes('scan')) return 'slow_pan';
  if (src.includes('pull back') || src.includes('pullback') || src.includes('reveal') || src.includes('wide')) return 'dolly_out';
  if (src.includes('orbit') || src.includes('360') || src.includes('around')) return 'orbit';
  if (src.includes('tilt') || src.includes('rise') || src.includes('upward') || src.includes('yukarı')) return 'tilt_up';
  if (src.includes('static') || src.includes('still') || src.includes('sabit') || src.includes('steady')) return 'static';
  return 'dolly_in'; // default: cinematic push-in
}

/** Derive duration from production notes (5 or 10 seconds) */
function guessDuration(productionNotes?: string, contentType?: string): 5 | 10 {
  const src = ((productionNotes ?? '') + ' ' + (contentType ?? '')).toLowerCase();
  if (src.includes('5 sec') || src.includes('5sn') || src.includes('short') || src.includes('teaser') || src.includes('quick')) return 5;
  return 10;
}

/** Parse content_ideation output_summary → ReelBrief[] */
function parseIdeationNode(
  node: MissionNodeProgress,
  missionTitle: string,
  missionId: string,
  fallbackPhotos: string[],
): ReelBrief[] {
  const ideas = nodeOutputArray(node);
  if (ideas.length === 0) return [];

  return ideas
    .filter((idea) => {
      const fmt = String(idea.format ?? idea.content_type ?? idea.type ?? '').toLowerCase();
      return fmt.includes('reel') || fmt.includes('video') || fmt.includes('story');
    })
      .map((idea, i: number): ReelBrief => {
      const visualBrief = (
        idea.visual_brief && typeof idea.visual_brief === 'object' ? idea.visual_brief : idea.visualBrief
      ) as Record<string, unknown> | undefined;
      const galleryUrl = (visualBrief?.gallery_url ?? visualBrief?.galleryUrl ?? null) as string | null;
      const photo = (galleryUrl && isUsableUrl(galleryUrl) ? galleryUrl : null) ?? fallbackPhotos[i % fallbackPhotos.length] ?? null;
      const ct = String(idea.content_type ?? idea.contentType ?? idea.type ?? 'reel');
      const visualDir = String(idea.visual_direction ?? idea.visualDirection ?? '');
      const productionNotes = String(idea.production_notes ?? idea.productionNotes ?? '');

      // Build scene concept from agent visual fields (priority order)
      const sceneParts: string[] = [
        visualDir,
        String(idea.image_prompt ?? idea.imagePrompt ?? ''),
        String(visualBrief?.treatment ?? ''),
        productionNotes,
      ].map(s => s.trim()).filter(Boolean);
      const sceneConcept = sceneParts.length > 0
        ? sceneParts.join('. ').slice(0, 280)
        : String(idea.caption ?? '').slice(0, 280);

      return {
        id:           `${missionId}:${node.node_key}:${i}`,
        missionTitle,
        missionId,
        nodeKey:      node.node_key,
        headline:     String(idea.headline ?? idea.title ?? idea.idea_title ?? ''),
        caption:      String(idea.caption ?? ''),
        sceneConcept,
        hashtags:     Array.isArray(idea.hashtags) ? (idea.hashtags as string[]).join(' ') : String(idea.hashtags ?? ''),
        photoUrl:     photo,
        visualStyle:  guessStyle(ct, visualDir),
        cameraMotion: guessMotion(visualDir, productionNotes),
        duration:     guessDuration(productionNotes, ct),
        contentType:  ct,
        suggestedDate: String(idea.posting_time_suggestion ?? idea.best_time ?? ''),
      };
    });
}

// ── Main component ─────────────────────────────────────────────────────────

export function ReelsStudio() {
  const { goBack } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const { t } = useTheme();
  const qc = useQueryClient();

  const [tab, setTab]                   = useState<Tab>('briefs');
  const [selectedBrief, setSelectedBrief] = useState<ReelBrief | null>(null);
  const [briefs, setBriefs]             = useState<ReelBrief[]>([]);
  const [loadingBriefs, setLoadingBriefs] = useState(true);

  // ── Brand context & gallery ──────────────────────────────────────────────
  const { data: productionSnapshot } = useQuery({
    queryKey: ['production-context-snapshot', tenantId],
    queryFn:  () => apiClient.getProductionBrandContextSnapshot(tenantId),
    enabled:  Boolean(tenantId),
    staleTime: 60_000,
  });
  const brandCtx = productionSnapshotToLegacyBrandContext(productionSnapshot);

  const galleryPhotos = parseGalleryUrls(brandCtx?.reference_image_urls).slice(0, 12);

  // ── Fetch mission briefs ─────────────────────────────────────────────────
  const { data: missions = [] } = useQuery({
    queryKey:      ['missions', tenantId],
    queryFn:       () => apiClient.listMissions(tenantId),
    enabled:       Boolean(tenantId),
    staleTime:     30_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!missions.length) { setLoadingBriefs(false); return; }

    const completedOrActive = (missions as MissionSummary[])
      .filter(m => ['completed', 'in_flight', 'approved'].includes(m.status))
      .slice(0, 8);

    if (!completedOrActive.length) { setLoadingBriefs(false); return; }

    setLoadingBriefs(true);
    const fallback = galleryPhotos;

    Promise.all(
      completedOrActive.map(m =>
        apiClient.getMissionProgress(tenantId, m.id).then(prog => ({ m, prog })).catch(() => null)
      )
    ).then(results => {
      const all: ReelBrief[] = [];
      for (const res of results) {
        if (!res) continue;
        for (const node of res.prog.nodes) {
          if (node.task_type !== 'content_ideation' || node.status !== 'completed') continue;
          all.push(...parseIdeationNode(node, res.m.title, res.m.id, fallback));
        }
      }
      setBriefs(all);
      setLoadingBriefs(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions.length, tenantId]);

  const S = styles(t);

  // ── Detail view replaces the list (no overlay needed) ─────────────────────
  if (selectedBrief) {
    return (
      <DetailView
        brief={selectedBrief}
        tenantId={tenantId}
        brandCtx={brandCtx}
        galleryPhotos={galleryPhotos}
        t={t}
        S={S}
        onBack={() => setSelectedBrief(null)}
        qc={qc}
      />
    );
  }

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => goBack()} style={S.backBtn}>‹</button>
        <div style={{ flex: 1 }}>
          <div style={S.headerTitle}>Reels Studio</div>
          <div style={S.headerSub}>AI Briefs + Prompt → Runway Gen 4.5</div>
        </div>
        <div style={S.badge}>▶ Runway Gen 4.5</div>
      </div>

      {/* Tabs */}
      <div style={S.tabRow}>
        {(['briefs', 'manual'] as Tab[]).map(tb => {
          const isActive = tab === tb;
          return (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              style={{
                flex: 1,
                padding: '11px 0',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: isActive ? `2px solid ${t.accent}` : '2px solid transparent',
                color: isActive ? t.textPrimary : t.textSecondary,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.01em',
              }}
            >
              {tb === 'briefs' ? `✦ Mission Briefs${briefs.length ? ` (${briefs.length})` : ''}` : '+ Manuel'}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={S.body}>
        {tab === 'briefs'
          ? <BriefsTab
              briefs={briefs}
              loading={loadingBriefs}
              hasMissions={missions.length > 0}
              onSelect={setSelectedBrief}
              galleryPhotos={galleryPhotos}
              t={t}
              S={S}
            />
          : <ManualTab
              tenantId={tenantId}
              brandCtx={brandCtx}
              galleryPhotos={galleryPhotos}
              t={t}
              S={S}
              qc={qc}
            />
        }
      </div>
    </div>
  );
}

// ── Briefs Tab ─────────────────────────────────────────────────────────────

function BriefsTab({ briefs, loading, hasMissions, onSelect, galleryPhotos, t, S }: {
  briefs: ReelBrief[];
  loading: boolean;
  hasMissions: boolean;
  onSelect: (b: ReelBrief) => void;
  galleryPhotos: string[];
  t: T;
  S: ReturnType<typeof styles>;
}) {
  if (loading) {
    return (
      <div style={S.center}>
        <span style={S.spinner} />
        <div style={{ marginTop: 12, fontSize: 12, color: t.textSecondary }}>Mission Hub taranıyor…</div>
      </div>
    );
  }

  if (!hasMissions) {
    return (
      <EmptyState
        icon="✦"
        title="Henüz Mission yok"
        sub="Mission Hub'dan bir kampanya başlat. Agents içerik fikirleri üretince burada görünür."
        t={t}
      />
    );
  }

  if (briefs.length === 0) {
    return (
      <EmptyState
        icon="▶"
        title="Reel brief'i henüz yok"
        sub="Tamamlanmış mission'larda reel formatında içerik üretilince burada listelenir. Manuel sekmesinden kendin de ekleyebilirsin."
        t={t}
      />
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 14 }}>
        Mission Hub'ın ürettiği {briefs.length} reel brief'i — tıkla, incele, üret
      </div>
      {briefs.map(b => (
        <BriefCard key={b.id} brief={b} onSelect={onSelect} galleryPhotos={galleryPhotos} t={t} S={S} />
      ))}
    </div>
  );
}

function BriefCard({ brief: b, onSelect, galleryPhotos, t, S }: {
  brief: ReelBrief;
  onSelect: (b: ReelBrief) => void;
  galleryPhotos: string[];
  t: T;
  S: ReturnType<typeof styles>;
}) {
  const photo = b.photoUrl ?? galleryPhotos[0] ?? null;
  const style = STYLES.find(s => s.key === b.visualStyle);

  return (
    <button onClick={() => onSelect(b)} style={S.briefCard}>
      {photo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={photo} alt="" style={S.briefThumb} />
      )}
      {!photo && (
        <div style={{ ...S.briefThumb, background: t.elevated, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>▶</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          {b.headline || '(Başlık yok)'}
        </div>
        <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
          {b.caption || b.contentType}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          <Chip label={style?.emoji + ' ' + style?.label} t={t} />
          <Chip label={`▶ ${b.missionTitle.slice(0, 24)}`} t={t} />
          {b.suggestedDate && <Chip label={b.suggestedDate.slice(0, 10)} t={t} />}
        </div>
      </div>
      <div style={{ color: t.textSecondary, fontSize: 18, marginLeft: 4 }}>›</div>
    </button>
  );
}

// ── Detail View (full-screen, no overlay) ─────────────────────────────────

function DetailView({ brief, tenantId, brandCtx, galleryPhotos, t, S, onBack, qc }: {
  brief: ReelBrief;
  tenantId: string;
  brandCtx: any;
  galleryPhotos: string[];
  t: T;
  S: ReturnType<typeof styles>;
  onBack: () => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [photo, setPhoto]           = useState<string | null>(brief.photoUrl ?? galleryPhotos[0] ?? null);
  const [title, setTitle]           = useState(brief.headline);
  const [concept, setConcept]       = useState(brief.sceneConcept || brief.caption);
  const [style, setStyle]           = useState<VisualStyle>(brief.visualStyle);
  const [motion, setMotion]         = useState<CameraMotion>(brief.cameraMotion);
  const [duration, setDuration]     = useState<Duration>(brief.duration ?? 10);
  const [musicMood, setMusicMood]   = useState<MusicMood>(visualStyleToMusicMood(brief.visualStyle));

  const [isGenerating, setIsGenerating] = useState(false);
  const [genStep, setGenStep]           = useState('');
  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [saved, setSaved]               = useState(false);

  const [isBuildingPack, setIsBuildingPack] = useState(false);
  const [packResults, setPackResults]       = useState<{ format: string; url: string }[]>([]);
  const [packError, setPackError]           = useState<string | null>(null);

  async function generate() {
    if (!title.trim() && !concept.trim()) { setError('Başlık veya açıklama gerekli.'); return; }
    setIsGenerating(true); setError(null); setVideoUrl(null); setSaved(false);

    try {
      setGenStep('AI Director prompt hazırlanıyor…');
      const res = await fetch('/api/generate-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}) },
        body: JSON.stringify({
          title:          title.trim() || concept.trim().slice(0, 60),
          concept:        concept.trim() || title.trim(),
          caption:        concept.trim(),
          platform:       'instagram',
          contentType:    'reel',
          visualStyle:    style,
          cameraMotion:   motion,
          brandTone:      brandCtx?.brand_tone || 'professional',
          targetAudience: brandCtx?.target_audience || '',
          duration,
          ratio:          '720:1280',
          promptImage:    photo ?? undefined,
          sceneMetadata: {
            brandName: brandCtx?.business_name || '',
            location:  brandCtx?.location || '',
          },
        }),
      });
      setGenStep('Runway ile video render ediliyor… (30-90sn)');
      const data = await res.json();
      const url: string | null = data.videoUrl ?? data.outputUrls?.[0] ?? null;
      if (!res.ok || !url) throw new Error(data.error || data.detail || 'Video üretilemedi.');
      setVideoUrl(url);
      setGenStep('');
    } catch (e: any) {
      setError(e?.message?.slice(0, 140) || 'Runway hatası');
      setGenStep('');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    if (!videoUrl) return;
    setSaved(true);
    try {
      await apiClient.saveCreativeArtifact({
        title: title.trim() || 'Reels Studio',
        contentUrl: videoUrl,
        platform: 'instagram',
        contentType: 'instagram_reel',
        content: JSON.stringify({ videoUrl, concept, kind: 'instagram_reel' }),
        metadata: { videoUrl, concept, source: 'reels_studio', style, motion },
      });
      qc.invalidateQueries({ queryKey: ['artifacts'] });
    } catch { setSaved(false); }
  }

  async function handleBrandedPack() {
    if (!videoUrl || !tenantId) return;
    setIsBuildingPack(true); setPackError(null); setPackResults([]);
    try {
      // Resolve music track URL from the selected mood (or live Pixabay API)
      let musicUrl = '';
      if (musicMood !== 'none') {
        try {
          const mRes = await fetch(`/api/music-tracks?mood=${musicMood}`);
          if (mRes.ok) {
            const mData = await mRes.json();
            musicUrl = mData.url ?? '';
          }
        } catch {
          musicUrl = getMusicTrack(musicMood)?.url ?? '';
        }
      }

      const res = await fetch(`/api/brand-context/${tenantId}/brand-video-pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({
          video_url: videoUrl, title: title.trim(),
          source_image_url: photo || '',
          formats: ['reel', 'story', 'feed', 'teaser'],
          wait_for_completion: true,
          music_url: musicUrl,
          music_volume: 0.55,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Pack üretilemedi.');
      const results = (data.results ?? [])
        .filter((r: any) => r.status === 'succeeded' && r.output_url)
        .map((r: any) => ({ format: r.format as string, url: r.output_url as string }));
      setPackResults(results);
    } catch (e: any) {
      setPackError(e?.message?.slice(0, 140) || 'Creatomate hatası');
    } finally {
      setIsBuildingPack(false);
    }
  }

  const styleOpt = STYLES.find(s => s.key === style);

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {brief.headline || 'Reel Brief'}
          </div>
          <div style={{ fontSize: 11, color: t.textSecondary, marginTop: 1 }}>
            {brief.missionTitle} · {brief.contentType}
          </div>
        </div>
        <div style={S.badge}>▶ Runway</div>
      </div>

      {/* Scrollable content */}
      <div style={S.body}>

          {/* Photo strip */}
          <SectionLabel label="Fotoğraf" t={t} />
          <div style={{ display: 'flex', gap: 7, overflowX: 'auto' as const, paddingBottom: 4, marginBottom: 14 }}>
            {(brief.photoUrl ? [brief.photoUrl, ...galleryPhotos.filter(u => u !== brief.photoUrl)] : galleryPhotos).slice(0, 8).map((url, i) => (
              <button
                key={i}
                onClick={() => setPhoto(url)}
                style={{
                  flexShrink: 0,
                  width: 64, height: 64,
                  borderRadius: 8,
                  overflow: 'hidden',
                  padding: 0, border: 'none', cursor: 'pointer',
                  outline: photo === url ? `2.5px solid ${t.accent}` : `1px solid ${t.separator}`,
                  outlineOffset: 1,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>

          {/* Caption preview */}
          <SectionLabel label="Caption (Agent üretimi)" t={t} />
          <div style={{ ...S.captionBox, marginBottom: 12 }}>
            {brief.caption || '—'}
          </div>

          {/* Hashtags */}
          {brief.hashtags && (
            <div style={{ fontSize: 11, color: t.accent, marginBottom: 14, lineHeight: '1.6' }}>
              {brief.hashtags}
            </div>
          )}

          {/* Editable title */}
          <SectionLabel label="Başlık (düzenleyebilirsin)" t={t} />
          <input
            style={{ ...S.input, marginBottom: 12 }}
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={80}
          />

          {/* Editable concept */}
          <SectionLabel label="Sahne Açıklaması (Agent üretimi · düzenleyebilirsin)" t={t} />
          <textarea
            style={{ ...S.input, minHeight: 72, resize: 'vertical' as const, marginBottom: 14 }}
            value={concept}
            onChange={e => setConcept(e.target.value)}
            maxLength={300}
          />

          {/* Style */}
          <SectionLabel label="Görsel Stil" t={t} />
          <div style={{ ...S.chipRow, marginBottom: 14 }}>
            {STYLES.map(s => (
              <button key={s.key} onClick={() => setStyle(s.key)}
                style={{ ...S.chip, background: style === s.key ? t.accent : t.elevated, color: style === s.key ? '#fff' : t.textPrimary, border: `1px solid ${style === s.key ? t.accent : t.separator}` }}>
                {s.emoji} {s.label}
              </button>
            ))}
          </div>

          {/* Motion */}
          <SectionLabel label="Kamera Hareketi" t={t} />
          <div style={{ ...S.chipRow, marginBottom: 14 }}>
            {MOTIONS.map(m => (
              <button key={m.key} onClick={() => setMotion(m.key)}
                style={{ ...S.chip, background: motion === m.key ? t.accent : t.elevated, color: motion === m.key ? '#fff' : t.textPrimary, border: `1px solid ${motion === m.key ? t.accent : t.separator}` }}>
                {m.emoji} {m.label}
              </button>
            ))}
          </div>

          {/* Duration */}
          <SectionLabel label="Süre" t={t} />
          <div style={{ ...S.chipRow, marginBottom: 20 }}>
            {([5, 10] as Duration[]).map(d => (
              <button key={d} onClick={() => setDuration(d)}
                style={{ ...S.chip, minWidth: 72, background: duration === d ? t.accent : t.elevated, color: duration === d ? '#fff' : t.textPrimary, border: `1px solid ${duration === d ? t.accent : t.separator}` }}>
                {d} sn
              </button>
            ))}
          </div>

          {/* Music selector */}
          <SectionLabel label="Müzik (Branded Pack)" t={t} />
          <div style={{ ...S.chipRow, flexWrap: 'wrap' as const, marginBottom: 20 }}>
            {/* No music option */}
            <button onClick={() => setMusicMood('none')}
              style={{ ...S.chip, background: musicMood === 'none' ? t.elevated : t.elevated, color: musicMood === 'none' ? t.textPrimary : t.textSecondary, border: `1px solid ${musicMood === 'none' ? t.textPrimary : t.separator}`, opacity: musicMood === 'none' ? 1 : 0.7 }}>
              🔇 Yok
            </button>
            {MUSIC_CATALOG.map(track => (
              <button key={track.mood} onClick={() => setMusicMood(track.mood)}
                style={{ ...S.chip, background: musicMood === track.mood ? t.accent : t.elevated, color: musicMood === track.mood ? '#fff' : t.textPrimary, border: `1px solid ${musicMood === track.mood ? t.accent : t.separator}` }}>
                {track.emoji} {track.label}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && <div style={{ ...S.errorBox, marginBottom: 14 }}>⚠ {error}</div>}

          {/* Generate button */}
          <button onClick={generate} disabled={isGenerating}
            style={{ ...S.generateBtn, opacity: isGenerating ? 0.7 : 1, marginBottom: 14 }}>
            {isGenerating
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span style={S.spinner} />{genStep || 'Üretiliyor…'}
                </span>
              : `▶  Reels Üret  ·  ${styleOpt?.emoji ?? ''} ${styleOpt?.label ?? style}  ·  ${duration}sn`
            }
          </button>

          {/* Video result */}
          {videoUrl && (
            <div style={{ border: `1px solid ${t.separator}`, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${t.separator}` }}>
                <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 13 }}>✓ Hazır</span>
                <span style={{ fontSize: 11, color: t.textSecondary }}>Runway Gen 4.5</span>
              </div>
              <video src={videoUrl} controls autoPlay loop playsInline
                style={{ width: '100%', maxHeight: 300, background: '#000', display: 'block' }} />
              <div style={{ display: 'flex', gap: 8, padding: '10px 14px' }}>
                <button onClick={handleSave} disabled={saved}
                  style={{ flex: 2, padding: '9px 0', background: t.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {saved ? '✓ Kaydedildi' : "+ Outputs'a Kaydet"}
                </button>
                <a href={videoUrl} download="reel.mp4"
                  style={{ flex: 1, padding: '9px 0', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 10, color: t.textPrimary, fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ↓ İndir
                </a>
              </div>

              {/* Branded Pack */}
              <div style={{ borderTop: `1px solid ${t.separator}`, padding: '12px 14px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>✦ Marka Paketi — 4 Format</div>
                <div style={{ fontSize: 11, color: t.textSecondary, marginBottom: 10 }}>
                  {musicMood !== 'none'
                    ? `🎵 ${MUSIC_CATALOG.find(m => m.mood === musicMood)?.emoji ?? ''} ${MUSIC_CATALOG.find(m => m.mood === musicMood)?.label ?? ''} müzikli · Marka rengi + font + animasyon`
                    : 'Marka rengi + font + animasyon ekle → Reel · Story · Feed · Teaser'}
                </div>
                {packResults.length === 0 && (
                  <button onClick={handleBrandedPack} disabled={isBuildingPack}
                    style={{ width: '100%', padding: '10px', background: isBuildingPack ? t.elevated : '#4D7088', border: `1px solid ${isBuildingPack ? t.separator : '#4D7088'}`, borderRadius: 10, color: isBuildingPack ? t.textSecondary : '#fff', fontSize: 12, fontWeight: 700, cursor: isBuildingPack ? 'default' : 'pointer' }}>
                    {isBuildingPack
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}><span style={S.spinner} />Creatomate render… (1-2dk)</span>
                      : '✦ Branded Pack Üret (Creatomate)'}
                  </button>
                )}
                {packError && <div style={{ ...S.errorBox, marginTop: 8, marginBottom: 0 }}>⚠ {packError}</div>}
                {packResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                    <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, marginBottom: 2 }}>✓ {packResults.length} format hazır</div>
                    {packResults.map(r => (
                      <a key={r.format} href={r.url} download={`branded_${r.format}.mp4`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 8, textDecoration: 'none', color: t.textPrimary }}>
                        <span style={{ fontSize: 16 }}>
                          {r.format === 'reel' ? '▶' : r.format === 'story' ? '↕' : r.format === 'feed' ? '□' : '◈'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' as const }}>
                            {r.format === 'reel' ? 'Reels 9:16' : r.format === 'story' ? 'Story 9:16' : r.format === 'feed' ? 'Feed 1:1' : 'Teaser 3sn'}
                          </div>
                          <div style={{ fontSize: 10, color: t.textSecondary }}>MP4 · Marka renkleri uygulandı</div>
                        </div>
                        <span style={{ fontSize: 12, color: t.accent }}>↓</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ height: 40 }} />
        </div>
      </div>
  );
}

// ── Manual Tab ─────────────────────────────────────────────────────────────

function ManualTab({ tenantId, brandCtx, galleryPhotos, t, S, qc }: {
  tenantId: string;
  brandCtx: any;
  galleryPhotos: string[];
  t: T;
  S: ReturnType<typeof styles>;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [title, setTitle]         = useState('');
  const [concept, setConcept]     = useState('');
  const [photo, setPhoto]         = useState<string | null>(galleryPhotos[0] ?? null);
  const [customUrl, setCustomUrl] = useState('');
  const [style, setStyle]         = useState<VisualStyle>('cinematic');
  const [motion, setMotion]       = useState<CameraMotion>('dolly_in');
  const [duration, setDuration]   = useState<Duration>(10);
  const [musicMood, setMusicMood] = useState<MusicMood>('cinematic');

  const [isGenerating, setIsGenerating]     = useState(false);
  const [genStep, setGenStep]           = useState('');
  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [saved, setSaved]               = useState(false);

  const activePhoto = customUrl.trim() || photo;

  async function generate() {
    if (!title.trim() && !concept.trim()) { setError('Başlık veya açıklama girin.'); return; }
    setIsGenerating(true); setError(null); setVideoUrl(null); setSaved(false);
    try {
      setGenStep('AI Director prompt hazırlanıyor…');
      const res = await fetch('/api/generate-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}) },
        body: JSON.stringify({
          title: title.trim() || concept.trim().slice(0, 60),
          concept: concept.trim() || title.trim(),
          platform: 'instagram', contentType: 'reel',
          visualStyle: style, cameraMotion: motion,
          brandTone: brandCtx?.brand_tone || 'professional',
          duration, ratio: '720:1280',
          promptImage: activePhoto ?? undefined,
          sceneMetadata: { brandName: brandCtx?.business_name || '', location: brandCtx?.location || '' },
        }),
      });
      setGenStep('Runway render ediyor… (30-90sn)');
      const data = await res.json();
      const url: string | null = data.videoUrl ?? data.outputUrls?.[0] ?? null;
      if (!res.ok || !url) throw new Error(data.error || data.detail || 'Üretilemedi.');
      setVideoUrl(url); setGenStep('');
    } catch (e: any) {
      setError(e?.message?.slice(0, 140) || 'Runway hatası'); setGenStep('');
    } finally {
      setIsGenerating(false);
    }
  }

  const [isBuildingPack, setIsBuildingPack] = useState(false);
  const [packResults, setPackResults]       = useState<{ format: string; url: string }[]>([]);
  const [packError, setPackError]           = useState<string | null>(null);

  async function handleSave() {
    if (!videoUrl) return; setSaved(true);
    try {
      await apiClient.saveCreativeArtifact({
        title: title.trim() || 'Reels Studio',
        contentUrl: videoUrl, platform: 'instagram', contentType: 'instagram_reel',
        content: JSON.stringify({ videoUrl, concept, kind: 'instagram_reel' }),
        metadata: { videoUrl, concept, source: 'reels_studio_manual', style, motion },
      });
      qc.invalidateQueries({ queryKey: ['artifacts'] });
    } catch { setSaved(false); }
  }

  async function handleBrandedPack() {
    if (!videoUrl || !tenantId) return;
    setIsBuildingPack(true); setPackError(null); setPackResults([]);
    try {
      let musicUrl = '';
      if (musicMood !== 'none') {
        try {
          const mRes = await fetch(`/api/music-tracks?mood=${musicMood}`);
          if (mRes.ok) { const mData = await mRes.json(); musicUrl = mData.url ?? ''; }
        } catch { musicUrl = getMusicTrack(musicMood)?.url ?? ''; }
      }
      const res = await fetch(`/api/brand-context/${tenantId}/brand-video-pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({
          video_url: videoUrl, title: title.trim() || 'Reel',
          source_image_url: activePhoto || '',
          formats: ['reel', 'story', 'feed', 'teaser'],
          wait_for_completion: true,
          music_url: musicUrl, music_volume: 0.55,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Pack üretilemedi.');
      const results = (data.results ?? [])
        .filter((r: any) => r.status === 'succeeded' && r.output_url)
        .map((r: any) => ({ format: r.format as string, url: r.output_url as string }));
      setPackResults(results);
    } catch (e: any) {
      setPackError(e?.message?.slice(0, 140) || 'Creatomate hatası');
    } finally { setIsBuildingPack(false); }
  }

  return (
    <div>
      <SectionLabel label="Fotoğraf Seç" t={t} />
      {galleryPhotos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 10 }}>
          {galleryPhotos.map((url, i) => (
            <button key={i} onClick={() => { setPhoto(url); setCustomUrl(''); }}
              style={{ width: '100%', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', padding: 0, border: 'none', cursor: 'pointer', outline: (photo === url && !customUrl) ? `2px solid ${t.accent}` : 'none', outlineOffset: 2 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
      <input style={{ ...S.input, marginBottom: 14 }}
        placeholder="Veya fotoğraf URL'si (https://…)"
        value={customUrl} onChange={e => setCustomUrl(e.target.value)} />

      <SectionLabel label="Başlık" t={t} />
      <input style={{ ...S.input, marginBottom: 8 }} placeholder="Gala Gecesi, Happy Hour…"
        value={title} onChange={e => setTitle(e.target.value)} maxLength={80} />

      <SectionLabel label="Sahne açıklaması / Prompt" t={t} />
      <textarea style={{ ...S.input, minHeight: 72, resize: 'vertical' as const, marginBottom: 14 }}
        placeholder="Dili Türkçe bırak, AI otomatik çevirir."
        value={concept} onChange={e => setConcept(e.target.value)} maxLength={300} />

      <SectionLabel label="Görsel Stil" t={t} />
      <div style={{ ...S.chipRow, marginBottom: 14 }}>
        {STYLES.map(s => (
          <button key={s.key} onClick={() => setStyle(s.key)}
            style={{ ...S.chip, background: style === s.key ? t.accent : t.elevated, color: style === s.key ? '#fff' : t.textPrimary, border: `1px solid ${style === s.key ? t.accent : t.separator}` }}>
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      <SectionLabel label="Kamera Hareketi" t={t} />
      <div style={{ ...S.chipRow, marginBottom: 14 }}>
        {MOTIONS.map(m => (
          <button key={m.key} onClick={() => setMotion(m.key)}
            style={{ ...S.chip, background: motion === m.key ? t.accent : t.elevated, color: motion === m.key ? '#fff' : t.textPrimary, border: `1px solid ${motion === m.key ? t.accent : t.separator}` }}>
            {m.emoji} {m.label}
          </button>
        ))}
      </div>

      <SectionLabel label="Süre" t={t} />
      <div style={{ ...S.chipRow, marginBottom: 20 }}>
        {([5, 10] as Duration[]).map(d => (
          <button key={d} onClick={() => setDuration(d)}
            style={{ ...S.chip, minWidth: 72, background: duration === d ? t.accent : t.elevated, color: duration === d ? '#fff' : t.textPrimary, border: `1px solid ${duration === d ? t.accent : t.separator}` }}>
            {d} sn
          </button>
        ))}
      </div>

      <SectionLabel label="Müzik (Branded Pack)" t={t} />
      <div style={{ ...S.chipRow, flexWrap: 'wrap' as const, marginBottom: 20 }}>
        <button onClick={() => setMusicMood('none')}
          style={{ ...S.chip, color: musicMood === 'none' ? t.textPrimary : t.textSecondary, border: `1px solid ${musicMood === 'none' ? t.textPrimary : t.separator}`, opacity: musicMood === 'none' ? 1 : 0.7 }}>
          🔇 Yok
        </button>
        {MUSIC_CATALOG.map(track => (
          <button key={track.mood} onClick={() => setMusicMood(track.mood)}
            style={{ ...S.chip, background: musicMood === track.mood ? t.accent : t.elevated, color: musicMood === track.mood ? '#fff' : t.textPrimary, border: `1px solid ${musicMood === track.mood ? t.accent : t.separator}` }}>
            {track.emoji} {track.label}
          </button>
        ))}
      </div>

      {error && <div style={{ ...S.errorBox, marginBottom: 14 }}>⚠ {error}</div>}

      <button onClick={generate} disabled={isGenerating}
        style={{ ...S.generateBtn, opacity: isGenerating ? 0.7 : 1, marginBottom: 14 }}>
        {isGenerating
          ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}><span style={S.spinner} />{genStep || 'Üretiliyor…'}</span>
          : '▶  Reels Üret'}
      </button>

      {videoUrl && (
        <div style={{ border: `1px solid ${t.separator}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${t.separator}` }}>
            <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 13 }}>✓ Video hazır</span>
            <span style={{ fontSize: 11, color: t.textSecondary }}>Runway Gen 4.5</span>
          </div>
          <video src={videoUrl} controls autoPlay loop playsInline
            style={{ width: '100%', maxHeight: 300, background: '#000', display: 'block' }} />
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px' }}>
            <button onClick={handleSave} disabled={saved}
              style={{ flex: 2, padding: '9px 0', background: t.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {saved ? '✓ Kaydedildi' : "+ Outputs'a Kaydet"}
            </button>
            <a href={videoUrl} download="reel.mp4"
              style={{ flex: 1, padding: '9px 0', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 10, color: t.textPrimary, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ↓ İndir
            </a>
          </div>
          {/* Branded Pack */}
          <div style={{ borderTop: `1px solid ${t.separator}`, padding: '12px 14px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary, marginBottom: 6 }}>
              🎵 {musicMood !== 'none' ? `${MUSIC_CATALOG.find(m => m.mood === musicMood)?.emoji} ${MUSIC_CATALOG.find(m => m.mood === musicMood)?.label} müzikli` : 'Müziksiz'} · Marka Paketi
            </div>
            {packResults.length === 0 && (
              <button onClick={handleBrandedPack} disabled={isBuildingPack}
                style={{ width: '100%', padding: '10px', background: isBuildingPack ? t.elevated : '#4D7088', border: `1px solid ${isBuildingPack ? t.separator : '#4D7088'}`, borderRadius: 10, color: isBuildingPack ? t.textSecondary : '#fff', fontSize: 12, fontWeight: 700, cursor: isBuildingPack ? 'default' : 'pointer' }}>
                {isBuildingPack
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}><span style={S.spinner} />Creatomate render… (1-2dk)</span>
                  : '✦ Markalı Video Paketi Oluştur'}
              </button>
            )}
            {packError && <div style={{ ...S.errorBox, marginTop: 8 }}>⚠ {packError}</div>}
            {packResults.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, marginBottom: 8 }}>✓ {packResults.length} format hazır</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
                  {packResults.map(r => (
                    <a key={r.format} href={r.url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 10, fontSize: 11, color: t.textPrimary, textDecoration: 'none', fontWeight: 600 }}>
                      ↓ {r.format.toUpperCase()}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ height: 40 }} />
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────

function SectionLabel({ label, t }: { label: string; t: T }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: t.textSecondary, marginBottom: 7 }}>
      {label}
    </div>
  );
}

function Chip({ label, t }: { label: string; t: T }) {
  return (
    <span style={{ background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 20, padding: '2px 8px', fontSize: 10, color: t.textSecondary, whiteSpace: 'nowrap' as const }}>
      {label}
    </span>
  );
}

function EmptyState({ icon, title, sub, t }: { icon: string; title: string; sub: string; t: T }) {
  return (
    <div style={{ textAlign: 'center' as const, padding: '40px 20px' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: '1.6' }}>{sub}</div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

function styles(t: T) {
  return {
    root: { position: 'relative' as const, display: 'flex', flexDirection: 'column' as const, height: '100%', background: t.bg, color: t.textPrimary, fontFamily: "-apple-system,sans-serif", overflow: 'hidden' },
    header: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 14px', borderBottom: `1px solid ${t.separator}`, flexShrink: 0 },
    backBtn: { background: 'none', border: 'none', color: t.textPrimary, fontSize: 28, cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
    headerTitle: { fontSize: 17, fontWeight: 700, color: t.textPrimary },
    headerSub: { fontSize: 11, color: t.textSecondary, marginTop: 1 },
    badge: { marginLeft: 'auto', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 20, padding: '3px 10px', fontSize: 10, color: t.textSecondary },
    tabRow: { display: 'flex', borderBottom: `1px solid ${t.separator}`, flexShrink: 0 },
    body: { flex: 1, overflowY: 'auto' as const, padding: '18px 20px 0' },
    center: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '60px 20px' },
    briefCard: { display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '12px 14px', background: t.surface, border: `1px solid ${t.separator}`, borderRadius: 12, cursor: 'pointer', marginBottom: 10, textAlign: 'left' as const },
    briefThumb: { width: 64, height: 64, borderRadius: 8, objectFit: 'cover' as const, flexShrink: 0 },
    captionBox: { background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: t.textPrimary, lineHeight: '1.6' },
    input: { width: '100%', background: t.elevated, border: `1px solid ${t.separator}`, borderRadius: 10, color: t.textPrimary, fontSize: 13, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
    chipRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 7 },
    chip: { borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' },
    errorBox: { background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f87171' },
    generateBtn: { width: '100%', padding: '15px', background: t.accent, border: 'none', borderRadius: 14, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' },
    spinner: { width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spinSlow 0.8s linear infinite' },
  };
}
