import { describe, expect, it } from 'vitest';
import { buildDiversityDirective, computeMissionDiversity } from '../mission-diversity';
import { detectHeadlineThemeClusters } from '../headline-theme-clusters';

describe('mission diversity — rejected wellness burn', () => {
  const scorpiosLoop = [
    { status: 'rejected', type: 'seasonal', title: 'Yaz İçin Ferahlatıcı Cilt Bakım Rutinleri' },
    { status: 'rejected', type: 'seasonal', title: 'Yaz İçin Ferahlatıcı Wellness Etkinlikleri' },
    { status: 'completed', type: 'seasonal', title: 'Yaz Wellness Etkinlikleri Kampanyası' },
  ];

  it('detects cilt/wellness titles as spa_wellness cluster', () => {
    expect(detectHeadlineThemeClusters('Yaz İçin Ferahlatıcı Cilt Bakım Rutinleri')).toContain(
      'spa_wellness',
    );
    expect(detectHeadlineThemeClusters('Summer skincare ritual')).toContain('spa_wellness');
  });

  it('includes rejected missions in diversity directive and burns spa_wellness', () => {
    const directive = buildDiversityDirective(scorpiosLoop);
    expect(directive).toContain('REJECTED');
    expect(directive).toMatch(/YANMIŞ TEMALAR/i);
    expect(directive).toMatch(/Spa \/ wellness/i);
    expect(directive).toMatch(/Beach club/i);
  });

  it('scores variety across rejected + completed set', () => {
    const result = computeMissionDiversity(scorpiosLoop);
    expect(result.recentSignatures.length).toBeGreaterThan(0);
  });
});
