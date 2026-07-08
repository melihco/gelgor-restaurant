import { serverConfig } from './server-config';

const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_AUTH_HEADER = (key: string) => ({ Authorization: `Key ${key}` });

const VIDEO_MODELS = [
  'fal-ai/kling-video/v1.6/pro/image-to-video',
  'fal-ai/luma-dream-machine/image-to-video',
  'fal-ai/hailuo-ai/video-01/image-to-video',
] as const;

interface FalQueueSubmit {
  request_id: string;
  response_url: string;
  status_url: string;
}

interface FalQueueStatus {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  queue_position?: number;
  logs?: unknown[];
  error?: string;
}

interface FalVideoResult {
  video?: { url?: string };
  videoUrl?: string;
  output?: { url?: string };
}

async function runModel(
  apiKey: string,
  modelId: string,
  imageUrl: string,
  prompt: string,
  durationSecs: number,
  timeoutMs: number,
): Promise<string | null> {
  const enqueueRes = await fetch(`${FAL_QUEUE_BASE}/${modelId}`, {
    method: 'POST',
    headers: { ...FAL_AUTH_HEADER(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image_url: imageUrl,
      duration: durationSecs,
      aspect_ratio: '9:16',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!enqueueRes.ok) {
    const body = await enqueueRes.text().catch(() => '');
    throw new Error(`enqueue failed ${enqueueRes.status}: ${body.slice(0, 200)}`);
  }

  const queued = (await enqueueRes.json()) as FalQueueSubmit;
  const { recordFalRequestSubmitted, markFalRequestCompleted, markFalRequestFailed } = await import('./fal-request-tracker');
  recordFalRequestSubmitted({
    requestId: queued.request_id,
    model: modelId,
    kind: 'video',
  });
  const statusUrl = queued.status_url ?? `${FAL_QUEUE_BASE}/${modelId}/requests/${queued.request_id}/status`;
  const resultUrl = queued.response_url ?? `${FAL_QUEUE_BASE}/${modelId}/requests/${queued.request_id}`;

  const deadline = Date.now() + timeoutMs;
  let pollInterval = 4_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, 12_000);

    const statusRes = await fetch(statusUrl, {
      headers: FAL_AUTH_HEADER(apiKey),
      signal: AbortSignal.timeout(10_000),
    });
    if (!statusRes.ok) continue;

    const status = (await statusRes.json()) as FalQueueStatus;
    if (status.status === 'FAILED') {
      markFalRequestFailed(queued.request_id, status.error ?? 'fal.ai job failed');
      throw new Error(status.error ?? 'fal.ai job failed');
    }
    if (status.status !== 'COMPLETED') continue;

    const resultRes = await fetch(resultUrl, {
      headers: FAL_AUTH_HEADER(apiKey),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resultRes.ok) throw new Error(`result fetch failed ${resultRes.status}`);

    const result = (await resultRes.json()) as FalVideoResult;
    const url = result.video?.url ?? result.videoUrl ?? result.output?.url;
    if (url) {
      markFalRequestCompleted(queued.request_id, url);
      return url;
    }
    markFalRequestFailed(queued.request_id, 'fal.ai result has no video URL');
    throw new Error('fal.ai result has no video URL');
  }

  markFalRequestFailed(queued.request_id, `fal.ai job timed out after ${timeoutMs / 1000}s`);
  throw new Error(`fal.ai job timed out after ${timeoutMs / 1000}s`);
}

export async function generateFalVideo(
  imageUrl: string,
  prompt: string,
  opts?: { durationSecs?: number; timeoutMs?: number; workspaceId?: string; skipReuse?: boolean },
): Promise<{ videoUrl: string; model: string; reused?: boolean; reusedFromArtifactId?: string }> {
  if (opts?.workspaceId && !opts.skipReuse) {
    const { findReusableRawI2vVideo } = await import('@/lib/fal-i2v-reuse');
    const reused = await findReusableRawI2vVideo(opts.workspaceId, imageUrl);
    if (reused) {
      console.log(
        `[fal-video] reusing raw I2V from artifact ${reused.artifactId} (${reused.source}):`,
        reused.videoUrl.slice(0, 80),
      );
      return {
        videoUrl: reused.videoUrl,
        model: 'reused_raw_i2v',
        reused: true,
        reusedFromArtifactId: reused.artifactId,
      };
    }
  }

  const apiKey = serverConfig.fal.apiKey;
  if (!apiKey) throw new Error('FAL_API_KEY not set — fal.ai video fallback unavailable');

  const { resolveExternallyAccessibleUrl, isFalAccessibleMediaUrl } = await import('@/lib/media-url');
  const resolvedImageUrl = await resolveExternallyAccessibleUrl(imageUrl);
  if (!isFalAccessibleMediaUrl(resolvedImageUrl)) {
    throw new Error(
      `Image URL not accessible to fal.ai (need HTTPS or data URI): ${resolvedImageUrl.slice(0, 120)}`,
    );
  }

  const durationSecs = opts?.durationSecs ?? 5;
  const timeoutMs = opts?.timeoutMs ?? 110_000;

  for (const modelId of VIDEO_MODELS) {
    try {
      console.log(`[fal-video] trying ${modelId}`);
      const url = await runModel(apiKey, modelId, resolvedImageUrl, prompt, durationSecs, timeoutMs);
      if (url) {
        console.log(`[fal-video] success with ${modelId}:`, url.slice(0, 80));
        return { videoUrl: url, model: modelId };
      }
    } catch (err) {
      console.warn(`[fal-video] ${modelId} failed:`, err instanceof Error ? err.message : err);
    }
  }
  throw new Error('All fal.ai video models failed');
}

// Pipeline classification is owned by the canonical registry (single source of
// truth). These thin re-exports preserve the historical import path used across
// production-loop.ts and production-pipeline-router.ts.
export {
  isFalVideoPipeline,
  isFalDesignPipeline,
  isFalOnlyPipeline,
  isFalOnlyVideoPipeline,
  isFalOnlyPostPipeline,
} from './pipeline-registry';

/** Mission fal.ai slots — image-to-video from gallery reference. */
export async function produceFalMissionVideo(input: {
  imageUrl: string;
  headline: string;
  caption: string;
  mood?: string;
  brandBusinessType?: string;
  pipeline: 'fal_story' | 'fal_reel';
  workspaceId?: string;
  skipReuse?: boolean;
}): Promise<{ videoUrl: string; model: string; reused?: boolean; reusedFromArtifactId?: string }> {
  const prompt = [
    input.headline,
    input.caption,
    input.mood ? `Mood: ${input.mood}` : '',
    input.brandBusinessType ? `Brand sector: ${input.brandBusinessType}` : '',
    input.pipeline === 'fal_reel'
      ? 'Cinematic Instagram reel, smooth camera motion, vertical 9:16, premium brand content.'
      : 'Subtle cinematic story motion, vertical 9:16, ambient atmosphere, premium brand story.',
  ].filter(Boolean).join('. ').slice(0, 500);

  const durationSecs = input.pipeline === 'fal_reel' ? 10 : 5;
  return generateFalVideo(input.imageUrl, prompt, {
    durationSecs,
    timeoutMs: input.pipeline === 'fal_reel' ? 150_000 : 120_000,
    workspaceId: input.workspaceId,
    skipReuse: input.skipReuse,
  });
}
