import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function backendRoot(): string {
  const cwd = process.cwd();
  // next dev cwd: apps/web → repo/backend
  const candidates = [
    path.join(cwd, '..', '..', 'backend'),
    path.join(cwd, '..', 'backend'),
    path.join(cwd, 'backend'),
  ];
  for (const p of candidates) {
    try {
      const fs = require('node:fs') as typeof import('node:fs');
      if (fs.existsSync(path.join(p, 'app', 'database.py'))) return p;
    } catch {
      /* continue */
    }
  }
  return path.join(cwd, '..', '..', 'backend');
}

/**
 * Read brand_contexts row when Python HTTP is hung/unreachable (dev fallback).
 * Uses backend venv + SQLAlchemy — same DB as Crew service.
 */
export async function readBrandContextFromDb(
  workspaceId: string,
): Promise<Record<string, unknown> | null> {
  const root = backendRoot();
  const pyBin = path.join(root, '.venv', 'bin', 'python');
  const code = `
import asyncio, json, sys, uuid, logging
logging.basicConfig(level=logging.ERROR)
from sqlalchemy import text
from app.database import async_session_factory

COLS = (
    "business_name, business_type, location, description, brand_tone, "
    "target_audience, campaign_goals, visual_style, logo_url, website_url, "
    "instagram_handle, google_business_url, content_pillars, default_ctas, "
    "brand_primary_color, brand_accent_color, brand_font_family, competitors, "
    "website_summary, reference_image_urls, brand_constitution_confirmed_at, "
    "languages, visual_dna, discovery_confidence, gallery_analysis, brand_dna, "
    "brand_theme"
)

async def main():
    wid = uuid.UUID(sys.argv[1])
    async with async_session_factory() as db:
        r = await db.execute(
            text("SELECT " + COLS + " FROM brand_contexts WHERE workspace_id = :w"),
            {"w": wid},
        )
        row = r.mappings().first()
        if not row:
            print("{}")
            return
        out = dict(row)
        for k, v in list(out.items()):
            if hasattr(v, "isoformat"):
                out[k] = v.isoformat()
        print(json.dumps(out, ensure_ascii=False))

asyncio.run(main())
`;

  try {
    const { stdout } = await execFileAsync(pyBin, ['-c', code, workspaceId], {
      cwd: root,
      timeout: 20_000,
      maxBuffer: 4_000_000,
      env: { ...process.env, PYTHONPATH: root },
    });
    const lines = stdout.trim().split('\n').filter((l) => l.startsWith('{'));
    const jsonLine = lines[lines.length - 1] ?? '';
    if (!jsonLine || jsonLine === '{}') return null;
    return JSON.parse(jsonLine) as Record<string, unknown>;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[brand-context-db-fallback]', err);
    }
    return null;
  }
}
