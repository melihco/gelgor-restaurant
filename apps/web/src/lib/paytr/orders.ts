/**
 * Pending PayTR checkout orders — Redis when available, in-memory fallback for local dev.
 */

import { getRedisClient } from '@/lib/redis-client';

export type PaytrOrderStatus = 'pending' | 'paid' | 'failed' | 'fulfilled';

export interface PaytrOrder {
  merchantOid: string;
  tenantId: string;
  packageSlug: string;
  amountTry: number;
  amountKurus: number;
  email: string;
  status: PaytrOrderStatus;
  createdAt: string;
  fulfilledAt?: string;
}

const MEMORY = new Map<string, PaytrOrder>();
const TTL_SEC = 60 * 60 * 24; // 24h
const KEY = (oid: string) => `paytr:order:${oid}`;

export async function savePaytrOrder(order: PaytrOrder): Promise<void> {
  MEMORY.set(order.merchantOid, order);
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(KEY(order.merchantOid), JSON.stringify(order), 'EX', TTL_SEC);
  } catch (err) {
    console.warn('[paytr/orders] redis save failed:', err);
  }
}

export async function getPaytrOrder(merchantOid: string): Promise<PaytrOrder | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(KEY(merchantOid));
      if (raw) {
        const parsed = JSON.parse(raw) as PaytrOrder;
        MEMORY.set(merchantOid, parsed);
        return parsed;
      }
    } catch (err) {
      console.warn('[paytr/orders] redis get failed:', err);
    }
  }
  return MEMORY.get(merchantOid) ?? null;
}

export async function updatePaytrOrder(
  merchantOid: string,
  patch: Partial<PaytrOrder>,
): Promise<PaytrOrder | null> {
  const current = await getPaytrOrder(merchantOid);
  if (!current) return null;
  const next = { ...current, ...patch };
  await savePaytrOrder(next);
  return next;
}

/** Alphanumeric merchant_oid ≤ 64 chars (PayTR constraint). */
export function createMerchantOid(packageSlug: string): string {
  const slug = packageSlug.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'plan';
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `SA${ts}${slug}${rand}`.slice(0, 64);
}
