import { NextRequest, NextResponse } from 'next/server';
import { getPaytrConfig, isPaytrConfigured } from '@/lib/paytr/config';
import { verifyPaytrCallbackHash } from '@/lib/paytr/hash';
import { getPaytrOrder, updatePaytrOrder } from '@/lib/paytr/orders';
import { fulfillPaidOrder } from '@/lib/paytr/fulfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PayTR server-to-server notification (STEP 2).
 * Must respond with plain text "OK" on success.
 */
export async function POST(req: NextRequest) {
  if (!isPaytrConfigured()) {
    return new NextResponse('PAYTR not configured', { status: 503 });
  }

  const cfg = getPaytrConfig();
  const form = await req.formData();
  const merchantOid = String(form.get('merchant_oid') ?? '');
  const status = String(form.get('status') ?? '');
  const totalAmount = String(form.get('total_amount') ?? '');
  const hash = String(form.get('hash') ?? '');

  if (!merchantOid || !status || !totalAmount || !hash) {
    return new NextResponse('PAYTR notification failed: missing fields', { status: 400 });
  }

  const ok = verifyPaytrCallbackHash(
    { merchant_oid: merchantOid, status, total_amount: totalAmount, hash },
    cfg.merchantKey,
    cfg.merchantSalt,
  );
  if (!ok) {
    console.error('[paytr/callback] bad hash', merchantOid);
    return new NextResponse('PAYTR notification failed: bad hash', { status: 400 });
  }

  const order = await getPaytrOrder(merchantOid);
  if (!order) {
    // Still ACK so PayTR stops retrying unknown/expired local orders in test.
    console.warn('[paytr/callback] unknown merchant_oid', merchantOid);
    return new NextResponse('OK');
  }

  if (order.status === 'fulfilled') {
    return new NextResponse('OK');
  }

  if (status === 'success') {
    await updatePaytrOrder(merchantOid, { status: 'paid' });
    try {
      const paid = (await getPaytrOrder(merchantOid)) ?? { ...order, status: 'paid' as const };
      await fulfillPaidOrder(paid);
    } catch (err) {
      console.error('[paytr/callback] fulfill failed', err);
      // Do not ACK — PayTR will retry; order stays paid for retry.
      return new NextResponse('fulfill_failed', { status: 500 });
    }
  } else {
    await updatePaytrOrder(merchantOid, { status: 'failed' });
  }

  return new NextResponse('OK');
}
