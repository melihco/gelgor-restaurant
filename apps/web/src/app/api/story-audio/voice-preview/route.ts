/**
 * POST /api/story-audio/voice-preview
 * OpenAI TTS sample for brand story audio settings.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateStoryVoicePreviewFile } from '@/lib/story-voiceover';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { voiceId?: string; locale?: string };
    const voiceId = String(body.voiceId ?? '').trim();
    if (!voiceId) {
      return NextResponse.json({ error: 'voiceId required' }, { status: 400 });
    }

    const preview = await generateStoryVoicePreviewFile({
      voiceId,
      locale: body.locale,
    });
    if (!preview?.playbackUrl) {
      return NextResponse.json({ error: 'voice_preview_unavailable' }, { status: 503 });
    }

    return NextResponse.json({
      playbackUrl: preview.playbackUrl,
      voiceId: preview.voiceId,
      script: preview.script,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'voice_preview_failed';
    console.error('[story-audio/voice-preview]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
