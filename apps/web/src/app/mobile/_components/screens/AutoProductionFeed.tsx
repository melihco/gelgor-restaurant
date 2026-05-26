'use client';
/**
 * AutoProductionFeed
 *
 * Takes content ideation output and automatically:
 *   1. Picks the best matching gallery photo for each idea
 *   2. For stories/reels: applies canvas text overlay
 *   3. Shows produced cards in a swipeable vertical feed
 *   4. User taps ✓ to approve → saved as artifact → appears in Outputs
 *
 * Zero manual steps between "idea" and "ready to post".
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import {
  assignPhotosToContents,
  buildGalleryLookup,
  matchPhotoToContent,
  rankPhotosForContent,
  resolveBestGalleryUrl,
  MIN_ACCEPT_SCORE,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
} from '@/lib/gallery-photo-matcher';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import { composeBrandPhotoCard, composeAgencyDesignCard, hexToRgb, CANVAS_STYLES, upscaleCdnUrl } from './MissionContentFactory';
import dynamic from 'next/dynamic';
import type { BrandTheme } from '@/types/brand-theme';

const LayoutEngine = dynamic(() => import('@/components/canvas/LayoutEngine').then(m => m.LayoutEngine), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface GalleryMeta extends GalleryPhotoMeta {}

interface ProducedItem {
  ideaIndex: number;
  headline: string;
  caption: string;
  captionAlt: string;
  hashtags: string[];
  cta: string;
  contentType: string;
  imageUrl: string | null;       // raw brand photo
  canvasUrl: string | null;      // canvas overlay version
  canvasBuilding: boolean;       // canvas is still being generated
  agencyUrl: string | null;      // agency design version
  agencyBuilding: boolean;
  reelUrl: string | null;        // runway video
  reelBuilding: boolean;
  reelError: string | null;
  // ── Canva brand template autofill ──────────────────
  canvaEditUrl: string | null;   // Canva design edit URL
  canvaThumb: string | null;     // Canva thumbnail
  canvaTemplate: string | null;  // selected template title
  canvaBuilding: boolean;        // Canva autofill in progress
  canvaError: string | null;
  strategicPurpose: string;
  postingTime: string;
  status: 'producing' | 'ready' | 'approved' | 'skipped' | 'error';
  error?: string;
}

type VisualMode = 'photo' | 'canvas' | 'agency' | 'reel' | 'brand_canvas' | 'canva';

interface AutoProductionFeedProps {
  ideas: Record<string, unknown>[];
  brandRefImages: string[];
  galleryAnalysis: Record<string, GalleryMeta>;
  tenantId: string;
  brandName: string;
  logoUrl?: string;
  missionBrief: string;
  onClose: () => void;
  onApproved: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getField(idea: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = idea[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function normalizeHashtags(raw: unknown): string[] {
  if (Array.isArray(raw)) return (raw as string[]).map(h => h.startsWith('#') ? h : `#${h}`).slice(0, 12);
  if (typeof raw === 'string') return raw.split(/[\s,]+/).filter(Boolean).map(h => h.startsWith('#') ? h : `#${h}`).slice(0, 12);
  return [];
}

function buildIdeaMatchInput(idea: Record<string, unknown>, item?: {
  headline: string;
  caption: string;
  strategicPurpose: string;
  contentType: string;
}): MatchPhotoInput {
  const fmt = item?.contentType ?? (getField(idea, 'content_type', 'content_kind') || 'post');
  const fmtLower = fmt.toLowerCase();
  return {
    caption: item?.caption ?? getField(idea, 'caption_draft', 'caption'),
    headline: item?.headline ?? getField(idea, 'headline', 'concept_title', 'title'),
    mood: getField(idea, 'mood', 'tone', 'vibe'),
    contentType: fmtLower.includes('story') ? 'story' : fmtLower.includes('reel') ? 'reel' : 'post',
    visualDirection: getField(idea, 'visual_direction', 'visual_production_spec'),
    templateUseCase: getField(idea, 'template_use_case'),
    strategicPurpose: item?.strategicPurpose ?? getField(idea, 'strategic_purpose', 'hook'),
  };
}

function extractAgentGalleryUrl(idea: Record<string, unknown>): string | null {
  const vps = idea.visual_production_spec as Record<string, unknown> | undefined;
  const url = vps?.selected_gallery_url;
  return typeof url === 'string' && url.startsWith('http') ? url : null;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AutoProductionFeed({
  ideas,
  brandRefImages,
  galleryAnalysis,
  tenantId,
  brandName,
  missionBrief,
  logoUrl,
  onClose,
  onApproved,
}: AutoProductionFeedProps) {
  const { t } = useTheme();
  const queryClient = useQueryClient();

  const [items, setItems] = useState<ProducedItem[]>([]);
  const [producing, setProducing] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [activeCaption, setActiveCaptions] = useState<Record<number, 'primary' | 'alt'>>({});
  const [activeVisual, setActiveVisual] = useState<Record<number, VisualMode>>({});
  const [expandedPanel, setExpandedPanel] = useState<Record<number, boolean>>({});
  const [canvasStyleIdx, setCanvasStyleIdx] = useState<Record<number, number>>({});
  const [itemPhotoIdx, setItemPhotoIdx] = useState<Record<number, number>>({});
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const producedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetIdx = useRef<number | null>(null);
  // Stable ref to generateCanva so produceAll closure can call it without stale capture
  const generateCanvaRef = useRef<((item: ProducedItem, silent?: boolean) => Promise<void>) | null>(null);

  // BrandTheme — lazy-fetched once per session
  const { data: brandTheme } = useQuery<BrandTheme | null>({
    queryKey: ['brandTheme', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      try {
        const res = await fetch(`/api/brand-context/${tenantId}/theme`, {
          headers: { 'X-Tenant-Id': tenantId },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return (data.theme ?? null) as BrandTheme | null;
      } catch { return null; }
    },
    staleTime: 5 * 60_000,
    enabled: !!tenantId,
  });

  // Fetch previously approved artifacts to exclude their images from the pool
  const { data: existingArtifacts = [] } = useQuery({
    queryKey: ['artifacts'],
    queryFn: () => apiClient.getArtifacts(),
    staleTime: 60_000,
  });

  // Build set of base URLs already used in approved/saved artifacts
  const usedPreviouslyBases = useMemo(() => {
    const bases = new Set<string>();
    for (const a of existingArtifacts) {
      const urls: string[] = [];
      // contentUrl is the canonical stored image URL
      if (a.contentUrl) urls.push(a.contentUrl);
      // metadata.imageUrl is set by AutoProductionFeed on save
      const meta = a.metadata as Record<string, unknown> | undefined;
      if (typeof meta?.imageUrl === 'string') urls.push(meta.imageUrl);
      for (const u of urls) {
        if (u.startsWith('http')) bases.add(u.split('?')[0] as string);
      }
    }
    return bases;
  }, [existingArtifacts]);

  // Filter usable images: no logos/icons AND not already used in a saved artifact.
  // Upscale CDN thumbnails so they render sharp at full mobile width.
  const photoPool = brandRefImages
    .filter(u => {
      const l = u.toLowerCase();
      if (['logo','icon','banner','footer','-150x','-300x'].some(p => l.includes(p))) return false;
      return !usedPreviouslyBases.has(u.split('?')[0] as string);
    })
    .map(upscaleCdnUrl);

  // Produce all ideas sequentially
  const produceAll = useCallback(async () => {
    if (producedRef.current) return;
    producedRef.current = true;
    setProducing(true);

    // Initialize items as "producing"
    const initial: ProducedItem[] = ideas.map((idea, i) => ({
      ideaIndex: i,
      headline:         getField(idea, 'headline', 'concept_title', 'title'),
      caption:          getField(idea, 'caption_draft', 'caption'),
      captionAlt:       getField(idea, 'caption_draft_alt', 'caption_alt'),
      hashtags:         normalizeHashtags(idea.hashtags),
      cta:              getField(idea, 'cta', 'call_to_action'),
      contentType:      getField(idea, 'content_type', 'content_kind') || 'post',
      imageUrl:         null,
      canvasUrl:        null,
      canvasBuilding:   false,
      agencyUrl:        null,
      agencyBuilding:   false,
      reelUrl:          null,
      reelBuilding:     false,
      reelError:        null,
      canvaEditUrl:     null,
      canvaThumb:       null,
      canvaTemplate:    null,
      canvaBuilding:    false,
      canvaError:       null,
      strategicPurpose: getField(idea, 'strategic_purpose', 'hook'),
      postingTime:      getField(idea, 'posting_time_suggestion'),
      status:           'producing',
    }));
    setItems(initial);

    const meta = galleryAnalysis as Record<string, GalleryPhotoMeta>;
    const batchItems = ideas.map((idea, i) => ({
      key: String(i),
      input: buildIdeaMatchInput(idea, initial[i]),
      agentUrl: extractAgentGalleryUrl(idea),
    }));

    const assignments = assignPhotosToContents(
      batchItems.map(({ key, input }) => ({ key, input })),
      photoPool,
      meta,
      { displayUrls: photoPool },
    );

  // Track used photos across all ideas in this session
    const usedInSession = new Set<string>();

    for (let i = 0; i < initial.length; i++) {
      const item = initial[i]!;
      const { input, agentUrl: agentUrlRaw } = batchItems[i]!;
      const available = photoPool.filter(u => !usedInSession.has(normalizeGalleryUrl(u)));

      let imageUrl: string | null = null;
      const assigned = assignments.get(String(i));
      const agentBase = agentUrlRaw ? normalizeGalleryUrl(agentUrlRaw) : null;
      const agentInPool = agentBase
        && photoPool.some(u => normalizeGalleryUrl(u) === agentBase)
        && !usedPreviouslyBases.has(agentBase)
        && !usedInSession.has(agentBase);

      if (agentInPool && agentUrlRaw) {
        const resolved = resolveBestGalleryUrl(
          input,
          available.length > 0 ? available : photoPool,
          meta,
          agentUrlRaw,
          { displayUrls: photoPool },
        );
        imageUrl = resolved?.url ?? null;
      }

      if (!imageUrl && assigned && !usedInSession.has(normalizeGalleryUrl(assigned.url))) {
        imageUrl = assigned.url;
      }

      if (!imageUrl && available.length > 0) {
        const fallback = resolveBestGalleryUrl(
          input,
          available,
          meta,
          null,
          { displayUrls: photoPool },
        ) ?? matchPhotoToContent(input, available, meta, {
          displayUrls: photoPool,
          bestEffort: true,
        });
        imageUrl = fallback?.url ?? null;
      }

      if (imageUrl) usedInSession.add(normalizeGalleryUrl(imageUrl));

      await new Promise(r => setTimeout(r, 80));

      // Show raw photo immediately as ready
      setItems(prev => prev.map((it, idx) =>
        idx === i ? { ...it, imageUrl, canvasBuilding: Boolean(imageUrl), status: 'ready' } : it
      ));
      setDoneCount(i + 1);

      // Generate canvas overlay in background (non-blocking)
      if (imageUrl) {
        const itemRef = initial[i]!;
        const fmt = itemRef.contentType.replace('instagram_', '');
        const contentTypeFmt: 'post' | 'story' | 'reel' =
          fmt.includes('story') ? 'story' : fmt.includes('reel') ? 'reel' : 'post';
        const styleIdx = i % CANVAS_STYLES.length;
        composeBrandPhotoCard({
          photoUrl: imageUrl,
          headline: itemRef.headline,
          cta: itemRef.cta || 'Keşfet',
          contentType: contentTypeFmt,
          styleIdx,
        }).then(canvasUrl => {
          setItems(prev => prev.map((it, idx) =>
            idx === i ? { ...it, canvasUrl, canvasBuilding: false } : it
          ));
        }).catch(() => {
          setItems(prev => prev.map((it, idx) =>
            idx === i ? { ...it, canvasBuilding: false } : it
          ));
        });

        // Auto-trigger Canva autofill for Story/Reel in the background (silent — no error toast)
        const isStoryOrReel = contentTypeFmt === 'story' || contentTypeFmt === 'reel';
        if (isStoryOrReel) {
          const canvaTriggerItem: ProducedItem = {
            ...itemRef, imageUrl, canvaEditUrl: null, canvaThumb: null,
            canvaTemplate: null, canvaBuilding: false, canvaError: null,
          };
          // Small stagger per item so we don't flood the Canva API
          setTimeout(() => {
            generateCanvaRef.current?.(canvaTriggerItem, true);
          }, 2000 + i * 800);
        }
      }
    }

    setProducing(false);
  }, [ideas, photoPool, galleryAnalysis, usedPreviouslyBases]);

  useEffect(() => { produceAll(); }, [produceAll]);

  // Cycle to the next semantically compatible photo for this caption
  function cyclePhoto(item: ProducedItem) {
    if (photoPool.length === 0) return;
    const idea = ideas[item.ideaIndex];
    if (!idea) return;

    const input = buildIdeaMatchInput(idea, item);
    const lookup = buildGalleryLookup(galleryAnalysis as Record<string, GalleryPhotoMeta>, photoPool);
    const usedByOthers = new Set(
      items
        .filter(it => it.ideaIndex !== item.ideaIndex && it.imageUrl)
        .map(it => normalizeGalleryUrl(it.imageUrl!)),
    );
    const ranked = rankPhotosForContent(
      input,
      photoPool.filter(u => !usedByOthers.has(normalizeGalleryUrl(u))),
      lookup,
      new Set<string>(),
      galleryAnalysis as Record<string, GalleryPhotoMeta>,
    ).filter(r => r.score >= MIN_ACCEPT_SCORE);

    if (!ranked.length) return;

    const currentBase = normalizeGalleryUrl(item.imageUrl ?? '');
    const currentIdx = ranked.findIndex(r => normalizeGalleryUrl(r.url) === currentBase);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % ranked.length : 0;
    const next = ranked[nextIdx]!;
    setItemPhotoIdx(prev => ({ ...prev, [item.ideaIndex]: nextIdx }));
    setItems(prev => prev.map(it =>
      it.ideaIndex === item.ideaIndex
        ? { ...it, imageUrl: next.url, canvasUrl: null, agencyUrl: null, reelUrl: null }
        : it
    ));
    setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'photo' }));
  }

  // Upload a photo from device, save to brand gallery, use as this item's image
  async function uploadPhoto(ideaIndex: number, file: File) {
    setUploadingIdx(ideaIndex);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => {
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      // Upload to R2
      const uploadRes = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, mimeType: file.type || 'image/jpeg' }),
      });
      if (!uploadRes.ok) throw new Error('Yükleme başarısız');
      const { imageUrl: uploaded } = await uploadRes.json();

      // Persist to brand gallery (Python BrandContext)
      if (tenantId) {
        const currentCtxRes = await fetch(`/api/brand-context-data/${tenantId}`);
        const ctx = currentCtxRes.ok ? await currentCtxRes.json() : {};
        const existing: string[] = (() => {
          const raw = ctx.reference_image_urls ?? [];
          if (Array.isArray(raw)) return raw;
          try { return JSON.parse(raw); } catch { return []; }
        })();
        await fetch(`/api/brand-context-data/${tenantId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference_image_urls: JSON.stringify([uploaded, ...existing]) }),
        });
        let existingAnalysis: Record<string, unknown> = {};
        try {
          const cacheRes = await fetch(`/api/brand-context/${tenantId}/gallery-analysis`);
          if (cacheRes.ok) existingAnalysis = await cacheRes.json();
        } catch { /* proceed without cache */ }
        const analysisRes = await fetch('/api/analyze-gallery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetUrls: [uploaded], maxImages: 1, existingAnalysis }),
        });
        if (analysisRes.ok) {
          const data = await analysisRes.json();
          const results = Array.isArray(data?.results) ? data.results : [];
          if (results.length > 0) {
            await fetch(`/api/brand-context/${tenantId}/gallery-analysis`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ results }),
            }).catch(() => { /* non-fatal */ });
          }
        }
        queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
      }

      // Set as this item's image
      setItems(prev => prev.map(it =>
        it.ideaIndex === ideaIndex
          ? { ...it, imageUrl: uploaded, canvasUrl: null, agencyUrl: null, reelUrl: null }
          : it
      ));
      setActiveVisual(prev => ({ ...prev, [ideaIndex]: 'photo' }));
    } catch {
      /* non-fatal */
    } finally {
      setUploadingIdx(null);
    }
  }

  // Save artifact mutation
  const saveMutation = useMutation({
    mutationFn: async ({ item, useAlt, useCanvas }: { item: ProducedItem; useAlt: boolean; useCanvas: boolean }) => {
      const vm = (activeVisual[item.ideaIndex] ?? 'photo') as VisualMode;
      const rawUrl =
        vm === 'canvas' && item.canvasUrl ? item.canvasUrl :
        vm === 'agency' && item.agencyUrl ? item.agencyUrl :
        vm === 'reel'   && item.reelUrl   ? item.reelUrl   :
        item.imageUrl;
      if (!rawUrl) throw new Error('Görsel yok');
      const caption = useAlt && item.captionAlt ? item.captionAlt : item.caption;
      const fmt = item.contentType.replace('instagram_', '');
      const kind = fmt.includes('story') ? 'instagram_story' : fmt.includes('reel') ? 'instagram_reel' : 'instagram_post';

      // Canvas data URIs need to be uploaded to R2 first
      let finalUrl = rawUrl;
      if (rawUrl.startsWith('data:')) {
        const uploadRes = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: rawUrl, mimeType: 'image/jpeg' }),
        });
        if (!uploadRes.ok) throw new Error(`Görsel yüklenemedi (${uploadRes.status})`);
        const { imageUrl: uploaded } = await uploadRes.json();
        finalUrl = uploaded;
      }

      return apiClient.saveCreativeArtifact({
        title: item.headline || `${brandName} — ${fmt}`,
        contentUrl: finalUrl,
        content: JSON.stringify({ kind, contentType: fmt, caption, hashtags: item.hashtags, cta: item.cta, imageUrl: finalUrl, headline: item.headline }),
        platform: 'instagram',
        contentType: fmt,
        metadata: {
          contentType: fmt, kind, platform: 'instagram',
          headline: item.headline,
          caption: caption?.slice(0, 300),
          cta: item.cta,
          hashtags: item.hashtags?.slice(0, 10),
          strategic_purpose: item.strategicPurpose?.slice(0, 200),
          mission_brief: missionBrief?.slice(0, 200),
          idea_index: item.ideaIndex,
          imageUrl: finalUrl,
          visual_mode: useCanvas ? 'canvas' : 'photo',
        },
      });
    },
    onSuccess: (_, { item }) => {
      setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, status: 'approved' } : it));
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      onApproved();
    },
  });

  const approve = (item: ProducedItem) => {
    const useAlt    = (activeCaption[item.ideaIndex] ?? 'primary') === 'alt';
    const useCanvas = (activeVisual[item.ideaIndex] ?? 'photo') === 'canvas';
    saveMutation.mutate({ item, useAlt, useCanvas });
  };

  const skip = (item: ProducedItem) => {
    setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, status: 'skipped' } : it));
  };

  // Canvas style değiştir (4 style arasında rotate)
  const changeCanvasStyle = async (item: ProducedItem) => {
    if (!item.imageUrl) return;
    const idx = ((canvasStyleIdx[item.ideaIndex] ?? item.ideaIndex) + 1) % CANVAS_STYLES.length;
    setCanvasStyleIdx(prev => ({ ...prev, [item.ideaIndex]: idx }));
    setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, canvasBuilding: true } : it));
    const fmt = item.contentType.replace('instagram_', '');
    const ct: 'post' | 'story' | 'reel' = fmt.includes('story') ? 'story' : fmt.includes('reel') ? 'reel' : 'post';
    try {
      const canvasUrl = await composeBrandPhotoCard({ photoUrl: item.imageUrl, headline: item.headline, cta: item.cta || 'Keşfet', contentType: ct, styleIdx: idx });
      setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, canvasUrl, canvasBuilding: false } : it));
      setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'canvas' }));
    } catch {
      setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, canvasBuilding: false } : it));
    }
  };

  // Ajans tasarımı üret — Design Director → GPT-image-1 edit veya canvas fallback
  const generateAgency = async (item: ProducedItem) => {
    if (!item.imageUrl) return;
    setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, agencyBuilding: true } : it));
    setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'agency' }));

    const fmt = item.contentType.replace('instagram_', '');
    const ct: 'post' | 'story' | 'reel' = fmt.includes('story') ? 'story' : fmt.includes('reel') ? 'reel' : 'post';

    const runCanvasFallback = async (
      design?: Record<string, unknown>,
      templateName?: string,
    ) => {
      // Use canvas_spec from design or sensible defaults
      const cs = (design?.canvas_spec as Record<string, unknown>) ?? {};
      const accentHex = (cs.headline_color as string) || '#c9a96e';
      const primaryHex = '#1a1a2e';
      const overlayRgba = (cs.overlay_rgba as string) || `rgba(${hexToRgb(primaryHex)},0.55)`;
      const logoUrl = (cs.logo_url as string) || '';
      const logoPos = ((cs.logo_position as string) || 'top_left') as 'top_left' | 'top_center' | 'top_right';
      const typoMap: Record<string, string> = { impact: 'condensed_impact', editorial: 'elegant_serif', minimal: 'clean_sans' };
      const tn = templateName || 'impact';
      return composeAgencyDesignCard({
        photoUrl:       item.imageUrl!,
        headline:       (design?.headline as string || item.headline).split(/\s+/).slice(0, 3).join(' '),
        subline:        '',
        cta:            '',
        contentType:    ct,
        overlayColor:   overlayRgba,
        overlayOpacity: tn === 'minimal' ? 0.0 : 0.5,
        bgIntent:       'venue_full_bleed',
        textColor:      accentHex,
        ctaColor:       'transparent',
        typoStyle:      typoMap[tn] ?? 'bold_display',
        ctaStyle:       'none',
        logoUrl,
        logoPosition:   logoPos,
      });
    };

    try {
      // Step 1: Call Design Director (backend handles 429 + mini fallback)
      const directorRes = await fetch(`/api/design-director/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline:          item.headline.slice(0, 50),
          cta:               item.cta.slice(0, 30),
          caption_context:   item.caption.slice(0, 300),
          format:            ct,
          mission_brief:     missionBrief.slice(0, 300),
          strategic_purpose: item.strategicPurpose.slice(0, 200),
        }),
      });

      const directorData = directorRes.ok ? await directorRes.json() : null;
      const designs: Record<string, unknown>[] = directorData?.designs ?? [];
      const design = designs[0] ?? {};
      const templateName = (design.template as string) || 'impact';
      const imageEditPrompt = (design.image_edit_prompt as string) || '';

      // Step 2: GPT-image-1 edit if prompt available
      if (imageEditPrompt) {
        try {
          const result = await apiClient.generateInstagramImage({
            title:             item.headline,
            caption:           item.caption,
            concept:           imageEditPrompt,
            brandName,
            contentType:       ct,
            referenceImageUrls: [item.imageUrl!],
            designCardPrompt:  imageEditPrompt,
          });
          setItems(prev => prev.map(it =>
            it.ideaIndex === item.ideaIndex ? { ...it, agencyUrl: result.imageUrl, agencyBuilding: false } : it
          ));
          return;
        } catch {
          // GPT-image-1 failed → fall through to canvas
        }
      }

      // Step 3: Canvas fallback with design spec
      const agencyUrl = await runCanvasFallback(design, templateName);
      setItems(prev => prev.map(it =>
        it.ideaIndex === item.ideaIndex ? { ...it, agencyUrl, agencyBuilding: false } : it
      ));

    } catch {
      // Final fallback — impact canvas with defaults
      try {
        const agencyUrl = await runCanvasFallback();
        setItems(prev => prev.map(it =>
          it.ideaIndex === item.ideaIndex ? { ...it, agencyUrl, agencyBuilding: false } : it
        ));
      } catch {
        setItems(prev => prev.map(it =>
          it.ideaIndex === item.ideaIndex ? { ...it, agencyBuilding: false } : it
        ));
        setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'photo' }));
      }
    }
  };

  // ── Runway reel builder — shared core ─────────────────────────────────────
  const _runwayAnimate = async (
    item: ProducedItem,
    promptImage: string,
    source: 'photo' | 'agency' | 'canvas',
  ) => {
    // Build a vibe-enriched concept from BrandTheme + item data
    const vibeClause = brandTheme
      ? `Visual style: ${brandTheme.grading?.look ?? ''}. Color palette: ${brandTheme.palette?.description ?? ''}. ${brandTheme.grading?.lutDirective ?? ''}.`
      : '';
    const cameraMotion = source === 'agency' ? 'arc_right' : 'dolly_in';

    const res = await fetch('/api/generate-reel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:          item.headline || `${brandName} Reel`,
        concept:        [item.strategicPurpose || item.caption, vibeClause].filter(Boolean).join(' '),
        platform:       'instagram',
        contentType:    'reel',
        duration:       5,
        cameraMotion,
        ratio:          '720:1280',
        visualStyle:    brandTheme?.grading?.look ?? 'cinematic editorial',
        brandTone:      item.strategicPurpose?.slice(0, 80) ?? '',
        tags:           item.hashtags.slice(0, 5),
        promptImage,
      }),
    });
    const data = await res.json();
    const videoUrl: string | null = data.videoUrl ?? data.outputUrls?.[0] ?? null;
    if (!res.ok || !videoUrl) throw new Error(data.error || 'Reel üretilemedi');
    return videoUrl;
  };

  // Reel üret — raw brand photo → Runway
  const generateReel = async (item: ProducedItem) => {
    if (!item.imageUrl) return;
    setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, reelBuilding: true, reelError: null } : it));
    try {
      const videoUrl = await _runwayAnimate(item, item.imageUrl, 'photo');
      setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, reelUrl: videoUrl, reelBuilding: false } : it));
      setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'reel' }));
      await apiClient.saveCreativeArtifact({
        title: `${item.headline || brandName} — Reel`,
        contentUrl: videoUrl, platform: 'instagram', contentType: 'instagram_reel',
        content: JSON.stringify({ videoUrl, caption: item.caption, kind: 'instagram_reel' }),
        metadata: { videoUrl, caption: item.caption, source: 'runway' },
      });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      onApproved();
    } catch (e: any) {
      setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, reelBuilding: false, reelError: e?.message?.slice(0, 80) || 'Hata' } : it));
    }
  };

  // Ajans Still → Runway: generate 9:16 agency design then animate it
  const generateAgencyReel = async (item: ProducedItem) => {
    if (!item.imageUrl) return;
    setItems(prev => prev.map(it =>
      it.ideaIndex === item.ideaIndex ? { ...it, reelBuilding: true, reelError: null, agencyBuilding: true } : it
    ));
    setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'agency' }));

    try {
      // Step 1 — produce 9:16 agency still
      await generateAgency(item);
      // Wait briefly for state to settle then read from items ref
      await new Promise(r => setTimeout(r, 600));

      // Read the agencyUrl that generateAgency stored
      let agencyUrl: string | null = null;
      setItems(prev => {
        const found = prev.find(it => it.ideaIndex === item.ideaIndex);
        agencyUrl = found?.agencyUrl ?? null;
        return prev.map(it =>
          it.ideaIndex === item.ideaIndex ? { ...it, reelBuilding: true, agencyBuilding: false } : it
        );
      });

      // Fallback to brand photo if agency generation failed
      const promptImg = agencyUrl ?? item.imageUrl;
      if (!promptImg) throw new Error('Görsel yok');

      // Step 2 — animate with Runway
      const videoUrl = await _runwayAnimate(item, promptImg, 'agency');
      setItems(prev => prev.map(it =>
        it.ideaIndex === item.ideaIndex ? { ...it, reelUrl: videoUrl, reelBuilding: false } : it
      ));
      setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'reel' }));

      await apiClient.saveCreativeArtifact({
        title: `${item.headline || brandName} — Ajans Reel`,
        contentUrl: videoUrl, platform: 'instagram', contentType: 'instagram_reel',
        content: JSON.stringify({ videoUrl, caption: item.caption, kind: 'instagram_reel', agencyUrl }),
        metadata: { videoUrl, agencyUrl, caption: item.caption, source: 'runway_agency' },
      });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      onApproved();
    } catch (e: any) {
      setItems(prev => prev.map(it =>
        it.ideaIndex === item.ideaIndex ? { ...it, reelBuilding: false, agencyBuilding: false, reelError: e?.message?.slice(0, 80) || 'Hata' } : it
      ));
    }
  };

  // ── Canva brand template autofill (background, non-blocking) ──────────────
  const generateCanva = async (item: ProducedItem, silent = false) => {
    if (item.canvaBuilding) return;
    setItems(prev => prev.map(it =>
      it.ideaIndex === item.ideaIndex
        ? { ...it, canvaBuilding: true, canvaError: null }
        : it
    ));

    try {
      const kindMap: Record<string, string> = {
        post: 'instagram_post', story: 'instagram_story',
        reel: 'instagram_reel', canvas: 'instagram_story',
      };
      const fmt = item.contentType.replace('instagram_', '').replace(/_/g, '');
      const kind = kindMap[fmt] ?? 'instagram_post';
      const summary = item.strategicPurpose || item.caption.slice(0, 120);

      const res = await fetch('/api/canva/autofill-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          title: item.headline.trim() || item.caption.trim().slice(0, 60),
          signal: {
            kind,
            title:    item.headline.trim() || item.caption.trim().slice(0, 60),
            headline: item.headline.trim(),
            caption:  item.caption.trim(),
            summary,
            cta:      item.cta.trim() || undefined,
            hashtags: item.hashtags.slice(0, 5),
          },
        }),
        signal: AbortSignal.timeout(60_000),
      });

      const data = await res.json();

      if (!res.ok) {
        // 401 = not connected; 409 = no templates — silent fail in background mode
        if (silent) {
          setItems(prev => prev.map(it =>
            it.ideaIndex === item.ideaIndex ? { ...it, canvaBuilding: false } : it
          ));
          return;
        }
        throw new Error(
          res.status === 401 ? 'Canva bağlı değil — Ayarlar → Canva ile Bağlan' :
          res.status === 409 ? 'Bu format için yayınlı Canva şablonu bulunamadı' :
          (data.error ?? 'Canva hatası'),
        );
      }

      const design = data.design;
      const editUrl: string | null = design?.url ?? design?.urls?.edit_url ?? null;
      const thumbUrl: string | null = design?.thumbnail?.url ?? null;
      const templateTitle: string | null = data.decision?.template?.title ?? null;

      if (!editUrl) throw new Error('Canva tasarım URL\'si alınamadı.');

      setItems(prev => prev.map(it =>
        it.ideaIndex === item.ideaIndex
          ? { ...it, canvaEditUrl: editUrl, canvaThumb: thumbUrl, canvaTemplate: templateTitle, canvaBuilding: false, canvaError: null }
          : it
      ));
      if (!silent) {
        setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'canva' }));
      }

      await apiClient.saveCreativeArtifact({
        title:       `${item.headline || brandName} — Canva ${templateTitle ?? fmt}`,
        contentUrl:  editUrl,
        platform:    'canva',
        contentType: kind,
        content: JSON.stringify({
          canvaEditUrl: editUrl, canvaThumbnail: thumbUrl,
          canvaDesignId: design?.id, templateTitle, caption: item.caption, kind, source: 'canva_autofill',
        }),
        metadata: { source: 'canva_autofill', canvaEditUrl: editUrl, canvaDesignId: design?.id, templateTitle, contentKind: kind },
      });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    } catch (e: any) {
      setItems(prev => prev.map(it =>
        it.ideaIndex === item.ideaIndex
          ? { ...it, canvaBuilding: false, canvaError: e?.message?.slice(0, 120) || 'Canva hatası' }
          : it
      ));
    }
  };

  // Keep ref stable for useCallback closures
  generateCanvaRef.current = generateCanva;

  const approvedCount = items.filter(i => i.status === 'approved').length;
  const readyCount    = items.filter(i => i.status === 'ready').length;
  const FORMAT_COLOR: Record<string, string> = { post: '#8B5CF6', story: '#F472B6', reel: '#F59E0B', carousel: '#60A5FA' };

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', flexDirection: 'column' }}>

      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && uploadTargetIdx.current !== null) {
            uploadPhoto(uploadTargetIdx.current, file);
          }
          e.target.value = '';
        }}
      />

      {/* Header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 14px) 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <button onClick={onClose} style={{ ...t.backBtn, cursor: 'pointer', width: 34, height: 34,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, border: 'none' }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.02em' }}>
              İçerik Feed'i
            </div>
            <div style={{ fontSize: 12, color: t.textMuted }}>
              {producing
                ? `${doneCount}/${ideas.length} hazırlanıyor…`
                : `${readyCount + approvedCount} içerik hazır · ${approvedCount} onaylandı`}
            </div>
          </div>
          {approvedCount > 0 && (
            <button onClick={() => (window as any).__navigateToOutputs?.() }
              style={{ padding: '7px 14px', borderRadius: 20, cursor: 'pointer', border: 'none',
                background: 'rgba(16,185,129,0.12)', color: '#10B981', fontSize: 12, fontWeight: 700 }}>
              Outputs ({approvedCount}) →
            </button>
          )}
        </div>

        {/* Progress bar */}
        {producing && (
          <div style={{ height: 3, background: t.separator, borderRadius: 2, marginBottom: 10 }}>
            <div style={{ height: '100%', background: t.accent, borderRadius: 2,
              width: `${(doneCount / ideas.length) * 100}%`, transition: 'width 0.3s ease' }} />
          </div>
        )}
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px calc(80px + env(safe-area-inset-bottom,0px))', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.map((item) => {
          const fmt = item.contentType.replace('instagram_', '').replace(/_/g, ' ');
          const fmtColor = FORMAT_COLOR[item.contentType.replace('instagram_', '')] ?? t.accent;
          const isPortrait = item.contentType.includes('story') || item.contentType.includes('reel');
          const captionMode = activeCaption[item.ideaIndex] ?? 'primary';
          const shownCaption = captionMode === 'alt' && item.captionAlt ? item.captionAlt : item.caption;
          const visualMode = activeVisual[item.ideaIndex] ?? 'photo';
          const shownImage =
            visualMode === 'canvas'  && item.canvasUrl  ? item.canvasUrl  :
            visualMode === 'agency'  && item.agencyUrl  ? item.agencyUrl  :
            visualMode === 'reel'    && item.reelUrl    ? item.reelUrl    :
            visualMode === 'canva'   && item.canvaThumb ? item.canvaThumb :
            item.imageUrl;
          const isApproved = item.status === 'approved';
          const isSkipped  = item.status === 'skipped';

          return (
            <div key={item.ideaIndex} style={{
              borderRadius: 20,
              background: t.surface,
              border: `1px solid ${isApproved ? 'rgba(16,185,129,0.3)' : isSkipped ? 'transparent' : t.separator}`,
              overflow: 'hidden',
              opacity: isSkipped ? 0.4 : 1,
              transition: 'all 0.25s ease',
              boxShadow: isApproved ? '0 0 0 2px rgba(16,185,129,0.2)' : 'none',
            }}>

              {/* Visual */}
              <div style={{ position: 'relative', width: '100%', aspectRatio: isPortrait ? '9/16' : '1/1', maxHeight: isPortrait ? 480 : 360, background: t.elevated, overflow: 'hidden' }}>
                {item.status === 'producing' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${t.separator}`, borderTop: `3px solid ${fmtColor}`, animation: 'spinSlow 0.9s linear infinite' }} />
                    <span style={{ fontSize: 12, color: t.textMuted }}>İçeriğe uygun görsel aranıyor…</span>
                  </div>
                ) : visualMode === 'brand_canvas' && brandTheme ? (
                  /* ── Brand Canvas (LayoutEngine) ── */
                  <LayoutEngine
                    content={{
                      headline: item.headline,
                      subline: '',
                      bullets: [],
                      caption: item.caption,
                      cta: item.cta || '',
                      hashtags: item.hashtags.join(' '),
                      layoutId: (isPortrait ? 'story_full' : 'feed_square') as any,
                      postingTimeSuggestion: item.postingTime,
                      contentType: item.contentType,
                      format: isPortrait ? 'story' : 'feed',
                      visualBrief: {
                        treatment: 'photo',
                        galleryUrl: item.imageUrl ?? null,
                        shotType: 'environmental',
                        includePeople: false,
                      },
                      tokensHint: { primaryColor: null, overlayOpacity: null, typographyWeight: null },
                      ideaTitle: item.headline,
                      brandConfidence: 1,
                      antiPatternFlags: [],
                    } as any}
                    theme={brandTheme}
                    style={{ width: '100%', height: '100%' }}
                  />
                ) : visualMode === 'canva' && item.canvaEditUrl ? (
                  /* ── Canva design full view ── */
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, background: 'rgba(124,58,237,0.06)', position: 'relative' }}>
                    {item.canvaThumb ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={item.canvaThumb} alt="Canva şablon önizleme"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 32 }}>
                        <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>◧</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#7C3AED', textAlign: 'center' }}>
                          {item.canvaTemplate ?? 'Canva Şablonu'}
                        </div>
                      </div>
                    )}
                    {/* Edit overlay */}
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <a href={item.canvaEditUrl} target="_blank" rel="noopener noreferrer"
                        style={{
                          padding: '14px 28px', borderRadius: 18, textDecoration: 'none',
                          background: '#7C3AED', color: '#fff', fontWeight: 800, fontSize: 15,
                          display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 24px rgba(124,58,237,0.5)',
                        }}>
                        ◧ Canva&apos;da Düzenle
                      </a>
                    </div>
                    {isApproved && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#10B981',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#fff' }}>✓</div>
                      </div>
                    )}
                  </div>
                ) : shownImage ? (
                  <>
                    {visualMode === 'reel' && item.reelUrl ? (
                      <video src={item.reelUrl} autoPlay loop muted playsInline
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <img src={shownImage} alt={item.headline}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )}
                    {isApproved && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#10B981',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#fff' }}>✓</div>
                      </div>
                    )}
                  </>
                ) : (
                  /* No matching photo — show logo placeholder + upload CTA */
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
                    {logoUrl ? (
                      <img src={logoUrl} alt={brandName}
                        style={{ maxWidth: 96, maxHeight: 96, objectFit: 'contain', opacity: 0.55, borderRadius: 16 }} />
                    ) : (
                      <div style={{ width: 64, height: 64, borderRadius: 18, background: t.elevated,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, opacity: 0.5 }}>📷</div>
                    )}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.textSecondary, marginBottom: 4 }}>
                        Bu içerik için uygun görsel bulunamadı
                      </div>
                      <div style={{ fontSize: 11, color: t.textMuted }}>
                        Galeriye fotoğraf ekleyerek kullanabilirsin
                      </div>
                    </div>
                    <button
                      disabled={uploadingIdx === item.ideaIndex}
                      onClick={() => { uploadTargetIdx.current = item.ideaIndex; fileInputRef.current?.click(); }}
                      style={{ padding: '10px 20px', borderRadius: 14, border: `1.5px dashed ${t.accent}`,
                        background: `${t.accent}10`, color: t.accent, fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {uploadingIdx === item.ideaIndex
                        ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 0.8s linear infinite' }} />Yükleniyor…</>
                        : <>📤 Fotoğraf Yükle</>}
                    </button>
                  </div>
                )}

                {/* Format badge */}
                <div style={{ position: 'absolute', top: 10, left: 10, padding: '4px 10px', borderRadius: 20,
                  background: `${fmtColor}dd`, color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {fmt}
                </div>

                {/* Canva ready badge — appears when background autofill completes */}
                {item.canvaEditUrl && visualMode !== 'canva' && (
                  <button
                    onClick={() => setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'canva' }))}
                    style={{
                      position: 'absolute', top: 10, right: 10,
                      padding: '4px 10px', borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: 'rgba(124,58,237,0.88)', backdropFilter: 'blur(8px)',
                      color: '#fff', fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 5,
                      animation: 'canvaBadgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275)',
                    }}>
                    ◧ Canva
                  </button>
                )}

                {/* Canva loading indicator (background silent auto-trigger) */}
                {item.canvaBuilding && visualMode !== 'canva' && (
                  <div style={{
                    position: 'absolute', top: 10, right: 10,
                    padding: '4px 10px', borderRadius: 14,
                    background: 'rgba(124,58,237,0.6)', backdropFilter: 'blur(8px)',
                    color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%',
                      border: '1.5px solid rgba(255,255,255,0.3)', borderTop: '1.5px solid #fff',
                      animation: 'spinSlow 0.8s linear infinite' }} />
                    Canva
                  </div>
                )}

                {/* Active visual mode badge on image */}
                {item.status === 'ready' && visualMode !== 'photo' && (
                  <div style={{ position: 'absolute', bottom: 10, left: 10, padding: '4px 10px', borderRadius: 14,
                    background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, fontWeight: 600, backdropFilter: 'blur(6px)' }}>
                    {visualMode === 'canvas' ? `🎨 ${CANVAS_STYLES[(canvasStyleIdx[item.ideaIndex] ?? item.ideaIndex) % CANVAS_STYLES.length]?.name}` :
                     visualMode === 'agency' ? '✦ Ajans' :
                     visualMode === 'reel'   ? '▶ Reel' :
                     visualMode === 'brand_canvas' ? '✦ Marka Kiti' :
                     visualMode === 'canva'  ? `◧ ${item.canvaTemplate?.slice(0, 20) ?? 'Canva'}` : ''}
                  </div>
                )}
              </div>

              {/* Caption */}
              <div style={{ padding: '14px 16px' }}>
                {/* Headline */}
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, marginBottom: 8, letterSpacing: '-0.01em' }}>
                  {item.headline}
                </div>

                {/* Caption text */}
                <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55, margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>
                  {shownCaption}
                </p>

                {/* ── Üretim Seçenekleri ── */}
                {item.status === 'ready' && (
                  <div style={{ marginBottom: 12 }}>

                    {/* Caption A/B + active visual badge satırı */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      {item.captionAlt && (
                        <>
                          <span style={{ fontSize: 11, color: t.textMuted }}>Metin:</span>
                          {(['primary', 'alt'] as const).map(mode => (
                            <button key={mode} onClick={() => setActiveCaptions(prev => ({ ...prev, [item.ideaIndex]: mode }))}
                              style={{ padding: '4px 10px', borderRadius: 12, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                border: `1px solid ${captionMode === mode ? t.accent : t.separator}`,
                                background: captionMode === mode ? `${t.accent}18` : 'transparent',
                                color: captionMode === mode ? t.accent : t.textMuted }}>
                              {mode === 'primary' ? 'A' : 'B'}
                            </button>
                          ))}
                        </>
                      )}

                      {/* Active visual mode badge */}
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {visualMode !== 'photo' && (
                          <button onClick={() => setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'photo' }))}
                            style={{ padding: '3px 8px', borderRadius: 10, border: `1px solid ${t.separator}`,
                              background: 'transparent', color: t.textMuted, fontSize: 10, cursor: 'pointer' }}>
                            ← Fotoğrafa Dön
                          </button>
                        )}
                        {photoPool.length > 1 && (
                          <button
                            onClick={() => cyclePhoto(item)}
                            title="İçeriğe uygun farklı bir görsel dene"
                            style={{
                              padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                              border: `1px solid ${t.separator}`,
                              background: t.elevated,
                              color: t.textSecondary,
                              fontSize: 11, fontWeight: 600,
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                            <span style={{ fontSize: 13 }}>↺</span>
                            <span>Görsel</span>
                            <span style={{ fontSize: 10, color: t.textMuted }}>
                              {((itemPhotoIdx[item.ideaIndex] ?? photoPool.findIndex(u => u.split('?')[0] === item.imageUrl?.split('?')[0])) % photoPool.length) + 1}/{photoPool.length}
                            </span>
                          </button>
                        )}
                        <button onClick={() => setExpandedPanel(prev => ({ ...prev, [item.ideaIndex]: !prev[item.ideaIndex] }))}
                          style={{ padding: '4px 10px', borderRadius: 12, border: `1px solid ${t.accent}`,
                            background: `${t.accent}14`, color: t.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          {expandedPanel[item.ideaIndex] ? 'Kapat ✕' : '⊞ Seçenekler'}
                        </button>
                      </div>
                    </div>

                    {/* Expanded production panel */}
                    {expandedPanel[item.ideaIndex] && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 0' }}>

                        {/* Canvas styles */}
                        {CANVAS_STYLES.map((style, si) => {
                          const styleActive = visualMode === 'canvas' && (canvasStyleIdx[item.ideaIndex] ?? item.ideaIndex) % CANVAS_STYLES.length === si;
                          return (
                            <button key={si}
                              onClick={async () => {
                                setCanvasStyleIdx(prev => ({ ...prev, [item.ideaIndex]: si }));
                                setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, canvasBuilding: true } : it));
                                setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'canvas' }));
                                const fmt = item.contentType.replace('instagram_', '');
                                const ct: 'post' | 'story' | 'reel' = fmt.includes('story') ? 'story' : fmt.includes('reel') ? 'reel' : 'post';
                                try {
                                  const url = await composeBrandPhotoCard({ photoUrl: item.imageUrl!, headline: item.headline, cta: item.cta || 'Keşfet', contentType: ct, styleIdx: si });
                                  setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, canvasUrl: url, canvasBuilding: false } : it));
                                } catch {
                                  setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, canvasBuilding: false } : it));
                                }
                              }}
                              disabled={!item.imageUrl || item.canvasBuilding}
                              style={{ padding: '10px 8px', borderRadius: 12, cursor: 'pointer', fontSize: 11, fontWeight: 600, textAlign: 'left',
                                border: `1.5px solid ${styleActive ? t.accent : t.separator}`,
                                background: styleActive ? `${t.accent}14` : t.elevated,
                                color: styleActive ? t.accent : t.textSecondary }}>
                              <span style={{ fontSize: 15 }}>{style.icon}</span>
                              <span style={{ marginLeft: 6 }}>{style.name}</span>
                              <span style={{ display: 'block', fontSize: 10, color: t.textMuted, marginTop: 2 }}>Canvas</span>
                            </button>
                          );
                        })}

                        {/* Ajans Tasarımı */}
                        <button onClick={() => generateAgency(item)}
                          disabled={!item.imageUrl || item.agencyBuilding}
                          style={{ padding: '10px 8px', borderRadius: 12, cursor: 'pointer', fontSize: 11, fontWeight: 600, textAlign: 'left',
                            border: `1.5px solid ${visualMode === 'agency' ? '#8B5CF6' : t.separator}`,
                            background: visualMode === 'agency' ? 'rgba(139,92,246,0.12)' : t.elevated,
                            color: visualMode === 'agency' ? '#8B5CF6' : t.textSecondary,
                            gridColumn: 'span 1' }}>
                          <span style={{ fontSize: 15 }}>{item.agencyBuilding ? '⏳' : '✦'}</span>
                          <span style={{ marginLeft: 6 }}>{item.agencyBuilding ? 'Üretiliyor…' : 'Ajans Tasarımı'}</span>
                          <span style={{ display: 'block', fontSize: 10, color: t.textMuted, marginTop: 2 }}>GPT-image-1</span>
                        </button>

                        {/* Reel (raw photo → Runway) */}
                        <button onClick={() => generateReel(item)}
                          disabled={!item.imageUrl || item.reelBuilding}
                          style={{ padding: '10px 8px', borderRadius: 12, cursor: 'pointer', fontSize: 11, fontWeight: 600, textAlign: 'left',
                            border: `1.5px solid ${visualMode === 'reel' ? '#10B981' : t.separator}`,
                            background: visualMode === 'reel' ? 'rgba(16,185,129,0.12)' : t.elevated,
                            color: visualMode === 'reel' ? '#10B981' : t.textSecondary }}>
                          <span style={{ fontSize: 15 }}>{item.reelBuilding ? '⏳' : '▶'}</span>
                          <span style={{ marginLeft: 6 }}>{item.reelBuilding ? 'Video üretiliyor…' : 'Reel Üret'}</span>
                          <span style={{ display: 'block', fontSize: 10, color: item.reelError ? '#F87171' : t.textMuted, marginTop: 2 }}>
                            {item.reelError || 'Fotoğraf → Runway'}
                          </span>
                        </button>

                        {/* Ajans Still → Reel (portrait only) */}
                        {isPortrait && (
                          <button onClick={() => generateAgencyReel(item)}
                            disabled={!item.imageUrl || item.reelBuilding || item.agencyBuilding}
                            style={{ padding: '10px 8px', borderRadius: 12, cursor: 'pointer', fontSize: 11, fontWeight: 600, textAlign: 'left',
                              border: `1.5px solid ${item.agencyBuilding || item.reelBuilding ? '#F59E0B' : '#ec4899'}`,
                              background: item.agencyBuilding || item.reelBuilding ? 'rgba(245,158,11,0.1)' : 'rgba(236,72,153,0.08)',
                              color: item.agencyBuilding || item.reelBuilding ? '#F59E0B' : '#ec4899',
                              gridColumn: 'span 2' }}>
                            <span style={{ fontSize: 15 }}>
                              {item.agencyBuilding ? '🎨' : item.reelBuilding ? '⏳' : '🎬'}
                            </span>
                            <span style={{ marginLeft: 6 }}>
                              {item.agencyBuilding ? 'Ajans tasarımı üretiliyor…'
                                : item.reelBuilding ? 'Runway ile animasyona alınıyor…'
                                : 'Ajans Story → Reel'}
                            </span>
                            <span style={{ display: 'block', fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                              GPT-image-1 (9:16) → Runway gen4
                            </span>
                          </button>
                        )}

                        {/* Marka Kiti (LayoutEngine brand canvas) */}
                        {brandTheme && (
                          <button
                            onClick={() => setActiveVisual(prev => ({
                              ...prev,
                              [item.ideaIndex]: visualMode === 'brand_canvas' ? 'photo' : 'brand_canvas',
                            }))}
                            style={{ padding: '10px 8px', borderRadius: 12, cursor: 'pointer', fontSize: 11, fontWeight: 600, textAlign: 'left',
                              border: `1.5px solid ${visualMode === 'brand_canvas' ? '#a78bfa' : t.separator}`,
                              background: visualMode === 'brand_canvas' ? 'rgba(167,139,250,0.14)' : t.elevated,
                              color: visualMode === 'brand_canvas' ? '#a78bfa' : t.textSecondary }}>
                            <span style={{ fontSize: 15 }}>✦</span>
                            <span style={{ marginLeft: 6 }}>{visualMode === 'brand_canvas' ? 'Kapat' : 'Marka Kiti'}</span>
                            <span style={{ display: 'block', fontSize: 10, color: t.textMuted, marginTop: 2 }}>LayoutEngine</span>
                          </button>
                        )}

                        {/* ── Canva Şablonu ile Üret ── */}
                        <button
                          onClick={() => {
                            if (item.canvaEditUrl) {
                              setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: visualMode === 'canva' ? 'photo' : 'canva' }));
                            } else {
                              generateCanva(item, false);
                            }
                          }}
                          disabled={item.canvaBuilding}
                          style={{
                            padding: '10px 8px', borderRadius: 12, cursor: item.canvaBuilding ? 'default' : 'pointer',
                            fontSize: 11, fontWeight: 600, textAlign: 'left', gridColumn: 'span 2',
                            border: `1.5px solid ${visualMode === 'canva' && item.canvaEditUrl ? '#7C3AED' : item.canvaBuilding ? 'rgba(124,58,237,0.3)' : item.canvaError ? 'rgba(239,68,68,0.3)' : 'rgba(124,58,237,0.4)'}`,
                            background: visualMode === 'canva' && item.canvaEditUrl ? 'rgba(124,58,237,0.14)' : item.canvaBuilding ? 'rgba(124,58,237,0.06)' : 'transparent',
                            color: item.canvaError ? '#F87171' : item.canvaBuilding ? '#a78bfa' : '#7C3AED',
                            opacity: item.canvaBuilding ? 0.8 : 1,
                          }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {item.canvaBuilding ? (
                              <div style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                                border: '2px solid rgba(124,58,237,0.3)', borderTop: '2px solid #7C3AED',
                                animation: 'spinSlow 0.8s linear infinite' }} />
                            ) : (
                              <span style={{ fontSize: 15 }}>◧</span>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div>
                                {item.canvaBuilding ? 'Canva şablonu dolduruluyor…'
                                  : item.canvaEditUrl
                                    ? (visualMode === 'canva' ? '◧ Canva görünümünü kapat' : `◧ Canva: ${item.canvaTemplate?.slice(0, 24) ?? 'Marka Şablonu'}`)
                                    : item.canvaError ? `◧ Hata — tekrar dene`
                                    : '◧ Canva Şablonu ile Üret'}
                              </div>
                              <div style={{ fontSize: 10, color: item.canvaError ? '#F87171' : 'rgba(124,58,237,0.6)', marginTop: 2 }}>
                                {item.canvaError ? item.canvaError.slice(0, 60)
                                  : item.canvaEditUrl ? 'Autofill · Marka şablonunuzdan'
                                  : item.canvaBuilding ? `${item.headline.slice(0, 30)} → Canva`
                                  : 'Headline · Caption · CTA → Marka şablonu'}
                              </div>
                            </div>
                          </div>
                        </button>

                        {/* Canva result: thumbnail + edit link */}
                        {item.canvaEditUrl && (
                          <div style={{
                            gridColumn: 'span 2', borderRadius: 14, overflow: 'hidden',
                            border: '0.5px solid rgba(124,58,237,0.3)',
                            background: 'rgba(124,58,237,0.04)',
                          }}>
                            {item.canvaThumb && (
                              <div style={{ position: 'relative', width: '100%', aspectRatio: isPortrait ? '9/16' : '1/1', maxHeight: 200, overflow: 'hidden' }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={item.canvaThumb} alt="Canva önizleme"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                {/* Shimmer overlay while canva view is active */}
                                <div style={{
                                  position: 'absolute', top: 8, right: 8,
                                  background: 'rgba(124,58,237,0.85)', borderRadius: 8,
                                  padding: '3px 8px', fontSize: 10, fontWeight: 700, color: '#fff',
                                }}>
                                  ◧ {item.canvaTemplate?.slice(0, 18) ?? 'Canva'}
                                </div>
                              </div>
                            )}
                            <div style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', marginBottom: 2 }}>
                                  ✓ Tasarım hazır — Outputs&apos;a eklendi
                                </div>
                                {item.canvaTemplate && (
                                  <div style={{ fontSize: 10, color: 'rgba(124,58,237,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.canvaTemplate}
                                  </div>
                                )}
                              </div>
                              <a href={item.canvaEditUrl} target="_blank" rel="noopener noreferrer"
                                style={{
                                  flexShrink: 0, padding: '8px 14px', borderRadius: 10, textDecoration: 'none',
                                  background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 12,
                                  display: 'flex', alignItems: 'center', gap: 5,
                                }}>
                                ◧ Düzenle
                              </a>
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )}

                {/* Hashtags */}
                {item.hashtags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                    {item.hashtags.slice(0, 8).map(h => (
                      <span key={h} style={{ fontSize: 11, color: t.accent, background: `${t.accent}12`, padding: '2px 8px', borderRadius: 10 }}>{h}</span>
                    ))}
                  </div>
                )}

                {/* Posting time */}
                {item.postingTime && (
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>
                    🕐 {item.postingTime.slice(0, 60)}
                  </div>
                )}

                {/* Actions */}
                {item.status === 'ready' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => approve(item)}
                      disabled={saveMutation.isPending || !item.imageUrl}
                      style={{ flex: 2, padding: '12px 0', borderRadius: 14, border: 'none', cursor: item.imageUrl ? 'pointer' : 'not-allowed',
                        background: item.imageUrl ? 'linear-gradient(135deg, #10B981cc, #10B98188)' : t.elevated,
                        color: item.imageUrl ? '#fff' : t.textMuted,
                        fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {saveMutation.isPending ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} />Kaydediliyor</> : '✓ Onayla'}
                    </button>
                    <button
                      disabled={uploadingIdx === item.ideaIndex}
                      onClick={() => { uploadTargetIdx.current = item.ideaIndex; fileInputRef.current?.click(); }}
                      title="Cihazdan fotoğraf yükle ve galeriye ekle"
                      style={{ padding: '12px 14px', borderRadius: 14, border: `1px solid ${t.separator}`,
                        cursor: 'pointer', background: t.elevated, color: t.textSecondary, fontSize: 16 }}>
                      {uploadingIdx === item.ideaIndex
                        ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 0.8s linear infinite' }} />
                        : '📤'}
                    </button>
                    <button onClick={() => skip(item)}
                      style={{ padding: '12px 14px', borderRadius: 14, border: `1px solid ${t.separator}`,
                        cursor: 'pointer', background: 'transparent', color: t.textMuted, fontSize: 13, fontWeight: 600 }}>
                      Geç
                    </button>
                  </div>
                )}

                {isApproved && (
                  <div style={{ padding: '10px 0', textAlign: 'center', fontSize: 13, color: '#10B981', fontWeight: 600 }}>
                    ✓ Outputs'a eklendi
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
