import { serverConfig } from '@/lib/server-config';
import type { PaytrOrder } from './orders';
import { updatePaytrOrder } from './orders';

/** Activate package on Nexus after PayTR success (idempotent via merchant_oid). */
export async function fulfillPaidOrder(order: PaytrOrder): Promise<void> {
  if (order.status === 'fulfilled') return;

  const base = serverConfig.nexus.baseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/packages/activate-paid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Api-Key': serverConfig.internal.apiKey,
      'X-Tenant-Id': order.tenantId,
    },
    body: JSON.stringify({
      tenantId: order.tenantId,
      packageSlug: order.packageSlug,
      merchantOid: order.merchantOid,
      amountTry: order.amountTry,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `[paytr/fulfill] activate-paid ${res.status}: ${text.slice(0, 300)}`,
    );
  }

  await updatePaytrOrder(order.merchantOid, {
    status: 'fulfilled',
    fulfilledAt: new Date().toISOString(),
  });
}
