/**
 * Force re-analyze Karaman (or any) brand gallery with the latest vision schema
 * (primary_subject, subject_aliases, subject_family, visible_label_text).
 *
 * Usage:
 *   INTERNAL_API_KEY=... npx tsx apps/web/scripts/karaman-gallery-reanalyze.mts
 *   NEXTJS_INTERNAL_URL=https://smartagency-web.onrender.com  (default)
 *   KARAMAN_WORKSPACE_ID=327db521-...  (default: Karaman Datça)
 */
const WS = process.env.KARAMAN_WORKSPACE_ID ?? '327db521-ede2-48e0-8f06-4146ee458c50';
const WEB = (process.env.NEXTJS_INTERNAL_URL ?? 'https://smartagency-web.onrender.com').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY ?? '';

const HDRS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Internal-Api-Key': KEY,
  'X-Tenant-Id': WS,
};

if (!KEY) {
  console.error('INTERNAL_API_KEY required');
  process.exit(1);
}

interface CoverageResult {
  tenantId?: string;
  usable?: number;
  alreadyAnalyzed?: number;
  batchSize?: number;
  newlyAnalyzed?: number;
  remaining?: number;
  complete?: boolean;
  errors?: { url: string; error: string }[];
  error?: string;
}

async function runCoverageBatch(round: number, maxImages: number): Promise<CoverageResult> {
  const url = `${WEB}/api/gallery-intelligence/${WS}/analyze-coverage`;
  console.log(`\n[round ${round}] POST ${url} (forceReanalyze, maxImages=${maxImages})`);
  const res = await fetch(url, {
    method: 'POST',
    headers: HDRS,
    body: JSON.stringify({
      forceReanalyze: true,
      maxImages,
      tier: 'standard',
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  let data: CoverageResult;
  try {
    data = JSON.parse(text) as CoverageResult;
  } catch {
    console.error('Invalid JSON:', text.slice(0, 400));
    process.exit(1);
  }
  if (!res.ok) {
    console.error('analyze-coverage failed', res.status, data);
    process.exit(1);
  }
  console.log(
    `  usable=${data.usable} batch=${data.batchSize} saved=${data.newlyAnalyzed} ` +
    `remaining=${data.remaining} complete=${data.complete}`,
  );
  if (data.errors?.length) {
    for (const e of data.errors.slice(0, 5)) {
      console.warn(`  error: ${e.url.slice(0, 60)} — ${e.error.slice(0, 80)}`);
    }
  }
  return data;
}

// Run in batches until all photos are re-analyzed.
let round = 0;
let complete = false;
while (!complete && round < 10) {
  round += 1;
  const result = await runCoverageBatch(round, 30);
  complete = result.complete === true || (result.remaining ?? 0) === 0;
  if ((result.newlyAnalyzed ?? 0) === 0 && (result.remaining ?? 0) > 0) {
    console.error('No progress — aborting');
    process.exit(1);
  }
}

// Fetch persisted analysis and print subject summary.
const galleryRes = await fetch(`${WEB}/api/brand-context/${WS}/gallery-analysis`, { headers: HDRS });
if (!galleryRes.ok) {
  console.error('gallery-analysis fetch failed', galleryRes.status, await galleryRes.text());
  process.exit(1);
}
const gallery = await galleryRes.json() as Record<string, Record<string, unknown>>;
const entries = Object.entries(gallery);
console.log(`\n--- gallery subject summary (${entries.length} photos) ---`);
for (const [url, meta] of entries) {
  const ps = meta.primarySubject ?? meta.primary_subject ?? '—';
  const fam = meta.subjectFamily ?? meta.subject_family ?? '—';
  const aliases = meta.subjectAliases ?? meta.subject_aliases;
  const aliasStr = Array.isArray(aliases) && aliases.length ? aliases.join(',') : '—';
  const label = meta.visibleLabelText ?? meta.visible_label_text ?? '';
  const short = url.split('/').pop()?.slice(0, 40) ?? url.slice(0, 40);
  console.log(`${short}`);
  console.log(`  primary=${ps} family=${fam} aliases=${aliasStr}${label ? ` label="${String(label).slice(0, 40)}"` : ''}`);
}
console.log('\nDone.');
