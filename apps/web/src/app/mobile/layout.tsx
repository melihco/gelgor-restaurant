import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Mobile',
  description: 'SmartAgency mobil creative hub — feed onayı, mission üretimi ve marka operasyonları.',
  openGraph: {
    title: 'SmartAgency Mobile',
    description: 'AI destekli içerik üretimi ve publish — cebinizde.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#05060f',
  viewportFit: 'cover',
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mobile-shell"
      style={{ minHeight: '100dvh', background: '#0A0A0E' }}
    >
      {children}
    </div>
  );
}
