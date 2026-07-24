import type { Metadata, Viewport } from 'next';

/** Square mark for tabs, home-screen, and WhatsApp/Twitter link chips. */
const MOBILE_ICON = {
  url: '/smartagency-icon.png',
  width: 1024,
  height: 1024,
  alt: 'SmartAgency',
  type: 'image/png' as const,
};

export const metadata: Metadata = {
  title: 'Mobile',
  description: 'SmartAgency mobil creative hub — feed onayı, mission üretimi ve marka operasyonları.',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/smartagency-icon.png', sizes: '1024x1024', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/favicon-32.png'],
  },
  openGraph: {
    title: 'SmartAgency Mobile',
    description: 'AI destekli içerik üretimi ve publish — cebinizde.',
    images: [MOBILE_ICON],
  },
  // Small square preview chip (WhatsApp / X) — not the wide marketing card.
  twitter: {
    card: 'summary',
    title: 'SmartAgency Mobile',
    description: 'AI destekli içerik üretimi ve publish — cebinizde.',
    images: [MOBILE_ICON.url],
  },
  // Edge-to-edge under Dynamic Island / status bar (PWA + iOS home-screen).
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SmartAgency',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { color: '#000000' },
  ],
  // Critical for env(safe-area-inset-*) + painting under Dynamic Island.
  viewportFit: 'cover',
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mobile-shell">
      {children}
    </div>
  );
}
