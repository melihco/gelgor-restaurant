#!/usr/bin/env bash
# Kaçta VPD + auto-produce via curl (avoids Node headers timeout)
set -euo pipefail
TENANT="5feb36f7-def7-4b4a-834f-353457de57bf"
BASE="${NEXTJS_INTERNAL_URL:-http://127.0.0.1:3000}"
KEY="${INTERNAL_API_KEY:-smartagency-internal-dev-key}"
LOG="/tmp/kacta-vpd-run.log"

exec > >(tee -a "$LOG") 2>&1
echo "=== $(date -Iseconds) Kaçta produce start ==="

curl -sf -X PATCH "$BASE/api/brand-context/$TENANT/theme/ai-settings" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $TENANT" \
  -H "X-Internal-Api-Key: $KEY" \
  -d '{
    "ai_photo_enhance": true,
    "ai_use_brand_identity": true,
    "ai_brief_drives_scene": true,
    "ai_embed_logo": true,
    "ai_visual_subject": "venue_ambiance",
    "ai_enhance_formats": ["post","story","carousel","reel"],
    "enable_visual_production_director": true
  }' > /dev/null
echo "✓ Ayarlar PATCH"

node --input-type=module <<'NODEEOF'
const TENANT = '5feb36f7-def7-4b4a-834f-353457de57bf';
const BASE = process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000';
const KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';
const HDRS = { 'Content-Type': 'application/json', 'X-Tenant-Id': TENANT, 'X-Internal-Api-Key': KEY };
const idea = (ct, h, c, kind) => ({
  headline: h, concept_title: h, caption_draft: c, caption: c,
  content_type: ct, content_kind: kind, format: ct === 'carousel' ? 'carousel' : ct.replace('instagram_', ''),
  cta: 'Randevu için DM', mood: 'premium', strategic_purpose: 'Kaçta VPD',
});
const IDEAS = [
  idea('post', 'Kaçta — Ustalık', 'Her kesimde özen.', 'instagram_post'),
  idea('post', 'Kaçta — Tasarım', 'Yeni sezon stilleri.', 'instagram_post'),
  idea('carousel', 'Kaçta — Carousel', '3 kesim — kaydır.', 'instagram_carousel'),
  idea('story', 'Kaçta story 1', 'Salon atmosferi.', 'instagram_story'),
  idea('story', 'Kaçta story 2', 'Detay çekim.', 'instagram_story'),
  idea('story', 'Kaçta story 3', 'Müşteri deneyimi.', 'instagram_story'),
  idea('reel', 'Kaçta reel', 'Kesim ritmi.', 'instagram_reel'),
];
const PA = [
  { idea_index: 0, slot_role: 'organic_post', pipeline: 'gallery_photo', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
  { idea_index: 1, slot_role: 'designed_post', pipeline: 'remotion_poster', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
  { idea_index: 2, slot_role: 'organic_carousel', pipeline: 'carousel_gallery', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
  { idea_index: 3, slot_role: 'campaign_story_motion', pipeline: 'remotion_story', layout_family_hint: 'editorial_bottom', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
  { idea_index: 4, slot_role: 'campaign_story_motion', pipeline: 'remotion_story', layout_family_hint: 'gallery_series', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
  { idea_index: 5, slot_role: 'campaign_story_motion', pipeline: 'remotion_story', layout_family_hint: 'cinematic_center', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
  { idea_index: 6, slot_role: 'organic_reel', pipeline: 'runway_reel', copy_bundle_id: 'kacta-vpd', publish_channel: 'instagram_organic' },
];
const FR = { feed_score: 88, hero_reel_index: 6, production_package: 'weekly_content', production_assignments: PA, manifest_coverage_pct: 100 };
const v = await fetch(`${BASE}/api/brand-context/${TENANT}/visual-production-enrich`, {
  method: 'POST', headers: HDRS,
  body: JSON.stringify({ ideas: IDEAS, feed_director_report: FR, mission_title: 'Kaçta VPD Paket' }),
});
const vd = await v.json();
if (!v.ok) { console.error('VPD failed', vd); process.exit(1); }
console.log(`✓ VPD enrich: ${vd.enriched_count ?? 0} ideas`);
const fs = await import('fs');
fs.writeFileSync('/tmp/kacta-produce.json', JSON.stringify({
  workspaceId: TENANT, nodeKey: 'kacta_vpd_curl', brandName: 'Kaçta Info',
  bundleCards: true, productionPackage: 'weekly_content',
  ideas: vd.ideas || IDEAS, feedDirectorReport: FR,
}));
NODEEOF

echo "POST auto-produce (max 15m)…"
curl -s -m 900 -X POST "$BASE/api/auto-produce" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $TENANT" \
  -H "X-Internal-Api-Key: $KEY" \
  -d @/tmp/kacta-produce.json \
  -o /tmp/kacta-produce-out.json \
  -w "HTTP %{http_code} in %{time_total}s\n"

node -e "
const d=require('/tmp/kacta-produce-out.json');
const r=d.results||[];
console.log('Produced:', d.produced??r.length);
for (const x of r) {
  console.log('•', (x.title||'').slice(0,50), x.error||'');
  for (const u of [x.imageUrl,x.videoUrl].filter(Boolean)) console.log(' ', u.startsWith('http')?u:'$BASE'+u);
  if (x.carousel_urls) for (const u of x.carousel_urls) console.log('  carousel:', u.startsWith('http')?u:'$BASE'+u);
}
"
echo "=== $(date -Iseconds) done ==="
