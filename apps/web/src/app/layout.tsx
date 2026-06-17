import type { Metadata } from 'next';
import { QueryProviders } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sunu Event — AI Agency OS',
  description: 'AI-powered digital agency operating system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <QueryProviders>{children}</QueryProviders>
      </body>
    </html>
  );
}
