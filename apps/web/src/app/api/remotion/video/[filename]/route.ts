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

function isAllowedFilename(filename: string): boolean {
  return filename.endsWith('.mp4') && !filename.includes('/') && !filename.includes('..');
}

function resolveServeFile(filename: string): { filePath: string; size: number } | 'forbidden' | 'missing' {
  if (!isAllowedFilename(filename)) return 'forbidden';
  const filePath = path.join(SERVE_DIR, filename);
  if (!fs.existsSync(filePath)) return 'missing';
  const size = fs.statSync(filePath).size;
  return { filePath, size };
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
): Promise<NextResponse> {
  const { filename } = await params;
  const resolved = resolveServeFile(filename);
  if (resolved === 'forbidden') {
    return new NextResponse(null, { status: 403 });
  }
  if (resolved === 'missing') {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': resolved.size.toString(),
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  });
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
      'Content-Type': 'video/mp4',
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  });
}
