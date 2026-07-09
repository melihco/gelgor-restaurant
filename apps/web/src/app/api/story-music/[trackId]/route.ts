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
import { resolveStoryMusicSource } from '@/lib/story-audio-catalog';

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
  let stream: fs.ReadStream | null = null;
  let closed = false;
  return new ReadableStream({
    start(controller) {
      stream = fs.createReadStream(filePath, {
        start: rangeStart,
        end: rangeEnd,
        highWaterMark: 64 * 1024, // 64 KB chunks
      });
      stream.on('data', (chunk) => {
        if (closed) return;
        try {
          controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        } catch {
          closed = true;
          stream?.destroy();
        }
      });
      stream.on('end', () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch { /* client already disconnected */ }
      });
      stream.on('error', (err) => {
        if (closed) return;
        closed = true;
        try {
          controller.error(err);
        } catch { /* client already disconnected */ }
      });
    },
    cancel() {
      closed = true;
      stream?.destroy();
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

function localPublicPath(relativePath: string): string {
  return path.join(process.cwd(), 'public', relativePath.replace(/^\/+/, ''));
}

function serveCachedOrLocalFile(
  req: NextRequest,
  filePath: string,
  trackId: string,
  sourceTag: string,
): NextResponse {
  let fileSize = 0;
  try {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    fileSize = stat?.size ?? 0;
  } catch { /* fall through */ }

  if (fileSize <= 10_000) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  }

  const headerBuf = Buffer.alloc(4);
  let validHeader = false;
  try {
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, headerBuf, 0, 4, 0);
    fs.closeSync(fd);
    validHeader = isMp3Header(headerBuf);
  } catch { /* fall through */ }

  if (!validHeader) {
    return NextResponse.json({ error: 'Invalid audio file' }, { status: 502 });
  }

  const AUDIO_HEADERS = {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, immutable`,
    'Accept-Ranges': 'bytes',
    'X-Story-Music-Id': trackId,
  };

  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1]!, 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      return new NextResponse(fileToReadableStream(filePath, start, end), {
        status: 206,
        headers: {
          ...AUDIO_HEADERS,
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'X-Story-Music-Source': `${sourceTag}-range`,
        },
      });
    }
  }

  return new NextResponse(fileToReadableStream(filePath), {
    status: 200,
    headers: {
      ...AUDIO_HEADERS,
      'Content-Length': String(fileSize),
      'X-Story-Music-Source': `${sourceTag}-stream`,
    },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ trackId: string }> },
): Promise<NextResponse> {
  const { trackId } = await ctx.params;
  const decoded = decodeURIComponent(trackId);
  const source = resolveStoryMusicSource(decoded);

  if (!source) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  }

  if (source.type === 'local') {
    return serveCachedOrLocalFile(req, localPublicPath(source.track.relativePath), source.track.id, 'local');
  }

  const track = source.track;
  if (!track.url) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  }

  const cached = cachePath(track.id);
  let cachedSize = 0;
  try {
    const stat = fs.existsSync(cached) ? fs.statSync(cached) : null;
    cachedSize = stat?.size ?? 0;
  } catch { /* best-effort */ }

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
      return serveCachedOrLocalFile(req, cached, track.id, 'cache');
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
        'Content-Type': 'audio/mpeg',
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, immutable`,
        'Accept-Ranges': 'bytes',
        'X-Story-Music-Id': track.id,
        'Content-Length': String(body.length),
        'X-Story-Music-Source': 'upstream',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Stream failed' }, { status: 502 });
  }
}
