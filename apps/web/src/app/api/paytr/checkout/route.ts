import { NextRequest, NextResponse } from 'next/server';
import { getPlanSpec, isSellablePackageSlug } from '@/lib/package-plan-config';
import { isPaytrEnabled } from '@/lib/paytr/config';
import { requestPaytrIframeToken } from '@/lib/paytr/client';
import { createMerchantOid, savePaytrOrder } from '@/lib/paytr/orders';
import { hasRedis } from '@/lib/redis-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return '127.0.0.1';
}

/**
 * Start PayTR iFrame checkout for a monthly package plan.
 * Body: { packageSlug, email?, userName?, userPhone? }
 * Headers: X-Tenant-Id (required)
 */
export async function POST(req: NextRequest) {
  if (!isPaytrEnabled()) {
    return NextResponse.json(
      { error: 'paytr_disabled', message: 'Ödeme şu an yapılandırılmamış.' },
      { status: 503 },
    );
  }

  const tenantId =
    req.headers.get('X-Tenant-Id')?.trim() ||
    req.headers.get('x-tenant-id')?.trim();
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_required' }, { status: 400 });
  }

  let body: {
    packageSlug?: string;
    email?: string;
    userName?: string;
    userPhone?: string;
    userAddress?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const slug = (body.packageSlug ?? '').trim().toLowerCase();
  if (!isSellablePackageSlug(slug)) {
    return NextResponse.json(
      { error: 'package_not_sellable', message: 'Bu plan artık satışta değil.' },
      { status: 400 },
    );
  }
  const plan = getPlanSpec(slug);
  if (!plan || plan.monthlyPriceTry <= 0) {
    return NextResponse.json({ error: 'unknown_package' }, { status: 400 });
  }

  const email = (body.email ?? '').trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json(
      { error: 'email_required', message: 'Ödeme için geçerli e-posta gerekli.' },
      { status: 400 },
    );
  }

  if (process.env.NODE_ENV === 'production' && !hasRedis()) {
    console.warn(
      '[paytr/checkout] REDIS_URL missing — pending orders are in-memory only; callbacks may fail across instances',
    );
  }

  const merchantOid = createMerchantOid(plan.slug);
  const userName = (body.userName ?? email.split('@')[0] ?? 'Musteri').slice(0, 60);

  try {
    await savePaytrOrder({
      merchantOid,
      tenantId,
      packageSlug: plan.slug,
      amountTry: plan.monthlyPriceTry,
      amountKurus: Math.round(plan.monthlyPriceTry * 100),
      email,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    const tokenResult = await requestPaytrIframeToken({
      userIp: clientIp(req),
      merchantOid,
      email,
      amountTry: plan.monthlyPriceTry,
      productName: `Smart Agency ${plan.name} — aylık plan`,
      userName,
      userPhone: body.userPhone,
      userAddress: body.userAddress,
    });

    return NextResponse.json({
      iframeToken: tokenResult.token,
      merchantOid: tokenResult.merchantOid,
      amountTry: plan.monthlyPriceTry,
      packageSlug: plan.slug,
      packageName: plan.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[paytr/checkout]', message);
    return NextResponse.json(
      { error: 'checkout_failed', message: 'Ödeme oturumu açılamadı. Lütfen tekrar deneyin.' },
      { status: 502 },
    );
  }
}
