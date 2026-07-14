import { DEFAULT_SITE_URL, SITE_NAME } from './site-metadata';

export type AppReferralShareContext = {
  /** Tenant / brand display name — personalizes invite copy for every brand. */
  brandName?: string;
  inviterName?: string;
};

/** Public mobile entry — works for all tenants (no hardcoded brand UUIDs). */
export function resolveAppReferralUrl(): string {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL?.trim()) ||
    (typeof window !== 'undefined' ? window.location.origin : '') ||
    DEFAULT_SITE_URL;
  const base = raw.replace(/\/$/, '');
  return `${base}/mobile`;
}

/** Ready-to-send invite — WhatsApp, SMS, X, system share sheet. */
export function buildAppReferralShareMessage(ctx: AppReferralShareContext = {}): string {
  const brand = ctx.brandName?.trim();
  const inviter = ctx.inviterName?.trim();
  const url = resolveAppReferralUrl();
  const opener = inviter
    ? `Merhaba! Ben ${inviter}.`
    : 'Merhaba!';

  if (brand) {
    return (
      `${opener} ${brand} artık ${SITE_NAME} ile sosyal medyasını yapay zeka ekibiyle yönetiyor — ` +
      `içerik üretimi, story/reel ve yayın planı tek uygulamada.\n\n` +
      `Sen de markanı tanıt, AI ekibini aktive et:\n${url}\n\n` +
      `#SmartAgency`
    );
  }

  return (
    `${opener} Sosyal medya içeriklerimi ${SITE_NAME} ile yapay zeka ekibiyle üretiyorum — ` +
    `marka analizi, story/reel ve otomatik yayın planı harika.\n\n` +
    `Uygulamayı dene:\n${url}\n\n` +
    `#SmartAgency`
  );
}

export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function buildTwitterShareUrl(text: string): string {
  return `https://twitter.com/intent/tweet?${new URLSearchParams({ text }).toString()}`;
}

export function buildSmsShareUrl(text: string): string {
  return `sms:?&body=${encodeURIComponent(text)}`;
}

export function buildTelegramShareUrl(text: string, url: string): string {
  return `https://t.me/share/url?${new URLSearchParams({
    url,
    text: text.replace(`\n${url}`, '').trim(),
  }).toString()}`;
}

export function openExternalShare(href: string): void {
  if (typeof window === 'undefined') return;
  window.open(href, '_blank', 'noopener,noreferrer');
}
