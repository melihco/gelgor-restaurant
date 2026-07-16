#!/usr/bin/env npx tsx
/**
 * Mission slot Satori test — weekly manifest Satori-eligible roles through real
 * `renderLocalTypography` (same code path as auto-produce), grouped by mission slot.
 *
 * Usage (apps/web):
 *   npx tsx scripts/test-satori-mission-slots.mts
 *   WORKSPACE_ID=<uuid> npx tsx scripts/test-satori-mission-slots.mts
 *
 * Output: .preview-renders/satori-mission-slots/{slotRole}.jpg + index.html
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  LOCAL_TYPOGRAPHY_ROLES,
  renderLocalTypography,
  shouldUseLocalTypography,
} from '../src/lib/local-typography-renderer';
import { buildMissionProductionManifest } from '../src/lib/mission-production-manifest';
import { SLOT_ROLE_LABEL_TR } from '../src/lib/mission-slot-checklist';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

function loadEnvLocal(): void {
  const envPath = path.join(webRoot, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i);
    let v = t.slice(i + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();
process.env.LOCAL_TYPOGRAPHY_ENABLED = 'true';
if (!process.env.NEXT_PUBLIC_SITE_URL) process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

const OUT_DIR = path.join(webRoot, '.preview-renders/satori-mission-slots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const YULA_WS = process.env.WORKSPACE_ID ?? 'd365f0e0-436e-402d-8f84-0c8fd7ab2022';
const BRAND = {
  brandName: 'Yula Bodrum',
  brandColors: { primary: '#1a1a2e', accent: '#e8c97a' },
  vibe: 'warm_coastal' as const,
  logoUrl: 'https://yulabodrum.com/yula-bodrum-logo-dark.png',
  sector: 'beach_club',
  referencePhotoUrl: 'https://yulabodrum.com/galeri/54.webp',
};

/** One sample brief per Satori-eligible manifest role (weekly mission geometry). */
const SLOT_BRIEFS: Record<string, { headline: string; subtitle?: string; aspectRatio: '9:16' | '4:5' }> = {
  campaign_story_motion: {
    headline: "Don't Miss Our Exclusive Summer Festival!",
    subtitle: 'Bu hafta sonu — özel kokteyller ve yerel lezzetler.',
    aspectRatio: '9:16',
  },
  fal_story_motion: {
    headline: 'Gün Batımında Şef Menüsü',
    subtitle: 'Ege esintili yeni tatlar, her akşam 18.00’den itibaren.',
    aspectRatio: '9:16',
  },
  designed_typography: {
    headline: 'Bodrum Mandalinası ile Yaz Kokteylleri',
    subtitle: 'Taze hasat mandalina — şimdi menümüzde.',
    aspectRatio: '4:5',
  },
  fal_designed_post: {
    headline: 'Yaz Festivali Başlıyor',
    subtitle: 'Rezervasyon için DM.',
    aspectRatio: '4:5',
  },
  fal_only_story: {
    headline: 'Serinletici Kokteyller',
    subtitle: 'Plajda gün batımı keyfi.',
    aspectRatio: '9:16',
  },
  fal_only_post: {
    headline: 'Yeni Sezon Menüsü',
    subtitle: 'Yerel lezzetler, deniz manzarası.',
    aspectRatio: '4:5',
  },
};

const manifest = buildMissionProductionManifest({
  missionId: '00000000-0000-0000-0000-000000000001',
  missionType: 'weekly',
});
const satoriSlots = manifest.slots.filter((s) => LOCAL_TYPOGRAPHY_ROLES.has(s.role));

interface ResultRow {
  role: string;
  label: string;
  layout: string;
  url: string;
  file: string;
}

const results: ResultRow[] = [];

console.log(`Workspace ${YULA_WS}`);
console.log(`Weekly manifest: ${manifest.slots.length} slots, ${satoriSlots.length} Satori-eligible\n`);

for (const slot of satoriSlots) {
  const brief = SLOT_BRIEFS[slot.role];
  if (!brief) {
    console.warn(`  skip ${slot.role} — no sample brief`);
    continue;
  }
  const routed = shouldUseLocalTypography(slot.role, slot.pipeline, {
    production_engines: { satori: { local_typography_enabled: true } },
  });
  console.log(`[${slot.role}] pipeline=${slot.pipeline} routed=${routed}`);
  if (!routed) continue;

  const out = await renderLocalTypography({
    workspaceId: YULA_WS,
    headline: brief.headline,
    subtitle: brief.subtitle,
    brandName: BRAND.brandName,
    brandColors: BRAND.brandColors,
    vibe: BRAND.vibe,
    aspectRatio: brief.aspectRatio,
    referencePhotoUrl: BRAND.referencePhotoUrl,
    logoUrl: BRAND.logoUrl,
    sector: BRAND.sector,
    slotRole: slot.role,
    templateType: slot.role.includes('post') ? 'menu_highlight' : 'event_teaser',
  });
  if (!out) {
    console.error(`  !! null for ${slot.role}`);
    continue;
  }
  const file = path.join(OUT_DIR, `${slot.role}.jpg`);
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartagency-web.onrender.com').replace(/\/$/, '');
  const fetchUrl = out.imageUrl.startsWith('http') ? out.imageUrl : `${site}${out.imageUrl}`;
  const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(60_000) });
  if (res.ok) fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  OK layout=${out.layoutFamily} → ${out.imageUrl}`);
  results.push({
    role: slot.role,
    label: SLOT_ROLE_LABEL_TR[slot.role as keyof typeof SLOT_ROLE_LABEL_TR] ?? slot.role,
    layout: out.layoutFamily,
    url: fetchUrl,
    file,
  });
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Satori Mission Slots</title>
<style>body{font-family:system-ui;background:#111;color:#eee;padding:24px}h1{font-size:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;margin-top:20px}
.card{background:#1a1a1a;border-radius:12px;padding:12px}img{width:100%;border-radius:8px}a{color:#5eead4;font-size:11px}
.tag{display:inline-block;background:#0d9488;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;margin-bottom:8px}
</style></head><body><h1>Satori — Weekly Mission Slot Previews (${results.length}/${satoriSlots.length})</h1>
<div class="grid">${results.map((r) => `
<div class="card"><span class="tag">Satori · ${r.layout}</span><div style="font-weight:700;margin-bottom:6px">${r.label}</div>
<div style="font-size:11px;color:#888;margin-bottom:8px">${r.role}</div>
<img src="${path.basename(r.file)}" alt="${r.role}"/><br/><a href="${r.url}" target="_blank">Canlı URL</a></div>`).join('')}
</div></body></html>`;
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);

console.log(`\n=== ${results.length}/${satoriSlots.length} mission slot previews ===`);
for (const r of results) console.log(`${r.role}: ${r.url}`);
console.log(`\nGallery: ${path.join(OUT_DIR, 'index.html')}`);
