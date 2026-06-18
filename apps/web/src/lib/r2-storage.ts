/**
 * Cloudflare R2 Storage Service
 *
 * Stores generated images and videos permanently so they can be:
 * 1. Published to Instagram/Facebook via Meta Graph API (requires public HTTPS URL)
 * 2. Referenced in artifacts without expiring
 * 3. Downloaded by users
 *
 * R2 is S3-compatible — we use @aws-sdk/client-s3.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mediaUrlForKey } from './media-url';
import { fetchExternalImageBuffer } from './external-image-fetch';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const BUCKET = process.env.R2_BUCKET_NAME ?? 'smartagency-media';
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? ''; // optional: set if bucket has public access

function getClient(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT ?? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true, // Required for R2 — generates accessible path-style URLs
  });
}

export type UploadResult = {
  key: string;
  url: string;
  size: number;
  contentType: string;
};

/**
 * Upload a file (Buffer or base64 data URI) to R2.
 * Returns the permanent public URL.
 */
export async function uploadToR2(
  data: Buffer | string,
  key: string,
  contentType: string,
): Promise<UploadResult> {
  const client = getClient();

  let buffer: Buffer;
  let finalContentType = contentType;

  if (typeof data === 'string') {
    if (data.startsWith('data:')) {
      // base64 data URI
      const [header, b64] = data.split(',');
      finalContentType = (header ?? '').split(':')[1]?.split(';')[0] ?? 'image/jpeg';
      buffer = Buffer.from(b64!, 'base64');
    } else {
      buffer = Buffer.from(data);
    }
  } else {
    buffer = data;
  }

  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: finalContentType,
    // Cache 1 year — these are immutable generated assets
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  // Serve through Next.js proxy — avoids browser auth/CORS issues with R2
  // Falls back to public URL if configured (production with custom domain)
  const url = mediaUrlForKey(key, PUBLIC_URL);

  return {
    key,
    url,
    size: buffer.length,
    contentType: finalContentType,
  };
}

/**
 * Upload a generated image from a URL (fetches and re-uploads to R2).
 * Used for Flux/OpenAI generated images that expire.
 */
export async function uploadImageFromUrl(
  sourceUrl: string,
  key: string,
): Promise<UploadResult | null> {
  try {
    const buffer = await fetchExternalImageBuffer(sourceUrl, 30_000);
    if (!buffer) return null;
    const contentType = sourceUrl.toLowerCase().endsWith('.png')
      ? 'image/png'
      : sourceUrl.toLowerCase().endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    return uploadToR2(buffer, key, contentType);
  } catch {
    return null;
  }
}

/**
 * Generate a unique storage key for a generated asset.
 * Format: {tenantId}/{type}/{date}/{uuid}.{ext}
 */
export function generateStorageKey(
  tenantId: string,
  type: 'image' | 'video' | 'reel' | 'event' | 'reel-multi',
  ext: string = 'jpg',
): string {
  const date = new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  // Sanitize tenantId: replace spaces and special chars with hyphens
  const safe = tenantId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40);
  return `${safe}/${type}/${date}/${id}.${ext}`;
}

/**
 * Generate a pre-signed URL for a private R2 object.
 * Valid for `expiresIn` seconds (default 1 hour).
 * Works with Meta Graph API — the URL is publicly accessible for that duration.
 */
export async function getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const client = getClient();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

export async function deleteFromR2(key: string): Promise<void> {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export function isR2Configured(): boolean {
  return !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}
