/**
 * Mission story guarantee — Fal.ai 9:16 designed poster when no story artifact is publish-ready.
 * Replaces the legacy Remotion MP4 guarantee that could block production on Render timeouts.
 */
import { resolveFalBrandInput, resolveFalProductionBrandColors } from '@/lib/fal-brand-input';
import {
  bindBrandTemplateForFalProduction,
  resolveFalTemplateLockOptions,
  templateStyleReferenceUrls,
} from '@/lib/brand-design-template-production';
import { resolveTypographyVibeFromContext } from '@/lib/fal-designer-production';
import type { BrandTemplateLibrary } from '@/lib/brand-template-library';
import type { BrandProductionTokens } from '@/lib/brand-production-tokens';
import type { ProductionRunResultRow } from '@/lib/mission-slot-backfill';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import { runFalStoryPosterProduction } from '@/app/api/auto-produce/pipelines/fal-video-pipeline';
import { nexusPersistableContentUrl } from '@/app/api/auto-produce/caption-publish-resolver';
import type { NexusClient } from '@/app/api/auto-produce/nexus-client';
import { serverConfig } from '@/lib/server-config';

export type MissionFalStoryGuaranteeResult = {
  artifactId: string;
  imageUrl: string;
  title: string;
  metadata: Record<string, unknown>;
  costUsd: number;
};

function isStoryProductionRow(row: ProductionRunResultRow): boolean {
  const meta = row.metadata ?? {};
  const role = String(meta.production_role ?? '');
  const pipeline = String(meta.pipeline ?? '');
  const contentType = String(meta.contentType ?? meta.kind ?? '').toLowerCase();
  return pipeline === 'fal_story'
    || role === 'campaign_story_motion'
    || role === 'fal_story_motion'
    || role === 'organic_story_still'
    || contentType === 'story'
    || contentType === 'instagram_story';
}

/** True when at least one mission story artifact is already publish-ready (skip Remotion/fal guarantee). */
export function missionHasPublishReadyStory(results: ProductionRunResultRow[]): boolean {
  return results.some((row) => {
    if (!row.publishReady || row.error || row.rendering) return false;
    if (!isStoryProductionRow(row)) return false;
    return Boolean(String(row.imageUrl ?? '').trim());
  });
}

