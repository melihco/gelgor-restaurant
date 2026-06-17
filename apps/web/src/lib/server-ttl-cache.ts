/**
 * Lightweight server-side in-process TTL cache.
 *
 * Lives in Node.js module scope — persists across requests in the same
 * Next.js worker process. Safe for API route handlers; NOT for edge runtime.
 *
 * Usage:
 *   const brsCache = new ServerTtlCache<BrandReadinessResult>(180_000); // 3 min
 *   const cached = brsCache.get(tenantId);
 *   if (cached) return NextResponse.json(cached);
 *   const fresh = await computeExpensive();
 *   brsCache.set(tenantId, fresh);
 *   return NextResponse.json(fresh);
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class ServerTtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
    // Prune stale entries every 5 minutes to prevent unbounded memory growth.
    if (typeof setInterval !== 'undefined') {
      this.pruneTimer = setInterval(() => this.prune(), 5 * 60_000);
      // Don't keep the Node.js process alive just for pruning.
      if (this.pruneTimer && typeof this.pruneTimer === 'object' && 'unref' in this.pruneTimer) {
        (this.pruneTimer as NodeJS.Timeout).unref();
      }
    }
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.ttlMs),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Evict all entries matching a prefix — call after mutations. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

/** Shared cache instances — one per route family. */
export const brsCache   = new ServerTtlCache<unknown>(180_000); // brand-readiness: 3 min
export const basCache   = new ServerTtlCache<unknown>(120_000); // brand-alignment: 2 min
export const gisCache   = new ServerTtlCache<unknown>(300_000); // gallery-intelligence: 5 min
export const ccsCache   = new ServerTtlCache<unknown>(300_000); // context-signals: 5 min
