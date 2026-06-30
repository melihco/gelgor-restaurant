#!/usr/bin/env node
/**
 * Standalone fal.ai-only designed-post test.
 *
 * Mirrors apps/web/src/lib/fal-typography-design.ts (Ideogram V4 path) so we can
 * verify a real fal.ai-produced designed Instagram post WITHOUT the gallery photo
 * or GPT-image path — i.e. the pure fal.ai engine.
 *
 * Usage: node scripts/test-fal-design.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

// ── Load FAL_API_KEY from apps/web/.env.local ────────────────────────────────
function loadEnvKey(name) {
  if (process.env[name]) return process.env[name];
  const envPath = path.join(REPO, 'apps/web/.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === name) {
      return m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
  return null;
}

const FAL_API_KEY = loadEnvKey('FAL_API_KEY');
if (!FAL_API_KEY) {
  console.error('FAL_API_KEY not found in apps/web/.env.local');
  process.exit(1);
}

const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_RUN_BASE = 'https://fal.run';
const IDEOGRAM_MODEL = 'ideogram/v4';
const FLUX_MODEL = 'fal-ai/flux-pro/v1.1-ultra';
const AUTH = { Authorization: `Key ${FAL_API_KEY}` };

// ── Sample mission idea (a promo post — vibe derived from caption) ────────────
const SAMPLE = {
  brandName: 'Karaman Coffee',
  headline: 'Hafta Sonu Kahve Keyfi',
  subtitle: 'Tüm filtre kahvelerde %20 indirim',
  caption: 'Bu hafta sonu nostaljik bir mola: taze kavrulmuş filtre kahvelerde %20 indirim. Lezzet ve sıcaklık bir arada.',
  primary: '#3b2417',
  accent: '#d4a574',
  vibe: 'retro_poster', // resolveTypographyVibeFromContext(caption "kahve" + "%") → retro/bubble; pinned for the demo
  aspectRatio: '4:5',
  // Faz-1.1 — brief-aware scene hint: visual_subject_hint + missionVisualBrief.
  // This is what the fal-only slot now injects so the AI background reflects the
  // post's actual topic instead of a generic gradient.
  sceneHint: 'filtre kahve, sıcak fincan, kavrulmuş çekirdek — hafta sonu kahve kampanyası, nostaljik sıcak atmosfer',
};

// Mirrors distillSceneHint() in fal-typography-design.ts.
function distillSceneHint(raw) {
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').replace(/["'`]/g, '').trim().slice(0, 140);
}

// VIBE spec mirrors VIBE_PROMPTS.retro_poster in fal-typography-design.ts
const VIBE = {
  styleDirective: 'Vintage-inspired poster lettering. Bold retro display type with nostalgia.',
  fontDescription: 'retro bold display lettering with vintage poster aesthetic and slight texture',
  backgroundHint: 'warm retro color palette, vintage paper or bold color blocks',
  colorUsage: (p, a) => `Vintage palette: ${p} and ${a} with cream/mustard accents. Retro warmth.`,
};

// Safety-filter-friendly prompt: plain color words (no hex), no "watermark"/negatives.
// Mirrors the new buildTypographyPrompt() sceneLine injection in fal-typography-design.ts.
function buildPrompt(s) {
  const scene = distillSceneHint(s.sceneHint);
  const sceneLine = scene
    ? `Background should subtly evoke the theme of: ${scene} — abstract and atmospheric, complementing the design without competing with the text.`
    : '';
  return [
    `Premium retro coffee shop Instagram poster, portrait 4:5 layout.`,
    `Vintage-inspired bold display typography with nostalgic warmth.`,
    `Large headline text reads "${s.headline}".`,
    `Smaller line below reads "${s.subtitle}".`,
    `Warm color palette: deep espresso brown and caramel with cream and mustard accents.`,
    `Soft vintage paper texture background with gentle gradient.`,
    sceneLine,
    `Small "${s.brandName}" brand name in a corner.`,
    `Clean, legible, social-media-ready design, premium quality.`,
  ].filter(Boolean).join(' ').trim().slice(0, 1300);
}

async function enqueueWithRetry(body, maxTries = 6) {
  for (let i = 1; i <= maxTries; i++) {
    const res = await fetch(`${FAL_QUEUE_BASE}/${IDEOGRAM_MODEL}`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res;
    const text = await res.text();
    if (res.status === 403 && /balance/i.test(text) && i < maxTries) {
      console.log(`[fal] balance lock (try ${i}/${maxTries}) — retrying in 5s…`);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    throw new Error(`enqueue ${res.status}: ${text.slice(0, 300)}`);
  }
  throw new Error('enqueue failed after retries');
}

async function callIdeogram(prompt, timeoutMs = 90_000) {
  const enqueue = await enqueueWithRetry({
    prompt,
    image_size: { width: 1080, height: 1350 }, // 4:5
    rendering_speed: 'BALANCED',
    expansion_model: 'None',
    num_images: 1,
  });
  const q = await enqueue.json();
  const statusUrl = q.status_url ?? `${FAL_QUEUE_BASE}/${IDEOGRAM_MODEL}/requests/${q.request_id}/status`;
  const resultUrl = q.response_url ?? `${FAL_QUEUE_BASE}/${IDEOGRAM_MODEL}/requests/${q.request_id}`;
  console.log(`[fal] enqueued request_id=${q.request_id}`);
  console.log(`[fal] status_url=${statusUrl}`);
  console.log(`[fal] result_url=${resultUrl}`);

  const deadline = Date.now() + timeoutMs;
  let interval = 3000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval * 1.4, 10_000);
    const sres = await fetch(statusUrl, { headers: AUTH });
    if (!sres.ok) continue;
    const st = await sres.json();
    process.stdout.write(`[fal] status=${st.status}\n`);
    if (st.status === 'FAILED') throw new Error(st.error ?? 'job failed');
    if (st.status !== 'COMPLETED') continue;
    const rres = await fetch(resultUrl, { headers: AUTH });
    if (!rres.ok) {
      throw new Error(`result ${rres.status}: ${(await rres.text()).slice(0, 400)}`);
    }
    const r = await rres.json();
    const url = r.images?.[0]?.url ?? r.image?.url ?? r.data?.images?.[0]?.url;
    if (!url) {
      console.log('[fal] raw result:', JSON.stringify(r).slice(0, 600));
      throw new Error('no image URL in result');
    }
    return url;
  }
  throw new Error(`timed out after ${timeoutMs / 1000}s`);
}

// fal.ai Flux Pro — production fallback when Ideogram safety-blocks (still pure fal.ai).
async function callFlux(prompt) {
  for (let i = 1; i <= 6; i++) {
    const res = await fetch(`${FAL_RUN_BASE}/${FLUX_MODEL}`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        aspect_ratio: '4:5',
        output_format: 'jpeg',
        num_images: 1,
        raw: true,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const url = data.images?.[0]?.url;
      if (!url) throw new Error('Flux result has no image URL');
      return url;
    }
    const text = await res.text();
    if (res.status === 403 && /balance/i.test(text) && i < 6) {
      console.log(`[fal-flux] balance lock (try ${i}/6) — retrying in 5s…`);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    throw new Error(`flux ${res.status}: ${text.slice(0, 300)}`);
  }
  throw new Error('flux failed after retries');
}

(async () => {
  const prompt = buildPrompt(SAMPLE);
  console.log('─'.repeat(70));
  console.log(`Brand:    ${SAMPLE.brandName}`);
  console.log(`Headline: ${SAMPLE.headline}`);
  console.log(`Vibe:     ${SAMPLE.vibe} | Aspect: ${SAMPLE.aspectRatio}`);
  console.log(`Engine:   fal.ai (Ideogram V4 → Flux Pro fallback — pure fal, no gallery/GPT)`);
  console.log('─'.repeat(70));
  console.log('Prompt:', prompt);
  console.log('─'.repeat(70));
  // Faz-1.1 assertion: brief-aware sceneHint must be present in the prompt.
  const scene = distillSceneHint(SAMPLE.sceneHint);
  if (!prompt.includes(scene.slice(0, 30))) {
    console.error('❌ sceneHint NOT injected into prompt — Faz-1.1 regression');
    process.exit(1);
  }
  console.log('✓ sceneHint injected into prompt (brief-aware background)');
  console.log('─'.repeat(70));
  const t0 = Date.now();
  let imageUrl;
  let engine;
  try {
    imageUrl = await callIdeogram(prompt);
    engine = 'fal.ai Ideogram V4';
  } catch (ideErr) {
    console.warn(`[fal] Ideogram failed (${ideErr.message.slice(0, 120)}) → fal.ai Flux Pro fallback`);
    imageUrl = await callFlux(prompt);
    engine = 'fal.ai Flux Pro v1.1-ultra';
  }
  console.log('─'.repeat(70));
  console.log(`✅ fal.ai designed post ready in ${((Date.now() - t0) / 1000).toFixed(1)}s via ${engine}`);
  console.log(`\nOUTPUT_URL: ${imageUrl}\n`);
})().catch((err) => {
  console.error('❌ fal.ai test failed:', err.message);
  process.exit(1);
});
