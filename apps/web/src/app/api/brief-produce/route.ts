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
 *
 * With `background: true`, validates quickly and returns 202; BCD + auto-produce
 * run after the response via Next.js `after()`.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { type BriefOutputType } from '@/lib/brief-intent-resolver';
import { interpretBriefAsBrand, type BrandCreativeDirectorOutput } from '@/lib/brand-creative-director';
import {
  buildBriefProduceIdeas,
  type BriefOwnerChoices,
  clampBriefCarouselSlides,
  resolveBriefIdeaCount,
  resolveBriefVariantCount,
  stampBriefRequestSnapshot,
  validateBriefProduceRequest,
} from '@/lib/brief-produce-plan';
import {
  briefDesignDirectionLabel,
  briefGoalLabel,
  buildBriefDetailSubline,
  isBriefDesignDirectionId,
  isBriefGoalId,
  sanitizeBriefDetails,
} from '@/lib/brief-design-direction';
import { setBriefJobStatus, type BriefJobStatus } from '@/lib/brief-job-status';
import {
  buildBriefProduceQueueJobId,
  getProductionQueue,
  PRODUCTION_SLOTS_QUEUE,
  type BriefProduceJobData,
} from '@/lib/queue-client';
import { getProductionQueueWorkerSnapshot } from '@/lib/production-queue-health';
import { isTrustedInternalRequest } from '@/lib/tenant-production-guard';
import {
  BRIEF_MAX_REVISION_ROUNDS,
  buildBriefRequestSnapshot,
  sanitizeRevisionNote,
} from '@/lib/brief-revision';
import { serverConfig } from '@/lib/server-config';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

function catalogKeysFromArtifacts(
  artifacts: Array<Record<string, unknown>>,
): string[] {
  const keys: string[] = [];
  for (const art of artifacts) {
    const meta = (art.metadata && typeof art.metadata === 'object'
      ? art.metadata
      : {}) as Record<string, unknown>;
    const key = String(
      meta.catalog_slot_key
      ?? art.catalog_slot_key
      ?? art.catalogSlotKey
      ?? '',
    ).trim();
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export const runtime = 'nodejs';
/** Sync brief-produce waits on full auto-produce (image gen can exceed 5 min). */
export const maxDuration = 480;

interface BriefProduceParams {
  workspaceId: string;
  title: string;
  direction: string;
  outputType: BriefOutputType;
  ideaCount: number;
  /** Carousel only — requested slide count (2–6). */
  carouselSlides: number;
  photoUrls: string[];
  tenantId: string;
  officeId: string;
  lockUserHeadline: boolean;
  /** "+" owner choices — goal, design direction, facts. */
  choices: BriefOwnerChoices;
  /** "Pick one" looks per idea (1–3; reel/carousel forced to 1). */
  variantCount: number;
  /** Brief job id — seeds sibling variant groups. */
  jobId: string;
}

interface BriefProduceResult {
  produced: number;
  artifacts: Array<Record<string, unknown>>;
  brandInterpretation: string | null;
  error?: string;
}

async function loadBrandCreativeDirector(
  workspaceId: string,
  title: string,
  direction: string,
  outputType: BriefOutputType,
  lockUserHeadline: boolean,
  choices: BriefOwnerChoices,
): Promise<BrandCreativeDirectorOutput | null> {
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
    if (!brandRes.ok) return null;

    const brandCtx = await brandRes.json() as Record<string, unknown>;
    return await interpretBriefAsBrand({
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
      lockUserHeadline,
      ownerGoal: briefGoalLabel(choices.goal) ?? undefined,
      ownerDesignDirection: briefDesignDirectionLabel(choices.designDirection) ?? undefined,
      ownerFacts: choices.details ? buildBriefDetailSubline(choices.details) || undefined : undefined,
      ownerRevision: choices.revision?.note || undefined,
    });
  } catch (bcdErr) {
    console.warn('[brief-produce] BCD brand context fetch failed, using rule-based:', bcdErr instanceof Error ? bcdErr.message : bcdErr);
    return null;
  }
}

async function executeBriefProduction(params: BriefProduceParams): Promise<BriefProduceResult> {
  const {
    workspaceId,
    title,
    direction,
    outputType,
    ideaCount,
    carouselSlides,
    photoUrls,
    tenantId,
    officeId,
    lockUserHeadline,
    choices,
    variantCount,
    jobId,
  } = params;

  // Goal / look / facts go to the director as structured fields (not folded
  // into the direction text, which the director echoes back as the caption).
  const bcd = await loadBrandCreativeDirector(
    workspaceId,
    title,
    direction,
    outputType,
    lockUserHeadline,
    choices,
  );
  const rawIdeas = buildBriefProduceIdeas({
    title,
    extraDirection: direction,
    outputType,
    count: outputType === 'carousel' ? carouselSlides : ideaCount,
    photoUrls,
    bcd,
    lockUserHeadline,
    choices,
    variantCount,
    variantGroupSeed: jobId,
  });
  const ideas = stampBriefRequestSnapshot(
    rawIdeas,
    buildBriefRequestSnapshot({
      title,
      direction,
      outputType,
      count: outputType === 'carousel' ? carouselSlides : ideaCount,
      goal: choices.goal,
      designDirection: choices.designDirection,
      details: choices.details,
      lockUserHeadline,
      photoUrls,
    }),
  );

  const BASE = getNextjsInternalOrigin();
  const INTERNAL_KEY = serverConfig.internal.apiKey;
  const creativeBrief = [title.trim(), direction].filter(Boolean).join('\n');

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
    signal: AbortSignal.timeout(450_000),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const message = (data.error as string) ?? 'İçerik üretimi başarısız';
    console.error('[brief-produce] auto-produce error:', message);
    return {
      produced: 0,
      artifacts: [],
      brandInterpretation: bcd?.brandInterpretation ?? null,
      error: message,
    };
  }

  const artifacts = (data.artifacts ?? []) as Array<Record<string, unknown>>;
  const { resolveExternallyAccessibleUrl } = await import('@/lib/media-url');
  const resolvedArtifacts = await Promise.all(
    artifacts.map(async (art) => {
      const imageUrl = typeof art.imageUrl === 'string' ? await resolveExternallyAccessibleUrl(art.imageUrl) : art.imageUrl;
      const videoUrl = typeof art.videoUrl === 'string' ? await resolveExternallyAccessibleUrl(art.videoUrl) : art.videoUrl;
      return { ...art, imageUrl, videoUrl };
    }),
  );

  const produced = Number(data.produced ?? 0);
  return {
    produced,
    artifacts: resolvedArtifacts,
    brandInterpretation: bcd?.brandInterpretation ?? null,
    ...(produced === 0
      ? {
          error: (() => {
            const results = (data.results ?? data.errors ?? []) as Array<{ error?: string }>;
            const first = results.find((r) => r?.error)?.error;
            return first ?? 'İçerik üretilemedi. Galeri fotoğrafı veya API limitlerini kontrol edin.';
          })(),
        }
      : {}),
  };
}

