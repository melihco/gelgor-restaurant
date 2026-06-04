#!/usr/bin/env node
/**
 * Kaçta — son artifact'larda hangi pipeline kullanılmış + prod flag özeti.
 *   node scripts/kacta-production-audit.mjs
 *   node scripts/kacta-production-audit.mjs <missionId>
 */
const TENANT = '5feb36f7-def7-4b4a-834f-353457de57bf';
const NEXUS = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const CREW = (process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const HDRS = {
  'Content-Type': 'application/json',
  'X-Tenant-Id': TENANT,
  'X-Internal-Api-Key': process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key',
};

function meta(a) {
  try {
    return typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata ?? {});
  } catch {
    return {};
  }
}

const PROD_FLAGS = [
  ['AUTO_PRODUCE_GALLERY_ONLY', process.env.AUTO_PRODUCE_GALLERY_ONLY ?? '(runtime default true)'],
  ['VENUE_PHOTO_PRESERVE', process.env.VENUE_PHOTO_PRESERVE ?? '(default true)'],
  ['AUTO_PRODUCE_SUBTLE_ENHANCE', process.env.AUTO_PRODUCE_SUBTLE_ENHANCE ?? 'false'],
  ['SMART_AGENCY_IMAGE_PROVIDER', process.env.SMART_AGENCY_IMAGE_PROVIDER ?? 'flux'],
  ['FAL_API_KEY', process.env.FAL_API_KEY ? 'set' : 'unset'],
];

async function main() {
  const missionFilter = process.argv[2];
  console.log('\n=== Kaçta üretim denetimi ===');
  console.log('Tenant:', TENANT);
  if (missionFilter) console.log('Mission filter:', missionFilter);
  console.log('\n--- Ortam (bu shell) ---');
  for (const [k, v] of PROD_FLAGS) console.log(`  ${k}=${v}`);

  console.log('\n--- Marka theme (Crew) ---');
  const themeRes = await fetch(`${CREW}/api/v1/brand-context/${TENANT}/theme`, { headers: HDRS });
  const themeBody = themeRes.ok ? await themeRes.json() : {};
  const theme = themeBody.theme ?? {};
  const lib = theme.template_library ?? theme.templateLibrary;
  console.log({
    ai_photo_enhance: theme.ai_photo_enhance,
    ai_photo_enhance_level: theme.ai_photo_enhance_level,
    template_library_locked: lib?.locked,
    story_slots: lib?.slots?.filter((s) => s.format === 'story' && s.enabled)?.map((s) => s.key + ':' + (s.storyTemplateId || '?')),
  });

  console.log('\n--- Son artifact\'lar (Nexus) ---');
  const artRes = await fetch(`${NEXUS}/api/artifacts?limit=40`, { headers: HDRS });
  if (!artRes.ok) {
    console.error('Nexus artifacts failed', artRes.status);
    process.exit(1);
  }
  let arts = await artRes.json();
  if (missionFilter) {
    arts = arts.filter((a) => {
      const m = meta(a);
      return m.mission_id === missionFilter || String(a.title || '').includes(missionFilter.slice(0, 8));
    });
  }
  const auto = arts.filter((a) => meta(a).auto_produced || meta(a).source === 'auto-produce');
  const sample = (auto.length ? auto : arts).slice(0, 15);

  const counts = {};
  for (const a of sample) {
    const m = meta(a);
    const key = m.renderer_executed || m.pipeline || m.production_role || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    console.log('\n ', (a.title || '').slice(0, 55));
    console.log('   pipeline(plan):', m.pipeline, '| role:', m.production_role);
    console.log('   renderer_executed:', m.renderer_executed ?? '(eski artifact — yok)');
    console.log('   steps:', m.visual_pipeline_steps?.join(' → ') ?? '-');
    console.log('   agency_produced:', m.agency_produced, '| ai_enhance:', m.ai_gallery_enhanced);
    console.log('   bundle:', m.bundle_status, '| flux:', m.flux_used ?? '?');
    console.log('   gallery_only flag:', m.gallery_only, '(metadata — flux değil)');
  }

  console.log('\n--- Özet (son', sample.length, 'kart) ---');
  console.log(counts);
  console.log(`
Yorum:
  remotion_story_async / remotion_poster_* = ajans katmanı çalışmış
  gallery_raw = ham galeri (eski üretim veya AI katman kapalı)
  flux_used:true görürsen nadir — çoğu run'da fal.ai çağrılmaz

Kilit açma (yeni kod):
  Kaçta tenant + kilitli kütüphane → ai_photo_enhance otomatik açılır (deploy sonrası)
  Yeni mission üret; eski Feed kartları yeniden render edilmez.
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
