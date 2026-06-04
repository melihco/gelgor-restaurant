/**
 * GET /api/remotion/video/[filename]
 * Serves locally rendered Remotion MP4 files from /tmp/remotion-serve/
 * Used when R2 is not configured (dev environment).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const SERVE_DIR = '/tmp/remotion-serve';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
): Promise<NextResponse> {
  const { filename } = await params;

  // Security: only allow .mp4 files, no path traversal
  if (!filename.endsWith('.mp4') || filename.includes('/') || filename.includes('..')) {
    return new NextResponse('Not allowed', { status: 403 });
  }

  const filePath = path.join(SERVE_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  });
}
