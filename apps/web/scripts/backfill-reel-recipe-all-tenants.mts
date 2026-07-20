/**
 * Backfill design_spec.reel_recipe on all existing reel_cover templates
 * that are missing it (all tenants). Recipe-only — no thumbnail regenerate.
 *
 * Run:
 *   cd apps/web && npx tsx --env-file=.env.local scripts/backfill-reel-recipe-all-tenants.mts
 *   cd apps/web && npx tsx --env-file=.env.local scripts/backfill-reel-recipe-all-tenants.mts --dry-run
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  reelRecipeToJson,
  resolveEffectiveReelMotionMode,
  seedReelRecipeForTemplate,
} from '../src/lib/reel-production-recipe';
import { preferCoverCanvaForReelArchetype } from '../src/lib/reel-canva-archetypes';

const DRY = process.argv.includes('--dry-run');
const PROD = 'https://smartagency-web.onrender.com';
const OUT = join(process.cwd(), '.preview-renders/reel-recipe-backfill');
mkdirSync(OUT, { recursive: true });

interface MissingRow {
  id: string;
  workspace_id: string;
  business_name: string;
  sector: string;
  catalog_slot_key: string | null;
  template_name: string;
  template_type: string | null;
  format: string;
  design_spec: Record<string, unknown>;
}

function loadMissingViaPython(): MissingRow[] {
  const py = `
import json, asyncio, os, urllib.request
from pathlib import Path
import asyncpg

key = os.environ.get('RENDER_API_KEY')
if not key:
  for p in [Path('.env.local'), Path('../.env.local')]:
    if p.exists():
      for line in p.read_text().splitlines():
        if line.startswith('RENDER_API_KEY='):
          key = line.split('=',1)[1].strip().strip('"').strip("'")
if not key:
  raise SystemExit('RENDER_API_KEY missing')

req = urllib.request.Request(
  'https://api.render.com/v1/postgres/dpg-d8gkt4f7f7vs73esgf00-a/connection-info',
  headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'},
)
with urllib.request.urlopen(req, timeout=30) as r:
  dsn = json.loads(r.read().decode())['externalConnectionString']

async def main():
  conn = await asyncpg.connect(dsn, ssl='require', timeout=45)
  rows = await conn.fetch('''
    SELECT t.id::text AS id,
           t.workspace_id::text AS workspace_id,
           coalesce(bc.business_name, '?') AS business_name,
           coalesce(nullif(bc.business_type,''), 'restaurant_cafe') AS sector,
           t.catalog_slot_key,
           t.template_name,
           t.template_type,
           t.format,
           t.design_spec
    FROM brand_design_templates t
    LEFT JOIN brand_contexts bc ON bc.workspace_id = t.workspace_id
    WHERE t.format = 'reel_cover'
      AND NOT (t.design_spec ? 'reel_recipe' OR t.design_spec ? 'reelRecipe')
    ORDER BY bc.business_name NULLS LAST, t.catalog_slot_key NULLS LAST, t.created_at
  ''')
  out = []
  for r in rows:
    spec = r['design_spec']
    if isinstance(spec, str):
      spec = json.loads(spec)
    out.append({
      'id': r['id'],
      'workspace_id': r['workspace_id'],
      'business_name': r['business_name'],
      'sector': r['sector'] or 'restaurant_cafe',
      'catalog_slot_key': r['catalog_slot_key'],
      'template_name': r['template_name'],
      'template_type': r['template_type'],
      'format': r['format'],
      'design_spec': spec or {},
    })
  await conn.close()
  print(json.dumps(out))

asyncio.run(main())
`;
  const res = spawnSync(
    join(process.cwd(), '../../backend/.venv/bin/python3'),
    ['-c', py],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: process.env,
    },
  );
  if (res.status !== 0) {
    // try absolute venv from repo root
    const res2 = spawnSync(
      '/Users/melihtasoglan/Desktop/smart-agency/backend/.venv/bin/python3',
      ['-c', py],
      {
        cwd: '/Users/melihtasoglan/Desktop/smart-agency/apps/web',
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        env: process.env,
      },
    );
    if (res2.status !== 0) {
      throw new Error(`python list failed: ${res.stderr || res2.stderr || res.error}`);
    }
    return JSON.parse(res2.stdout) as MissingRow[];
  }
  return JSON.parse(res.stdout) as MissingRow[];
}

async function patchTemplate(
  key: string,
  row: MissingRow,
  designSpec: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(
    `${PROD}/api/brand-context/${row.workspace_id}/design-templates/${row.id}`,
    {
      method: 'PATCH',
      headers: {
        'X-Internal-Api-Key': key,
        'X-Tenant-Id': row.workspace_id,
        'X-Office-Id': '00000000-0000-0000-0000-000000000001',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ design_spec: designSpec }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${row.id.slice(0, 8)} → ${res.status} ${text.slice(0, 200)}`);
  }
}

async function main() {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error('INTERNAL_API_KEY missing');
  if (!process.env.RENDER_API_KEY) throw new Error('RENDER_API_KEY missing');

  console.log(DRY ? '== DRY RUN ==' : '== BACKFILL reel_recipe (all tenants) ==');
  const missing = loadMissingViaPython();
  console.log(`missing reel_cover rows: ${missing.length}`);

  const report: Array<Record<string, unknown>> = [];
  let ok = 0;
  let fail = 0;

  for (const row of missing) {
    const sd = { ...(row.design_spec ?? {}) };
    const canva = typeof sd.canvaArchetypeId === 'string' ? sd.canvaArchetypeId : null;
    const headline = typeof sd.sampleHeadline === 'string'
      ? sd.sampleHeadline
      : row.template_name;
    const caption = typeof sd.sampleSubtitle === 'string' ? sd.sampleSubtitle : null;

    const recipe = seedReelRecipeForTemplate({
      catalogSlotKey: row.catalog_slot_key,
      templateType: row.template_type ?? 'reel_cover',
      canvaArchetypeId: canva,
      sector: row.sector,
      headline,
      caption,
    });
    const recipeJson = reelRecipeToJson(recipe);
    const preferredCover = recipe.reelArchetypeId
      ? preferCoverCanvaForReelArchetype(
          recipe.reelArchetypeId as Parameters<typeof preferCoverCanvaForReelArchetype>[0],
          canva,
        )
      : canva ?? undefined;

    const nextSpec = {
      ...sd,
      reel_recipe: recipeJson,
      ...(preferredCover && preferredCover !== canva
        ? { canvaArchetypeId: preferredCover, coverCanvaPreferred: preferredCover }
        : {}),
      reelRecipeSeededAt: new Date().toISOString(),
      reelRecipeSeedSource: 'backfill_all_tenants',
    };

    const entry = {
      workspace_id: row.workspace_id,
      brand: row.business_name,
      id: row.id,
      slot: row.catalog_slot_key,
      name: row.template_name,
      arch: recipe.reelArchetypeId,
      motion: resolveEffectiveReelMotionMode(recipe),
      edit: recipe.editStyle,
      dry: DRY,
    };

    try {
      if (!DRY) await patchTemplate(key, row, nextSpec);
      ok += 1;
      report.push({ ...entry, status: 'ok' });
      console.log(
        `✓ ${row.business_name.slice(0, 28).padEnd(28)} `
        + `${(row.catalog_slot_key ?? 'no_slot').slice(0, 42).padEnd(42)} `
        + `arch=${recipe.reelArchetypeId} mode=${resolveEffectiveReelMotionMode(recipe)}`,
      );
    } catch (err) {
      fail += 1;
      const msg = err instanceof Error ? err.message : String(err);
      report.push({ ...entry, status: 'fail', error: msg });
      console.error(`✗ ${row.business_name} ${row.id.slice(0, 8)}: ${msg}`);
    }
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify({
    at: new Date().toISOString(),
    dry: DRY,
    missing: missing.length,
    ok,
    fail,
    items: report,
  }, null, 2));

  console.log(`\n== DONE ok=${ok} fail=${fail} dry=${DRY} ==`);
  console.log(`Report: ${OUT}/report.json`);
  if (fail > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
