/**
 * POST /api/remotion/render
 *
 * Server-side Remotion render API.
 * Accepts story props + composition ID, returns uploaded MP4 URL.
 *
 * Render pipeline:
 *   1. Bundle the Remotion composition (cached after first build)
 *   2. renderMedia() → MP4 buffer in memory
 *   3. Upload to R2 / S3 (or return as base64 for small payloads)
 *   4. Return { videoUrl, thumbUrl, compositionId, durationMs }
 *
 * This replaces Creatomate — no monthly fee, $0.001/render compute cost.
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';
import type { StoryCompositionId } from '@/remotion/types';
import path from 'path';
import { mediaUrlForKey } from '@/lib/media-url';
import { getRemotionTemplate } from '@/lib/remotion-template-catalog';
import {
  resolveTemplateFromDirector,
  type CreativeDirectorLayoutOverrides,
} from '@/lib/creative-director-routing';
import type { RemotionLayoutFamily } from '@/lib/remotion-template-types';
import {
  resolveBrandRemotionRenderPolicy,
  type ContentIntent,
} from '@/lib/brand-motion-profile';
import { resolveShowcasePhotoForRender } from '@/lib/brand-showcase-presets';
import { isUsableGalleryPhotoUrl, probeGalleryImageUrl } from '@/lib/media-url';
import {
  buildDirectorLayoutSpecPatch,
  buildGrafikerRetryPatch,
  grafikerMeetsBar,
  GRAFIKER_MAX_RETRIES,
  type GrafikerReviewResult,
} from '@/lib/remotion-quality';
import {
  applyBrandTokensToRenderProps,
  fetchBrandProductionTokensForWorkspace,
  fetchBrandThemeForWorkspace,
} from '@/lib/brand-production-tokens';

export const runtime = 'nodejs';

const RENDER_BASE_URL = (process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Remotion bundler runs on a random port — relative /api/media URLs must be absolute or presigned. */
async function resolveMediaUrlForHeadlessRender(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:')) return trimmed;

  if (trimmed.includes('/api/media') && trimmed.includes('key=')) {
    try {
      const { getPresignedUrl } = await import('@/lib/r2-storage');
      const keyMatch = trimmed.match(/[?&]key=([^&]+)/);
      if (keyMatch?.[1]) {
        return getPresignedUrl(decodeURIComponent(keyMatch[1]), 3600);
      }
    } catch {
      /* fall through to Next origin */
    }
  }

  return resolveShowcasePhotoForRender(trimmed, RENDER_BASE_URL);
}

const GRAFIKER_SYSTEM_PROMPT = `You are a senior art director reviewing an Instagram story frame for a premium hospitality brand.

━━━ LAYOUT TYPES — UNDERSTAND BEFORE EVALUATING ━━━
EDITORIAL / FROSTED: Text in BOTTOM zone on dark gradient — bright photo above is INTENTIONAL.
SPLIT PANEL: Text on SOLID brand panel — must be perfectly legible.
CINEMATIC / CAMPAIGN: Text centered — evaluate center contrast only.
MAGAZINE COVER: Giant headline lower-left — evaluate left text zone only.

━━━ EVALUATION (strict — client-ready bar is 8+) ━━━
1. TEXT IN ZONE: crystal clear in its designated area?
2. TEXT OVERLAP: any overlap between elements?
3. HIERARCHY: headline dominates?
4. PREMIUM FEEL: intentional, agency-grade?

pass = true ONLY if score ≥ 8 AND legibility clear AND no overlap.

Respond ONLY with JSON:
{"score":1-10,"pass":true/false,"text_overlap":true/false,"text_legibility":"clear|partial|poor","overlay_sufficient":true/false,"hierarchy_ok":true/false,"issues":[],"verdict":"..."}`;

