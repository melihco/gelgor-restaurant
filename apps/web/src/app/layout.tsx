import type { Metadata } from 'next';
import {
  Outfit,
  Playfair_Display,
  Montserrat,
  Lora,
  Raleway,
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Libre_Baskerville,
  Poppins,
  Fraunces,
  Space_Grotesk,
} from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-outfit',
  display: 'swap',
});

// BrandTheme safe fonts — loaded once at root, available as CSS var names
const playfairDisplay = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap' });
const montserrat     = Montserrat({ subsets: ['latin'], variable: '--font-montserrat', display: 'swap' });
const lora           = Lora({ subsets: ['latin'], variable: '--font-lora', display: 'swap' });
const raleway        = Raleway({ subsets: ['latin'], variable: '--font-raleway', display: 'swap' });
const cormorant      = Cormorant_Garamond({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-cormorant', display: 'swap' });
const dmSans         = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });
const dmSerif        = DM_Serif_Display({ subsets: ['latin'], weight: ['400'], variable: '--font-dm-serif', display: 'swap' });
const libreBaskerville = Libre_Baskerville({ subsets: ['latin'], weight: ['400','700'], variable: '--font-libre', display: 'swap' });
const poppins        = Poppins({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-poppins', display: 'swap' });
const fraunces       = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });
const spaceGrotesk   = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' });

const fontVars = [
  playfairDisplay, montserrat, lora, raleway, cormorant,
  dmSans, dmSerif, libreBaskerville, poppins, fraunces, spaceGrotesk,
].map(f => f.variable).join(' ');

export const metadata: Metadata = {
  title: 'Sunu Event — AI Agency OS',
  description: 'AI-powered digital agency operating system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `.dark`, ThemeProvider istemicide yönetiliyor; <html>'e sabitlemeyin (hydration ile çakışıyordu).
  return (
    <html lang="tr" className={`${outfit.variable} ${fontVars}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
