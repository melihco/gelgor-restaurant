import { resolveSiteUrl } from '@/lib/site-metadata';

/** Load mark PNG as data URI for next/og ImageResponse (edge-safe). */
export async function loadMarkLogoDataUri(): Promise<string | undefined> {
  const siteUrl = resolveSiteUrl();
  try {
    const res = await fetch(`${siteUrl}/smartagency-mark.png`, { cache: 'force-cache' });
    if (!res.ok) return undefined;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return `data:image/png;base64,${btoa(binary)}`;
  } catch {
    return undefined;
  }
}