type BriefStatusBase = Pick<BriefJobStatus, 'workspaceId' | 'title' | 'outputType' | 'expectedArtifacts' | 'revisionOf' | 'revisionRound'>;

/** queued → running → complete|failed on one brief-job-status record. */
async function runTrackedBriefProduction(
  jobId: string,
  base: BriefStatusBase,
  params: BriefProduceParams,
): Promise<BriefProduceResult> {
  try {
    await setBriefJobStatus({ ...base, jobId, status: 'running', produced: 0 });
    const result = await executeBriefProduction(params);
    const catalogSlotKeys = catalogKeysFromArtifacts(result.artifacts);
    if (result.produced === 0) {
      console.error('[brief-produce] job produced 0:', jobId, result.error);
      await setBriefJobStatus({
        ...base,
        jobId,
        status: 'failed',
        produced: 0,
        error: result.error ?? 'İçerik üretilemedi',
        catalogSlotKeys,
      });
    } else {
      console.info('[brief-produce] job complete:', jobId, `produced=${result.produced}`);
      await setBriefJobStatus({ ...base, jobId, status: 'complete', produced: result.produced, catalogSlotKeys });
    }
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'production failed';
    console.error('[brief-produce] job failed:', jobId, message);
    await setBriefJobStatus({ ...base, jobId, status: 'failed', produced: 0, error: message });
    return { produced: 0, artifacts: [], brandInterpretation: null, error: message };
  }
}

/**
 * Put the brief on the BullMQ production queue when the stack runs on it.
 * Returns ok:false (with a reason) so the caller can fall back to inline `after()`.
 */
