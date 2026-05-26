import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'SmartAgency — Mobile',
  description: 'AI Creative Operations Platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#05060f',
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mobile-shell">
      {children}
    </div>
  );
}
