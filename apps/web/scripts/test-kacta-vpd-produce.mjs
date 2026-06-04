/**
 * Kaçta — VPD + AI settings + 7-slot auto-produce.
 *
 *   node scripts/test-kacta-vpd-produce.mjs
 *   node scripts/test-kacta-vpd-produce.mjs --produce-only   # skip settings/vpd
 */
// Node undici default headers timeout ~300s — auto-produce can exceed that
process.env.UNDICI_HEADERS_TIMEOUT = process.env.UNDICI_HEADERS_TIMEOUT || '720000';
process.env.UNDICI_BODY_TIMEOUT = process.env.UNDICI_BODY_TIMEOUT || '720000';

const TENANT = '5feb36f7-def7-4b4a-834f-353457de57bf';
const PRODUCE_ONLY = process.argv.includes('--produce-only');
const BASE = (process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const INTERNAL = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';

const HDRS = {
  'Content-Type': 'application/json',
  'X-Tenant-Id': TENANT,
  'X-Internal-Api-Key': INTERNAL,
};

function idea(i, contentType, headline, caption) {
  const kind = contentType === 'post' ? 'instagram_post'
    : contentType === 'story' ? 'instagram_story'
      : contentType === 'reel' ? 'instagram_reel'
        : 'instagram_carousel';
  return {
    headline,
    concept_title: headline,
    caption_draft: caption,
    caption,
    content_type: contentType,
    content_kind: kind,
    format: contentType === 'carousel' ? 'carousel' : contentType,
    template_use_case: contentType === 'reel' ? 'behind_the_scenes' : 'daily_story',
    strategic_purpose: 'Kaçta VPD paketi',
    cta: 'Randevu için DM',
    hashtags: ['#kacta', '#berber', '#bodrum'],
    mood: 'premium',
  };
}

const IDEAS = [
  idea(0, 'post', 'Kaçta — Ustalık detayı', 'Her kesimde aynı özen. Premium barber craft Bodrum.'),
  idea(1, 'post', 'Kaçta — Tasarım post', 'Yeni sezon stilleri. Marka kimliği + brief uyumlu.'),
  idea(2, 'carousel', 'Kaçta — Stil carousel', '3 farklı kesim — kaydır ve keşfet.'),
  idea(3, 'story', 'Kaçta story 1', 'Salon atmosferi — editorial motion.'),
  idea(4, 'story', 'Kaçta story 2', 'Detay çekim — craft odaklı story.'),
  idea(5, 'story', 'Kaçta story 3', 'Müşteri deneyimi — premium hissiyat.'),
  idea(6, 'reel', 'Kaçta reel', 'Kesim ritmi — brief uyumlu reel motion.'),
];

const PRODUCTION_ASSIGNMENTS = [
  { idea_index: 0, slot_role: 'organic_post', pipeline: 'gallery_photo', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
  { idea_index: 1, slot_role: 'designed_post', pipeline: 'remotion_poster', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
  { idea_index: 2, slot_role: 'organic_carousel', pipeline: 'carousel_gallery', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
  { idea_index: 3, slot_role: 'campaign_story_motion', pipeline: 'remotion_story', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic', layout_family_hint: 'editorial_bottom' },
  { idea_index: 4, slot_role: 'campaign_story_motion', pipeline: 'remotion_story', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic', layout_family_hint: 'gallery_series' },
  { idea_index: 5, slot_role: 'campaign_story_motion', pipeline: 'remotion_story', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic', layout_family_hint: 'cinematic_center' },
  { idea_index: 6, slot_role: 'organic_reel', pipeline: 'runway_reel', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
];

const FEED_REPORT = {
  feed_score: 88,
  hero_reel_index: 6,
  production_package: 'weekly_content',
  recommended_layout_families: ['editorial_bottom', 'gallery_series', 'cinematic_center', 'magazine_cover'],
  production_assignments: PRODUCTION_ASSIGNMENTS,
  manifest_coverage_pct: 100,
};

function fullUrl(u) {
  if (!u) return u;
  if (u.startsWith('http') || u.startsWith('data:')) return u;
  return `${BASE}${u.startsWith('/') ? '' : '/'}${u}`;
}

async function main() {
  console.log(`\n=== Kaçta VPD üretim — ${TENANT} ===\n`);

  let ideas = IDEAS;

  if (!PRODUCE_ONLY) {
  console.log('1) Ayarlar (AI + VPD + mekan modu)…');
  const patchRes = await fetch(`${BASE}/api/brand-context/${TENANT}/theme/ai-settings`, {
    method: 'PATCH',
    headers: HDRS,
    body: JSON.stringify({
      ai_photo_enhance: true,
      ai_use_brand_identity: true,
      ai_brief_drives_scene: true,
      ai_embed_logo: true,
      ai_visual_subject: 'venue_ambiance',
      ai_enhance_formats: ['post', 'story', 'carousel', 'reel'],
      enable_visual_production_director: true,
    }),
  });
  if (!patchRes.ok) {
    console.error('Ayarlar PATCH failed:', patchRes.status, await patchRes.text());
    process.exit(1);
  }
  console.log('   ✓ Ayarlar kaydedildi\n');

  console.log('2) Visual Production Director enrich…');
  const tVpd = Date.now();
  const vpdRes = await fetch(`${BASE}/api/brand-context/${TENANT}/visual-production-enrich`, {
    method: 'POST',
    headers: HDRS,
    body: JSON.stringify({
      ideas: IDEAS,
      feed_director_report: FEED_REPORT,
      mission_title: 'Kaçta Haftalık Paket VPD',
      creative_brief: 'Premium barber Bodrum — marka kimliği sabit, brief sahneyi yönetir.',
      production_package: 'weekly_content',
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const vpdData = await vpdRes.json().catch(() => ({}));
  console.log(`   HTTP ${vpdRes.status} (${((Date.now() - tVpd) / 1000).toFixed(1)}s)`);
  if (!vpdRes.ok) {
    console.error(JSON.stringify(vpdData, null, 2).slice(0, 1500));
    process.exit(1);
  }
  ideas = vpdData.ideas ?? IDEAS;
  console.log(`   VPD enabled: ${vpdData.vpd_enabled} | enriched: ${vpdData.enriched_count ?? 0}`);
  for (let i = 0; i < Math.min(ideas.length, 3); i++) {
    const vps = ideas[i]?.visual_production_spec;
    if (vps) {
      console.log(`   [${i}] scene_mood=${vps.scene_mood ?? '-'} layout=${vps.layout_family_hint ?? '-'}`);
    }
  }
  console.log('');
  } else {
    console.log('(--produce-only: VPD enrich atlanıyor, son kayıtlı ayarlar kullanılır)\n');
    const vpdRes = await fetch(`${BASE}/api/brand-context/${TENANT}/visual-production-enrich`, {
      method: 'POST',
      headers: HDRS,
      body: JSON.stringify({
        ideas: IDEAS,
        feed_director_report: FEED_REPORT,
        mission_title: 'Kaçta Haftalık Paket VPD',
        production_package: 'weekly_content',
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const vpdData = await vpdRes.json().catch(() => ({}));
    if (vpdRes.ok && vpdData.ideas?.length) ideas = vpdData.ideas;
  }

  console.log('POST auto-produce (12m timeout)…');
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/auto-produce`, {
    method: 'POST',
    headers: HDRS,
    body: JSON.stringify({
      workspaceId: TENANT,
      nodeKey: 'test_kacta_vpd',
      brandName: 'Kaçta Info',
      bundleCards: true,
      productionPackage: 'weekly_content',
      ideas,
      feedDirectorReport: FEED_REPORT,
    }),
    signal: AbortSignal.timeout(720_000),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`   HTTP ${res.status} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

  if (!res.ok) {
    console.error(JSON.stringify(data, null, 2).slice(0, 2500));
    process.exit(1);
  }

  const results = data.results ?? [];
  console.log(`Artifacts: ${results.length}\n`);
  for (const r of results) {
    console.log(`• ${(r.title ?? '').slice(0, 55)}`);
    if (r.error) console.log('  ERROR:', r.error);
    for (const u of [r.imageUrl, r.videoUrl].filter(Boolean)) {
      console.log(' ', fullUrl(u));
    }
    if (r.carousel_urls?.length) {
      for (const u of r.carousel_urls) console.log('  carousel:', fullUrl(u));
    }
  }

  console.log('\n--- Tüm URL ---');
  for (const r of results) {
    for (const u of [r.imageUrl, r.videoUrl, ...(r.carousel_urls || [])].filter(Boolean)) {
      console.log(fullUrl(u));
    }
  }
  console.log('\n✓ Kaçta VPD üretim tamamlandı\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
