/**
 * Kaçta — 7-slot mission package smoke test (internal auto-produce).
 *
 *   node scripts/test-kacta-package-produce.mjs
 */
const TENANT = '5feb36f7-def7-4b4a-834f-353457de57bf';
const BASE = (process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const CREW = (process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const INTERNAL = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';
/** Omit fake mission id — assertMissionBelongsToWorkspace would 404. */
const MISSION_ID = '';

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
    strategic_purpose: 'Kaçta test paketi',
    cta: 'Randevu için DM',
    hashtags: ['#kacta', '#berber', '#bodrum'],
    mood: 'premium',
  };
}

const IDEAS = [
  idea(0, 'post', 'Kaçta — Ustalık detayı', 'Her kesimde aynı özen. Brief: premium barber craft.'),
  idea(1, 'post', 'Kaçta — Tasarım post', 'Yeni sezon stilleri. Caption brief ile uyumlu.'),
  idea(2, 'carousel', 'Kaçta — Stil carousel', '3 farklı kesim — kaydır ve keşfet.'),
  idea(3, 'story', 'Kaçta story 1', 'Salon atmosferi — story motion.'),
  idea(4, 'story', 'Kaçta story 2', 'Detay çekim — story motion.'),
  idea(5, 'story', 'Kaçta story 3', 'Müşteri deneyimi — story motion.'),
  idea(6, 'reel', 'Kaçta reel', 'Reel motion — brief uyumlu kesim ritmi.'),
];

const PRODUCTION_ASSIGNMENTS = [
  { idea_index: 0, slot_role: 'organic_post', pipeline: 'gallery_photo', copy_bundle_id: 'kacta-week', publish_channel: 'instagram_organic' },
  { idea_index: 1, slot_role: 'designed_post', pipeline: 'remotion_poster', copy_bundle_id: 'kacta-week', publish_channel: 'instagram_organic' },
  { idea_index: 2, slot_role: 'organic_carousel', pipeline: 'carousel_gallery', copy_bundle_id: 'kacta-week', publish_channel: 'instagram_organic' },
  { idea_index: 3, slot_role: 'campaign_story_motion', pipeline: 'remotion_story', copy_bundle_id: 'kacta-week', publish_channel: 'instagram_organic', layout_family_hint: 'editorial_bottom' },
  { idea_index: 4, slot_role: 'campaign_story_motion', pipeline: 'remotion_story', copy_bundle_id: 'kacta-week', publish_channel: 'instagram_organic', layout_family_hint: 'gallery_series' },
  { idea_index: 5, slot_role: 'campaign_story_motion', pipeline: 'remotion_story', copy_bundle_id: 'kacta-week', publish_channel: 'instagram_organic', layout_family_hint: 'cinematic_center' },
  { idea_index: 6, slot_role: 'organic_reel', pipeline: 'runway_reel', copy_bundle_id: 'kacta-week', publish_channel: 'instagram_organic' },
];

async function main() {
  console.log(`\n=== Kaçta 7-slot package test — ${TENANT} ===\n`);

  const ctxRes = await fetch(`${CREW}/api/v1/brand-context/${TENANT}`, {
    headers: { 'X-Internal-Api-Key': INTERNAL, 'X-Tenant-Id': TENANT },
    signal: AbortSignal.timeout(20_000),
  });
  const ctx = ctxRes.ok ? await ctxRes.json() : {};
  const brandName = ctx.business_name || 'Kaçta';
  console.log('Brand:', brandName);
  const themeRes = await fetch(`${CREW}/api/v1/brand-context/${TENANT}/theme`, {
    headers: { 'X-Internal-Api-Key': INTERNAL, 'X-Tenant-Id': TENANT },
  });
  const themePayload = themeRes.ok ? await themeRes.json() : {};
  const aiOn = Boolean(themePayload?.theme?.ai_photo_enhance);
  console.log('AI fotoğraf iyileştirme:', aiOn ? 'AÇIK' : 'kapalı');

  const body = {
    workspaceId: TENANT,
    missionId: MISSION_ID || undefined,
    nodeKey: 'test_kacta_package',
    brandName,
    bundleCards: true,
    productionPackage: 'weekly_content',
    ideas: IDEAS,
    feedDirectorReport: {
      feed_score: 88,
      hero_reel_index: 6,
      recommended_layout_families: ['editorial_bottom', 'gallery_series', 'cinematic_center', 'magazine_cover'],
      production_assignments: PRODUCTION_ASSIGNMENTS,
      manifest_coverage_pct: 100,
    },
  };

  console.log('POST auto-produce (timeout 12m)…');
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/auto-produce`, {
    method: 'POST',
    headers: HDRS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(720_000),
  });
  const data = await res.json().catch(() => ({}));
  console.log('HTTP', res.status, `(${(Date.now() - t0) / 1000}s)`);

  if (!res.ok) {
    console.error(JSON.stringify(data, null, 2).slice(0, 2000));
    process.exit(1);
  }

  const results = data.results ?? [];
  console.log(`\nArtifacts: ${results.length}\n`);
  for (const r of results) {
    const urls = [r.imageUrl, r.videoUrl].filter(Boolean);
    console.log(`• ${r.title?.slice(0, 50) ?? '(no title)'}`);
    if (r.error) console.log('  ERROR:', r.error);
    for (const u of urls) {
      const full = u.startsWith('http') ? u : `${BASE}${u.startsWith('/') ? '' : '/'}${u}`;
      console.log(' ', full);
    }
    if (r.carousel_urls?.length) {
      for (const u of r.carousel_urls) {
        const full = u.startsWith('http') ? u : `${BASE}${u.startsWith('/') ? '' : '/'}${u}`;
        console.log('  carousel:', full);
      }
    }
  }

  console.log('\n--- Özet URL listesi ---');
  for (const r of results) {
    for (const u of [r.imageUrl, r.videoUrl, ...(r.carousel_urls || [])].filter(Boolean)) {
      console.log(u.startsWith('http') ? u : `${BASE}${u.startsWith('/') ? '' : '/'}${u}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
