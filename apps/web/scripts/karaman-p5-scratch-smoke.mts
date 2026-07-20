/**
 * P5 — Karaman packaging-safe visual smoke.
 *
 * Product shops must NOT invent branded packaging. This smoke:
 *   1) Builds idea/brief stack (scratch brief SSOT)
 *   2) Restages a REAL gallery SKU via /api/enhance-product-photo (reference locked)
 *
 * Pure text-to-image branded jars are forbidden for product sectors.
 *
 * Run:
 *   cd apps/web && npx tsx --env-file=.env.local scripts/karaman-p5-scratch-smoke.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildScratchVisualBrief,
  buildScratchCreativePromptLines,
} from '../src/lib/scratch-visual-brief';
import { expectsProductPackaging } from '../src/lib/product-packaging-fidelity';

const WS = process.env.KARAMAN_WORKSPACE_ID ?? '327db521-ede2-48e0-8f06-4146ee458c50';
const PROD_WEB = (process.env.PROD_WEB_URL ?? 'https://smartagency-web.onrender.com').replace(/\/$/, '');
const LOCAL = (process.env.NEXTJS_INTERNAL_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY ?? '';
const OUT = join(process.cwd(), '.preview-renders/karaman-p5-scratch-smoke');
mkdirSync(OUT, { recursive: true });

const FIG_JAM =
  'https://karamandatca.com.tr/wp-content/uploads/2026/03/WhatsApp-Image-2025-10-26-at-13.39.07-7.jpeg';

function headers(): Record<string, string> {
  return {
    'X-Internal-Api-Key': KEY,
    'X-Tenant-Id': WS,
    'X-Office-Id': '00000000-0000-0000-0000-000000000001',
    Accept: 'application/json',
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} → ${res.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function ensureLocalNext(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const root = await fetch(LOCAL, { signal: AbortSignal.timeout(4_000) });
      if (root.status > 0) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Local Next not reachable at ${LOCAL}`);
}

async function main(): Promise<void> {
  if (!KEY) throw new Error('INTERNAL_API_KEY required');
  await ensureLocalNext();
  console.log(`local=${LOCAL} prod=${PROD_WEB} workspace=${WS}`);

  const [snapshot, gallery] = await Promise.all([
    fetchJson<Record<string, unknown>>(`${PROD_WEB}/api/production-context/${WS}/snapshot`),
    fetchJson<Record<string, Record<string, unknown>>>(`${PROD_WEB}/api/brand-context/${WS}/gallery-analysis`),
  ]);
  const brand = (snapshot.brandContext ?? snapshot.brand_context ?? {}) as Record<string, unknown>;
  const brandName = String(brand.business_name ?? brand.brand_name ?? 'Karaman Datça');
  const businessType = String(brand.business_type ?? 'local_products_shop');

  const photos = Object.keys(gallery);
  const sourceUrl = photos.includes(FIG_JAM) ? FIG_JAM : photos[0];
  if (!sourceUrl) throw new Error('No gallery photos for Karaman');

  if (!expectsProductPackaging({ businessType, productType: 'fig jam' })) {
    throw new Error(`Expected product packaging sector, got ${businessType}`);
  }

  const idea = {
    headline: 'İncir Reçeli',
    caption: 'Datça’nın güneşinde olgunlaşmış incirlerden hazırlanan reçelimiz.',
    strategic_purpose: 'Ürün hero — gerçek kavanoz ambalajı korunarak lifestyle sahne',
    visual_direction:
      'Keep the REAL fig jam jar from the reference photo letter-perfect; warm Aegean table BG only',
    scene_hint: 'Product hero — packaging locked; environment only',
    mood: 'warm artisan',
    product_type: 'fig jam',
    catalog_slot_key: 'local_products_product_reveal_post',
    visual_production_spec: {
      image_edit_prompt: 'BG/props only — never rewrite label or logo',
      shot_type: 'product_hero_still',
    },
  };

  const brief = buildScratchVisualBrief({
    idea,
    headline: idea.headline,
    caption: idea.caption,
    mood: idea.mood,
    assignment: {
      slot_role: 'product_reveal',
      pipeline: 'gallery_enhanced',
      catalog_slot_key: idea.catalog_slot_key,
      visual_subject_hint: 'product_hero',
    },
    missionBrief: 'P5 packaging fidelity — gallery reference required',
  });

  const promptLines = buildScratchCreativePromptLines({
    brief,
    headline: idea.headline,
    caption: idea.caption,
  });
  const packagingGuard = promptLines.some((l) => /NEVER invent or approximate brand logos/i.test(l));

  console.log('\n── brief ──');
  console.log(`  sources: ${brief.sources.join(', ')}`);
  console.log(`  packagingGuardInPrompt: ${packagingGuard}`);
  console.log(`  source: ${sourceUrl.slice(0, 90)}`);

  console.log('\n=== POST /api/enhance-product-photo (gallery-locked, moderate) ===');
  const t0 = Date.now();
  const res = await fetch(`${LOCAL}/api/enhance-product-photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify({
      photoUrl: sourceUrl,
      caption: idea.caption,
      headline: idea.headline,
      missionBrief: brief.sceneBrief,
      brandName,
      productType: idea.product_type,
      level: 'moderate',
      businessType,
      workspaceId: WS,
      visualSubject: 'product_hero',
      embedLogo: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const results = (data.results as Array<{ imageUrl?: string }> | undefined) ?? [];
  const imageUrl = results[0]?.imageUrl
    ?? (typeof data.imageUrl === 'string' ? data.imageUrl : null);

  if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('/'))) {
    try {
      const imgRes = await fetch(
        imageUrl.startsWith('/') ? `${LOCAL}${imageUrl}` : imageUrl,
        { headers: headers(), signal: AbortSignal.timeout(60_000) },
      );
      if (imgRes.ok) {
        writeFileSync(
          join(OUT, `packaging-safe-${Date.now()}.jpg`),
          Buffer.from(await imgRes.arrayBuffer()),
        );
      }
    } catch (err) {
      console.warn('image download failed', err);
    }
  }

  const report = {
    httpStatus: res.status,
    elapsedSec: Number(elapsed),
    brandName,
    businessType,
    sourceUrl,
    briefSources: brief.sources,
    packagingGuardInPrompt: packagingGuard,
    imageUrl: imageUrl?.startsWith('data:') ? `data:(${imageUrl.length} chars)` : imageUrl,
    error: data.error ?? null,
    note: 'Gallery reference required — pure scratch branded packaging is forbidden',
  };
  const outPath = join(OUT, `report-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${outPath}`);
  console.log(JSON.stringify(report, null, 2));

  console.log('\n── P5 packaging verdict ──');
  console.log(`  packaging guard in brief: ${packagingGuard ? '✓' : '✗'}`);
  console.log(`  gallery-locked enhance:   ${imageUrl && res.ok ? '✓' : '✗'} status=${res.status} ${elapsed}s`);

  if (!packagingGuard) process.exit(2);
  if (!imageUrl || !res.ok) process.exit(3);
  console.log('\n✓ PASS — Karaman packaging-safe enhance (gallery locked)');
  console.log('  Manual check: label/logo must match source jar — no Kenamon/Datlc gibberish.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
