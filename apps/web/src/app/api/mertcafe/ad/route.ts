import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { generateStorageKey, getPresignedUrl, uploadToR2 } from '@/lib/r2-storage';

export const runtime = 'nodejs';
export const maxDuration = 90;

const BASE_URL = process.env.MERTCAFE_BASE_URL ?? 'https://web-production-02d278.up.railway.app';
const API_KEY = process.env.MERTCAFE_API_KEY ?? '';

type AdBody = {
  image_url?: string;
  headline?: string;
  body?: string;
  link_url?: string;
  goal?: 'engagement' | 'reach' | 'traffic' | 'messages';
  budget?: number;
  budget_type?: 'daily' | 'lifetime';
  duration_days?: number;
  placement?: 'all' | 'instagram_feed' | 'instagram_story' | 'instagram_reels' | 'facebook_feed';
  countries?: string[];
  gender?: 'all' | 'male' | 'female';
  age_min?: number;
  age_max?: number;
  interests?: string[];
  call_to_action?: 'LEARN_MORE' | 'SHOP_NOW' | 'CONTACT_US' | 'BOOK_TRAVEL' | 'MESSAGE_PAGE';
};

function toPublicUrl(input: string | undefined, origin: string): string | undefined {
  if (!input) return undefined;
  const url = input.trim();
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${origin}${url}`;
  return `${origin}/${url}`;
}

async function normalizeImageForAd(url: string): Promise<string> {
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    const contentType = (head.headers.get('content-type') || '').toLowerCase();
    const looksWebp = contentType.includes('image/webp') || /\.webp(\?|$)/i.test(url);
    if (!looksWebp) return url;

    const imageRes = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (!imageRes.ok) return url;
    const input = Buffer.from(await imageRes.arrayBuffer());
    const jpgBuffer = await sharp(input).jpeg({ quality: 92 }).toBuffer();
    const key = generateStorageKey('mertcafe-ad', 'image', 'jpg');
    const uploaded = await uploadToR2(jpgBuffer, key, 'image/jpeg');
    try {
      return await getPresignedUrl(uploaded.key, 24 * 3600);
    } catch {
      return uploaded.url;
    }
  } catch {
    return url;
  }
}

async function callAdWithRetry(payload: Record<string, unknown>): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${BASE_URL}/api/ad`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok || ![502, 503, 504].includes(res.status) || attempt === 2) return res;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return fetch(`${BASE_URL}/api/ad`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!API_KEY) return NextResponse.json({ error: 'MERTCAFE_API_KEY is not configured' }, { status: 500 });

  const body = (await request.json().catch(() => null)) as AdBody | null;
  if (!body?.image_url) return NextResponse.json({ error: 'image_url is required' }, { status: 400 });
  if (!body?.headline?.trim()) return NextResponse.json({ error: 'headline is required' }, { status: 400 });
  if (!body?.body?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 });

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '');
  let imageUrl = toPublicUrl(body.image_url, origin);
  if (!imageUrl) return NextResponse.json({ error: 'Invalid image_url' }, { status: 400 });
  imageUrl = toPublicUrl(await normalizeImageForAd(imageUrl), origin);
  if (!imageUrl) return NextResponse.json({ error: 'Image normalization failed' }, { status: 400 });

  const payload = {
    api_key: API_KEY,
    image_url: imageUrl,
    headline: body.headline.trim(),
    body: body.body.trim(),
    link_url: body.link_url || undefined,
    goal: body.goal ?? 'engagement',
    budget: Math.max(20, Number(body.budget ?? 100)),
    budget_type: body.budget_type ?? 'daily',
    duration_days: Math.max(1, Number(body.duration_days ?? 7)),
    placement: body.placement ?? 'all',
    countries: Array.isArray(body.countries) && body.countries.length ? body.countries : ['TR'],
    gender: body.gender ?? 'all',
    age_min: Math.max(13, Number(body.age_min ?? 18)),
    age_max: Math.min(65, Number(body.age_max ?? 65)),
    interests: Array.isArray(body.interests) ? body.interests : [],
    call_to_action: body.call_to_action ?? 'LEARN_MORE',
  };

  try {
    const res = await callAdWithRetry(payload);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        {
          error: (data as { message?: string; error?: string }).message || (data as { message?: string; error?: string }).error || `Ad create failed (${res.status})`,
          upstream_status: res.status,
          request_id: (data as { request_id?: string }).request_id,
        },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Ad create failed' }, { status: 503 });
  }
}
