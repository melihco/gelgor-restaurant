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
  'profile',
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

/** Login + onboarding — done/success uses steel chrome, not emerald green. */
export const SA_ONBOARDING = {
  done: SA_CHROME.steel300,
  doneBright: '#9DBECE',
  doneBg: 'rgba(138,171,189,0.14)',
  doneBorder: 'rgba(138,171,189,0.35)',
  active: SA_CHROME.steel500,
  activeBg: 'rgba(77,112,136,0.14)',
  activeBorder: 'rgba(77,112,136,0.4)',
  label: SA_CHROME.steel300,
  warm: SA_CHROME.warmGold,
  warmBg: SA_CHROME.warmGoldDim,
} as const;
