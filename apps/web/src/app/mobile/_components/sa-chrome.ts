/** SmartAgency chrome — cold steel on void black (matches logo + login). */
export const SA_CHROME = {
  void: '#07090F',
  steel50: '#EEF3F7',
  steel200: '#B0C4D4',
  steel300: '#8AABBD',
  steel400: '#6A8EA0',
  steel500: '#4D7088',
  steel600: '#355B72',
  steel700: '#1E3F55',
  warmGold: '#C8A86A',
  warmGoldDim: 'rgba(200,168,106,0.14)',
} as const;

/** Screens that keep native / IG styling — no SA chrome shell. */
export const FEED_NATIVE_SCREENS = new Set([
  'feed',
  'creative-preview',
  'approval',
  'platform-preview',
]);

export function shouldWrapWithSaChrome(screen: string): boolean {
  return !FEED_NATIVE_SCREENS.has(screen);
}

/** Studio hub tile accents — steel family + restrained gold (no rainbow). */
export const SA_STUDIO_ACCENTS = {
  identity: SA_CHROME.steel300,
  content: SA_CHROME.steel400,
  design: SA_CHROME.warmGold,
  gallery: '#5BB8CC',
  chatbot: '#9DBECE',
  channels: SA_CHROME.steel500,
} as const;
