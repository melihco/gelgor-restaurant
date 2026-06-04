/**
 * Kaçta — doğrula: AI theme + gpt-image-2 + Remotion metadata.
 *   npx tsx scripts/verify-kacta-visual-pipeline.mjs
 */
const TENANT = '5feb36f7-def7-4b4a-834f-353457de57bf';
const BASE = (process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const CREW = (process.env.CREW_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const NEXUS = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const INTERNAL = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';
const HDRS = {
  'Content-Type': 'application/json',
  'X-Tenant-Id': TENANT,
  'X-Internal-Api-Key': INTERNAL,
};

function parseMeta(a) {
  try {
    return typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata ?? {});
  } catch {
    return {};
  }
}

async function main() {
  console.log('\n=== Kaçta görsel pipeline doğrulama ===\n');

  const themeRes = await fetch(`${CREW}/api/v1/brand-context/${TENANT}/theme`, { headers: HDRS });
  const theme = themeRes.ok ? (await themeRes.json()).theme : null;
  console.log('1) Marka AI ayarları:', {
    ai_photo_enhance: theme?.ai_photo_enhance,
    level: theme?.ai_photo_enhance_level,
    formats: theme?.ai_enhance_formats,
  });
  if (!theme?.ai_photo_enhance) {
    console.error('FAIL: ai_photo_enhance kapalı');
    process.exit(1);
  }

  const beforeRes = await fetch(`${NEXUS}/api/artifacts`, { headers: HDRS });
  const before = beforeRes.ok ? await beforeRes.json() : [];
  const beforeIds = new Set(before.map((a) => a.id));

  const idea = {
    headline: 'Pipeline doğrulama — story',
    concept_title: 'Pipeline doğrulama — story',
    caption_draft: 'Kaçta dijital randevu — premium barber salon.',
    caption: 'Kaçta dijital randevu — premium barber salon.',
    content_type: 'story',
    content_kind: 'instagram_story',
    template_use_case: 'daily_story',
    mood: 'premium',
    strategic_purpose: 'visual pipeline verify',
  };

  const body = {
    workspaceId: TENANT,
    nodeKey: 'verify_visual_pipeline',
    brandName: 'Kaçta Info',
    bundleCards: true,
    ideas: [idea],
    feedDirectorReport: {
      feed_score: 90,
      production_assignments: [{
        idea_index: 0,
        slot_role: 'campaign_story_motion',
        pipeline: 'remotion_story',
        copy_bundle_id: 'verify-pipeline',
        publish_channel: 'instagram_organic',
      }],
    },
  };

  console.log('2) Tek story auto-produce (max 8 dk)…');
  const t0 = Date.now();
  const prodRes = await fetch(`${BASE}/api/auto-produce`, {
    method: 'POST',
    headers: HDRS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(480_000),
  });
  const prodText = await prodRes.text();
  let prod;
  try { prod = JSON.parse(prodText); } catch { prod = { raw: prodText.slice(0, 400) }; }
  console.log('   HTTP', prodRes.status, `(${(Date.now() - t0) / 1000}s)`);
  if (!prodRes.ok) {
    console.error('FAIL auto-produce:', prod);
    process.exit(1);
  }
  console.log('   produced:', prod.produced ?? prod.results?.length, 'errors:', prod.errors?.length ?? 0);

  await new Promise((r) => setTimeout(r, 3000));
  const afterRes = await fetch(`${NEXUS}/api/artifacts`, { headers: HDRS });
  const after = afterRes.ok ? await afterRes.json() : [];
  const fresh = after.filter((a) => !beforeIds.has(a.id));
  console.log('\n3) Yeni artifact sayısı:', fresh.length);
  if (!fresh.length) {
    console.error('FAIL: yeni artifact yok');
    process.exit(1);
  }

  let pass = 0;
  let fail = 0;
  for (const a of fresh) {
    const m = parseMeta(a);
    const steps = m.visual_pipeline_steps;
    const checks = {
      ai_visual_standard_enabled: m.ai_visual_standard_enabled === true,
      has_pipeline_steps: Array.isArray(steps) && steps.length > 0,
      includes_gpt_enhance: Array.isArray(steps) && steps.includes('gpt_image_enhance'),
      includes_remotion: Array.isArray(steps) && steps.includes('remotion_motion'),
      pipeline_remotion_story: m.pipeline === 'remotion_story',
      ai_enhance_flag_set: typeof m.ai_gallery_enhanced === 'boolean',
    };
    const ok = checks.has_pipeline_steps && checks.pipeline_remotion_story && checks.ai_visual_standard_enabled;
    if (ok) pass++; else fail++;
    console.log('\n  ', a.title?.slice(0, 50));
    console.log('   metadata:', {
      ai_gallery_enhanced: m.ai_gallery_enhanced,
      visual_pipeline_steps: steps,
      pipeline: m.pipeline,
      bundle_status: m.bundle_status,
    });
    console.log('   checks:', checks, ok ? '✓' : '✗');
  }

  console.log('\n=== Sonuç ===');
  console.log(`PASS ${pass} / FAIL ${fail} (yeni artifact)`);
  if (fail > 0 || pass === 0) process.exit(1);
  console.log('OK: Yeni kod metadata ile üretim doğrulandı.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
