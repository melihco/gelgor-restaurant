import type { Metadata } from 'next';
import { QueryProviders } from './providers';
import { RuntimePublicConfigScript } from '@/components/RuntimePublicConfigScript';
import { buildSiteMetadata } from '@/lib/site-metadata';
import './globals.css';

export const metadata: Metadata = buildSiteMetadata();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <RuntimePublicConfigScript />
      </head>
      <body suppressHydrationWarning>
        <QueryProviders>{children}</QueryProviders>
      </body>
    </html>
  );
}
