import { createHmac } from 'node:crypto';

/** PayTR iFrame get-token hash (HMAC-SHA256 → base64). */
export function buildPaytrTokenHash(
  parts: {
    merchantId: string;
    userIp: string;
    merchantOid: string;
    email: string;
    paymentAmount: string;
    userBasket: string;
    noInstallment: string;
    maxInstallment: string;
    currency: string;
    testMode: string;
  },
  merchantKey: string,
  merchantSalt: string,
): string {
  const hashStr =
    parts.merchantId +
    parts.userIp +
    parts.merchantOid +
    parts.email +
    parts.paymentAmount +
    parts.userBasket +
    parts.noInstallment +
    parts.maxInstallment +
    parts.currency +
    parts.testMode;
  return createHmac('sha256', merchantKey)
    .update(hashStr + merchantSalt)
    .digest('base64');
}

/** PayTR notification callback hash check. */
export function verifyPaytrCallbackHash(
  body: {
    merchant_oid: string;
    status: string;
    total_amount: string;
    hash: string;
  },
  merchantKey: string,
  merchantSalt: string,
): boolean {
  const expected = createHmac('sha256', merchantKey)
    .update(body.merchant_oid + merchantSalt + body.status + body.total_amount)
    .digest('base64');
  return expected === body.hash;
}
