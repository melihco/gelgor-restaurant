import { ImageResponse } from 'next/og';
import { OgImageMarkup } from '@/lib/og-image-shared';
import { loadMarkLogoDataUri } from '@/lib/og-load-logo';
import { SITE_NAME } from '@/lib/site-metadata';

export const runtime = 'edge';
export const alt = `${SITE_NAME} — AI Creative Operations Platform`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function TwitterImage() {
  const logoSrc = await loadMarkLogoDataUri();
  return new ImageResponse(<OgImageMarkup logoSrc={logoSrc} />, {
    ...size,
  });
}