async function enqueueBriefProduceJob(
  data: Omit<BriefProduceJobData, 'kind'>,
): Promise<{ ok: true; queueJobId: string } | { ok: false; reason: string }> {
  if ((process.env.PRODUCTION_EXECUTOR ?? '').toLowerCase() !== 'bullmq') {
    return { ok: false, reason: 'executor_not_bullmq' };
  }
  const queue = getProductionQueue();
  if (!queue) return { ok: false, reason: 'queue_unavailable' };
  const workers = await getProductionQueueWorkerSnapshot();
  if (!workers.available || workers.workerCount < 1) {
    console.warn(`[brief-produce] BullMQ worker offline (${workers.reason ?? 'no workers'}) — running brief ${data.jobId} inline`);
    return { ok: false, reason: 'production_worker_offline' };
  }
  try {
    const queueJobId = buildBriefProduceQueueJobId(data.jobId);
    // Briefs are owner-initiated: jump ahead of the weekly slot batches.
    await queue.add(PRODUCTION_SLOTS_QUEUE, { kind: 'brief', ...data }, { jobId: queueJobId, priority: 1, attempts: 2 });
    return { ok: true, queueJobId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'enqueue failed';
    console.warn(`[brief-produce] enqueue failed (${reason}) — running brief ${data.jobId} inline`);
    return { ok: false, reason };
  }
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
    background?: boolean;
    lockUserHeadline?: boolean;
    /** "+" owner choices. */
    goal?: string;
    designDirection?: string;
    details?: Record<string, unknown>;
    /** "Pick one" looks per idea (1–3). */
    variants?: string | number;
    /** "Düzelt" round — set by /api/brief-revise. */
    revision?: { of?: string; round?: number; note?: string };
    /** BullMQ worker replay — internal callers only. */
    jobId?: string;
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
    background = false,
    lockUserHeadline = false,
    goal,
    designDirection,
    details,
    variants,
    revision,
  } = body;
  const revisionNote = sanitizeRevisionNote(revision?.note);
  const revisionRound = Math.round(Number(revision?.round) || 0);
  const revisionOf = String(revision?.of ?? '').trim();
  const activeRevision = revisionNote && revisionOf && revisionRound >= 1 && revisionRound <= BRIEF_MAX_REVISION_ROUNDS
    ? { of: revisionOf, round: revisionRound, note: revisionNote }
    : null;
  const choices: BriefOwnerChoices = {
    goal: isBriefGoalId(goal) ? goal : null,
    designDirection: isBriefDesignDirectionId(designDirection) ? designDirection : null,
    details: sanitizeBriefDetails(details),
    revision: activeRevision,
  };

  const validation = validateBriefProduceRequest({ workspaceId, title, outputType });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const resolvedWorkspaceId = validation.workspaceId;
  const direction = (extraDirection ?? description).trim();
  // Carousel: `count` is the slide count of a single carousel (kept on the idea).
  const ideaCount = resolveBriefIdeaCount(outputType, count);
  const carouselSlides = clampBriefCarouselSlides(count);
  // A revise round repaints one card — never fans out into looks again.
  const variantCount = activeRevision ? 1 : resolveBriefVariantCount(outputType, variants);
  const expectedArtifacts = ideaCount * variantCount;
  const tenantId = req.headers.get('X-Tenant-Id') || resolvedWorkspaceId;
  const officeId = req.headers.get('X-Office-Id') || '';
  // Worker replay: the BullMQ worker posts the stored body back with the original
  // jobId so status stays on one record. Only trusted internal callers may set it.
  const replayJobId = String(body.jobId ?? '').trim();
  const trackedReplay = Boolean(replayJobId && isTrustedInternalRequest(req));
  const jobId = trackedReplay ? replayJobId : crypto.randomUUID();

  const productionParams: BriefProduceParams = {
    workspaceId: resolvedWorkspaceId,
    title: title.trim(),
    direction,
    outputType,
    ideaCount,
    carouselSlides,
    photoUrls,
    tenantId,
    officeId,
    lockUserHeadline: Boolean(lockUserHeadline),
    choices,
    variantCount,
    jobId,
  };

  const statusBase = {
    workspaceId: resolvedWorkspaceId,
    title: title.trim().slice(0, 120),
    outputType,
    expectedArtifacts,
    ...(activeRevision ? { revisionOf: activeRevision.of, revisionRound: activeRevision.round } : {}),
  };

  if (background) {
    // Durable path: BullMQ worker replays this body. Inline `after()` only when
    // the queue is not configured or no worker is online (local/dev).
    const queued = await enqueueBriefProduceJob({
      jobId,
      workspaceId: resolvedWorkspaceId,
      officeId,
      produceBody: {
        workspaceId: resolvedWorkspaceId,
        title: title.trim(),
        extraDirection: direction,
        outputType,
        count,
        photoUrls,
        lockUserHeadline: Boolean(lockUserHeadline),
        goal: choices.goal,
        designDirection: choices.designDirection,
        details: choices.details,
        variants: variantCount,
        ...(activeRevision ? { revision: activeRevision } : {}),
      },
    });
    await setBriefJobStatus({
      ...statusBase,
      jobId,
      status: 'queued',
      produced: 0,
      executor: queued.ok ? 'bullmq' : 'inline',
    });

    if (!queued.ok) {
      after(() => runTrackedBriefProduction(jobId, statusBase, productionParams));
    }

    return NextResponse.json({
      ok: true,
      queued: true,
      jobId,
      executor: queued.ok ? 'bullmq' : 'inline',
      title: title.trim(),
      outputType,
      count: ideaCount,
      variants: variantCount,
      expectedArtifacts,
    }, { status: 202 });
  }

  try {
    const result = trackedReplay
      ? await runTrackedBriefProduction(jobId, statusBase, productionParams)
      : await executeBriefProduction(productionParams);
    if (result.error && result.produced === 0) {
      return NextResponse.json(
        { error: result.error, produced: 0, code: 'production_failed' },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      produced: result.produced,
      artifacts: result.artifacts,
      pipeline: 'fal_art_director',
      brandInterpretation: result.brandInterpretation,
      ...(result.produced === 0 ? { error: result.error } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'İçerik üretimi sırasında hata oluştu';
    console.error('[brief-produce] fetch error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