async function runGrafikerReview(
  composition: { durationInFrames: number; fps: number },
  serveUrl: string,
  inputProps: Record<string, unknown>,
  compositionId: string,
): Promise<GrafikerReviewResult | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return null;

  try {
    const os = await import('os');
    const fsModule = await import('fs');
    const { renderStill } = await import('@remotion/renderer');
    const thumbFile = os.default.tmpdir() + `/remotion-thumb-${Date.now()}.jpg`;
    const reviewFrame = Math.min(90, Math.max(45, Math.round(composition.durationInFrames * 0.35)));

    await renderStill({
      composition,
      serveUrl,
      output: thumbFile,
      inputProps,
      frame: reviewFrame,
      imageFormat: 'jpeg',
      jpegQuality: 92,
      scale: 1.0,
    });

    if (!fsModule.default.existsSync(thumbFile)) return null;

    const thumbB64 = fsModule.default.readFileSync(thumbFile).toString('base64');
    fsModule.default.unlinkSync(thumbFile);

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiKey });
    const reviewResp = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 400,
      temperature: 0.05,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: GRAFIKER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Review frame for ${compositionId}. Reject amateur overlap, weak contrast, cramped type.` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${thumbB64}`, detail: 'high' } },
          ],
        },
      ],
    });

    const reviewRaw = reviewResp.choices[0]?.message?.content?.trim() ?? '{}';
    const review = JSON.parse(reviewRaw.match(/\{[\s\S]*\}/)?.[0] ?? reviewRaw) as GrafikerReviewResult;
    return {
      score: review.score ?? null,
      pass: review.pass === true,
      text_overlap: review.text_overlap,
      text_legibility: review.text_legibility,
      overlay_sufficient: review.overlay_sufficient,
      hierarchy_ok: review.hierarchy_ok,
      issues: review.issues,
      verdict: review.verdict,
    };
  } catch {
    return null;
  }
}

export const maxDuration = 300; // Remotion: bundle ~90s + render ~60s = 150s; extra buffer

export type RemotionCompositionId =
  | StoryCompositionId
  | 'BrandedFeedPost'
  | 'BrandedFeedPortrait';

export type RemotionRenderRequest = {
  compositionId: RemotionCompositionId;
  props: {
    photoUrl: string;
    headline: string;
    subtitle?: string;
    categoryLabel?: string;
    brandName: string;
    location?: string;
    primaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    overlayOpacity?: number;
    headlineWeight?: number;
    headlineScale?: number;
    templateId?: string;
    kitId?: string;
    contentIntent?: string;
    sector?: string;
    layoutSpecPatch?: Record<string, unknown>;
    galleryPhotoUrls?: string[];
    mood?: string;
    businessType?: string;
    sceneBrief?: string;
    preferredLayoutFamily?: string;
  };
  /** If true, call Creative Director Agent to enhance spec before render (recommended) */
  useCreativeDirector?: boolean;
  /** Marka Detayı kütüphanesi kilitliyse Creative Director şablon ailesini değiştiremez */
  brandTemplateLocked?: boolean;
  /** Tenant motion profile constraints — Creative Director must pick from this list */
  allowedCompositions?: StoryCompositionId[];
  motionStyle?: string;
  locale?: string;
  /** Optional: upload output to R2 and return URL instead of base64 */
  uploadToR2?: boolean;
  /** Production: do not return ephemeral /tmp video URLs */
  requirePersistent?: boolean;
  /** Workspace ID for storage path */
  workspaceId?: string;
};

// Bundle is created once and cached between requests (Next.js module cache)
let _bundleUrl: string | null = null;
let _bundling = false;
const BUNDLE_VERSION = '17';
let _bundleVersionApplied = '';

