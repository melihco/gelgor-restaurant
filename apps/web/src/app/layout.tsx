import type { Metadata } from 'next';
import { QueryProviders } from './providers';
import { RuntimePublicConfigScript } from '@/components/RuntimePublicConfigScript';
import { buildSiteMetadata } from '@/lib/site-metadata';
import './globals.css';

export const metadata: Metadata = buildSiteMetadata();

/** Render/Docker: env vars are runtime-only — never bake localhost into SSG HTML. */
export const dynamic = 'force-dynamic';

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
