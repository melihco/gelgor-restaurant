import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Mobile',
  description: 'SmartAgency mobil creative hub — feed onayı, mission üretimi ve marka operasyonları.',
  openGraph: {
    title: 'SmartAgency Mobile',
    description: 'AI destekli içerik üretimi ve publish — cebinizde.',
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
