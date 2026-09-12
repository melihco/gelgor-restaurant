/**
 * Re-encode gallery / look bytes as a real JPEG the app can serve and
 * OpenAI can read. Changing enc_avif → enc_jpg in a Wix URL is not enough.
 */
const APP_JPEG_MAX_EDGE = 2048;

export async function toAppJpegBuffer(buf: Buffer): Promise<Buffer | null> {
  if (!buf || buf.length < 80) return null;
  try {
    const sharp = (await import('sharp')).default;
    const jpeg = await sharp(buf)
      .rotate()
      .resize(APP_JPEG_MAX_EDGE, APP_JPEG_MAX_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
    return jpeg.length >= 80 ? jpeg : null;
  } catch {
    return null;
  }
}
