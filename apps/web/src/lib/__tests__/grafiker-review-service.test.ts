import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Grafiker prompts are module-private; assert the taste / agency bar
 * so Canva-split rejection language cannot regress silently.
 */
describe('grafiker agency taste bar', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/lib/grafiker-review-service.ts'),
    'utf8',
  );

  it('asks the which-agency question and rejects text escaping plates', () => {
    expect(src).toMatch(/which agency made this/i);
    expect(src).toMatch(/agency-portfolio bar/i);
    expect(src).toMatch(/TYPE CRAFT/i);
    expect(src).toMatch(/TYPE CONTAINMENT/i);
    expect(src).toMatch(/escaping|straddl/i);
    expect(src).toMatch(/TASTE FAIL/i);
    expect(src).toMatch(/paint sandwich/i);
    expect(src).toMatch(/score ≤ 6/i);
  });
});
