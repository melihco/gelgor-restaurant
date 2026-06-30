/**
 * POST /api/brief-produce
 *
 * Bridges "New Brief" form → fal.ai art-director auto-produce pipeline.
 * User intent (e.g. "Full Moon" + Story) is merged with brand DNA / colors /
 * gallery photos and rendered as Canva Pro–level designed feed artifacts.
 *
 * NEW: Brand Creative Director (GPT-4o) interprets the brief through the lens
 * of the logged-in brand before production — "Full Moon" for a beach club becomes
 * "moonlit DJ party by the Aegean" rather than a generic lunar image.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ParsedIdea } from '../auto-produce/caption-publish-resolver';
import { resolveBriefIntent, type BriefOutputType } from '@/lib/brief-intent-resolver';
import { interpretBriefAsBrand, type BrandCreativeDirectorOutput } from '@/lib/brand-creative-director';
import { serverConfig } from '@/lib/server-config';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const maxDuration = 300;

function mapContentType(outputType: BriefOutputType): string {
  switch (outputType) {
    case 'story': return 'story';
    case 'reel':  return 'reel';
    case 'post':  return 'feed_post';
    default:      return 'feed_post';
  }
}

function attachUserPhotos(idea: ParsedIdea, photoUrls: string[], slotIndex: number): void {
  if (photoUrls.length === 0) return;
  idea.attached_photo_urls = photoUrls;
  idea.force_attached_photos = true;
  idea.selected_gallery_url = photoUrls[slotIndex % photoUrls.length];
}

function buildIdeas(
  title: string,
  extraDirection: string,
  outputType: BriefOutputType,
  count: number,
  photoUrls: string[],
  bcd: BrandCreativeDirectorOutput | null,
): ParsedIdea[] {
  const contentType = mapContentType(outputType);
  return Array.from({ length: count }, (_, i) => {
    if (bcd) {
      const idea: ParsedIdea = {
        headline: bcd.headline,
        caption_draft: bcd.caption,
        content_type: contentType,
        visual_direction: bcd.visualDirection,
        strategic_purpose: bcd.strategicPurpose,
        mood: bcd.mood,
        scene_hint: bcd.sceneHint,
        motion_cue: bcd.motionCue,
      };
      attachUserPhotos(idea, photoUrls, i);
      return idea;
    }
    const intent = resolveBriefIntent({ title, extraDirection, outputType });
    const idea: ParsedIdea = {
      headline: intent.headline,
      caption_draft: intent.caption,
      content_type: contentType,
      visual_direction: intent.visualDirection,
      strategic_purpose: intent.strategicPurpose,
      mood: intent.mood,
    };
    attachUserPhotos(idea, photoUrls, i);
    return idea;
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    workspaceId?: string;
    title?: string;
    /** Legacy — full description blob; prefer extraDirection. */
    description?: string;
    extraDirection?: string;
    outputType?: BriefOutputType;
    count?: string | number;
    photoUrls?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    workspaceId,
    title = '',
    description = '',
    extraDirection,
    outputType = 'post',
    count,
    photoUrls = [],
  } = body;

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  if (!title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (!['story', 'reel', 'post'].includes(outputType)) {
    return NextResponse.json({ error: 'outputType must be story, reel, or post' }, { status: 400 });
  }

  const direction = (extraDirection ?? description).trim();
  const ideaCount = Math.min(Math.max(parseInt(String(count ?? 1), 10), 1), 10);

  // ── Brand Creative Director: interpret the brief through the brand's lens ──
  let bcd: BrandCreativeDirectorOutput | null = null;
  try {
    const CREW_BACKEND = serverConfig.crewBackend.baseUrl;
    const INTERNAL_KEY = serverConfig.internal.apiKey;
    const brandRes = await fetch(`${CREW_BACKEND}/api/v1/brand-context/${workspaceId}`, {
      headers: {
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (brandRes.ok) {
      const brandCtx = await brandRes.json() as Record<string, unknown>;
      bcd = await interpretBriefAsBrand({
        title: title.trim(),
        extraDirection: direction,
        outputType,
        brandName: String(brandCtx.business_name ?? brandCtx.brand_name ?? ''),
        brandBusinessType: String(brandCtx.business_type ?? ''),
        brandLocation: String(brandCtx.location ?? ''),
        brandTone: String(brandCtx.brand_tone ?? ''),
        brandDescription: String(brandCtx.description ?? ''),
        visualDna: typeof brandCtx.visual_dna === 'string' ? brandCtx.visual_dna : undefined,
        contentPillars: Array.isArray(brandCtx.content_pillars) ? brandCtx.content_pillars.map(String) : undefined,
        instagramBio: typeof brandCtx.instagram_bio === 'string' ? brandCtx.instagram_bio : undefined,
        customRules: typeof brandCtx.custom_rules === 'string' ? brandCtx.custom_rules : undefined,
        locale: typeof brandCtx.locale === 'string' ? brandCtx.locale : 'tr',
      });
    }
  } catch (bcdErr) {
    console.warn('[brief-produce] BCD brand context fetch failed, using rule-based:', bcdErr instanceof Error ? bcdErr.message : bcdErr);
  }

  const ideas = buildIdeas(title, direction, outputType, ideaCount, photoUrls, bcd);

  const BASE = getNextjsInternalOrigin();
  const INTERNAL_KEY = serverConfig.internal.apiKey;
  const tenantId = req.headers.get('X-Tenant-Id') || workspaceId;
  const officeId = req.headers.get('X-Office-Id') || '';
  const creativeBrief = [title.trim(), direction].filter(Boolean).join('\n');

  try {
    const res = await fetch(`${BASE}/api/auto-produce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': tenantId,
        ...(officeId ? { 'X-Office-Id': officeId } : {}),
      },
      body: JSON.stringify({
        workspaceId,
        ideas,
        creativeBrief,
        adHocBrief: true,
        bundleCards: false,
        skipArtifactDedupe: false,
      }),
      signal: AbortSignal.timeout(295_000),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      console.error('[brief-produce] auto-produce error:', data.error);
      return NextResponse.json(
        { error: (data.error as string) ?? 'İçerik üretimi başarısız', code: data.code },
        { status: res.status },
      );
    }

    // Resolve relative /api/media URLs to externally accessible absolute URLs
    const artifacts = (data.artifacts ?? []) as Array<Record<string, unknown>>;
    const { resolveExternallyAccessibleUrl } = await import('@/lib/media-url');
    const resolvedArtifacts = await Promise.all(
      artifacts.map(async (art) => {
        const imageUrl = typeof art.imageUrl === 'string' ? await resolveExternallyAccessibleUrl(art.imageUrl) : art.imageUrl;
        const videoUrl = typeof art.videoUrl === 'string' ? await resolveExternallyAccessibleUrl(art.videoUrl) : art.videoUrl;
        return { ...art, imageUrl, videoUrl };
      }),
    );

    return NextResponse.json({
      ok: true,
      produced: data.produced ?? 0,
      artifacts: resolvedArtifacts,
      pipeline: 'fal_art_director',
      brandInterpretation: bcd?.brandInterpretation ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'İçerik üretimi sırasında hata oluştu';
    console.error('[brief-produce] fetch error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
