#!/usr/bin/env node
/**
 * Smoke: caption-driven AI visual for Kaçta → single OpenAI image → Feed artifact.
 * Usage: node scripts/smoke-kacta-caption-visual.mjs
 */
const WS = process.env.TENANT_ID || '5feb36f7-def7-4b4a-834f-353457de57bf';
const BASE = (process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const CREW = (process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const NEXUS = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';

const CAPTION =
  'Dijitalleşme ile salonunuzu nasıl daha verimli yönetirsiniz? İşte 5 ipucu! 🌟 '
  + 'Müşteri memnuniyetinden zaman tasarrufuna, dijital randevu sisteminizle salonunuzu güçlendirin! '
  + 'Hızla harekete geçin, hemen başlayın!';

const HEADLINE = 'Salonunuzu Dijitalleştirin — 5 İpucu';

const headers = {
  'Content-Type': 'application/json',
  'X-Tenant-Id': WS,
  'X-Internal-Api-Key': KEY,
};

async function jfetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, data };
}

function absUrl(u) {
  if (!u) return '';
  return u.startsWith('http') ? u : `${BASE}${u.startsWith('/') ? u : `/${u}`}`;
}

async function main() {
  console.log('=== Kaçta caption-driven visual smoke ===');
  console.log('tenant', WS);

  // Enable setting (idempotent)
  const patch = await jfetch(`${BASE}/api/brand-context/${WS}/theme/ai-settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      ai_photo_enhance: true,
      ai_caption_driven_visual: true,
      ai_use_brand_identity: true,
      ai_brief_drives_scene: true,
      ai_embed_logo: true,
    }),
    timeoutMs: 30_000,
  });
  console.log('ai-settings patch', patch.status, patch.ok ? 'ok' : patch.data);

  const brandRes = await jfetch(`${CREW}/api/v1/brand-context/${WS}`, { timeoutMs: 20_000 });
  const brand = brandRes.data || {};

  const genBody = {
    title: HEADLINE,
    caption: CAPTION,
    contentType: 'post',
    workspaceId: WS,
    brandName: brand.business_name || 'Kaçta Info',
    industry: brand.business_type || 'barber',
    businessType: brand.business_type || 'barber',
    location: brand.location || 'Bodrum, Türkiye',
    description: brand.description || '',
    brandTone: brand.brand_tone || '',
    targetAudience: brand.target_audience || '',
    visualStyle: brand.visual_style || '',
    visualDna: brand.visual_dna || '',
    logoUrl: brand.logo_url || undefined,
    captionDrivenMode: true,
  };

  console.log('\nGenerating image (OpenAI, ~1 call)...');
  const gen = await jfetch(`${BASE}/api/generate-instagram-image`, {
    method: 'POST',
    body: JSON.stringify(genBody),
    timeoutMs: 180_000,
  });
  if (!gen.ok || !gen.data?.imageUrl) {
    console.error('GENERATION FAILED', gen.status, gen.data);
    process.exit(1);
  }
  const imageUrl = absUrl(gen.data.imageUrl);
  console.log('image', imageUrl);
  console.log('provider', gen.data.provider, gen.data.model);

  const contentUrl = gen.data.imageUrl.startsWith('http') || gen.data.imageUrl.startsWith('/api/')
    ? gen.data.imageUrl
    : imageUrl;

  const save = await jfetch(`${NEXUS}/api/artifacts/creative`, {
    method: 'POST',
    body: JSON.stringify({
      title: HEADLINE,
      contentUrl,
      content: JSON.stringify({
        kind: 'instagram_post',
        contentType: 'post',
        caption: CAPTION,
        headline: HEADLINE,
        imageUrl: contentUrl,
        source: 'caption_driven_smoke',
      }),
      platform: 'instagram',
      contentType: 'post',
      metadata: {
        kind: 'instagram_post',
        contentType: 'post',
        platform: 'instagram',
        headline: HEADLINE,
        caption: CAPTION.slice(0, 500),
        auto_produced: true,
        caption_driven_visual: true,
        gallery_sourced: false,
        ai_gallery_enhanced: true,
        production_role: 'organic_post',
        pipeline: 'caption_driven_ai',
        renderer_executed: 'caption_driven_ai',
        publish_package: 'primary',
        publish_priority: 'recommended',
        imageUrl: contentUrl,
        source: 'caption-driven-smoke',
        smoke_test: true,
      },
    }),
    timeoutMs: 30_000,
  });

  if (!save.ok) {
    console.error('ARTIFACT SAVE FAILED', save.status, save.data);
    process.exit(1);
  }

  const artifactId = save.data?.id;
  console.log('\n=== DONE ===');
  console.log('artifact_id:', artifactId);
  console.log('feed_ui:', `${BASE}/mobile`);
  console.log('image_url:', imageUrl);
  console.log('çıktı sayısı: 1');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
