/**
 * OpenAI images.edit only accepts JPEG / PNG / WebP.
 * Wix and other CDNs often serve AVIF (enc_avif in the URL).
 */
import { toFile } from 'openai/uploads';

export const OPENAI_EDIT_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export function rewriteCdnUrlForOpenAiEdit(url: string): string {
  return String(url ?? '').replace(/enc_avif/gi, 'enc_jpg');
}

export function isOpenAiEditCompatibleMime(mime: string): boolean {
  const m = String(mime ?? '').split(';')[0]!.trim().toLowerCase();
  return OPENAI_EDIT_IMAGE_MIMES.has(m);
}

export function bufferLooksLikeAvif(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return buf.subarray(4, 12).toString('ascii') === 'ftypavif'
    || buf.subarray(4, 12).toString('ascii') === 'ftypavis';
}

export async function toOpenAiEditImageFile(
  buf: Buffer,
  mimeHint = 'image/jpeg',
): Promise<Awaited<ReturnType<typeof toFile>>> {
  const hint = String(mimeHint ?? '').split(';')[0]!.trim().toLowerCase();
  const needsConvert = !isOpenAiEditCompatibleMime(hint) || bufferLooksLikeAvif(buf);
  if (!needsConvert) {
    const ext = hint.includes('png') ? 'png' : hint.includes('webp') ? 'webp' : 'jpg';
    const type = hint === 'image/jpg' ? 'image/jpeg' : hint;
    return toFile(buf, `ref.${ext}`, { type });
  }
  const { default: sharp } = await import('sharp');
  const jpeg = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
  return toFile(jpeg, 'ref.jpg', { type: 'image/jpeg' });
}
