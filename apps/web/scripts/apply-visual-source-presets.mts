/**
 * Apply post-launch visual_source / AI enhance presets for existing tenants.
 *
 * Karaman (local_products_shop) → product photographer staging (test brand).
 * Venue / F&B brands → gallery_enhanced + venue_ambiance (moderate).
 *
 * Run:
 *   cd apps/web && npx tsx --env-file=.env.local scripts/apply-visual-source-presets.mts
 *   cd apps/web && npx tsx --env-file=.env.local scripts/apply-visual-source-presets.mts --dry-run
 */
const DRY = process.argv.includes('--dry-run');
const PROD = 'https://smartagency-web.onrender.com';

type AiPatch = Record<string, unknown>;

interface TenantPreset {
  workspaceId: string;
  name: string;
  kind: 'product_shop' | 'venue' | 'service';
  ai: AiPatch;
  productShowcase?: Record<string, unknown>;
}

/** Photographer-grade product staging — Karaman test brand. */
const PRODUCT_SHOP_AI: AiPatch = {
  visual_source_mode: 'gallery_enhanced',
  ai_photo_enhance: true,
  ai_photo_enhance_level: 'full',
  ai_visual_subject: 'product_hero',
  ai_adaptive_scene: true,
  ai_adaptive_scene_mode: 'product_showcase',
  ai_brief_drives_scene: true,
  ai_caption_driven_visual: false,
  ai_enhance_gallery_selected: true,
  ai_use_brand_identity: true,
  ai_embed_logo: true,
  ai_enhance_formats: ['post', 'story', 'carousel', 'reel'],
};

const PRODUCT_SHOWCASE = {
  enabled: true,
  posts_per_mission: 2,
  stories_per_mission: 2,
  background_style: 'lifestyle_scene',
};

/** Beach / cafe / restaurant — polish real venue photos, do not invent locations. */
const VENUE_AI: AiPatch = {
  visual_source_mode: 'gallery_enhanced',
  ai_photo_enhance: true,
  ai_photo_enhance_level: 'moderate',
  ai_visual_subject: 'venue_ambiance',
  ai_adaptive_scene: false,
  ai_adaptive_scene_mode: 'venue_context',
  ai_brief_drives_scene: true,
  ai_caption_driven_visual: false,
  ai_enhance_gallery_selected: true,
  ai_use_brand_identity: true,
  ai_embed_logo: true,
  ai_enhance_formats: ['post', 'story', 'carousel', 'reel'],
};

/** Beauty / service — adaptive brief-driven (sector already forces adaptive). */
const SERVICE_AI: AiPatch = {
  visual_source_mode: 'gallery_enhanced',
  ai_photo_enhance: true,
  ai_photo_enhance_level: 'full',
  ai_visual_subject: 'auto',
  ai_adaptive_scene: true,
  ai_adaptive_scene_mode: 'lifestyle_composite',
  ai_brief_drives_scene: true,
  ai_caption_driven_visual: false,
  ai_enhance_gallery_selected: true,
  ai_use_brand_identity: true,
  ai_embed_logo: true,
  ai_enhance_formats: ['post', 'story', 'carousel', 'reel'],
};

const PRESETS: TenantPreset[] = [
  // ── Product shop test brand (both Karaman workspaces) ───────────────────
  {
    workspaceId: '327db521-ede2-48e0-8f06-4146ee458c50',
    name: 'Karaman Datça',
    kind: 'product_shop',
    ai: PRODUCT_SHOP_AI,
    productShowcase: PRODUCT_SHOWCASE,
  },
  {
    workspaceId: '3be8dacc-0300-4e90-8438-4db8954bb76b',
    name: 'KARAMAN DATÇA',
    kind: 'product_shop',
    ai: PRODUCT_SHOP_AI,
    productShowcase: PRODUCT_SHOWCASE,
  },
  // Secondary product shop — slightly softer than Karaman (still product_hero)
  {
    workspaceId: '0d35ed46-c8db-4636-a0dd-75685fdfe1dd',
    name: 'Kitsuvi',
    kind: 'product_shop',
    ai: {
      ...PRODUCT_SHOP_AI,
      ai_photo_enhance_level: 'moderate',
    },
    productShowcase: { ...PRODUCT_SHOWCASE, background_style: 'auto' },
  },

  // ── Venue / F&B ─────────────────────────────────────────────────────────
  {
    workspaceId: 'd365f0e0-436e-402d-8f84-0c8fd7ab2022',
    name: 'Yula Bodrum',
    kind: 'venue',
    ai: VENUE_AI,
  },
  {
    workspaceId: 'f00e3308-ebbe-4d75-8592-12d52e7ff1aa',
    name: 'Yula Bodrum - Drink & Chill',
    kind: 'venue',
    ai: VENUE_AI,
  },
  {
    workspaceId: '114b50bc-3cc7-45bc-8a5e-004e17673960',
    name: 'Scorpios Bodrum',
    kind: 'venue',
    ai: { ...VENUE_AI, ai_photo_enhance_level: 'subtle' },
  },
  {
    workspaceId: '431b2901-a2dc-4df6-abe3-3670d9844851',
    name: 'Sarnıç Beach',
    kind: 'venue',
    ai: VENUE_AI,
  },
  {
    workspaceId: 'd6b187ab-0821-43bf-8381-25f3b17f24e4',
    name: 'Turunç Bodrum',
    kind: 'venue',
    ai: VENUE_AI,
  },
  {
    workspaceId: '38724813-2067-4851-a63b-ebfb1a312155',
    name: 'Walters Coffee',
    kind: 'venue',
    ai: VENUE_AI,
  },
  {
    workspaceId: '0466adb9-9fd3-40a6-85c1-66d23fb4d094',
    name: 'Gelgör Restaurant',
    kind: 'venue',
    ai: VENUE_AI,
  },

  // ── Service ─────────────────────────────────────────────────────────────
  {
    workspaceId: 'aa49a753-cd1c-4506-a71e-f5febf721ea0',
    name: 'Meon Wedding',
    kind: 'service',
    ai: SERVICE_AI,
  },
];

