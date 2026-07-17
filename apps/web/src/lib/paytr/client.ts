import { getPaytrConfig } from './config';
import { buildPaytrTokenHash } from './hash';

export interface PaytrIframeTokenInput {
  userIp: string;
  merchantOid: string;
  email: string;
  /** Amount in TRY (e.g. 4992) */
  amountTry: number;
  /** Basket line label shown in PayTR */
  productName: string;
  userName: string;
  userAddress?: string;
  userPhone?: string;
}

export interface PaytrIframeTokenResult {
  token: string;
  merchantOid: string;
  paymentAmountKurus: string;
}

function tryToKurus(amountTry: number): string {
  return String(Math.round(amountTry * 100));
}

export async function requestPaytrIframeToken(
  input: PaytrIframeTokenInput,
): Promise<PaytrIframeTokenResult> {
  const cfg = getPaytrConfig();
  const paymentAmount = tryToKurus(input.amountTry);
  const currency = 'TL';
  const noInstallment = '0';
  const maxInstallment = '0';
  const testMode = cfg.testMode ? '1' : '0';

  const basketJson = JSON.stringify([
    [input.productName, input.amountTry.toFixed(2), 1],
  ]);
  const userBasket = Buffer.from(basketJson, 'utf8').toString('base64');

  const paytrToken = buildPaytrTokenHash(
    {
      merchantId: cfg.merchantId,
      userIp: input.userIp,
      merchantOid: input.merchantOid,
      email: input.email,
      paymentAmount,
      userBasket,
      noInstallment,
      maxInstallment,
      currency,
      testMode,
    },
    cfg.merchantKey,
    cfg.merchantSalt,
  );

  const merchantOkUrl =
    process.env.PAYTR_MERCHANT_OK_URL?.trim() ||
    `${cfg.publicBaseUrl}/api/paytr/return?result=ok`;
  const merchantFailUrl =
    process.env.PAYTR_MERCHANT_FAIL_URL?.trim() ||
    `${cfg.publicBaseUrl}/api/paytr/return?result=fail`;

  const body = new URLSearchParams({
    merchant_id: cfg.merchantId,
    user_ip: input.userIp,
    merchant_oid: input.merchantOid,
    email: input.email,
    payment_amount: paymentAmount,
    paytr_token: paytrToken,
    user_basket: userBasket,
    debug_on: cfg.debugOn ? '1' : '0',
    no_installment: noInstallment,
    max_installment: maxInstallment,
    user_name: input.userName.slice(0, 60) || 'Musteri',
    user_address: (input.userAddress || 'Turkiye').slice(0, 400),
    user_phone: (input.userPhone || '05000000000').replace(/\D/g, '').slice(0, 20) || '05000000000',
    merchant_ok_url: merchantOkUrl,
    merchant_fail_url: merchantFailUrl,
    timeout_limit: '30',
    currency,
    test_mode: testMode,
    lang: 'tr',
  });

  const res = await fetch('https://www.paytr.com/odeme/api/get-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  let data: { status?: string; reason?: string; token?: string };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error(`[paytr] get-token non-JSON response: ${text.slice(0, 200)}`);
  }

  if (data.status !== 'success' || !data.token) {
    throw new Error(`[paytr] get-token failed: ${data.reason ?? text.slice(0, 200)}`);
  }

  return {
    token: data.token,
    merchantOid: input.merchantOid,
    paymentAmountKurus: paymentAmount,
  };
}
