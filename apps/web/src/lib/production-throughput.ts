/**
 * Production throughput — factory drain batch + Remotion admission control.
 *
 * Env overrides (operator ceiling):
 *   PRODUCTION_FACTORY_DRAIN_BATCH=1   (1–5, Python factory reads same var)
 *   REMOTION_MAX_CONCURRENT_RENDERS=2  (1–3)
 *   REMOTION_RENDER_CONCURRENCY=2      (per-render ffmpeg/cpu threads)
 *
 * Per-brand overrides live on brand_theme.production_engines.throughput.
 */
import { cpus } from 'os';

export interface BrandProductionThroughputConfig {
  /** Slots claimed per factory drain / auto-produce backfill batch (1–5). */
  factory_drain_batch?: number;
  /** Parallel Remotion renders allowed on this host (1–2 recommended). */
  remotion_max_concurrent?: number;
}

function readThroughputFromTheme(
  theme: Record<string, unknown> | null | undefined,
): BrandProductionThroughputConfig {
  const engines = (theme?.production_engines ?? theme?.productionEngines) as
    Record<string, unknown> | undefined;
  const raw = engines?.throughput;
  if (!raw || typeof raw !== 'object') return {};
  const t = raw as BrandProductionThroughputConfig;
  return {
    factory_drain_batch: t.factory_drain_batch,
    remotion_max_concurrent: t.remotion_max_concurrent,
  };
}

export function resolveFactoryDrainBatch(
  theme?: Record<string, unknown> | null,
): number {
  const brandBatch = readThroughputFromTheme(theme).factory_drain_batch;
  const fromEnv = Number.parseInt(process.env.PRODUCTION_FACTORY_DRAIN_BATCH ?? '', 10);
  const base = Number.isFinite(brandBatch) && brandBatch! > 0
    ? brandBatch!
    : Number.isFinite(fromEnv) && fromEnv > 0
      ? fromEnv
      : 1;
  return Math.max(1, Math.min(Math.floor(base), 5));
}

export function resolveRemotionMaxConcurrentRenders(
  theme?: Record<string, unknown> | null,
): number {
  const brandMax = readThroughputFromTheme(theme).remotion_max_concurrent;
  const fromEnv = Number.parseInt(process.env.REMOTION_MAX_CONCURRENT_RENDERS ?? '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.max(1, Math.min(fromEnv, 3));
  }
  if (Number.isFinite(brandMax) && brandMax! > 0) {
    return Math.max(1, Math.min(Math.floor(brandMax!), 3));
  }
  const coreCount = cpus()?.length ?? 4;
  return coreCount >= 8 ? 2 : 1;
}

/** Per-render CPU concurrency — lower when multiple renders run in parallel. */
export function resolveRemotionRenderConcurrency(maxConcurrent: number): number {
  const fromEnv = Number.parseInt(process.env.REMOTION_RENDER_CONCURRENCY ?? '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  const cores = cpus()?.length ?? 4;
  if (maxConcurrent >= 2) {
    return Math.max(1, Math.floor(cores / 3));
  }
  return Math.max(1, Math.floor(cores / 2));
}

export const DEFAULT_THROUGHPUT: BrandProductionThroughputConfig = {
  factory_drain_batch: 1,
  remotion_max_concurrent: 2,
};
