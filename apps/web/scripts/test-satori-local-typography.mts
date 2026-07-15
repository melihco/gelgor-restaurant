#!/usr/bin/env npx tsx
/**
 * Satori Lokal Tipografi Üretim Hattı — canlı test.
 *
 * Gerçek üretim kodunu (`renderLocalTypography`) gerçek mission brief'leri +
 * gerçek galeri fotoğraflarıyla çalıştırır (2 marka × 2 format), R2'ye persist
 * eder ve URL'leri basar. Karşılaştırma için lokal kopya da indirir.
 *
 * Usage (repo root):
 *   npx tsx apps/web/scripts/test-satori-local-typography.mts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

function loadEnvLocal(): void {
  const envPath = path.join(webRoot, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let val = trimmed.slice(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();
process.env.LOCAL_TYPOGRAPHY_ENABLED = 'true';
if (!process.env.NEXT_PUBLIC_SITE_URL) process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

const { renderLocalTypography, shouldUseLocalTypography } = await import(
  '../src/lib/local-typography-renderer'
);

const OUT_DIR = path.join(webRoot, '.preview-renders/satori-live-test');
fs.mkdirSync(OUT_DIR, { recursive: true });

interface TestSlot {
  label: string;
  slotRole: string;
  input: Parameters<typeof renderLocalTypography>[0];
}

const YULA_WS = 'd365f0e0-436e-402d-8f84-0c8fd7ab2022';
const KARAMAN_WS = '327db521-ede2-48e0-8f06-4146ee458c50';

const SLOTS: TestSlot[] = [
  {
    // Gerçek Yula mission story brief'i (69514047… başarılı üretimden)
    label: 'yula-story',
    slotRole: 'fal_story_motion',
    input: {
      workspaceId: YULA_WS,
      headline: "Don't Miss Our Exclusive Summer Festival!",
      subtitle: 'Bu hafta sonu — özel kokteyller ve yerel lezzetler. Rezervasyon için DM.',
      brandName: 'Yula Bodrum',
      brandColors: { primary: '#1a1a2e', accent: '#e8c97a' },
      vibe: 'warm_coastal',
      aspectRatio: '9:16',
      referencePhotoUrl: 'https://yulabodrum.com/galeri/54.webp',
      logoUrl: 'https://yulabodrum.com/yula-bodrum-logo-dark.png',
      sector: 'beach_club',
      occasion: { name: 'Summer Festival' },
      slotRole: 'fal_story_motion',
    },
  },
  {
    label: 'yula-post',
    slotRole: 'designed_typography',
    input: {
      workspaceId: YULA_WS,
      headline: 'Gün Batımında Şef Menüsü',
      subtitle: 'Ege esintili yeni tatlar, her akşam 18.00’den itibaren.',
      brandName: 'Yula Bodrum',
      brandColors: { primary: '#1a1a2e', accent: '#e8c97a' },
      vibe: 'warm_coastal',
      aspectRatio: '4:5',
      referencePhotoUrl: 'https://yulabodrum.com/galeri/23.webp',
      logoUrl: 'https://yulabodrum.com/yula-bodrum-logo-dark.png',
      sector: 'beach_club',
      templateType: 'menu_highlight',
      slotRole: 'designed_typography',
    },
  },
  {
    label: 'karaman-story',
    slotRole: 'fal_only_story',
    input: {
      workspaceId: KARAMAN_WS,
      headline: 'Datça Çam Balı — Doğadan Sofranıza',
      subtitle: 'Yeni hasat, sınırlı sayıda. Sipariş için profildeki bağlantı.',
      brandName: 'Karaman Datça',
      brandColors: { primary: '#4a3726', accent: '#c9813f' },
      vibe: 'editorial_serif',
      aspectRatio: '9:16',
      referencePhotoUrl:
        'https://karamandatca.com.tr/wp-content/uploads/2026/03/WhatsApp-Image-2025-10-26-at-13.38.57.jpeg',
      sector: 'local_products_shop',
      occasion: { name: 'Yeni Hasat' },
      slotRole: 'fal_only_story',
    },
  },
  {
    label: 'karaman-post',
    slotRole: 'fal_designed_post',
    input: {
      workspaceId: KARAMAN_WS,
      headline: 'Erken Hasat Zeytinyağı',
      subtitle: 'Datça’nın taş baskı soğuk sıkım zeytinyağı — şimdi raflarda.',
      brandName: 'Karaman Datça',
      brandColors: { primary: '#4a3726', accent: '#c9813f' },
      vibe: 'editorial_serif',
      aspectRatio: '4:5',
      referencePhotoUrl:
        'https://karamandatca.com.tr/wp-content/uploads/2026/03/WhatsApp-Image-2025-10-26-at-13.38.59-2.jpeg',
      sector: 'local_products_shop',
      templateType: 'product_announcement',
      slotRole: 'fal_designed_post',
    },
  },
];

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`download ${res.status} ${url.slice(0, 90)}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

const results: Array<{ label: string; url: string; layout: string; file: string }> = [];

for (const slot of SLOTS) {
  const routed = shouldUseLocalTypography(slot.slotRole, null);
  console.log(`\n[${slot.label}] role=${slot.slotRole} shouldUseLocalTypography=${routed}`);
  if (!routed) {
    console.error(`  !! rol yönlendirmesi FALSE döndü — beklenmedik`);
    continue;
  }
  const t0 = Date.now();
  const out = await renderLocalTypography(slot.input);
  const ms = Date.now() - t0;
  if (!out) {
    console.error(`  !! render null döndü (${ms}ms)`);
    continue;
  }
  const file = path.join(OUT_DIR, `${slot.label}.jpg`);
  try {
    await download(out.imageUrl, file);
  } catch (e) {
    console.warn(`  local copy indirilemedi: ${(e as Error).message}`);
  }
  console.log(`  OK ${ms}ms layout=${out.layoutFamily}`);
  console.log(`  URL: ${out.imageUrl}`);
  results.push({ label: slot.label, url: out.imageUrl, layout: out.layoutFamily, file });
}

console.log('\n=== SONUÇ ===');
for (const r of results) {
  console.log(`${r.label} [${r.layout}]\n  ${r.url}\n  ${r.file}`);
}
console.log(`\n${results.length}/${SLOTS.length} slot üretildi.`);
