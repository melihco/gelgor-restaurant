'use client';
/**
 * AutoProductionFeed
 *
 * Takes content ideation output and automatically:
 *   1. Picks the best matching gallery photo for each idea
 *   2. Applies canvas overlay; auto Canva autofill (post/story/reel) as ek çıktı
 *   3. Shows produced cards in a swipeable vertical feed
 *   4. User taps ✓ to approve → saved as artifact → appears in Outputs
 *
 * Zero manual steps between "idea" and "ready to post".
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantBrandContext } from '../TenantBrandProvider';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { parseArtifactContent } from '@/app/mobile/_components/artifact-utils';
import type { OutputArtifact } from '@/types';
import { isCanvaEnabledClient } from '@/lib/canva-config';
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';

const CANVA_ACTIVE = isCanvaEnabledClient();
import {
  assignPhotosToContents,
  buildGalleryLookup,
  matchPhotoToContent,
  rankPhotosForContent,
  resolveBestGalleryUrl,
  enrichGalleryAnalysis,
  MIN_ACCEPT_SCORE,
  classifyMatch,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
} from '@/lib/gallery-photo-matcher';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import {
  mergeSectorGallerySeed,
  SYNTHETIC_GALLERY_MIN,
} from '@/lib/sector-gallery-seed';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import { productionIdeaFromRecord } from '@/lib/production-idea-parse';
import { buildReelPayload, auditRendererPayload, type RendererBrandContext } from '@/lib/renderer-payload';
import {
  buildMultiReelPhotoInputs,
  callGenerateMultiReel,
  isUsableReelPhotoUrl,
  maxPhotosForStrategy,
  resolveRunwayReelStrategy,
} from '@/lib/reel-multi-production';
import { fetchAnnouncementBrandKitPreview } from '@/lib/brand-kit-preview';
import { resolveContentIntent } from '@/lib/brand-motion-profile';
import { ensureBrandTemplateLibrary, resolveProductionTemplate } from '@/lib/brand-template-library';
import { buildCanvaMissionSignal } from '@/lib/canva-mission-signal';
import { upscaleCdnUrl } from './MissionContentFactory';
// composeBrandPhotoCard, composeAgencyDesignCard, CANVAS_STYLES removed — Remotion handles story/reel designs
import type { BrandTheme } from '@/types/brand-theme';
import { useBrandStoryTemplates } from '@/hooks/useBrandStoryTemplates';
import { filterFeedPublishableArtifacts } from '@/lib/weekly-publish-package';
import { parseArtifactMissionId } from '@/lib/mission-feed-package';
import { MissionFeedPreviewGrid } from '../MissionFeedPreviewGrid';
import {
  buildStoryRemotionRenderRequest,
  ideaFieldsForStoryTemplate,
  resolveMissionStoryTemplate,
  resolveStoryTemplateForSlot,
} from '@/lib/mission-story-template';

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
  imageUrl: string | null;       // raw gallery photo (reference — preserved for reel/story video)
  referencePhotoUrl: string | null;
  reelUrl: string | null;        // Remotion MP4 (stories) or Runway MP4 (reels)
  reelBuilding: boolean;
  reelError: string | null;
  // ── Canva autofill (optional, disabled by default) ─────────
  canvaEditUrl: string | null;
  canvaThumb: string | null;
  canvaDownloadUrl: string | null;
  canvaExportFormat: 'png' | 'mp4' | null;
  canvaTemplate: string | null;
  canvaBuilding: boolean;
  canvaError: string | null;
  canvaSavedToOutputs: boolean;
  // ── Deprecated (kept for type compat, always null) ──────────
  canvasUrl: string | null;
  canvasBuilding: boolean;
  agencyUrl: string | null;
  agencyBuilding: boolean;
  brandKitUrl: string | null;
  brandKitBuilding: boolean;
  storySlotKey?: string | null;
  storyTemplateName?: string | null;
  // ────────────────────────────────────────────────────────────
  strategicPurpose: string;
  postingTime: string;
  matchScore: number | null;
  status: 'producing' | 'ready' | 'approved' | 'skipped' | 'error';
  error?: string;
}

// Simplified: canvas/agency/brand_canvas removed — Remotion handles all animated story designs
type VisualMode = 'photo' | 'reel' | 'canva';

function findMissionProductionArtifact(
  artifacts: OutputArtifact[],
  missionId: string | undefined,
  ideaIndex: number,
): OutputArtifact | undefined {
  if (!missionId) return undefined;
  return artifacts.find((a) => {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const content = parseArtifactContent(a.content);
    const mid = String(meta.mission_id ?? meta.missionId ?? content.mission_id ?? '').trim();
    if (mid !== missionId) return false;
    const rawIdx = meta.idea_index ?? meta.ideaIndex ?? content.idea_index;
    if (Number(rawIdx) !== ideaIndex) return false;
    return Boolean(
      meta.production_bundle
      || meta.auto_produced
      || content.production_bundle
      || meta.source === 'auto-produce'
      || meta.source === 'remotion',
    );
  });
}

interface AutoProductionFeedProps {
  ideas: Record<string, unknown>[];
  brandRefImages: string[];
  galleryAnalysis: Record<string, GalleryMeta>;
  /** Navigate to the Outputs/Feed screen to see approved artifacts. */
  onViewOutputs?: () => void;
  tenantId: string;
  brandName: string;
  location?: string;
  logoUrl?: string;
  missionBrief: string;
  onClose: () => void;
  onApproved: () => void;
  /** Opens manual İçerik Fabrikası (advanced mode) */
  onAdvanced?: () => void;
  /** Sector for template library resolution (beach_club, restaurant, …) */
  sector?: string;
  /** Links saved artifacts to Mission Hub weekly feed package selection */
  missionId?: string | null;
  nodeKey?: string | null;
  /**
   * APO-3.7 — Mission already produced on server (auto-produce after ideation).
   * Skips client-side duplicate production (incl. Canva).
   */
  serverProductionOnly?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerFileDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function exportCanvaDesignFile(input: {
  tenantId: string;
  designId: string;
  title: string;
  kind: string;
}): Promise<{ permanentPreviewUrl?: string; format?: 'png' | 'mp4' }> {
  const format = input.kind.includes('reel') ? 'mp4' : 'png';
  const res = await fetch('/api/canva/export-design', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: input.tenantId,
      designId: input.designId,
      title: input.title,
      format,
    }),
  });
  const data = await res.json();
  if (!res.ok && res.status !== 202) {
    throw new Error(data.error ?? 'Canva export başarısız.');
  }
  return { permanentPreviewUrl: data.permanentPreviewUrl, format };
}