async function getBundleUrl(): Promise<string> {
  if (_bundleVersionApplied !== BUNDLE_VERSION) {
    _bundleUrl = null;
    _bundleVersionApplied = BUNDLE_VERSION;
  }
  if (_bundleUrl) return _bundleUrl;
  if (_bundling) {
    // Wait for in-progress bundle
    while (_bundling) await new Promise(r => setTimeout(r, 200));
    return _bundleUrl!;
  }

  _bundling = true;
  try {
    const { bundle } = await import('@remotion/bundler');
    const entryPoint = path.resolve(process.cwd(), 'src/remotion/Root.tsx');
    // publicDir: tells Remotion where to serve static files from (Next.js public folder)
    // staticFile('/audio/track.mp3') → served from publicDir/audio/track.mp3
    const publicDir = path.resolve(process.cwd(), 'public');
    _bundleUrl = await bundle({
      entryPoint,
      webpackOverride: (config) => {
        config.resolve = config.resolve ?? {};
        config.resolve.alias = {
          ...(config.resolve.alias as Record<string, string> | undefined),
          '@': path.resolve(process.cwd(), 'src'),
        };
        return config;
      },
      publicDir,
    });
    return _bundleUrl;
  } finally {
    _bundling = false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RemotionRenderRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    compositionId: reqCompositionId,
    props: reqProps,
    uploadToR2 = false,
    requirePersistent = false,
    workspaceId,
    useCreativeDirector = true,
    brandTemplateLocked = false,
    allowedCompositions,
    motionStyle,
    locale,
  } = body;
  if (workspaceId) {
    const tenantGuard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
    if (tenantGuard) return tenantGuard;
  }
  if (!reqCompositionId || !reqProps?.photoUrl || !reqProps?.headline) {
    return NextResponse.json({ error: 'compositionId, props.photoUrl, props.headline required' }, { status: 400 });
  }
  if (!isUsableGalleryPhotoUrl(reqProps.photoUrl)) {
    return NextResponse.json(
      { error: 'Photo URL is not a usable image asset (invalid or broken gallery link)' },
      { status: 400 },
    );
  }
  if (!(await probeGalleryImageUrl(reqProps.photoUrl))) {
    return NextResponse.json(
      { error: 'Photo URL is not reachable (expired, blocked, or not an image)' },
      { status: 422 },
    );
  }

  let propsForRender = reqProps;
  let effectiveBrandTemplateLocked = brandTemplateLocked;
  let effectiveMotionStyle = motionStyle;
  let effectiveLocale = locale;
  let effectiveAllowedCompositions = allowedCompositions;

  if (workspaceId) {
    const sectorHint = String((reqProps as Record<string, unknown>).sector ?? '');
    const [tokens, theme] = await Promise.all([
      fetchBrandProductionTokensForWorkspace(workspaceId, {
        brandName: reqProps.brandName,
        sector: sectorHint,
      }),
      fetchBrandThemeForWorkspace(workspaceId),
    ]);
    propsForRender = applyBrandTokensToRenderProps(
      reqProps as Record<string, unknown>,
      tokens,
    ) as typeof reqProps;

    const policy = resolveBrandRemotionRenderPolicy(theme, { sector: sectorHint });
    if (!effectiveBrandTemplateLocked && policy.brandTemplateLocked) {
      effectiveBrandTemplateLocked = true;
    }
    effectiveMotionStyle = effectiveMotionStyle || policy.motionStyle;
    effectiveLocale = effectiveLocale || policy.locale;
    effectiveAllowedCompositions = effectiveAllowedCompositions ?? policy.allowedCompositions;
  }

  // ── Creative Director Agent: enhance spec before render ───────────────────
  let compositionId = reqCompositionId;
  let props = { ...propsForRender };
  let creativeDirector: Record<string, unknown> | null = null;
  const extProps = propsForRender as Record<string, unknown>;
  const incomingTemplateId = String(extProps.templateId ?? '');

  if (useCreativeDirector && reqProps.headline && reqProps.brandName) {
    try {
      const cdBase = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
      const currentTpl = incomingTemplateId ? getRemotionTemplate(incomingTemplateId) : undefined;
      const cdRes = await fetch(`${cdBase}/api/remotion/creative-director`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: reqProps.headline,
          caption: reqProps.subtitle || '',
          brandName: reqProps.brandName,
          businessType: extProps.businessType,
          mood: extProps.mood || '',
          primaryColor: reqProps.primaryColor,
          accentColor: reqProps.accentColor,
          allowedCompositions: effectiveAllowedCompositions,
          motionStyle: effectiveMotionStyle,
          locale: effectiveLocale,
          preferredCompositionId: reqCompositionId,
          templateId: incomingTemplateId || undefined,
          currentLayoutFamily: currentTpl?.family,
          contentIntent: extProps.contentIntent,
          sector: extProps.sector,
          galleryPhotoCount: Array.isArray(extProps.galleryPhotoUrls)
            ? (extProps.galleryPhotoUrls as unknown[]).length + 1
            : 1,
          sceneBrief: String(extProps.sceneBrief ?? ''),
          preferredLayoutFamily: extProps.preferredLayoutFamily as RemotionLayoutFamily | undefined,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (cdRes.ok) {
        const spec = await cdRes.json() as {
          layoutFamily?: string;
          variantIndex?: number;
          compositionId?: StoryCompositionId;
          categoryLabel?: string;
          displayHeadline?: string;
          displaySubtitle?: string;
          overlayOpacity?: number;
          headlineWeight?: number;
          headlineScale?: number;
          layoutOverrides?: CreativeDirectorLayoutOverrides;
          rationale?: string;
          designScore?: number;
        };

        const lockComposition = reqCompositionId === 'EventAnnouncementStory'
          || reqCompositionId === 'GallerySeriesStory'
          || reqCompositionId.startsWith('SpecPoster')
          || (effectiveBrandTemplateLocked && Boolean(incomingTemplateId));

        const isSpecStory = reqCompositionId === 'SpecStory';
        let nextTemplateId = incomingTemplateId;

        if (effectiveBrandTemplateLocked && incomingTemplateId) {
          // Marka Detayı story şablonu — CD yalnızca copy/layout ince ayarı; templateId sabit kalır.
          nextTemplateId = incomingTemplateId;
        } else if (isSpecStory && spec.layoutFamily) {
          nextTemplateId = resolveTemplateFromDirector({
            layoutFamily: spec.layoutFamily as RemotionLayoutFamily,
            variantIndex: spec.variantIndex,
            compositionId: spec.compositionId,
            currentTemplateId: incomingTemplateId || undefined,
            intent: extProps.contentIntent as ContentIntent | undefined,
            sector: String(extProps.sector ?? ''),
            galleryPhotoCount: Array.isArray(extProps.galleryPhotoUrls)
              ? (extProps.galleryPhotoUrls as unknown[]).length + 1
              : 1,
          });
        } else if (!lockComposition && spec.compositionId) {
          const allowed = effectiveAllowedCompositions?.length
            ? new Set(effectiveAllowedCompositions)
            : null;
          let nextComposition = spec.compositionId;
          if (allowed && !allowed.has(nextComposition)) {
            nextComposition = reqCompositionId as StoryCompositionId;
          }
          compositionId = nextComposition;
          nextTemplateId = resolveTemplateFromDirector({
            compositionId: nextComposition,
            currentTemplateId: incomingTemplateId || undefined,
            intent: extProps.contentIntent as ContentIntent | undefined,
            variantIndex: spec.variantIndex,
          });
        }

        const layoutSpecPatch = buildDirectorLayoutSpecPatch({
          layoutOverrides: spec.layoutOverrides,
          overlayOpacity: spec.overlayOpacity,
          headlineWeight: spec.headlineWeight,
          headlineScale: spec.headlineScale,
        });

        props = {
          ...reqProps,
          templateId: nextTemplateId || incomingTemplateId,
          headline: spec.displayHeadline || reqProps.headline,
          subtitle: spec.displaySubtitle || reqProps.subtitle,
          categoryLabel: spec.categoryLabel || reqProps.categoryLabel,
          overlayOpacity: spec.overlayOpacity,
          headlineWeight: spec.headlineWeight,
          headlineScale: spec.headlineScale,
          layoutSpecPatch,
        };

        creativeDirector = {
          layoutFamily: spec.layoutFamily,
          variantIndex: spec.variantIndex,
          templateId: nextTemplateId,
          compositionId: isSpecStory ? 'SpecStory' : compositionId,
          rationale: spec.rationale,
          designScore: spec.designScore,
        };

        console.log(
          `[remotion] Creative Director: ${incomingTemplateId || reqCompositionId} → ` +
          `${nextTemplateId} (${spec.layoutFamily}[${spec.variantIndex ?? 0}]) | ` +
          `score=${spec.designScore} | "${spec.displayHeadline}"`,
        );
      }
    } catch (cdErr) {
      console.warn('[remotion] Creative Director failed, using original spec:', (cdErr as Error).message?.slice(0, 60));
    }
  }

  const extResolved = props as Record<string, unknown>;
  props = {
    ...props,
    photoUrl: await resolveMediaUrlForHeadlessRender(props.photoUrl),
    galleryPhotoUrls: Array.isArray(extResolved.galleryPhotoUrls)
      ? await Promise.all(
          (extResolved.galleryPhotoUrls as string[]).map(resolveMediaUrlForHeadlessRender),
        )
      : extResolved.galleryPhotoUrls,
    logoUrl: typeof extResolved.logoUrl === 'string'
      ? await resolveMediaUrlForHeadlessRender(extResolved.logoUrl)
      : extResolved.logoUrl,
  };

  const t0 = Date.now();
  const renderMeta = () => ({
    templateId: String((props as Record<string, unknown>).templateId ?? incomingTemplateId ?? ''),
    creativeDirector,
  });

  try {
    // ── Agency posters: SVG overlay + Sharp (skip amateur CSS Remotion still) ──
    if (compositionId.startsWith('SpecPoster')) {
      const format = compositionId === 'SpecPosterPost'
        ? 'post' as const
        : compositionId === 'SpecPosterPortrait'
          ? 'portrait' as const
          : 'story' as const;
      const ext = props as Record<string, unknown>;
      const posterTemplateId = String(ext.posterTemplateId ?? ext.templateId ?? 'poster_lineup_tiered_01');
      const { renderAgencyPoster } = await import('@/lib/poster-render-service');
      let posterBrandKit;
      if (workspaceId) {
        const tokens = await fetchBrandProductionTokensForWorkspace(workspaceId, {
          brandName: props.brandName,
          sector: String(ext.sector ?? ext.businessType ?? ''),
        });
        posterBrandKit = tokens.announcementKit;
      }
      const {
        buffer: pngBuffer,
        announcementTemplateId,
        grafikerScore: posterGrafikerScore,
        grafikerPass: posterGrafikerPass,
      } = await renderAgencyPoster({
        posterTemplateId,
        photoUrl: props.photoUrl,
        format,
        headline: props.headline,
        subtitle: props.subtitle,
        brandName: props.brandName,
        location: props.location,
        eventDate: ext.eventDate as string | undefined,
        eventTime: ext.eventTime as string | undefined,
        cta: ext.cta as string | undefined,
        primaryColor: props.primaryColor,
        accentColor: props.accentColor,
        fontFamily: props.fontFamily,
        bodyFont: props.bodyFont as string | undefined,
        textColor: props.headlineColor as string | undefined,
        brandKit: posterBrandKit,
        brandTheme: (body as { brandTheme?: Record<string, unknown> }).brandTheme ?? null,
        logoUrl: ext.logoUrl as string | undefined,
        lineupArtists: ext.lineupArtists as string[] | undefined,
        sector: String(ext.sector ?? ext.businessType ?? ''),
      });
      const durationMs = Date.now() - t0;
      console.log(
        `[remotion] ${compositionId} agency poster via ${announcementTemplateId} in ${durationMs}ms (${(pngBuffer.length / 1024).toFixed(0)} KB)`,
      );

      if (uploadToR2 && workspaceId && process.env.R2_BUCKET_NAME) {
        try {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          const s3 = new S3Client({
            region: 'auto',
            endpoint: process.env.R2_ENDPOINT,
            credentials: {
              accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
              secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
            },
          });
          const slug = `${workspaceId.slice(0, 8)}-${compositionId.toLowerCase()}-${Date.now()}`;
          const key = `${workspaceId}/posts/${slug}.png`;
          await s3.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            Body: pngBuffer,
            ContentType: 'image/png',
          }));
          const imageUrl = mediaUrlForKey(key);
          return NextResponse.json({
            imageUrl,
            compositionId,
            durationMs,
            bytes: pngBuffer.length,
            isStill: true,
            announcementTemplateId,
            renderEngine: 'agency-svg',
            grafikerScore: posterGrafikerScore,
            grafikerPass: posterGrafikerPass,
          });
        } catch { /* fall through to base64 */ }
      }

      const b64 = pngBuffer.toString('base64');
      return NextResponse.json({
        imageUrl: `data:image/png;base64,${b64}`,
        compositionId,
        durationMs,
        bytes: pngBuffer.length,
        isStill: true,
        announcementTemplateId,
        renderEngine: 'agency-svg',
        grafikerScore: posterGrafikerScore,
        grafikerPass: posterGrafikerPass,
      });
    }

    // 1. Get (or build) bundle
    const serveUrl = await getBundleUrl();

    // 2. Select composition
    const { selectComposition } = await import('@remotion/renderer');
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: props,
    });

    // 3. Render to temp file
    const os = await import('os');
    const fsModule = await import('fs');
    const isStillComposition =
      compositionId === 'BrandedFeedPost'
      || compositionId === 'BrandedFeedPortrait'
      || compositionId === 'SpecPosterStory'
      || compositionId === 'SpecPosterPost'
      || compositionId === 'SpecPosterPortrait';

    // Post compositions → PNG still (fast ~3s); story/event → MP4 video
    if (isStillComposition) {
      const tmpPng = os.default.tmpdir() + `/remotion-${compositionId}-${Date.now()}.png`;
      const { renderStill: renderStillPost } = await import('@remotion/renderer');
      await renderStillPost({
        composition,
        serveUrl,
        output: tmpPng,
        inputProps: props,
        frame: 0,
        imageFormat: 'png',
        scale: 1.0,
      });

      if (!fsModule.default.existsSync(tmpPng)) {
        return NextResponse.json({ error: 'Still render produced no output' }, { status: 500 });
      }
      const pngBuffer = fsModule.default.readFileSync(tmpPng);
      fsModule.default.unlinkSync(tmpPng);
      const durationMs = Date.now() - t0;
      console.log(`[remotion] ${compositionId} still rendered in ${durationMs}ms (${(pngBuffer.length / 1024).toFixed(0)} KB)`);

      // Upload or return base64
      if (uploadToR2 && workspaceId && process.env.R2_BUCKET_NAME) {
        try {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          const s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '' } });
          const slug = `${workspaceId.slice(0, 8)}-${compositionId.toLowerCase()}-${Date.now()}`;
          const key = `${workspaceId}/posts/${slug}.png`;
          await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: pngBuffer, ContentType: 'image/png' }));
          const imageUrl = mediaUrlForKey(key);
          return NextResponse.json({ imageUrl, compositionId, durationMs, bytes: pngBuffer.length, isStill: true });
        } catch { /* fall through to base64 */ }
      }

      const b64 = pngBuffer.toString('base64');
      return NextResponse.json({ imageUrl: `data:image/png;base64,${b64}`, compositionId, durationMs, bytes: pngBuffer.length, isStill: true });
    }

    const tmpFile = os.default.tmpdir() + `/remotion-${compositionId}-${Date.now()}.mp4`;
    const { renderMedia, selectComposition: reselectComposition } = await import('@remotion/renderer');

    let renderProps: Record<string, unknown> = { ...props };
    let activeComposition = composition;
    let grafikerReview: GrafikerReviewResult | null = null;
    let videoBuffer: Buffer | null = null;

    for (let attempt = 0; attempt <= GRAFIKER_MAX_RETRIES; attempt++) {
      await renderMedia({
        composition: activeComposition,
        serveUrl,
        codec: 'h264',
        outputLocation: tmpFile,
        inputProps: renderProps,
        onProgress: ({ progress }) => {
          const pct = Math.round(progress * 100);
          if (pct % 20 === 0) console.log(`[remotion] ${compositionId}: ${pct}%`);
        },
        jpegQuality: 95,
        scale: 1.0,
      });

      if (!fsModule.default.existsSync(tmpFile)) {
        return NextResponse.json({ error: 'Render produced no output file' }, { status: 500 });
      }

      videoBuffer = fsModule.default.readFileSync(tmpFile);
      fsModule.default.unlinkSync(tmpFile);
      console.log(`[remotion] rendered ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB (attempt ${attempt + 1})`);

      grafikerReview = await runGrafikerReview(activeComposition, serveUrl, renderProps, compositionId);
      if (grafikerReview) {
        const overlap = grafikerReview.text_overlap ? '⚠ OVERLAP' : '✓ no overlap';
        console.log(
          `[remotion] Grafiker: ${grafikerReview.score}/10 pass=${grafikerReview.pass} | ${overlap} | ${grafikerReview.verdict ?? ''}`,
        );
        if (grafikerReview.issues?.length) {
          console.log(`[remotion] Grafiker issues: ${grafikerReview.issues.join(' | ')}`);
        }
      }

      if (!grafikerReview || grafikerMeetsBar(grafikerReview) || attempt >= GRAFIKER_MAX_RETRIES) {
        break;
      }

      const patched = buildGrafikerRetryPatch(renderProps, grafikerReview, attempt);
      if (!patched) break;

      console.log(
        `[remotion] Grafiker retry ${attempt + 1}/${GRAFIKER_MAX_RETRIES}: score=${grafikerReview.score} — boosting contrast/layout`,
      );
      renderProps = patched;
      activeComposition = await reselectComposition({
        serveUrl,
        id: compositionId,
        inputProps: renderProps,
      });
    }

    props = renderProps as typeof props;
    const grafikerScore = grafikerReview?.score ?? null;
    const grafikerPass = grafikerReview ? grafikerMeetsBar(grafikerReview) : true;

    const durationMs = Date.now() - t0;
    console.log(`[remotion] ${compositionId} rendered in ${durationMs}ms, ${videoBuffer!.length} bytes`);

    // 4a. Upload to R2 if requested and configured
    if (uploadToR2 && workspaceId && process.env.R2_BUCKET_NAME) {
      try {
        const slug = `${workspaceId.slice(0, 8)}-${compositionId.toLowerCase().replace('story', '')}-${Date.now()}`;
        const key = `${workspaceId}/stories/${slug}.mp4`;

        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        const s3 = new S3Client({
          region: 'auto',
          endpoint: process.env.R2_ENDPOINT,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
          },
        });

        await s3.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          Body: videoBuffer!,
          ContentType: 'video/mp4',
        }));

        const videoUrl = mediaUrlForKey(key);
        return NextResponse.json({ videoUrl, thumbUrl: videoUrl, compositionId, durationMs, bytes: videoBuffer!.length, grafikerScore, grafikerPass, ...renderMeta() });
      } catch (uploadErr) {
        console.warn('[remotion] R2 upload failed, returning base64:', uploadErr);
      }
    }

    if (requirePersistent) {
      return NextResponse.json(
        {
          error: 'Persistent video storage (R2) is required for production bundles. Configure R2_BUCKET_NAME or retry.',
        },
        { status: 422 },
      );
    }

    // 4b. Save to local /tmp/remotion-serve/ and return a serveable URL (dev fallback — dev only)
    try {
      const serveDir = '/tmp/remotion-serve';
      const mkdirModule = await import('fs');
      if (!mkdirModule.default.existsSync(serveDir)) {
        mkdirModule.default.mkdirSync(serveDir, { recursive: true });
      }
      const slug = `${compositionId.toLowerCase().replace('story','')}-${Date.now()}`;
      const serveFile = `${serveDir}/${slug}.mp4`;
      mkdirModule.default.writeFileSync(serveFile, videoBuffer!);
      const videoUrl = `/api/remotion/video/${slug}.mp4`;
      console.log(`[remotion] saved local: ${serveFile}`);
      return NextResponse.json({ videoUrl, thumbUrl: videoUrl, compositionId, durationMs, bytes: videoBuffer!.length, grafikerScore, grafikerPass });
    } catch {
      // Last resort: base64
      const base64 = videoBuffer!.toString('base64');
      return NextResponse.json({ videoBase64: base64, mimeType: 'video/mp4', compositionId, durationMs, bytes: videoBuffer!.length, grafikerScore, grafikerPass, ...renderMeta() });
    }

  } catch (err: any) {
    console.error('[remotion] render error:', err?.message ?? err);
    return NextResponse.json(
      { error: err?.message ?? 'Render failed', compositionId },
      { status: 500 },
    );
  }
}

