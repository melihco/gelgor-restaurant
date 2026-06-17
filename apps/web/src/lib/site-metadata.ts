import type { Metadata } from 'next';

/** Production fallback when NEXT_PUBLIC_SITE_URL is unset at build time. */
export const DEFAULT_SITE_URL = 'https://smartagency-web.onrender.com';

export const SITE_NAME = 'SmartAgency';
export const SITE_TAGLINE = 'AI Creative Operations Platform';
export const SITE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const SITE_DESCRIPTION =
  'Yapay zeka destekli creative operations: marka DNA, otomatik içerik üretimi, Instagram feed & story, mission hub ve publish — tek AI agency platformu.';

export const SITE_KEYWORDS = [
  'SmartAgency',
  'AI agency',
  'creative operations',
  'social media automation',
  'Instagram content',
  'brand DNA',
  'içerik üretimi',
  'yapay zeka pazarlama',
  'Remotion',
  'auto produce',
];

export function resolveSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    DEFAULT_SITE_URL;
  return raw.replace(/\/$/, '');
}

export function buildSiteMetadata(overrides?: Metadata): Metadata {
  const siteUrl = resolveSiteUrl();
  const ogImage = `${siteUrl}/opengraph-image`;
  const twitterImage = `${siteUrl}/twitter-image`;

  const base: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
      default: SITE_TITLE,
      template: `%s · ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    keywords: SITE_KEYWORDS,
    applicationName: SITE_NAME,
    authors: [{ name: SITE_NAME, url: siteUrl }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: 'technology',
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    alternates: {
      canonical: '/',
    },
    icons: {
      icon: [
        { url: '/smartagency-mark.png', type: 'image/png' },
      ],
      apple: [{ url: '/smartagency-mark.png', type: 'image/png' }],
      shortcut: ['/smartagency-mark.png'],
    },
    openGraph: {
      type: 'website',
      locale: 'tr_TR',
      alternateLocale: ['en_US'],
      url: siteUrl,
      siteName: SITE_NAME,
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} — AI destekli creative operations platformu`,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [twitterImage],
    },
    other: {
      'theme-color': '#05060f',
      'apple-mobile-web-app-title': SITE_NAME,
      'mobile-web-app-capable': 'yes',
    },
  };

  return { ...base, ...overrides };
}
