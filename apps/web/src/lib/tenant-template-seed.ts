/**
 * Deterministic per-tenant seeds — aynı sektördeki markalar farklı template setleri alır.
 */
export function hashTenantSeed(tenantId: string, salt = ''): number {
  let h = 2_166_136_261;
  const s = `${tenantId.trim().toLowerCase()}:${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 1_677_761_9);
  }
  return Math.abs(h >>> 0);
}

export function tenantSlotSeed(tenantId: string | undefined, slot: number): number {
  if (!tenantId?.trim()) return slot - 1;
  return hashTenantSeed(tenantId, `slot_${slot}`);
}

export function tenantKitSeed(tenantId: string | undefined): number {
  if (!tenantId?.trim()) return 0;
  return hashTenantSeed(tenantId, 'kit');
}

export function pickFromPool<T>(pool: T[], tenantId: string | undefined, salt: string, fallbackIndex = 0): T {
  if (!pool.length) throw new Error('pickFromPool: empty pool');
  const seed = tenantId?.trim() ? hashTenantSeed(tenantId, salt) : fallbackIndex;
  return pool[seed % pool.length]!;
}