export async function produceAndSaveMissionFalStoryGuarantee(input: {
  workspaceId: string;
  missionId: string;
  ideaIndex: number;
  ideaId: string;
  headline: string;
  caption: string;
  mood: string;
  cta?: string;
  referencePhotoUrl: string;
  aiGalleryEnhanced: boolean;
  resolvedBrandName: string;
  brandBusinessType: string;
  brandLocation?: string;
  brandLogoUrl?: string;
  brandCtx: Record<string, unknown>;
  brandTheme: Record<string, unknown> | null;
  brandTokens: BrandProductionTokens;
  templateLibrary: BrandTemplateLibrary;
  grafikerMaxRetries: number;
  librarySlotKey?: string;
  nodeKey?: string | null;
  assignment: ProductionAssignment;
  nexusClient: NexusClient;
}): Promise<MissionFalStoryGuaranteeResult | null> {
  if (!serverConfig.fal.configured) {
    console.warn('[auto-produce] Mission fal story guarantee skipped — FAL_API_KEY missing');
    return null;
  }

  const {
    workspaceId,
    missionId,
    ideaIndex,
    ideaId,
    headline,
    caption,
    mood,
    cta,
    referencePhotoUrl,
    aiGalleryEnhanced,
    resolvedBrandName,
    brandBusinessType,
    brandLocation,
    brandLogoUrl,
    brandCtx,
    brandTheme,
    brandTokens,
    templateLibrary,
    grafikerMaxRetries,
    librarySlotKey,
    nodeKey,
    assignment,
    nexusClient,
  } = input;

  try {
    const falBrand = resolveFalBrandInput({
      brandTheme,
      templateLibrary,
      librarySlotKey,
      tokens: brandTokens,
      sector: brandBusinessType,
      caption,
      headline,
      referencePhotoUrl,
      format: 'story',
      brandTone: String(brandCtx.brand_tone ?? ''),
      brandDescription: String(brandCtx.brand_description ?? ''),
    });

    const templateBinding = await bindBrandTemplateForFalProduction({
      workspaceId,
      slotRole: assignment.slot_role,
      librarySlotKey,
      format: 'story',
      caption,
      missionReferenceUrl: referencePhotoUrl,
      baseDirectives: falBrand.promptDirectives,
      brandColors: falBrand.brandColors,
      logoUrl: brandLogoUrl || undefined,
      brandVibe: falBrand.vibe,
    });

    const designVibe = templateBinding.lockedVibe
      ?? resolveTypographyVibeFromContext({
        caption,
        headline,
        sector: brandBusinessType,
        brandVibe: falBrand.vibe,
        lockPremiumVibe: /wedding|event|hotel|resort|spa|fine_dining|restaurant|beach|club/i.test(
          brandBusinessType ?? '',
        ),
      });

    const photoUrl = templateBinding.referencePhotoUrl ?? referencePhotoUrl;
    const styleRefs = templateStyleReferenceUrls(
      templateBinding,
      (brandCtx.reference_image_urls as string[] | undefined) ?? [],
    );
    const lockOpts = resolveFalTemplateLockOptions({
      binding: templateBinding,
      baseGrafikerMaxRetries: grafikerMaxRetries,
    });
    const brandColors = resolveFalProductionBrandColors(
      falBrand.brandColors,
      templateBinding.brandColors,
    );

    const poster = await runFalStoryPosterProduction({
      workspaceId,
      headline,
      caption,
      cta,
      resolvedBrandName,
      brandBusinessType,
      brandLocation,
      mood,
      referenceUrl: photoUrl,
      styleRefs,
      designVibe,
      brandColors,
      backgroundStyle: falBrand.backgroundStyle,
      lockOpts,
      templateBinding,
      visualDnaTone: falBrand.visualDnaTone,
      sceneHint: falBrand.sceneHint,
      designIntensityLevel: falBrand.designIntensityLevel,
    });

    const persistContentUrl = nexusPersistableContentUrl(poster.imageUrl, [photoUrl, referencePhotoUrl]);
    const metadata: Record<string, unknown> = {
      kind: 'instagram_story',
      contentType: 'story',
      platform: 'instagram',
      headline,
      caption: caption.slice(0, 2200),
      source: 'fal_story',
      auto_produced: true,
      gallery_sourced: true,
      mission_id: missionId,
      node_key: nodeKey || null,
      idea_index: ideaIndex,
      production_role: assignment.slot_role,
      pipeline: assignment.pipeline,
      publish_package: 'primary',
      publish_priority: 'recommended',
      production_bundle: true,
      bundle_status: 'ready',
      idea_id: ideaId,
      poster_url: poster.imageUrl,
      posterUrl: poster.imageUrl,
      reference_photo_url: referencePhotoUrl,
      imageUrl: poster.imageUrl,
      ai_gallery_enhanced: aiGalleryEnhanced,
      renderer_executed: 'fal_designer_story',
      production_route: 'fal_ai',
      production_track: 'fal_ai',
      fal_designer_produced: true,
      fal_design_engine: poster.typographyModel,
      grafiker_score: poster.grafikerScore,
      grafiker_pass: poster.grafikerPass,
      typography_text_valid: poster.grafikerPass,
      assignment_rationale: assignment.rationale ?? null,
      mission_fal_story_guarantee: true,
    };

    const saved = await nexusClient.saveArtifact(workspaceId, {
      title: headline || `${resolvedBrandName} — story`,
      contentUrl: persistContentUrl,
      content: JSON.stringify({
        kind: 'instagram_story',
        contentType: 'story',
        caption: caption.slice(0, 2200),
        headline,
        imageUrl: poster.imageUrl,
        posterUrl: poster.imageUrl,
        videoUrl: null,
        idea_index: ideaIndex,
        production_bundle: true,
        bundle_status: 'ready',
        idea_id: ideaId,
        source: 'fal_story',
        ai_gallery_enhanced: aiGalleryEnhanced,
      }),
      platform: 'instagram',
      contentType: 'story',
      metadata,
    });

    if (!saved.id || saved.error) return null;

    return {
      artifactId: saved.id,
      imageUrl: persistContentUrl,
      title: headline || `${resolvedBrandName} — story`,
      metadata,
      costUsd: 0.08,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auto-produce] Mission fal story guarantee failed: ${message}`);
    return null;
  }
}
