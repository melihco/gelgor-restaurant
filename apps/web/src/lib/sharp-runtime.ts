/**
 * Shared sharp instance tuned for small single-CPU containers (Render standard).
 *
 * Output bytes are IDENTICAL to plain `import sharp from 'sharp'` — only thread
 * count and cache behavior change:
 *
 * - concurrency: libvips defaults to one thread per core; on a 1 vCPU box the
 *   extra threads only contend with the Next.js event loop while production
 *   composites run, starving health checks (`/api/health/live` timeout → Render
 *   restart → 502). Capped at min(cores, 2); override with SHARP_CONCURRENCY.
 * - cache(false): the operation cache keeps decoded images in RSS between
 *   unrelated productions. Every pipeline here processes unique buffers, so the
 *   cache only inflates memory (~50MB+) without hits.
 */
import os from 'node:os';
import sharp from 'sharp';

const requested = Number(process.env.SHARP_CONCURRENCY ?? '');
const threads = Number.isFinite(requested) && requested > 0
  ? Math.floor(requested)
  : Math.max(1, Math.min(os.cpus().length, 2));

sharp.concurrency(threads);
sharp.cache(false);

export default sharp;