async function patchAi(key: string, ws: string, body: AiPatch): Promise<void> {
  const res = await fetch(`${PROD}/api/brand-context/${ws}/theme/ai-settings`, {
    method: 'PATCH',
    headers: {
      'X-Internal-Api-Key': key,
      'X-Tenant-Id': ws,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`ai-settings ${ws.slice(0, 8)} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

async function mergeProductShowcase(
  _key: string,
  ws: string,
  showcase: Record<string, unknown>,
): Promise<void> {
  // Theme GET returns camelCase derived view; PUT can drop snake_case AI keys.
  // Merge product_showcase directly into brand_theme JSONB via Render SQL helper.
  const { spawnSync } = await import('node:child_process');
  const py = `
import json, asyncio, urllib.request, os
from pathlib import Path
import asyncpg
key = os.environ.get('RENDER_API_KEY')
req = urllib.request.Request(
  'https://api.render.com/v1/postgres/dpg-d8gkt4f7f7vs73esgf00-a/connection-info',
  headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'},
)
with urllib.request.urlopen(req, timeout=30) as r:
  dsn = json.loads(r.read().decode())['externalConnectionString']
ws = ${JSON.stringify(ws)}
showcase = json.loads(${JSON.stringify(JSON.stringify(showcase))})
async def main():
  conn = await asyncpg.connect(dsn, ssl='require', timeout=45)
  raw = await conn.fetchval('SELECT brand_theme::text FROM brand_contexts WHERE workspace_id=$1::uuid', ws)
  theme = json.loads(raw) if raw else {}
  theme['product_showcase'] = showcase
  theme['productShowcase'] = showcase
  theme['visual_source_mode'] = theme.get('visual_source_mode') or 'gallery_enhanced'
  await conn.execute(
    'UPDATE brand_contexts SET brand_theme=$2::jsonb, brand_theme_updated_at=NOW() WHERE workspace_id=$1::uuid',
    ws, json.dumps(theme),
  )
  await conn.close()
asyncio.run(main())
`;
  const res = spawnSync(
    '/Users/melihtasoglan/Desktop/smart-agency/backend/.venv/bin/python3',
    ['-c', py],
    { encoding: 'utf8', env: process.env },
  );
  if (res.status !== 0) {
    throw new Error(`product_showcase SQL ${ws.slice(0, 8)}: ${res.stderr || res.stdout}`);
  }
}

async function main() {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error('INTERNAL_API_KEY missing');

  console.log(DRY ? '== DRY RUN ==' : '== APPLY visual source presets ==');
  let ok = 0;
  let fail = 0;

  for (const preset of PRESETS) {
    const label = `${preset.kind.padEnd(12)} ${preset.name}`;
    try {
      if (!DRY) {
        await patchAi(key, preset.workspaceId, preset.ai);
        if (preset.productShowcase) {
          await mergeProductShowcase(key, preset.workspaceId, preset.productShowcase);
        }
      }
      ok += 1;
      console.log(
        `✓ ${label}\n`
        + `    mode=${preset.ai.visual_source_mode} level=${preset.ai.ai_photo_enhance_level} `
        + `subject=${preset.ai.ai_visual_subject} adaptive=${preset.ai.ai_adaptive_scene_mode}`
        + (preset.productShowcase ? ' +product_showcase' : ''),
      );
    } catch (err) {
      fail += 1;
      console.error(`✗ ${label}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n== DONE ok=${ok} fail=${fail} dry=${DRY} ==`);
  if (fail > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
