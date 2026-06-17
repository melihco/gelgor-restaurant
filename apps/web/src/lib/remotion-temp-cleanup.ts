/**
 * Remotion bundler copies public/ into os.tmpdir() (~700MB per bundle).
 * Dev hot-reload invalidates the in-memory cache → orphaned bundles fill the disk.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const REMOTION_TEMP_PREFIXES = [
  'remotion-webpack-bundle-',
  'remotion-v4.0.',
] as const;

let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

export function removeRemotionBundleDir(bundleUrl: string | null | undefined): void {
  if (!bundleUrl?.includes('remotion-webpack-bundle')) return;
  try {
    if (fs.existsSync(bundleUrl)) {
      fs.rmSync(bundleUrl, { recursive: true, force: true });
    }
  } catch {
    /* best-effort */
  }
}

/** Drop stale Remotion temp dirs; keep the active bundle path if provided. */
export function pruneStaleRemotionTempDirs(opts?: {
  keepPath?: string | null;
  maxAgeMs?: number;
  force?: boolean;
}): { removed: number; freedEstimate: number } {
  const now = Date.now();
  if (!opts?.force && now - lastPruneAt < PRUNE_INTERVAL_MS) {
    return { removed: 0, freedEstimate: 0 };
  }
  lastPruneAt = now;

  const tmp = os.tmpdir();
  const keepResolved = opts?.keepPath ? path.resolve(opts.keepPath) : null;
  const maxAgeMs = opts?.maxAgeMs ?? 30 * 60 * 1000;
  let removed = 0;

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(tmp);
  } catch {
    return { removed: 0, freedEstimate: 0 };
  }

  for (const name of entries) {
    if (!REMOTION_TEMP_PREFIXES.some((p) => name.startsWith(p))) continue;
    const full = path.join(tmp, name);
    if (keepResolved && path.resolve(full) === keepResolved) continue;
    try {
      const stat = fs.statSync(full);
      const age = now - stat.mtimeMs;
      if (age < maxAgeMs && !opts?.force) continue;
      fs.rmSync(full, { recursive: true, force: true });
      removed += 1;
    } catch {
      /* skip locked dirs */
    }
  }

  return { removed, freedEstimate: removed * 700 * 1024 * 1024 };
}
