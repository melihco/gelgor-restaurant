#!/usr/bin/env node
/**
 * Backfill sector reel motion standards into brand_theme.motion_profile.
 *
 * Usage:
 *   node scripts/backfill-sector-reel-motion.mjs
 *   node scripts/backfill-sector-reel-motion.mjs <tenant-uuid> ...
 */
const BASE = process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000';
const CREW = process.env.CREW_API_URL || 'http://127.0.0.1:8000';
const KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';
const TENANTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
    '327db521-ede2-48e0-8f06-4146ee458c50',
    '431b2901-a2dc-4df6-abe3-3670d9844851',
    '5feb36f7-def7-4b4a-834f-353457de57bf',
  ];

const SECTOR_REEL = {
  local_products_shop: {
    motion_style: 'luxury', reel_pace: 'slow_burn', reel_camera_motion: 'dolly_in',
    reel_strategy: 'sequential', product_spotlight_reel: true, prefer_pure_photo_stories: 0.62,
    story_audio_mode: 'music_and_voice',
  },
  beach_club: {
    motion_style: 'bold', reel_pace: 'mid_tempo', reel_camera_motion: 'slow_pan',
    reel_strategy: 'sequential', product_spotlight_reel: false, prefer_pure_photo_stories: 0.82,
    story_audio_mode: 'music_only',
  },
  agency_services: {
    motion_style: 'minimal', reel_pace: 'mid_tempo', reel_camera_motion: 'static',
    reel_strategy: 'single', product_spotlight_reel: false, prefer_pure_photo_stories: 0.38,
    story_audio_mode: 'music_and_voice',
  },
};

const DEFAULT_REEL = {
  motion_style: 'editorial', reel_pace: 'mid_tempo', reel_camera_motion: 'slow_pan',
  reel_strategy: 'sequential', product_spotlight_reel: false, prefer_pure_photo_stories: 0.72,
  story_audio_mode: 'music_and_voice',
};

async function main() {
  for (const tenantId of TENANTS) {
    const hdrs = {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-Internal-Api-Key': KEY,
    };
    const ctxRes = await fetch(`${CREW}/api/v1/brand-context/${tenantId}`, { headers: hdrs });
    if (!ctxRes.ok) {
      console.warn(`✗ ${tenantId} context ${ctxRes.status}`);
      continue;
    }
    const ctx = await ctxRes.json();
    const sector = String(ctx.business_type ?? 'local_service_business');
    const reel = SECTOR_REEL[sector] ?? DEFAULT_REEL;

    await fetch(`${BASE}/api/brand-context/${tenantId}/theme/derive`, {
      method: 'POST', headers: hdrs,
    }).catch(() => null);

    const themeRes = await fetch(`${BASE}/api/brand-context/${tenantId}/theme`, { headers: hdrs });
    const themePayload = themeRes.ok ? await themeRes.json() : {};
    const theme = themePayload.theme ?? {};
    const motion = theme.motion_profile ?? theme.motionProfile ?? {};
    if (motion.operator_override || motion.operatorOverride) {
      console.log(`↷ ${tenantId} skipped (operator_override)`);
      continue;
    }

    const motion_profile = {
      ...motion,
      ...reel,
      operator_override: false,
      reel_motion_standard_version: 1,
    };

    const put = await fetch(`${BASE}/api/brand-context/${tenantId}/theme`, {
      method: 'PUT',
      headers: hdrs,
      body: JSON.stringify({ theme: { ...theme, motion_profile } }),
    });
    console.log(put.ok
      ? `✓ ${tenantId} (${sector}) reel motion persisted`
      : `✗ ${tenantId} PUT ${put.status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
