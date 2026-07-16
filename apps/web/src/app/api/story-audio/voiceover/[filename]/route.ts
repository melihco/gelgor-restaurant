/**
 * GET /api/story-audio/voiceover/{filename}
 * Serves cached OpenAI TTS preview files.
 */
import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const VOICEOVER_SERVE_DIR = '/tmp/story-audio-serve';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const safe = path.basename(filename);
  if (!safe || safe !== filename || !safe.endsWith('.mp3')) {
    return NextResponse.json({ error: 'invalid_filename' }, { status: 400 });
  }

  const filePath = path.join(VOICEOVER_SERVE_DIR, safe);
  const resolved = path.resolve(filePath);
  const serveRoot = path.resolve(VOICEOVER_SERVE_DIR);
  if (!resolved.startsWith(serveRoot) || !fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(resolved);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
