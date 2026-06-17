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

const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-outfit',
  display: 'swap',
});

const playfairDisplay = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-montserrat', display: 'swap' });
const lora = Lora({ subsets: ['latin'], variable: '--font-lora', display: 'swap' });
const raleway = Raleway({ subsets: ['latin'], variable: '--font-raleway', display: 'swap' });
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-cormorant',
  display: 'swap',
});
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });
const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: ['400'], variable: '--font-dm-serif', display: 'swap' });
const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-libre',
  display: 'swap',
});
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' });

/** Desk-only font CSS variables — mobile shell uses system fonts. */
export const deskFontClassName = [
  outfit.variable,
  playfairDisplay.variable,
  montserrat.variable,
  lora.variable,
  raleway.variable,
  cormorant.variable,
  dmSans.variable,
  dmSerif.variable,
  libreBaskerville.variable,
  poppins.variable,
  fraunces.variable,
  spaceGrotesk.variable,
].join(' ');
