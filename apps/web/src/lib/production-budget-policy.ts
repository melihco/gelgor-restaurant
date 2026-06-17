/**
 * Günlük auto-produce kota politikası.
 * Varsayılan: kapalı (pilot / dev). Limite almak için env'de explicit false verin.
 */
export function isProductionLimitsBypassed(): boolean {
  const pub = process.env.NEXT_PUBLIC_AUTO_PRODUCE_BYPASS_LIMITS;
  const priv = process.env.AUTO_PRODUCE_BYPASS_LIMITS;
  if (pub === 'false' || priv === 'false') return false;
  return true;
}
