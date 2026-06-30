#!/usr/bin/env npx tsx
/**
 * Side-by-side fal feed simulation — CURRENT vs PROPOSED for one brief idea.
 *
 * Usage:
 *   npx tsx scripts/fal-feed-before-after.mts
 *   npx tsx scripts/fal-feed-before-after.mts --json
 */
import { simulateYulaNewCitrusBeforeAfter } from '../src/lib/fal-production-simulation';

const jsonMode = process.argv.includes('--json');

function excerpt(prompt: string, max = 420): string {
  const oneLine = prompt.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

function printPlan(label: string, plan: ReturnType<typeof simulateYulaNewCitrusBeforeAfter>['before']) {
  console.log(`\n## ${label}`);
  console.log('| Alan | Değer |');
  console.log('|------|-------|');
  console.log(`| Slot | \`${plan.slotRole}\` / \`${plan.pipeline}\` |`);
  console.log(`| Format | ${plan.format} |`);
  console.log(`| Motor | **${plan.engine}** |`);
  console.log(`| Intensity | \`${plan.intensity}\` (${plan.intensitySource}) |`);
  console.log(`| Vibe | \`${plan.resolvedVibe}\` (${plan.vibeSource}) |`);
  console.log(`| Galeri | ${plan.galleryUrl ?? '—'} (skor: ${plan.galleryMatchScore ?? '—'}) |`);
  console.log(`| Gate | ${plan.productionGate.passed ? '✅' : '⛔'} ${plan.productionGate.reason} |`);
  console.log(`| Prompt uzunluğu | ${plan.promptLength} char |`);
  console.log(`| Prompt çelişkisi | ${plan.promptConflicts.length ? plan.promptConflicts.join(' · ') : '(yok)'} |`);
  if (plan.promptConflicts.length) {
    for (const c of plan.promptConflicts) console.log(`  - ${c}`);
  }
  console.log('\n**Prompt özeti:**');
  console.log(`> ${excerpt(plan.designCardPrompt)}`);
  console.log('\n**Artifact metadata:**');
  console.log('```json');
  console.log(JSON.stringify(plan.artifactMetadata, null, 2));
  console.log('```');
}

const comparison = simulateYulaNewCitrusBeforeAfter();

if (jsonMode) {
  console.log(JSON.stringify(comparison, null, 2));
  process.exit(0);
}

console.log('# Fal feed — önce / sonra simülasyon');
console.log(`\n**Brief:** ${comparison.briefLabel}`);
console.log(`**ID:** \`${comparison.briefId}\``);

printPlan('ŞİMDİ (current pipeline)', comparison.before);
printPlan('SONRA (proposed improvements)', comparison.after);

console.log('\n## Fark tablosu\n');
console.log('| Alan | Şimdi | Sonra | Etki |');
console.log('|------|-------|-------|------|');
for (const d of comparison.deltas) {
  console.log(`| ${d.field} | ${d.before} | ${d.after} | ${d.impact} |`);
}

console.log('\n---');
console.log('Not: Bu simülasyon gerçek GPT-image çağrısı yapmaz — routing, vibe, intensity ve prompt farkını gösterir.');
console.log('Görsel A/B için: aynı galeri URL + iki prompt ile /api/generate-instagram-image dry-run (ayrı adım).');
