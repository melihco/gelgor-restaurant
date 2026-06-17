/**
 * POST /api/remotion/voice-preview
 * Kısa TTS önizlemesi — marka ayarlarında ses tonu seçimi için.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  generateStoryVoicePreviewFile,
  isStoryVoiceoverEnabled,
} from '@/lib/story-voiceover';
import { isStoryTtsVoiceId } from '@/lib/story-voice-catalog';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isStoryVoiceoverEnabled()) {
    return NextResponse.json(
      { error: 'TTS için OPENAI_API_KEY gerekli' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    voiceId?: string;
    locale?: string;
  };

  const voiceId = String(body.voiceId ?? 'nova').trim().toLowerCase();
  if (!isStoryTtsVoiceId(voiceId)) {
    return NextResponse.json({ error: 'Geçersiz ses tonu' }, { status: 400 });
  }

  const locale = String(body.locale ?? 'tr').trim() || 'tr';
  const result = await generateStoryVoicePreviewFile({ voiceId, locale });
  if (!result) {
    return NextResponse.json({ error: 'Önizleme oluşturulamadı' }, { status: 502 });
  }

  return NextResponse.json({
    playbackUrl: result.playbackUrl,
    voiceId: result.voiceId,
    script: result.script,
  });
}
