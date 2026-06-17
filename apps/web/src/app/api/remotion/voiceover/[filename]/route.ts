/**
 * GET /api/remotion/voiceover/[filename]
 * Serves TTS voiceover MP3 from /tmp/remotion-serve/ for Remotion headless render.
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const SERVE_DIR = '/tmp/remotion-serve';

function isAllowedFilename(filename: string): boolean {
  return /^story-vo-[0-9a-f-]{36}\.mp3$/i.test(filename)
    || /^story-vo-preview-[a-z]+(-[a-z0-9]+)?\.mp3$/i.test(filename);
}

function resolveServeFile(filename: string): { filePath: string; size: number } | 'forbidden' | 'missing' {
  if (!isAllowedFilename(filename)) return 'forbidden';
  const filePath = path.join(SERVE_DIR, filename);
  if (!fs.existsSync(filePath)) return 'missing';
  return { filePath, size: fs.statSync(filePath).size };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
): Promise<NextResponse> {
  const { filename } = await params;
  const resolved = resolveServeFile(filename);
  if (resolved === 'forbidden') {
    return new NextResponse('Not allowed', { status: 403 });
  }
  if (resolved === 'missing') {
    return new NextResponse('Not found', { status: 404 });
  }

  const buffer = fs.readFileSync(resolved.filePath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
    },
  });
}
