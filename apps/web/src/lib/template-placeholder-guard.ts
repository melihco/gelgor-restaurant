import type { MatchedDesignTemplate } from '@/lib/brand-design-template-matcher';

function normalizeCopyToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sample copy baked into onboarding template previews — must never ship in feed. */
export function collectTemplatePlaceholderTexts(
  matched: Pick<
    MatchedDesignTemplate,
    'sampleHeadline' | 'sampleSubtitle' | 'templateName'
  > | null | undefined,
): string[] {
  if (!matched) return [];
  const out: string[] = [];
  for (const raw of [matched.sampleHeadline, matched.sampleSubtitle, matched.templateName]) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

/** True when detected canvas text still matches onboarding placeholder copy. */
export function textMatchesTemplatePlaceholder(
  detected: string | null | undefined,
  matched: Pick<
    MatchedDesignTemplate,
    'sampleHeadline' | 'sampleSubtitle' | 'templateName'
  > | null | undefined,
): boolean {
  const probe = normalizeCopyToken(String(detected ?? ''));
  if (!probe || probe.length < 4) return false;
  for (const forbidden of collectTemplatePlaceholderTexts(matched)) {
    const norm = normalizeCopyToken(forbidden);
    if (!norm) continue;
    if (probe === norm || probe.includes(norm) || norm.includes(probe)) return true;
  }
  return false;
}
