/**
 * POST /api/generate-reel
 *
 * Gallery image → fal.ai I2V reel video (Kling / Luma chain).
 * Server-side only — FAL_API_KEY never exposed to the client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { produceFalMissionVideo } from '@/lib/fal-video';
import { finalizeFalPrompt } from '@/lib/fal-prompt';
import { serverConfig } from '@/lib/server-config';
import { API_BASE_URL } from '@/lib/runtime-config';

interface GenerateReelInput {
  title?: string;
  headline?: string;
  concept?: string;
  caption?: string;
  promptImage?: string;
  promptImages?: string[];
  brandTone?: string;
  duration?: number;
  workspaceId?: string;
  sceneMetadata?: {
    workspaceId?: string;
    businessType?: string;
    brandName?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const input = (await request.json()) as GenerateReelInput;
    const promptImage = input.promptImage ?? input.promptImages?.[0];
    if (!promptImage?.trim()) {
      return NextResponse.json({ error: 'promptImage is required' }, { status: 400 });
    }

    if (!serverConfig.fal.configured) {
      return NextResponse.json(
        { error: 'fal.ai is not configured. Set FAL_API_KEY in your environment.' },
        { status: 503 },
      );
    }

    const headline = String(input.title ?? input.headline ?? 'Brand Reel').trim();
    const caption = String(input.concept ?? input.caption ?? '').trim();
    const workspaceId = String(
      input.workspaceId ?? input.sceneMetadata?.workspaceId ?? '',
    ).trim() || undefined;

    const result = await produceFalMissionVideo({
      imageUrl: promptImage,
      headline,
      caption,
      mood: input.brandTone,
      brandBusinessType: input.sceneMetadata?.businessType,
      pipeline: 'fal_reel',
      workspaceId,
    });

    let videoUrl = result.videoUrl;

    if (videoUrl) {
      try {
        const { isR2Configured, generateStorageKey, uploadImageFromUrl } = await import('@/lib/r2-storage');
        if (isR2Configured()) {
          const brandName = input.sceneMetadata?.brandName ?? 'shared';
          const key = generateStorageKey(brandName, 'reel', 'mp4');
          const r2Result = await uploadImageFromUrl(videoUrl, key);
          if (r2Result) {
            videoUrl = r2Result.url;
            console.log('[generate-reel] Video uploaded to R2:', videoUrl);
          }
        }
      } catch (err) {
        console.warn('[generate-reel] R2 upload failed, using fal URL:', err);
      }

      persistReelArtifact({
        title: headline,
        videoUrl,
        promptText: finalizeFalPrompt(
          [headline, caption].filter(Boolean).join('. '),
          { kind: 'video', label: 'generate-reel' },
        ),
        model: result.model,
        duration: input.duration ?? 10,
      }).catch((err) => {
        console.error('[/api/generate-reel] Failed to persist artifact:', err);
      });
    }

    return NextResponse.json(
      {
        videoUrl,
        outputUrls: videoUrl ? [videoUrl] : [],
        model: result.model,
        promptText: caption || headline,
        taskId: result.reusedFromArtifactId ?? `fal-${Date.now()}`,
        metadata: {
          duration: input.duration ?? 10,
          ratio: '9:16',
          source: 'fal',
          reused: Boolean(result.reused),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[/api/generate-reel] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: message },
      { status: 500 },
    );
  }
}

async function persistReelArtifact(data: {
  title: string;
  videoUrl: string;
  promptText: string;
  model: string;
  duration: number;
}): Promise<void> {
  const endpoint = `${API_BASE_URL}/api/artifacts/video`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: data.title,
      contentUrl: data.videoUrl,
      content: data.promptText,
      artifactType: 'VideoEdit',
      metadata: {
        model: data.model,
        duration: data.duration,
        ratio: '9:16',
        source: 'fal',
        generatedAt: new Date().toISOString(),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Artifact persist failed (${res.status}): ${body.slice(0, 200)}`);
  }
}