function getField(idea: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = idea[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Campaign/event/canvas ideas → story; keeps post / carousel / reel distinct. */
function normalizeContentFormat(raw: string): 'post' | 'story' | 'reel' | 'carousel' {
  const ct = raw.replace(/^instagram_/, '').toLowerCase();
  if (
    ct.includes('story') || ct.includes('canvas') || ct.includes('event')
    || ct.includes('announcement') || ct.includes('campaign')
  ) return 'story';
  if (ct.includes('reel')) return 'reel';
  if (ct.includes('carousel')) return 'carousel';
  return 'post';
}

function kindFromFormat(fmt: 'post' | 'story' | 'reel' | 'carousel'): string {
  if (fmt === 'story') return 'instagram_story';
  if (fmt === 'reel') return 'instagram_reel';
  if (fmt === 'carousel') return 'instagram_carousel';
  return 'instagram_post';
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
  if (typeof url !== 'string' || !url.startsWith('http')) return null;
  return isUsableGalleryPhotoUrl(url) ? url : null;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AutoProductionFeed({
  ideas,
  brandRefImages,
  galleryAnalysis,
  tenantId,
  brandName,
  location,
  missionBrief,
  logoUrl,
  onClose,
  onApproved,
  onAdvanced,
  onViewOutputs,
  sector,
  missionId = null,
  nodeKey = null,
  serverProductionOnly = false,
}: AutoProductionFeedProps) {
  const tenantBrand = useTenantBrandContext();
  const resolvedSector = sector || tenantBrand.sector || tenantBrand.businessType || 'general_business';
  const effectiveBrandName = brandName || tenantBrand.brandName;
  const effectiveLocation = location || tenantBrand.location;
  const effectiveLogoUrl = logoUrl || tenantBrand.logoUrl;
  const { t } = useTheme();
  const { openPlatformPreview, openStoryTemplates } = useMobileStore();
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
  const reelAttemptedRef = useRef(new Set<number>());
  const feedSavedRef = useRef(new Set<number>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetIdx = useRef<number | null>(null);
  // Stable ref to generateCanva so produceAll closure can call it without stale capture
  const generateCanvaRef = useRef<((item: ProducedItem, silent?: boolean) => Promise<void>) | null>(null);
  const generateReelRef = useRef<(item: ProducedItem) => Promise<void>>(async () => {});

  // Registry-backed field limits (for mission → Canva copy trimming)
  const { data: canvaLimitsByKind } = useQuery({
    queryKey: ['canva-field-limits', tenantId],
    queryFn: async () => {
      const kinds = ['instagram_post', 'instagram_story', 'instagram_reel'] as const;
      const out: Record<string, { registryMin?: Record<string, number> }> = {};
      await Promise.all(kinds.map(async (kind) => {
        try {
          const res = await fetch(`/api/canva/field-limits?tenantId=${encodeURIComponent(tenantId)}&kind=${kind}`);
          if (res.ok) out[kind] = await res.json();
        } catch { /* dictionary-only fallback */ }
      }));
      return out;
    },
    staleTime: 10 * 60_000,
    enabled: !!tenantId,
  });

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
  const { data: existingArtifacts = [] } = useMobileArtifacts({
    subscribeOnly: true,
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
  const photoPool = (() => {
    const filtered = brandRefImages
      .filter(u => isUsableGalleryPhotoUrl(u))
      .filter(u => {
        const l = u.toLowerCase();
        if (['logo','icon','banner','footer','-150x','-300x'].some(p => l.includes(p))) return false;
        return !usedPreviouslyBases.has(u.split('?')[0] as string);
      })
      .map(upscaleCdnUrl);
    if (filtered.length >= SYNTHETIC_GALLERY_MIN) return filtered;
    const { urls } = mergeSectorGallerySeed(filtered, resolvedSector, SYNTHETIC_GALLERY_MIN);
    return urls.map(upscaleCdnUrl);
  })();

  const { library: storyTemplateLibrary, isLocked: storyLibraryLocked } = useBrandStoryTemplates(tenantId, resolvedSector);

  const renderStoryForItem = useCallback(async (
    item: ProducedItem,
    pick: ReturnType<typeof resolveMissionStoryTemplate>,
    photoUrl: string,
  ) => {
    const idea = ideas[item.ideaIndex] as Record<string, unknown> | undefined;
    const mood = String(idea?.mood ?? '').toLowerCase();
    const body = buildStoryRemotionRenderRequest({
      pick,
      workspaceId: tenantId,
      photoUrl,
      headline: item.headline,
      caption: item.caption,
      brandName: brandName || 'BRAND',
      location,
      mood,
      logoUrl,
      primaryColor: brandTheme?.palette?.primary,
      accentColor: brandTheme?.palette?.accent,
      fontFamily: brandTheme?.typography?.headingFont,
      bodyFont: brandTheme?.typography?.bodyFont,
      brandTheme: brandTheme as Record<string, unknown> | null | undefined,
      sector: resolvedSector,
    });
    const res = await fetch('/api/remotion/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return;
    const data = await res.json();
    const videoUrl: string | null = data.videoUrl || null;
    if (!videoUrl) return;
    const compositionId = typeof data.compositionId === 'string' ? data.compositionId : undefined;
    const grafikerScore = typeof data.grafikerScore === 'number' ? data.grafikerScore : undefined;
    const grafikerPass = typeof data.grafikerPass === 'boolean' ? data.grafikerPass : undefined;
    const renderMs = typeof data.durationMs === 'number' ? data.durationMs : undefined;
    setItems(prev => prev.map(it =>
      it.ideaIndex === item.ideaIndex ? { ...it, reelUrl: videoUrl, canvasBuilding: false } : it,
    ));
    setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'reel' }));

    // Patch existing auto-produce artifact, or create poster-first bundle then attach MP4
    const fmt = normalizeContentFormat(item.contentType);
    const kind = kindFromFormat(fmt);
    try {
      const existing = findMissionProductionArtifact(existingArtifacts, missionId ?? undefined, item.ideaIndex);
      if (existing?.id) {
        await apiClient.attachVideoToArtifact(existing.id, videoUrl, photoUrl, {
          compositionId,
          grafikerScore,
          grafikerPass,
          renderMs,
        });
      } else {
        const saved = await apiClient.saveCreativeArtifact({
          title: item.headline || `${brandName} — ${fmt}`,
          contentUrl: photoUrl,
          content: JSON.stringify({
            kind,
            contentType: fmt,
            caption: item.caption,
            hashtags: item.hashtags,
            cta: item.cta,
            headline: item.headline,
            imageUrl: photoUrl,
            posterUrl: photoUrl,
            videoUrl: null,
            source: 'remotion',
            idea_index: item.ideaIndex,
            production_bundle: true,
            bundle_status: 'rendering',
          }),
          platform: 'instagram',
          contentType: fmt,
          metadata: {
            contentType: fmt,
            kind,
            platform: 'instagram',
            headline: item.headline,
            caption: item.caption?.slice(0, 300),
            cta: item.cta,
            hashtags: item.hashtags?.slice(0, 10),
            strategic_purpose: item.strategicPurpose?.slice(0, 200),
            mission_brief: missionBrief?.slice(0, 200),
            mission_id: missionId,
            node_key: nodeKey,
            idea_index: item.ideaIndex,
            imageUrl: photoUrl,
            poster_url: photoUrl,
            posterUrl: photoUrl,
            source: 'remotion',
            production_bundle: true,
            bundle_status: 'rendering',
            publish_package: 'primary',
          },
        });
        await apiClient.attachVideoToArtifact(saved.id, videoUrl, photoUrl, {
          compositionId,
          grafikerScore,
          grafikerPass,
          renderMs,
        });
      }
      feedSavedRef.current.add(item.ideaIndex);
      setItems(prev => prev.map(it =>
        it.ideaIndex === item.ideaIndex ? { ...it, status: 'approved' } : it,
      ));
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      onApproved();
    } catch { /* non-blocking — user can still manual approve */ }
  }, [ideas, tenantId, brandName, location, logoUrl, brandTheme, missionId, nodeKey, missionBrief, queryClient, onApproved, existingArtifacts]);

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
      referencePhotoUrl: null,
      canvasUrl:        null,
      canvasBuilding:   false,
      agencyUrl:        null,
      agencyBuilding:   false,
      reelUrl:          null,
      reelBuilding:     false,
      reelError:        null,
      canvaEditUrl:     null,
      canvaThumb:       null,
      canvaDownloadUrl: null,
      canvaExportFormat: null,
      canvaTemplate:    null,
      canvaBuilding:    false,
      canvaError:       null,
      canvaSavedToOutputs: false,
      brandKitUrl:        null,
      brandKitBuilding:   false,
      strategicPurpose: getField(idea, 'strategic_purpose', 'hook'),
      postingTime:      getField(idea, 'posting_time_suggestion'),
      matchScore:       null,
      status:           'producing',
    }));
    setItems(initial);

    // Enrich gallery metadata: derive tags/bestFor/usageContext from descriptions
    // when the stored analysis only has description + mood (missing structured tags).
    const meta = enrichGalleryAnalysis(galleryAnalysis as Record<string, GalleryPhotoMeta>);
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
    // Sprint 2 (S2.9): collect match scores to feed the GIS matcher-avg log
    const sessionMatchScores: number[] = [];
    const usedTemplateIds: string[] = [];

    for (let i = 0; i < initial.length; i++) {
      const item = initial[i]!;
      const { input, agentUrl: agentUrlRaw } = batchItems[i]!;
      const available = photoPool.filter(u => !usedInSession.has(normalizeGalleryUrl(u)));

      let imageUrl: string | null = null;
      let matchScore: number | null = null;
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
        matchScore = resolved?.score ?? null;
      }

      if (!imageUrl && assigned && !usedInSession.has(normalizeGalleryUrl(assigned.url))) {
        imageUrl = assigned.url;
        matchScore = assigned.score ?? null;
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
        matchScore = fallback?.score ?? null;
      }

      if (imageUrl) usedInSession.add(normalizeGalleryUrl(imageUrl));
      if (imageUrl && typeof matchScore === 'number') sessionMatchScores.push(matchScore);

      await new Promise(r => setTimeout(r, 80));

      if (!imageUrl) {
        setItems(prev => prev.map((it, idx) =>
          idx === i ? { ...it, matchScore, status: 'ready' } : it
        ));
        setDoneCount(i + 1);
        continue;
      }

      const itemRef = initial[i]!;
      const fmt = normalizeContentFormat(itemRef.contentType);
      const contentTypeFmt: 'post' | 'story' | 'reel' =
        fmt === 'story' ? 'story' : fmt === 'reel' ? 'reel' : 'post';

      // Marky layer: sync branded template — never show raw gallery as "ready"
      setItems(prev => prev.map((it, idx) =>
        idx === i ? {
          ...it,
          imageUrl,
          referencePhotoUrl: imageUrl,
          matchScore,
          brandKitBuilding: fmt !== 'reel',
          reelBuilding: fmt === 'reel',
          status: fmt === 'reel' ? 'ready' : 'producing',
        } : it
      ));

      if (fmt === 'reel') {
        setDoneCount(i + 1);
        const reelSnapshot: ProducedItem = {
          ...initial[i]!,
          imageUrl,
          referencePhotoUrl: imageUrl,
          matchScore,
          brandKitUrl: null,
          brandKitBuilding: false,
          reelBuilding: true,
          reelUrl: null,
          reelError: null,
          status: 'ready',
        };
        queueMicrotask(() => { void generateReelRef.current(reelSnapshot); });
        continue;
      }

      try {
          const ideaRecord = ideas[i] as Record<string, unknown>;
          const storyPick = fmt === 'story'
            ? resolveMissionStoryTemplate({
              theme: brandTheme as Record<string, unknown> | null,
              sector: resolvedSector,
              tenantId,
              idea: ideaRecord,
              ideaIndex: i,
              usedTemplateIds,
            })
            : null;
          if (storyPick?.storyTemplateId) usedTemplateIds.push(storyPick.storyTemplateId);

          let posterTemplateId: string | undefined;
          if (fmt === 'post' || fmt === 'carousel') {
            const { treatment, templateUseCase, mood, headline } = ideaFieldsForStoryTemplate(ideaRecord);
            const intent = resolveContentIntent({ treatment, templateUseCase, mood, headline });
            const library = ensureBrandTemplateLibrary(brandTheme as unknown as Record<string, unknown>, {
              sector: resolvedSector,
              tenantId,
            });
            const production = resolveProductionTemplate({
              library,
              sector: resolvedSector,
              intent,
              treatment,
              ideaIndex: i,
              format: 'post',
              usedTemplateIds,
              brandTheme: brandTheme as Record<string, unknown> | null | undefined,
            });
            posterTemplateId = production.posterTemplateId;
          }

          const brandedUrl = await fetchAnnouncementBrandKitPreview({
            photoUrl: imageUrl,
            headline: itemRef.headline,
            cta: itemRef.cta,
            tagline: itemRef.caption.slice(0, 80),
            contentType: fmt === 'story' ? 'story' : 'post',
            tenantId,
            brandName: effectiveBrandName,
            location: effectiveLocation,
            brandTheme,
            templateId: posterTemplateId ?? storyPick?.storyTemplateId,
          });

          setItems(prev => prev.map((it, idx) =>
            idx === i ? {
              ...it,
              brandKitUrl: brandedUrl,
              brandKitBuilding: false,
              storySlotKey: storyPick?.slot.key ?? null,
              storyTemplateName: storyPick?.templateName ?? null,
              status: 'ready',
            } : it
          ));

          // Premium: Remotion MP4 upgrades story (static Marky poster shown until video ready)
          if (contentTypeFmt === 'story' && storyPick) {
            renderStoryForItem(itemRef, storyPick, imageUrl).catch(() => { /* non-blocking */ });
          }
        } catch (brandErr) {
          console.warn('[AutoProductionFeed] brand kit overlay failed:', brandErr);
          setItems(prev => prev.map((it, idx) =>
            idx === i ? { ...it, brandKitBuilding: false, status: 'ready' } : it
          ));
        }

      setDoneCount(i + 1);
    }

    // Log match scores so GIS can evaluate matcher-avg (fire-and-forget).
    // Only log scores that represent a real match (>= MIN_ACCEPT_SCORE) to avoid
    // polluting the rolling average with zero/null values from skipped ideas.
    const meaningfulScores = sessionMatchScores.filter(s => s >= MIN_ACCEPT_SCORE);
    if (meaningfulScores.length > 0 && tenantId) {
      fetch(`/api/brand-context/${tenantId}/gallery-match-stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: meaningfulScores }),
      }).catch(() => { /* non-critical telemetry */ });
    }

    setProducing(false);
  }, [ideas, photoPool, galleryAnalysis, usedPreviouslyBases, tenantId, brandName, location, sector, brandTheme, renderStoryForItem, effectiveBrandName, effectiveLocation, resolvedSector]);

  useEffect(() => {
    if (serverProductionOnly) return;
    produceAll();
  }, [produceAll, serverProductionOnly]);

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
        ? { ...it, imageUrl: next.url, matchScore: next.score ?? null, canvasUrl: null, agencyUrl: null, reelUrl: null }
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
      const brandedStill = item.brandKitUrl ?? item.imageUrl;
      const rawUrl =
        vm === 'canva' && item.canvaDownloadUrl ? item.canvaDownloadUrl :
        vm === 'canva' && item.canvaThumb       ? item.canvaThumb :
        vm === 'reel'  && item.reelUrl          ? item.reelUrl   :
        brandedStill;
      if (!rawUrl) throw new Error('Görsel yok');
      const caption = useAlt && item.captionAlt ? item.captionAlt : item.caption;
      const fmt = normalizeContentFormat(item.contentType);
      const kind = kindFromFormat(fmt);

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

      const isReel = kind.includes('reel');
      // Story with Remotion video: finalUrl is the MP4.
      // imageUrl must be the ORIGINAL gallery photo, videoUrl must be the MP4.
      const hasRemotionVideo = kind === 'instagram_story' && item.reelUrl && vm === 'reel';
      const videoUrlToSave = (isReel || hasRemotionVideo) ? finalUrl : undefined;
      const imageUrlToSave = hasRemotionVideo
        ? (item.referencePhotoUrl || item.imageUrl || undefined)
        : isReel ? undefined
        : finalUrl;
      const referencePhoto = item.referencePhotoUrl || item.imageUrl || undefined;
      const markyBranded = Boolean(item.brandKitUrl && referencePhoto && item.brandKitUrl !== referencePhoto);
      const bundleReady = Boolean(hasRemotionVideo || (isReel && finalUrl) || markyBranded);

      return apiClient.saveCreativeArtifact({
        title: item.headline || `${brandName} — ${fmt}`,
        contentUrl: finalUrl,
        content: JSON.stringify({
          kind, contentType: fmt, caption, hashtags: item.hashtags, cta: item.cta,
          headline: item.headline,
          imageUrl: imageUrlToSave,
          posterUrl: referencePhoto,
          reference_photo_url: referencePhoto,
          videoUrl: videoUrlToSave,
          agency_branded: markyBranded,
          source: hasRemotionVideo ? 'remotion' : isReel ? 'runway' : undefined,
          canvaDownloadUrl: vm === 'canva' ? finalUrl : undefined,
          idea_index: item.ideaIndex,
          ...(bundleReady ? { production_bundle: true, bundle_status: 'ready' } : {}),
        }),
        platform: vm === 'canva' ? 'canva' : 'instagram',
        contentType: fmt,
        metadata: {
          contentType: fmt, kind, platform: vm === 'canva' ? 'canva' : 'instagram',
          headline: item.headline,
          caption: caption?.slice(0, 300),
          cta: item.cta,
          hashtags: item.hashtags?.slice(0, 10),
          strategic_purpose: item.strategicPurpose?.slice(0, 200),
          mission_brief: missionBrief?.slice(0, 200),
          mission_id: missionId,
          node_key: nodeKey,
          idea_index: item.ideaIndex,
          imageUrl: isReel ? undefined : (imageUrlToSave ?? finalUrl),
          poster_url: referencePhoto,
          posterUrl: referencePhoto,
          reference_photo_url: referencePhoto,
          agency_branded: markyBranded,
          videoUrl: isReel ? finalUrl : videoUrlToSave,
          permanentPreviewUrl: vm === 'canva' ? finalUrl : undefined,
          visual_mode: vm,
          publish_package: 'primary',
          ...(bundleReady ? { production_bundle: true, bundle_status: 'ready' } : {}),
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
    const useCanvas = false; // canvas removed — Remotion used instead
    saveMutation.mutate({ item, useAlt, useCanvas });
  };

  const skip = (item: ProducedItem) => {
    setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, status: 'skipped' } : it));
  };

  // Canvas style removed — no-op kept for type compat
  const changeCanvasStyle = (_item: ProducedItem) => { /* canvas removed, use Remotion */ };

  // generateAgency removed — Remotion handles all story/reel design
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const generateAgency = async (_item: ProducedItem) => { /* stub */ };
  // _generateAgencyFull body removed

  // ── Runway reel builder — shared core ─────────────────────────────────────
  type RunwayAnimateResult = {
    videoUrl: string;
    source: 'runway' | 'runway_multi_photo';
    strategy?: string;
    photoCount?: number;
  };

  const _runwayAnimate = async (
    item: ProducedItem,
    promptImage: string,
    source: 'photo' | 'agency' | 'canvas',
  ): Promise<RunwayAnimateResult> => {
    const baseIdea = (ideas[item.ideaIndex] as Record<string, unknown> | undefined) ?? {};
    const isReelItem = item.contentType.toLowerCase().includes('reel');
    const extraUrls = brandRefImages.filter(
      (u) => isUsableReelPhotoUrl(u) && normalizeGalleryUrl(u) !== normalizeGalleryUrl(promptImage),
    );
    const montageUrls = [promptImage, ...extraUrls].filter(isUsableReelPhotoUrl).slice(0, 4);
    const photoInputs = buildMultiReelPhotoInputs(montageUrls, galleryAnalysis, normalizeGalleryUrl);

    if (isReelItem && photoInputs.length >= 2) {
      const strategy = resolveRunwayReelStrategy({
        photoCount: photoInputs.length,
        treatment: getField(baseIdea, 'treatment', 'strategic_purpose'),
        templateUseCase: getField(baseIdea, 'template_use_case'),
        mood: getField(baseIdea, 'mood', 'tone'),
        contentType: 'reel',
      });
      const montageStrategy = strategy === 'multi_ref' ? 'multi_ref' : 'sequential';
      const limit = maxPhotosForStrategy(strategy === 'single' ? 'multi_ref' : strategy);
      const multi = await callGenerateMultiReel(window.location.origin, {
        workspaceId: tenantId,
        photos: photoInputs.slice(0, limit),
        headline: item.headline || `${brandName} Reel`,
        caption: item.caption.slice(0, 300),
        brandName,
        brandLocation: location,
        strategy: montageStrategy,
        ratio: '720:1280',
        duration: 5,
      });
      if (multi.videoUrl) {
        return {
          videoUrl: multi.videoUrl,
          source: 'runway_multi_photo' as const,
          strategy: multi.strategy,
          photoCount: multi.photoCount,
        };
      }
    }

    const cameraMotion = source === 'agency'
      ? 'arc_right'
      : String(
          (baseIdea.reel_motion_spec as Record<string, unknown> | undefined)?.camera_movement
          || ((baseIdea.visual_production_spec as Record<string, unknown> | undefined)?.reel_motion_spec as Record<string, unknown> | undefined)?.camera_movement
          || 'dolly_in',
        );
    const pIdea = productionIdeaFromRecord({
      ...baseIdea,
      headline: item.headline,
      caption_draft: item.caption,
      cta: item.cta,
      hashtags: item.hashtags,
      content_type: item.contentType,
      strategic_purpose: item.strategicPurpose,
    }, item.ideaIndex);

    const brandCtx: RendererBrandContext = {
      brandName,
      location,
      logoUrl,
      missionBrief,
      brandTone: item.strategicPurpose?.slice(0, 80),
      themeGrading: brandTheme
        ? {
            look: brandTheme.grading?.look,
            lutDirective: brandTheme.grading?.lutDirective,
            paletteDescription: brandTheme.palette?.description,
          }
        : undefined,
    };
    const photoMeta = galleryAnalysis[normalizeGalleryUrl(promptImage)] as GalleryMeta | undefined;
    const reelBody = buildReelPayload(
      pIdea,
      brandCtx,
      { photoUrl: promptImage, description: photoMeta?.description, tags: photoMeta?.contentTags },
      { cameraMotion },
    );
    auditRendererPayload('runway', reelBody as unknown as Record<string, unknown>);

    const res = await fetch('/api/generate-reel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reelBody),
    });
    const data = await res.json();
    const videoUrl: string | null = data.videoUrl ?? data.outputUrls?.[0] ?? null;
    if (!res.ok || !videoUrl) throw new Error(data.error || 'Reel üretilemedi');
    return { videoUrl, source: 'runway' as const };
  };

  // Reel üret — raw brand photo → Runway
  const generateReel = useCallback(async (item: ProducedItem) => {
    if (!item.imageUrl) return;
    if (reelAttemptedRef.current.has(item.ideaIndex) && item.reelUrl) return;
    reelAttemptedRef.current.add(item.ideaIndex);
    setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, reelBuilding: true, reelError: null } : it));
    try {
      const reelResult = await _runwayAnimate(item, item.imageUrl, 'photo');
      setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, reelUrl: reelResult.videoUrl, reelBuilding: false } : it));
      setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: 'reel' }));
      await apiClient.saveCreativeArtifact({
        title: `${item.headline || brandName} — ${reelResult.source === 'runway_multi_photo' ? 'Montaj Reel' : 'Reel'}`,
        contentUrl: reelResult.videoUrl,
        platform: 'instagram',
        contentType: 'reel',
        content: JSON.stringify({
          kind: 'instagram_reel',
          contentType: 'reel',
          videoUrl: reelResult.videoUrl,
          caption: item.caption,
          hashtags: item.hashtags,
          headline: item.headline,
          strategy: reelResult.strategy,
          photoCount: reelResult.photoCount,
          idea_index: item.ideaIndex,
        }),
        metadata: {
          kind: 'instagram_reel',
          contentType: 'reel',
          videoUrl: reelResult.videoUrl,
          caption: item.caption?.slice(0, 300),
          headline: item.headline,
          source: reelResult.source,
          runway_produced: true,
          mission_id: missionId,
          node_key: nodeKey,
          idea_index: item.ideaIndex,
          publish_package: 'primary',
          ...(reelResult.strategy ? { runway_strategy: reelResult.strategy, strategy: reelResult.strategy } : {}),
          ...(reelResult.photoCount ? { runway_photo_count: reelResult.photoCount, photoCount: reelResult.photoCount } : {}),
        },
      });
      feedSavedRef.current.add(item.ideaIndex);
      setItems(prev => prev.map(it =>
        it.ideaIndex === item.ideaIndex ? { ...it, status: 'approved' } : it,
      ));
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      onApproved();
    } catch (e: any) {
      reelAttemptedRef.current.delete(item.ideaIndex);
      setItems(prev => prev.map(it => it.ideaIndex === item.ideaIndex ? { ...it, reelBuilding: false, reelError: e?.message?.slice(0, 120) || 'Reel üretilemedi' } : it));
    }
  }, [ideas, brandRefImages, galleryAnalysis, tenantId, brandName, location, logoUrl, brandTheme, missionBrief, missionId, nodeKey, queryClient, onApproved]);

  generateReelRef.current = generateReel;

  // Auto-push post/carousel items to Feed (pending_review) when production finishes
  useEffect(() => {
    if (producing) return;
    for (const item of items) {
      const fmt = normalizeContentFormat(item.contentType);
      if (fmt === 'reel' || fmt === 'story') continue;
      if (item.status !== 'ready' || !item.imageUrl) continue;
      if (feedSavedRef.current.has(item.ideaIndex)) continue;
      feedSavedRef.current.add(item.ideaIndex);
      saveMutation.mutate({ item, useAlt: false, useCanvas: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producing, items]);

  // Ajans Still → Runway: generate 9:16 agency design then animate it
  const generateAgencyReel = async (_item: ProducedItem) => { /* stub — removed */ };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  // ── Canva brand template autofill (background, non-blocking) ──────────────
  const generateCanva = async (item: ProducedItem, silent = false) => {
    if (item.canvaBuilding) return;
    setItems(prev => prev.map(it =>
      it.ideaIndex === item.ideaIndex
        ? { ...it, canvaBuilding: true, canvaError: null }
        : it
    ));

    try {
      // Sprint 4 (PIS): start from the FULL original idea so canva_field_copy,
      // template_use_case, asset_intent and visual_production_spec survive — the
      // previous thin reconstruction dropped them and starved the Canva renderer.
      const baseIdea = (ideas[item.ideaIndex] as Record<string, unknown> | undefined) ?? {};
      const ideaRecord: Record<string, unknown> = {
        ...baseIdea,
        headline: item.headline,
        caption_draft: item.caption,
        caption_draft_alt: item.captionAlt,
        cta: item.cta,
        hashtags: item.hashtags,
        strategic_purpose: item.strategicPurpose,
        content_type: item.contentType,
        idea_index: item.ideaIndex,
      };
      const kindKey = item.contentType.includes('reel')
        ? 'instagram_reel'
        : item.contentType.includes('story')
          ? 'instagram_story'
          : 'instagram_post';
      const registryMin = canvaLimitsByKind?.[kindKey]?.registryMin as
        | Partial<Record<string, number>>
        | undefined;

      const { title, signal } = buildCanvaMissionSignal({
        idea: ideaRecord,
        brandName,
        location,
        missionBrief,
        imageUrl: item.imageUrl ?? undefined,
        registryMin,
      });
      const kind = signal.kind;
      auditRendererPayload('canva', {
        title,
        kind,
        canvaFieldCopy: signal.canvaFieldCopy,
      });

      const res = await fetch('/api/canva/autofill-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          title,
          signal,
          lineage: {
            source: 'mission_autonomous',
            ideaIndex: item.ideaIndex,
            selectedBy: 'ai_match',
          },
        }),
        signal: AbortSignal.timeout(90_000),
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
      const designId: string | undefined = design?.id;
      const editUrl: string | null = design?.url ?? design?.urls?.edit_url ?? null;
      const thumbUrl: string | null = design?.thumbnail?.url ?? null;
      const templateTitle: string | null = data.decision?.template?.title ?? null;

      if (!editUrl && !designId) throw new Error('Canva tasarım URL\'si alınamadı.');

      let downloadUrl: string | null = data.export?.permanentPreviewUrl ?? null;
      let exportFormat: 'png' | 'mp4' | null = data.export?.format ?? null;

      if (!downloadUrl && designId) {
        try {
          const exported = await exportCanvaDesignFile({
            tenantId,
            designId,
            title: item.headline.trim() || item.caption.trim().slice(0, 60),
            kind,
          });
          downloadUrl = exported.permanentPreviewUrl ?? null;
          exportFormat = exported.format ?? (kind.includes('reel') ? 'mp4' : 'png');
        } catch {
          if (!silent) throw new Error('Canva tasarımı oluştu ama indirilebilir dosya alınamadı.');
        }
      }

      const isReel = kind.includes('reel');

      setItems(prev => prev.map(it =>
        it.ideaIndex === item.ideaIndex
          ? {
              ...it,
              canvaEditUrl: editUrl,
              canvaThumb: thumbUrl,
              canvaDownloadUrl: downloadUrl,
              canvaExportFormat: exportFormat,
              canvaTemplate: templateTitle,
              canvaBuilding: false,
              canvaError: null,
            }
          : it
      ));
      // Otonom: varsayılan görsel fotoğraf/canvas kalır; Canva ek çıktı olarak Feed'e eklenir

      const publishUrl = downloadUrl ?? thumbUrl ?? editUrl;
      if (!publishUrl) {
        if (!silent) throw new Error('Canva çıktı URL\'si alınamadı.');
        return;
      }
      await apiClient.saveCreativeArtifact({
        title:       `${item.headline || brandName} — Canva ${templateTitle ?? kind}`,
        contentUrl:  publishUrl,
        platform:    'canva',
        contentType: kind.replace('instagram_', ''),
        content: JSON.stringify({
          canvaEditUrl: editUrl,
          canvaThumbnail: thumbUrl,
          canvaDownloadUrl: downloadUrl,
          canvaDesignId: designId,
          templateTitle,
          caption: item.caption,
          kind,
          source: 'canva_autofill',
          imageUrl: isReel ? undefined : downloadUrl ?? thumbUrl,
          videoUrl: isReel ? downloadUrl : undefined,
        }),
        metadata: {
          source: 'canva_autofill',
          canvaEditUrl: editUrl,
          canvaDesignId: designId,
          templateTitle,
          contentKind: kind,
          permanentPreviewUrl: downloadUrl,
          canvaExportFormat: exportFormat,
          imageUrl: isReel ? undefined : downloadUrl ?? thumbUrl,
          videoUrl: isReel ? downloadUrl : undefined,
        },
      });
      setItems(prev => prev.map(it =>
        it.ideaIndex === item.ideaIndex ? { ...it, canvaSavedToOutputs: true } : it
      ));
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

  const generateBrandKit = async (_item: ProducedItem) => { /* inline in produceAll */ };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  const approvedCount = items.filter(i => i.status === 'approved').length;
  const readyCount    = items.filter(i => i.status === 'ready').length;
  const FORMAT_COLOR: Record<string, string> = { post: '#8B5CF6', story: '#F472B6', reel: '#F59E0B', carousel: '#60A5FA' };

  const { data: serverArtifacts = [], refetch: refetchServerArtifacts } = useMobileArtifacts({
    params: missionId ? { missionId, limit: 80 } : { limit: 120 },
    subscribeOnly: true,
    enabled: Boolean(serverProductionOnly && missionId),
  });

  useEffect(() => {
    if (!serverProductionOnly || !missionId) return;
    const id = setInterval(() => { void refetchServerArtifacts(); }, 12_000);
    return () => clearInterval(id);
  }, [serverProductionOnly, missionId, refetchServerArtifacts]);

  const serverMissionArtifacts = useMemo(() => {
    if (!missionId) return [];
    return filterFeedPublishableArtifacts(
      (serverArtifacts as OutputArtifact[]).filter(
        (a) => parseArtifactMissionId(a) === missionId,
      ),
    );
  }, [serverArtifacts, missionId]);

  const serverFeedStats = useMemo(() => {
    if (!missionId) return { pending: 0, publishable: 0, total: 0 };
    const forMission = (serverArtifacts as OutputArtifact[]).filter(
      (a) => parseArtifactMissionId(a) === missionId,
    );
    return {
      total: forMission.length,
      pending: forMission.filter((a) => a.status === 'pending_review').length,
      publishable: serverMissionArtifacts.filter((a) => a.status === 'pending_review').length,
    };
  }, [serverArtifacts, missionId, serverMissionArtifacts]);

  useEffect(() => {
    if (!serverProductionOnly) return;
    void queryClient.invalidateQueries({ queryKey: ['artifacts'] });
  }, [serverProductionOnly, missionId, queryClient]);

  if (serverProductionOnly) {
    return (
      <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 14px) 22px 24px', flex: 1 }}>
          <button onClick={onClose} style={{ ...t.backBtn, cursor: 'pointer', width: 34, height: 34,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, border: 'none', marginBottom: 16 }}>←</button>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary, marginBottom: 10 }}>
            Sunucu üretimi aktif
          </div>
          <p style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.55, marginBottom: 12 }}>
            Bu mission için görseller <strong>auto-produce</strong> (Remotion + galeri + Runway) ile sunucuda üretilir.
            İstemci tarafı otonom üretim ve Canva devre dışı — çift kart oluşmaz.
          </p>
          <div style={{ padding: '12px 14px', borderRadius: 12, marginBottom: 16,
            background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            border: `0.5px solid ${t.separator}`, fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
            {serverFeedStats.publishable > 0
              ? <>Feed&apos;de <strong style={{ color: t.textPrimary }}>{serverFeedStats.publishable}</strong> içerik onay bekliyor.</>
              : serverFeedStats.total > 0
                ? <>{serverFeedStats.total} artifact kayıtlı — render tamamlanınca Feed&apos;de görünür. Liste yenileniyor…</>
                : <>Üretim devam ediyor veya henüz başlamadı. Mission tamamlandıysa birkaç dakika bekleyin.</>}
          </div>
          {serverMissionArtifacts.length > 0 && (
            <MissionFeedPreviewGrid
              artifacts={serverMissionArtifacts}
              onPreview={openPlatformPreview}
              t={t}
              title="Mission üretim önizlemesi"
            />
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {onViewOutputs && (
              <button onClick={() => { void refetchServerArtifacts(); onViewOutputs(); }}
                style={{ padding: '12px 20px', borderRadius: 24, border: 'none', cursor: 'pointer',
                  background: t.accent, color: '#fff', fontSize: 14, fontWeight: 700 }}>
                Platform Feed →
              </button>
            )}
            <button type="button" onClick={() => void refetchServerArtifacts()}
              style={{ padding: '12px 16px', borderRadius: 24, cursor: 'pointer',
                background: 'transparent', border: `0.5px solid ${t.separator}`,
                color: t.textSecondary, fontSize: 13, fontWeight: 600 }}>
              Yenile
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              Otonom Üretim
            </div>
            <div style={{ fontSize: 12, color: t.textMuted }}>
              {producing
                ? `${doneCount}/${ideas.length} hazırlanıyor…`
                : `${readyCount + approvedCount} içerik hazır · ${approvedCount} onaylandı`}
            </div>
          </div>
          {onAdvanced && (
            <button onClick={onAdvanced}
              style={{ padding: '7px 12px', borderRadius: 20, cursor: 'pointer',
                background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                border: `0.5px solid ${t.separator}`, color: t.textSecondary,
                fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
              Gelişmiş
            </button>
          )}
          {approvedCount > 0 && onViewOutputs && (
            <button onClick={onViewOutputs}
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

        <button
          type="button"
          onClick={openStoryTemplates}
          style={{
            width: '100%',
            marginBottom: 10,
            padding: '10px 12px',
            borderRadius: 12,
            cursor: 'pointer',
            textAlign: 'left',
            border: `0.5px solid ${storyLibraryLocked ? `${t.success}40` : t.accentBorder}`,
            background: storyLibraryLocked ? `${t.success}10` : t.accentDim,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: storyLibraryLocked ? t.success : t.accent }}>
            {storyLibraryLocked ? '✓ Marka story şablonları aktif' : 'Story şablonlarını özelleştir'}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            Mission üretimi {storyTemplateLibrary?.slots.filter((s) => s.format === 'story' && s.enabled).length ?? 0} story slot kullanıyor
          </div>
        </button>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px calc(80px + env(safe-area-inset-bottom,0px))', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.map((item) => {
          const fmt = item.contentType.replace('instagram_', '').replace(/_/g, ' ');
          const fmtColor = FORMAT_COLOR[item.contentType.replace('instagram_', '')] ?? t.accent;
          const isPortrait = item.contentType.includes('story') || item.contentType.includes('reel');
          const captionMode = activeCaption[item.ideaIndex] ?? 'primary';
          const shownCaption = captionMode === 'alt' && item.captionAlt ? item.captionAlt : item.caption;
          const visualMode = activeVisual[item.ideaIndex] ?? (normalizeContentFormat(item.contentType) === 'reel' ? 'reel' : 'photo');
          const isReelFmt = normalizeContentFormat(item.contentType) === 'reel';
          // Simplified: photo | reel (Remotion/Runway) | canva
          const shownImage =
            visualMode === 'reel'  && item.reelUrl            ? item.reelUrl    :
            visualMode === 'canva' && item.canvaDownloadUrl && item.canvaExportFormat !== 'mp4' ? item.canvaDownloadUrl :
            visualMode === 'canva' && item.canvaThumb          ? item.canvaThumb :
            item.brandKitUrl ?? item.imageUrl;
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
                {item.status === 'producing' || item.brandKitBuilding ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${t.separator}`, borderTop: `3px solid ${fmtColor}`, animation: 'spinSlow 0.9s linear infinite' }} />
                    <span style={{ fontSize: 12, color: t.textMuted }}>
                      {item.brandKitBuilding ? 'Marka şablonu uygulanıyor…' : 'İçeriğe uygun görsel aranıyor…'}
                    </span>
                  </div>
                ) : visualMode === 'canva' && item.canvaEditUrl ? (
                  /* ── Canva design full view ── */
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, background: 'rgba(124,58,237,0.06)', position: 'relative' }}>
                    {item.canvaExportFormat === 'mp4' && item.canvaDownloadUrl ? (
                      <video src={item.canvaDownloadUrl} autoPlay loop muted playsInline
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : item.canvaDownloadUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={item.canvaDownloadUrl} alt="Canva export"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : item.canvaThumb ? (
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
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', padding: 16 }}>
                      {item.canvaDownloadUrl && (
                        <button
                          type="button"
                          onClick={() => triggerFileDownload(
                            item.canvaDownloadUrl!,
                            `${(item.headline || 'canva').slice(0, 40)}.${item.canvaExportFormat ?? 'png'}`,
                          )}
                          style={{
                            padding: '12px 20px', borderRadius: 16, border: 'none', cursor: 'pointer',
                            background: '#10B981', color: '#fff', fontWeight: 800, fontSize: 14,
                          }}>
                          ⬇ İndir
                        </button>
                      )}
                      <a href={item.canvaEditUrl} target="_blank" rel="noopener noreferrer"
                        style={{
                          padding: '12px 20px', borderRadius: 16, textDecoration: 'none',
                          background: '#7C3AED', color: '#fff', fontWeight: 800, fontSize: 14,
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
                ) : isReelFmt && item.reelBuilding && !item.reelUrl ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, position: 'relative' }}>
                    {item.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={item.imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35, filter: 'blur(2px)' }} />
                    )}
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${t.separator}`, borderTop: '3px solid #F59E0B', animation: 'spinSlow 0.9s linear infinite' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>Runway reel üretiliyor…</span>
                      <span style={{ fontSize: 11, color: t.textMuted, textAlign: 'center', maxWidth: 220 }}>~1–2 dk sürebilir</span>
                    </div>
                  </div>
                ) : isReelFmt && item.reelError && !item.reelUrl ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
                    {item.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={item.imageUrl} alt="" style={{ width: '100%', height: '55%', objectFit: 'cover', borderRadius: 12, opacity: 0.7 }} />
                    )}
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#F87171', textAlign: 'center' }}>{item.reelError}</div>
                    <button type="button" onClick={() => generateReel(item)}
                      style={{ padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#F59E0B', color: '#fff', fontWeight: 700, fontSize: 13 }}>
                      Tekrar dene
                    </button>
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

                {/* Canva ready badge — only shown when Canva is enabled */}
                {CANVA_ACTIVE && item.canvaEditUrl && visualMode !== 'canva' && (
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

                {/* Canva loading indicator */}
                {CANVA_ACTIVE && item.canvaBuilding && visualMode !== 'canva' && (
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
                {CANVA_ACTIVE && item.canvaSavedToOutputs && !item.canvaBuilding && (
                  <div style={{
                    position: 'absolute', top: 10, right: 10,
                    padding: '4px 10px', borderRadius: 14,
                    background: 'rgba(16,185,129,0.75)', backdropFilter: 'blur(8px)',
                    color: '#fff', fontSize: 10, fontWeight: 700,
                  }}>
                    ◧ Canva → Feed
                  </div>
                )}

                {/* Gallery match quality badge (Sprint 2 GIS) — only on raw photo */}
                {item.status === 'ready' && item.matchScore != null && visualMode === 'photo' && (() => {
                  const cls = classifyMatch(item.matchScore);
                  const bg = cls.quality === 'strong' ? 'rgba(16,185,129,0.78)'
                    : cls.quality === 'acceptable' ? 'rgba(59,130,246,0.78)'
                    : cls.quality === 'weak' ? 'rgba(245,158,11,0.82)'
                    : 'rgba(239,68,68,0.82)';
                  const isRejected = cls.quality === 'rejected';
                  return (
                    <>
                      <div style={{
                        position: 'absolute', bottom: isRejected ? 36 : 10, left: 10, padding: '4px 10px', borderRadius: 14,
                        background: bg, color: '#fff', fontSize: 10, fontWeight: 700, backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        ◎ {Math.round(item.matchScore)} · {cls.label}
                      </div>
                      {isRejected && (
                        <div style={{
                          position: 'absolute', bottom: 10, left: 10, right: 10, padding: '4px 10px', borderRadius: 10,
                          background: 'rgba(0,0,0,0.72)', color: '#FCA5A5', fontSize: 10, fontWeight: 600,
                          backdropFilter: 'blur(6px)',
                        }}>
                          Galeri bu konuyu kapsamamakta — galeriye uygun fotoğraf ekleyin
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Active visual mode badge on image */}
                {item.status === 'ready' && visualMode !== 'photo' && (
                  <div style={{ position: 'absolute', bottom: 10, left: 10, padding: '4px 10px', borderRadius: 14,
                    background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, fontWeight: 600, backdropFilter: 'blur(6px)' }}>
                    {visualMode === 'reel' && item.reelUrl && item.contentType.includes('story') ? '🎬 Remotion' :
                     visualMode === 'reel'   ? '▶ Reel' :
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

                        {item.storyTemplateName && item.contentType.includes('story') && (
                          <span style={{
                            padding: '4px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                            background: `${t.accent}14`, color: t.accent, maxWidth: 140,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {item.storyTemplateName}
                          </span>
                        )}

                        {/* Remotion Story badge — story tipinde video hazırsa göster */}
                        {item.reelUrl && item.contentType.includes('story') && (
                          <button
                            onClick={() => setActiveVisual(prev => ({ ...prev, [item.ideaIndex]: visualMode === 'reel' ? 'photo' : 'reel' }))}
                            style={{
                              padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                              border: `1px solid ${visualMode === 'reel' ? '#7C3AED' : t.separator}`,
                              background: visualMode === 'reel' ? 'rgba(124,58,237,0.12)' : 'transparent',
                              color: visualMode === 'reel' ? '#A78BFA' : t.textMuted,
                              fontSize: 11, fontWeight: 700,
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                            🎬 Remotion
                          </button>
                        )}

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

                    {/* Expanded production panel — Remotion + Reel only */}
                    {expandedPanel[item.ideaIndex] && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 0' }}>

                        {/* Marka story şablonları (5 slot kütüphanesi) */}
                        {item.contentType.includes('story') && storyTemplateLibrary && (
                          storyTemplateLibrary.slots
                            .filter((s) => s.format === 'story' && s.enabled)
                            .map((slot) => {
                              const pick = resolveStoryTemplateForSlot(storyTemplateLibrary, slot.key, resolvedSector);
                              if (!pick) return null;
                              const isActive = item.storySlotKey === slot.key;
                              return (
                                <button
                                  key={slot.key}
                                  type="button"
                                  onClick={() => {
                                    if (!item.imageUrl) return;
                                    setItems(prev => prev.map(it =>
                                      it.ideaIndex === item.ideaIndex
                                        ? { ...it, storySlotKey: slot.key, storyTemplateName: pick.templateName }
                                        : it,
                                    ));
                                    renderStoryForItem(item, pick, item.imageUrl).catch(() => {});
                                  }}
                                  disabled={!item.imageUrl}
                                  style={{
                                    padding: '10px 8px',
                                    borderRadius: 12,
                                    cursor: item.imageUrl ? 'pointer' : 'default',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textAlign: 'left',
                                    border: `1.5px solid ${isActive ? t.accent : t.separator}`,
                                    background: isActive ? `${t.accent}18` : t.elevated,
                                    color: isActive ? t.accent : t.textSecondary,
                                  }}
                                >
                                  <span style={{ fontSize: 15 }}>▶</span>
                                  <span style={{ marginLeft: 6 }}>{slot.labelTr}</span>
                                  <span style={{ display: 'block', fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                                    {pick.templateName}
                                  </span>
                                </button>
                              );
                            })
                        )}

                        {/* Canvas overlay kaldırıldı — Remotion kullanılıyor */}

                        {/* Reel (raw photo → Runway) */}
                        <button onClick={() => {
                          reelAttemptedRef.current.delete(item.ideaIndex);
                          void generateReel(item);
                        }}
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

                        {/* Ajans Story → Reel kaldırıldı — Remotion ile değiştirildi */}

                        {/* Marka Kiti kaldırıldı — Remotion story şablonları kullanılıyor */}

                        {/* ── Canva Şablonu ile Üret — hidden when Canva is disabled ── */}
                        {CANVA_ACTIVE && <button
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
                        </button>}

                        {/* Canva result: thumbnail + edit link */}
                        {CANVA_ACTIVE && item.canvaEditUrl && (
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
                {item.status === 'ready' && (() => {
                  const fmtNorm = normalizeContentFormat(item.contentType);
                  const canApprove = fmtNorm === 'reel'
                    ? Boolean(item.reelUrl) && !item.reelBuilding
                    : Boolean(item.brandKitUrl || item.imageUrl) && !item.brandKitBuilding;
                  return (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => approve(item)}
                      disabled={saveMutation.isPending || !canApprove}
                      style={{ flex: 2, padding: '12px 0', borderRadius: 14, border: 'none', cursor: canApprove ? 'pointer' : 'not-allowed',
                        background: canApprove ? 'linear-gradient(135deg, #10B981cc, #10B98188)' : t.elevated,
                        color: canApprove ? '#fff' : t.textMuted,
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
                  );
                })()}

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