/**
 * GET /api/remotion/render — list available compositions and their props schema.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    compositions: [
      { id: 'EditorialStory', description: 'Safe default — bottom gradient, left-aligned type', bestFor: ['daily', 'food', 'venue'] },
      { id: 'MagazineCoverStory', description: 'Awwwards editorial — giant headline, cinematic pan', bestFor: ['feature', 'chef', 'spotlight'] },
      { id: 'CampaignHeroStory', description: 'Campaign hero — centered type + offer pill', bestFor: ['promo', 'offer', 'launch'] },
      { id: 'LuxurySplitStory', description: '60% photo + 40% brand panel', bestFor: ['premium', 'luxury', 'fine dining'] },
      { id: 'CinematicStory', description: 'Atmospheric — centered 1-2 words on empty horizon', bestFor: ['sunset', 'sea', 'sky'] },
      { id: 'EventAnnouncementStory', description: 'Event — date/time/CTA + audio', bestFor: ['events', 'DJ', 'parties'] },
    ],
    requiredProps: ['photoUrl', 'headline', 'brandName'],
    optionalProps: ['subtitle', 'categoryLabel', 'location', 'primaryColor', 'accentColor', 'fontFamily'],
    dimensions: { width: 1080, height: 1920 },
    duration: '5s @ 30fps',
    outputFormat: 'video/mp4 (H.264)',
  });
}
