'use client';

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { continueRender, delayRender } from 'remotion';
import { GOOGLE_FONT_SPECS, resolveFontStack } from '../../lib/premium-font-registry';
import type { FontPersonality } from '../../lib/remotion-template-types';

export const StoryFontContext = createContext<{ hero: string; body: string }>({
  hero: "'DM Serif Display', Georgia, serif",
  body: "'Sora', sans-serif",
});

export function useStoryFonts(): { hero: string; body: string } {
  return useContext(StoryFontContext);
}

const loadedFamilies = new Set<string>();
const inflight = new Map<string, Promise<void>>();

async function loadGoogleFontFamily(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || loadedFamilies.has(trimmed)) return;
  if (inflight.has(trimmed)) {
    await inflight.get(trimmed);
    return;
  }

  const run = (async () => {
    if (typeof document === 'undefined') return;
    const spec = GOOGLE_FONT_SPECS[trimmed];
    if (!spec) {
      loadedFamilies.add(trimmed);
      return;
    }

    try {
      const cssUrl = `https://fonts.googleapis.com/css2?family=${spec}&display=block`;
      const cssRes = await fetch(cssUrl, { signal: AbortSignal.timeout(12_000) });
      if (!cssRes.ok) return;
      const css = await cssRes.text();
      const urls = Array.from(
        css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g),
      ).map((m) => m[1]!);

      await Promise.all(
        urls.map(async (url) => {
          const face = new FontFace(trimmed, `url(${url})`, { display: 'block' });
          await face.load();
          document.fonts.add(face);
        }),
      );
      loadedFamilies.add(trimmed);
    } catch {
      loadedFamilies.add(trimmed);
    }
  })();

  inflight.set(trimmed, run);
  try {
    await run;
  } finally {
    inflight.delete(trimmed);
  }
}

export function useRemotionFonts(
  personality: FontPersonality | string,
  headingFont?: string,
  bodyFont?: string,
  opts?: { honorExplicitBrand?: boolean },
): { hero: string; body: string } {
  const honorExplicitBrand = opts?.honorExplicitBrand ?? Boolean(headingFont?.trim());
  const stacks = useMemo(
    () => resolveFontStack(personality, headingFont, bodyFont, { honorExplicitBrand }),
    [personality, headingFont, bodyFont, honorExplicitBrand],
  );
  const familiesKey = stacks.families.join('|');

  useEffect(() => {
    const handle = delayRender(`fonts:${familiesKey}`);
    Promise.all(stacks.families.map(loadGoogleFontFamily))
      .catch(() => undefined)
      .finally(() => continueRender(handle));
  }, [familiesKey, stacks.families]);

  return { hero: stacks.hero, body: stacks.body };
}

/** Provider + loader for StoryLayoutEngine and legacy compositions. */
export function StoryFontProvider({
  personality,
  headingFont,
  bodyFont,
  honorExplicitBrand,
  children,
}: {
  personality: FontPersonality | string;
  headingFont?: string;
  bodyFont?: string;
  /** Marka Detayı fontFamily — skip generic-font replacement in stacks. */
  honorExplicitBrand?: boolean;
  children: React.ReactNode;
}) {
  const fonts = useRemotionFonts(personality, headingFont, bodyFont, {
    honorExplicitBrand: honorExplicitBrand ?? Boolean(headingFont?.trim()),
  });
  return <StoryFontContext.Provider value={fonts}>{children}</StoryFontContext.Provider>;
}
