/**
 * Gallery judge vision payload — R2-backed galleries must reach the model.
 *
 * Tenant-uploaded photos are stored as relative `/api/media?key=…` paths, which
 * OpenAI cannot fetch. Attaching them raw sends a vision call with zero images,
 * the model answers "No images available", and the fail-closed gate withholds
 * every strict-caption slot for that brand.
 */
import { describe, expect, it, vi } from 'vitest';

import { judgeGalleryMatch } from '@/lib/gallery-ai-match-judge';

vi.mock('@/lib/r2-storage', () => ({
  isR2Configured: vi.fn(() => true),
  getPresignedUrl: vi.fn(async (key: string) => `https://pub-abc.r2.dev/${key}?sig=abc`),
}));

const MIRRORED = '/api/media?key=ws-1%2Fimage%2F2026-08-21%2Fdish.jpg';
const ABSOLUTE = 'https://brand.example.com/galeri/dish.jpg';

type CapturedContent = Array<{ type: string; image_url?: { url: string } }> | string;

/** Fake OpenAI client that records the user message content. */
function recordingOpenai(captured: { content?: CapturedContent }) {
  return {
    chat: {
      completions: {
        create: async (req: {
          messages: Array<{ role: string; content: CapturedContent }>;
        }) => {
          captured.content = req.messages.find((m) => m.role === 'user')?.content;
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  pickIndex: 0,
                  confidence: 0.9,
                  canonicalSubject: 'pasta_dish',
                  reason: 'ok',
                }),
              },
            }],
            usage: null,
          };
        },
      },
    },
  } as unknown as Parameters<typeof judgeGalleryMatch>[1]['openai'];
}

function foodInput(url: string) {
  return {
    caption: 'Bugünün imza makarnası sofranızda.',
    headline: 'İmza Makarna',
    canonicalSubject: 'pasta_dish',
    businessType: 'restaurant_cafe',
    contentType: 'post',
    useVision: true,
    candidates: [{
      url,
      primarySubject: 'pasta_dish',
      contentTags: ['food', 'pasta'],
      description: 'Plated pasta.',
    }],
  };
}

function imageUrls(content: CapturedContent | undefined): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((part) => part.type === 'image_url')
    .map((part) => part.image_url?.url ?? '');
}

function payloadJson(content: CapturedContent | undefined): Record<string, unknown> {
  const text = Array.isArray(content)
    ? String((content[0] as unknown as { text?: string })?.text ?? '{}')
    : String(content ?? '{}');
  return JSON.parse(text) as Record<string, unknown>;
}

describe('judgeGalleryMatch — vision URL resolution', () => {
  it('presigns R2-backed gallery paths so the judge can see them', async () => {
    const captured: { content?: CapturedContent } = {};
    const verdict = await judgeGalleryMatch(foodInput(MIRRORED), {
      openai: recordingOpenai(captured),
      model: 'gpt-4o-mini',
    });

    expect(verdict?.pickIndex).toBe(0);
    expect(imageUrls(captured.content)).toEqual([
      'https://pub-abc.r2.dev/ws-1/image/2026-08-21/dish.jpg?sig=abc',
    ]);
    expect(payloadJson(captured.content).evidence).toBe('attached_images_and_metadata');
  });

  it('leaves already public URLs untouched', async () => {
    const captured: { content?: CapturedContent } = {};
    await judgeGalleryMatch(foodInput(ABSOLUTE), {
      openai: recordingOpenai(captured),
      model: 'gpt-4o-mini',
    });

    expect(imageUrls(captured.content)).toEqual([ABSOLUTE]);
  });

  it('asks for a metadata verdict when no image could be attached', async () => {
    const captured: { content?: CapturedContent } = {};
    // A relative path that is not an R2 media key stays unresolvable.
    await judgeGalleryMatch(foodInput('/local/only/dish.jpg'), {
      openai: recordingOpenai(captured),
      model: 'gpt-4o-mini',
    });

    expect(imageUrls(captured.content)).toEqual([]);
    const payload = payloadJson(captured.content);
    // Announcing an absence made the model answer "No images available" and the
    // fail-closed gate then dropped every gallery match for the brand.
    expect(payload.evidence).toBe('vision_metadata');
    const candidates = payload.candidates as Array<Record<string, unknown>>;
    expect(candidates[0]).not.toHaveProperty('has_image');
    expect(candidates[0]?.content_tags).toEqual(['food', 'pasta']);
  });

  it('describes evidence as metadata when vision is not requested', async () => {
    const captured: { content?: CapturedContent } = {};
    await judgeGalleryMatch(
      { ...foodInput(ABSOLUTE), useVision: false },
      { openai: recordingOpenai(captured), model: 'gpt-4o-mini' },
    );

    expect(imageUrls(captured.content)).toEqual([]);
    expect(payloadJson(captured.content).evidence).toBe('vision_metadata');
  });
});
