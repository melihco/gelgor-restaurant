/**
 * Run the deterministic detector over the frame sets already downloaded during
 * the audit, so its verdicts can be compared against the Python prototypes that
 * were calibrated by eye on the same files.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  describeRenderDefects,
  detectRenderDefects,
} from './audit/render-defect-detector';

const ROOT = '/Users/melihtasoglan/Desktop/smart-agency';

const SETS: Array<{ label: string; dir: string }> = [
  { label: 'Gel Gör (denetim öncesi)', dir: 'tmp/review-gelgor' },
  { label: 'Karaman (denetim öncesi)', dir: 'tmp/review-karaman' },
  { label: 'Scorpios (denetim öncesi)', dir: 'tmp/review-scorpios' },
  { label: 'Logo denetimi kareleri', dir: 'tmp/logo-audit' },
  { label: 'Boş plaka düzeltmesi sonrası', dir: 'tmp/coherence-shots' },
];

async function main() {
  for (const set of SETS) {
    const dir = join(ROOT, set.dir);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => /\.(jpg|jpeg|png)$/i.test(f)).sort();
    if (!files.length) continue;

    let blocking = 0;
    let suspect = 0;
    let uninspected = 0;
    const lines: string[] = [];

    for (const f of files) {
      const report = await detectRenderDefects(readFileSync(join(dir, f)));
      if (!report.inspected) {
        uninspected++;
        continue;
      }
      if (report.clippedText?.severity === 'blocking') blocking++;
      else if (report.clippedText) suspect++;
      if (report.clippedText) {
        const c = report.clippedText;
        lines.push(
          `    ${f.padEnd(46)} ${c.severity.padEnd(8)} ${describeRenderDefects(report)}` +
          `  toplam=${c.totalPx} baskınlık=${c.dominance}`,
        );
      }
    }

    console.log(`\n=== ${set.label} — ${files.length} kare (${set.dir})`);
    console.log(
      `    ENGELLE: ${blocking}/${files.length}   şüpheli: ${suspect}/${files.length}` +
      (uninspected ? `   incelenemedi: ${uninspected}` : ''),
    );
    for (const l of lines.slice(0, 14)) console.log(l);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
