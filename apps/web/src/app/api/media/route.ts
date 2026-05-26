/**
 * Media Proxy — serves R2 assets through Next.js.
 * Avoids browser CORS/auth issues with pre-signed URLs.
 * Usage: /api/media?key=tenant/image/2026-05-09/uuid.jpg
 */
import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';

function getClient() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT ?? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });
}

// Key allowed pattern: <segment>/<segment>/.../<file.ext>
// Each segment: alphanumeric, hyphen, underscore. File: same + dot for extension.
// Blocks: path traversal (..), absolute paths (/), backslash, null byte, query/fragment.
const SAFE_KEY = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9._-]+)+$/;

function isValidKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (key.includes('..')) return false;
  if (key.startsWith('/') || key.startsWith('\\')) return false;
  if (key.includes('\0') || key.includes('?') || key.includes('#')) return false;
  return SAFE_KEY.test(key);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const key = request.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  if (!isValidKey(key)) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 });
  }

  try {
    const client = getClient();
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME ?? 'smartagency-media',
      Key: key,
    });
    const res = await client.send(command);
    const contentType = res.ContentType ?? 'application/octet-stream';
    const body = res.Body;
    if (!body) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const bytes = await body.transformToByteArray();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
