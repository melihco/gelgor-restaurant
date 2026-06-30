/**
 * Media Proxy — serves R2 assets through Next.js.
 * Avoids browser CORS/auth issues with pre-signed URLs.
 * Usage: /api/media?key=tenant/image/2026-05-09/uuid.jpg
 *
 * Range requests are required for HTML5 <video> on Safari/iOS and for reliable MP4 playback.
 */
import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';

function getClient() {
  const { accessKeyId, secretAccessKey } = serverConfig.r2.requireCredentials();
  return new S3Client({
    region: 'auto',
    endpoint: serverConfig.r2.endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

const SAFE_KEY = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9._-]+)+$/;

function isValidKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (key.includes('..')) return false;
  if (key.startsWith('/') || key.startsWith('\\')) return false;
  if (key.includes('\0') || key.includes('?') || key.includes('#')) return false;
  return SAFE_KEY.test(key);
}

function isStreamableMedia(contentType: string, key: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.startsWith('video/') || ct.startsWith('audio/')) return true;
  return /\.(mp4|mov|webm|m4v|mp3|m4a)(\?|$)/i.test(key);
}

function parseRangeHeader(
  rangeHeader: string | null,
  totalSize: number,
): { start: number; end: number } | null {
  if (!rangeHeader || totalSize <= 0) return null;
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) return null;
  const start = parseInt(match[1]!, 10);
  const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
  if (!Number.isFinite(start) || start < 0 || start >= totalSize) return null;
  return { start, end: Math.min(end, totalSize - 1) };
}

function streamToWeb(body: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      body.on('data', (chunk) => {
        controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      body.on('end', () => controller.close());
      body.on('error', (err) => controller.error(err));
    },
    cancel() {
      body.destroy();
    },
  });
}

function toNodeStream(body: unknown): Readable | null {
  if (body instanceof Readable) return body;
  if (body && typeof (body as { transformToWebStream?: unknown }).transformToWebStream === 'function') {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const key = request.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  if (!isValidKey(key)) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 });
  }

  try {
    const client = getClient();
    const bucket = serverConfig.r2.bucket;
    const rangeHeader = request.headers.get('range');

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(rangeHeader ? { Range: rangeHeader } : {}),
    });
    const res = await client.send(command);
    const body = res.Body;
    if (!body) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const contentType = res.ContentType ?? 'application/octet-stream';
    const contentRange = res.ContentRange ?? '';
    const contentLength = Number(res.ContentLength ?? 0);
    const streamable = isStreamableMedia(contentType, key);

    const baseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
    };

    const nodeStream = toNodeStream(body);
    const isPartial = Boolean(rangeHeader && contentRange);

    if (nodeStream && streamable && (isPartial || contentLength > 512 * 1024)) {
      return new NextResponse(streamToWeb(nodeStream), {
        status: isPartial ? 206 : 200,
        headers: {
          ...baseHeaders,
          ...(contentLength > 0 ? { 'Content-Length': String(contentLength) } : {}),
          ...(contentRange ? { 'Content-Range': contentRange } : {}),
        },
      });
    }

    const bytes = await body.transformToByteArray();
    return new NextResponse(Buffer.from(bytes), {
      status: isPartial ? 206 : 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(bytes.length),
        ...(contentRange ? { 'Content-Range': contentRange } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
