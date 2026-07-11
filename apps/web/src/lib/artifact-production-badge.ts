/**
 * Mission Hub preview tiles — hangi motor + hangi manifest slot?
 * Reads auto-produce artifact metadata (renderer_executed, production_role, pipeline).
 */
import type { OutputArtifact } from '@/types';
import type { ProductionSlotRole } from '@/lib/mission-production-manifest';
import { SLOT_ROLE_LABEL_TR } from '@/lib/mission-slot-checklist';
import { parseArtifactContent, parseArtifactMetadata } from '@/lib/artifact-utils';

export interface ArtifactProductionBadge {
  /** User-facing engine label: fal.ai, Runway, Remotion, … */
  engine: string;
  engineColor: string;
  /** Manifest slot (Turkish short label) */
  slot: string;
  slotRole: string;
}

const ENGINE_COLORS: Record<string, string> = {
  'fal.ai': '#C084FC',
  Runway: '#F472B6',
  Kling: '#E879F9',
  Luma: '#A78BFA',
  Remotion: '#60A5FA',
  Tasarım: '#60A5FA',
  Marky: '#FB923C',
  Galeri: '#94A3B8',
  'GPT Image': '#34D399',
  Carousel: '#38BDF8',
  Showcase: '#FBBF24',
  Canvas: '#F97316',
};

function colorForEngine(label: string): string {
  return ENGINE_COLORS[label] ?? '#9CA3AF';
}

function readMeta(artifact: OutputArtifact): Record<string, unknown> {
  const fromMeta = parseArtifactMetadata(artifact.metadata);
  if (Object.keys(fromMeta).length > 0) return fromMeta;
  return parseArtifactContent(artifact.content);
}

function slotLabel(role: string): string {
  const key = role as ProductionSlotRole;
  if (key && SLOT_ROLE_LABEL_TR[key]) return SLOT_ROLE_LABEL_TR[key];
  return role.replace(/_/g, ' ').slice(0, 28) || 'Slot';
}

function engineFromRunwaySource(source: string): string {
  const s = source.toLowerCase();
  if (s.includes('kling')) return 'Kling';
  if (s.includes('luma')) return 'Luma';
  if (s === 'fal_video') return 'fal.ai';
  if (s.includes('runway')) return 'Runway';
  return 'Runway';
}

function resolveEngine(meta: Record<string, unknown>): string {
  const track = String(meta.production_track ?? '').toLowerCase();
  if (track === 'fal_ai' || meta.fal_designer_produced === true || meta.fal_video_produced === true) {
    return 'fal.ai';
  }

  const executed = String(meta.renderer_executed ?? '').toLowerCase();
  if (executed.includes('fal') || executed === 'fal_reel' || executed === 'fal_designer_video') return 'fal.ai';
  if (executed === 'runway_reel') {
    return engineFromRunwaySource(String(meta.runway_source ?? 'runway'));
  }
  if (executed.startsWith('remotion') || executed === 'designed_poster_sync') return 'Tasarım';
  if (executed === 'remotion_poster_marky') return 'Marky';
  if (executed === 'gpt_image_enhance' || executed === 'caption_driven_ai') return 'GPT Image';
  if (executed === 'gallery_raw') return 'Galeri';
  if (executed === 'mission_visual_design_card') return 'Tasarım kartı';

  const pipeline = String(meta.pipeline ?? '').toLowerCase();
  if (pipeline === 'fal_story' || pipeline === 'fal_reel' || pipeline === 'runway_reel') return 'fal.ai';
  if (pipeline.startsWith('fal_only_')) return 'fal.ai';
  if (pipeline === 'remotion_story' || pipeline === 'remotion_poster' || pipeline === 'fal_design' || pipeline === 'fal_story') {
    return pipeline.startsWith('fal') ? 'fal.ai' : 'Tasarım';
  }
  if (pipeline === 'gallery_photo' || pipeline === 'story_still') return 'Galeri';
  if (pipeline === 'carousel_gallery') return 'Carousel';
  if (pipeline === 'product_showcase') return 'Showcase';
  if (pipeline === 'marky_event') return 'Canvas';

  if (meta.runway_produced === true) {
    return engineFromRunwaySource(String(meta.runway_source ?? 'runway'));
  }

  const route = String(meta.production_route ?? '').toLowerCase();
  if (route === 'fal_ai') return 'fal.ai';
  if (route === 'remotion_grafiker' || route === 'designed_grafiker') return 'Tasarım';

  return 'Üretim';
}

export function resolveArtifactProductionBadge(artifact: OutputArtifact): ArtifactProductionBadge {
  const meta = readMeta(artifact);
  const slotRole = String(
    meta.production_role ?? meta.slot_role ?? '',
  ).trim();
  const engine = resolveEngine(meta);
  return {
    engine,
    engineColor: colorForEngine(engine),
    slot: slotLabel(slotRole),
    slotRole,
  };
}
