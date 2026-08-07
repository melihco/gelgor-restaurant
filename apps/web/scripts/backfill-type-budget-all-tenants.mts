/**
 * Backfill design_spec.type_budget on templates missing it (all tenants).
 * Infers from sampleHeadline → source: migrated_from_sample.
 * Never overwrites operator (or any existing) type_budget. Recipe-only — no image regen.
 *
 * Run:
 *   cd apps/web && npx tsx --env-file=.env.local scripts/backfill-type-budget-all-tenants.mts --dry-run
 *   cd apps/web && npx tsx --env-file=.env.local scripts/backfill-type-budget-all-tenants.mts
 *   cd apps/web && npx tsx --env-file=.env.local scripts/backfill-type-budget-all-tenants.mts --workspace=<uuid>
 *
 * Optional:
 *   BACKFILL_BASE_URL=https://smartagency-web.onrender.com  (default)
 *   DATABASE_URL=...  (local/crew postgres; skips Render API lookup)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { planTypeBudgetBackfill } from '../src/lib/template-type-budget';

const DRY = process.argv.includes('--dry-run');
const workspaceArg = process.argv.find((a) => a.startsWith('--workspace='));
const WORKSPACE_FILTER = workspaceArg ? workspaceArg.slice('--workspace='.length).trim() : '';
const BASE = (process.env.BACKFILL_BASE_URL || 'https://smartagency-web.onrender.com').replace(/\/$/, '');
const OUT = join(process.cwd(), '.preview-renders/type-budget-backfill');
mkdirSync(OUT, { recursive: true });

interface CandidateRow {
  id: string;
  workspace_id: string;
  business_name: string;
  sector: string;
  catalog_slot_key: string | null;
  template_name: string;
  format: string;
  design_spec: Record<string, unknown>;
}

function pythonBin(): string {
  const candidates = [
    join(process.cwd(), '../../backend/.venv/bin/python3'),
    '/Users/melihtasoglan/Desktop/smart-agency/backend/.venv/bin/python3',
    'python3',
  ];
  for (const bin of candidates) {
    const probe = spawnSync(bin, ['-c', 'import asyncpg'], { encoding: 'utf8' });
    if (probe.status === 0) return bin;
  }
  return candidates[0]!;
}

function loadCandidatesViaPython(): CandidateRow[] {
  const workspaceFilter = WORKSPACE_FILTER
    ? JSON.stringify(WORKSPACE_FILTER)
    : 'None';
  const py = `
import json, asyncio, os, urllib.request
from pathlib import Path
import asyncpg

workspace_filter = ${workspaceFilter}
dsn = os.environ.get('DATABASE_URL') or os.environ.get('CREW_DATABASE_URL')
if not dsn:
  key = os.environ.get('RENDER_API_KEY')
  if not key:
    for p in [Path('.env.local'), Path('../.env.local'), Path('../../.env.local')]:
      if p.exists():
        for line in p.read_text().splitlines():
          if line.startswith('RENDER_API_KEY='):
            key = line.split('=',1)[1].strip().strip('"').strip("'")
  if not key:
    raise SystemExit('DATABASE_URL or RENDER_API_KEY missing')
  req = urllib.request.Request(
    'https://api.render.com/v1/postgres/dpg-d8gkt4f7f7vs73esgf00-a/connection-info',
    headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'},
  )
  with urllib.request.urlopen(req, timeout=30) as r:
    dsn = json.loads(r.read().decode())['externalConnectionString']

async def main():
  dsn_l = (dsn or '').lower()
  use_ssl = (
    'render.com' in dsn_l
    or 'amazonaws.com' in dsn_l
    or 'neon.tech' in dsn_l
    or os.environ.get('DATABASE_SSL') == 'require'
  )
  conn = await asyncpg.connect(dsn, ssl='require' if use_ssl else None, timeout=45)
  rows = await conn.fetch('''
    SELECT t.id::text AS id,
           t.workspace_id::text AS workspace_id,
           coalesce(bc.business_name, '?') AS business_name,
           coalesce(nullif(bc.business_type,''), 'restaurant_cafe') AS sector,
           t.catalog_slot_key,
           t.template_name,
           t.format,
           t.design_spec
    FROM brand_design_templates t
    LEFT JOIN brand_contexts bc ON bc.workspace_id = t.workspace_id
    WHERE NOT (t.design_spec ? 'type_budget' OR t.design_spec ? 'typeBudget')
      AND ($1::text IS NULL OR t.workspace_id::text = $1)
    ORDER BY bc.business_name NULLS LAST, t.catalog_slot_key NULLS LAST, t.created_at
  ''', workspace_filter)
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
      'format': r['format'],
      'design_spec': spec or {},
    })
  await conn.close()
  print(json.dumps(out))

asyncio.run(main())
`;
  const bin = pythonBin();
  const res = spawnSync(bin, ['-c', py], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`python list failed: ${res.stderr || res.stdout || res.error}`);
  }
  const stdout = (res.stdout || '').trim();
  const jsonLine = stdout.split('\n').filter((l) => l.startsWith('[')).pop() || stdout;
  return JSON.parse(jsonLine) as CandidateRow[];
}

async function patchTemplate(
  key: string,
  row: CandidateRow,
  designSpec: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(
    `${BASE}/api/brand-context/${row.workspace_id}/design-templates/${row.id}`,
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
  if (!key && !DRY) throw new Error('INTERNAL_API_KEY missing (required unless --dry-run)');

  console.log(DRY ? '== DRY RUN type_budget backfill ==' : `== BACKFILL type_budget → ${BASE} ==`);
  if (WORKSPACE_FILTER) console.log(`workspace filter: ${WORKSPACE_FILTER}`);

  const candidates = loadCandidatesViaPython();
  console.log(`candidates (missing type_budget key): ${candidates.length}`);

  const report: Array<Record<string, unknown>> = [];
  let patch = 0;
  let skip = 0;
  let fail = 0;

  for (const row of candidates) {
    const plan = planTypeBudgetBackfill({
      designSpec: row.design_spec,
      fallbackHeadline: row.template_name,
    });
    const entry = {
      workspace_id: row.workspace_id,
      brand: row.business_name,
      sector: row.sector,
      id: row.id,
      slot: row.catalog_slot_key,
      name: row.template_name,
      format: row.format,
      dry: DRY,
    };

    if (plan.action === 'skip') {
      skip += 1;
      report.push({ ...entry, status: 'skip', reason: plan.reason });
      continue;
    }

    try {
      if (!DRY) {
        if (!key) throw new Error('INTERNAL_API_KEY missing');
        await patchTemplate(key, row, plan.nextSpec);
      }
      patch += 1;
      report.push({
        ...entry,
        status: 'ok',
        budget: plan.typeBudget,
      });
      console.log(
        `✓ ${row.business_name.slice(0, 24).padEnd(24)} `
        + `${(row.catalog_slot_key ?? row.format).slice(0, 40).padEnd(40)} `
        + `${plan.typeBudget.headline.maxWords}w/${plan.typeBudget.headline.maxChars}c`,
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
    base: BASE,
    workspaceFilter: WORKSPACE_FILTER || null,
    candidates: candidates.length,
    patch,
    skip,
    fail,
    items: report,
  }, null, 2));

  console.log(`\n== DONE patch=${patch} skip=${skip} fail=${fail} dry=${DRY} ==`);
  console.log(`Report: ${OUT}/report.json`);
  if (fail > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
