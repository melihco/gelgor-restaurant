/**
 * GET /api/story-music/[trackId]
 * Story BGM preview / proxy — CORS + free-stock-music hotlink protection.
 *
 * Streaming design: the cache can hold 100 MB+ files. Using fs.readFileSync()
 * on large files blocks the Node.js event loop for seconds, causing all parallel
 * requests from Remotion's Html5Audio to queue up and hit the 28 s delayRender
 * timeout. We use a ReadStream piped through a Web ReadableStream instead.
 */
import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { findStoryMusicTrack } from '@/lib/story-audio-catalog';

export const runtime = 'nodejs';

const CACHE_DIR = '/tmp/story-music-cache';
const CACHE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const UPSTREAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.free-stock-music.com/',
  Accept: 'audio/mpeg, audio/*, */*',
};

function isMp3Header(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  // ID3 tag
  if (buf[0]! === 0x49 && buf[1]! === 0x44 && buf[2]! === 0x33) return true;
  // MPEG frame sync
  if (buf[0]! === 0xff && (buf[1]! & 0xe0) === 0xe0) return true;
  return false;
}

function cachePath(trackId: string): string {
  const safe = trackId.replace(/[^a-z0-9-]/gi, '_').slice(0, 120);
  return path.join(CACHE_DIR, `${safe}.mp3`);
}

/** Stream a local file as a Web ReadableStream without blocking the event loop. */
function fileToReadableStream(filePath: string, rangeStart = 0, rangeEnd?: number): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const stream = fs.createReadStream(filePath, {
        start: rangeStart,
        end: rangeEnd,
        highWaterMark: 64 * 1024, // 64 KB chunks
      });
      stream.on('data', (chunk) => controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });
}

async function fetchUpstreamMp3(url: string): Promise<Buffer | null> {
  const res = await fetch(url, {
    headers: UPSTREAM_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!isMp3Header(buf)) return null;
  return buf;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ trackId: string }> },
): Promise<NextResponse> {
  const { trackId } = await ctx.params;
  const decoded = decodeURIComponent(trackId);
  const track = findStoryMusicTrack(decoded);

  if (!track?.url) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  }

  const cached = cachePath(track.id);
  let cachedSize = 0;
  try {
    const stat = fs.existsSync(cached) ? fs.statSync(cached) : null;
    cachedSize = stat?.size ?? 0;
  } catch { /* best-effort */ }

  const AUDIO_HEADERS = {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, immutable`,
    'Accept-Ranges': 'bytes',
    'X-Story-Music-Id': track.id,
  };

  if (cachedSize > 10_000) {
    // Validate header without loading whole file
    const headerBuf = Buffer.alloc(4);
    let validHeader = false;
    try {
      const fd = fs.openSync(cached, 'r');
      fs.readSync(fd, headerBuf, 0, 4, 0);
      fs.closeSync(fd);
      validHeader = isMp3Header(headerBuf);
    } catch { /* fall through to upstream */ }

    if (validHeader) {
      // Honour Range requests (important for Safari / iOS audio)
      const rangeHeader = req.headers.get('range');
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1]!, 10);
          const end = match[2] ? parseInt(match[2], 10) : cachedSize - 1;
          const chunkSize = end - start + 1;
          return new NextResponse(fileToReadableStream(cached, start, end), {
            status: 206,
            headers: {
              ...AUDIO_HEADERS,
              'Content-Length': String(chunkSize),
              'Content-Range': `bytes ${start}-${end}/${cachedSize}`,
              'X-Story-Music-Source': 'cache-range',
            },
          });
        }
      }

      return new NextResponse(fileToReadableStream(cached), {
        status: 200,
        headers: {
          ...AUDIO_HEADERS,
          'Content-Length': String(cachedSize),
          'X-Story-Music-Source': 'cache-stream',
        },
      });
    }
  }

  // Not cached or invalid — fetch from upstream
  try {
    const body = await fetchUpstreamMp3(track.url);
    if (!body) {
      return NextResponse.json({ error: 'Upstream returned invalid audio' }, { status: 502 });
    }

    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cached, body);
    } catch { /* cache write best-effort */ }

    return new NextResponse(body as BodyInit, {
      status: 200,
      headers: {
        ...AUDIO_HEADERS,
        'Content-Length': String(body.length),
        'X-Story-Music-Source': 'upstream',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Stream failed' }, { status: 502 });
  }
}
