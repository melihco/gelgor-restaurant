import { describe, expect, it } from 'vitest';
import { buildActiveSignals, buildStrategistSignalBlock } from '@/lib/context-signals';
import { seasonSignal } from '@/lib/context-signals/calculators';
import { resolveSignalLanguage } from '@/lib/context-signals/language';
import { buildArtifactListTitle } from '@/lib/feed-display-caption';

describe('context-signals language', () => {
  it('resolveSignalLanguage maps en / en-US to en', () => {
    expect(resolveSignalLanguage('en')).toBe('en');
    expect(resolveSignalLanguage('en-US')).toBe('en');
    expect(resolveSignalLanguage('tr')).toBe('tr');
    expect(resolveSignalLanguage(null)).toBe('tr');
  });

  it('summer hooks stay Turkish for TR brands', () => {
    const summer = new Date('2026-07-15T12:00:00Z');
    const signal = seasonSignal(summer, 'tr');
    expect(signal.contentHooks.join(' ')).toMatch(/Yaz sezonu/);
    expect(signal.meta?.season).toBe('summer');
  });

  it('summer hooks are English for EN brands (beach_club)', () => {
    const summer = new Date('2026-07-15T12:00:00Z');
    const result = buildActiveSignals({
      date: summer,
      languages: 'en',
      businessType: 'beach_club',
      brandName: 'Coastal Beach Club',
      brandDescription: 'beach club hospitality',
    });
    const blob = result.signals.map((s) => `${s.title} ${s.contentHooks.join(' ')}`).join('\n');
    expect(blob).toMatch(/Summer season|Summer peak|beach\/pool/i);
    expect(blob).not.toMatch(/Yaz sezonu|serinletici menü|Gündüz plaj/);
    expect(result.promptBlock).toMatch(/CONTEXT SIGNALS/);
    expect(result.promptBlock).toMatch(/MUST be written in English/);
    expect(result.promptBlock).not.toMatch(/BAĞLAM SİNYALLERİ/);
  });

  it('local_products_shop TR brand still gets Turkish summer hooks', () => {
    const summer = new Date('2026-07-15T12:00:00Z');
    const result = buildActiveSignals({
      date: summer,
      languages: 'tr',
      businessType: 'local_products_shop',
      brandName: 'Yöresel Dükkan',
      brandDescription: 'yöresel ürünler ve el yapımı',
    });
    const blob = result.signals.map((s) => `${s.title} ${s.contentHooks.join(' ')}`).join('\n');
    expect(blob).toMatch(/Yaz sezonu|Sezon ürünleri/);
    expect(result.promptBlock).toMatch(/BAĞLAM SİNYALLERİ/);
  });

  it('buildStrategistSignalBlock frames in English when language=en', () => {
    const date = new Date('2026-07-15T12:00:00Z');
    const signals = [seasonSignal(date, 'en')];
    const block = buildStrategistSignalBlock(signals, 'Beach / Coastal', date, 'en');
    expect(block).toMatch(/CONTEXT SIGNALS/);
    expect(block).toMatch(/Summer season/);
    expect(block).not.toMatch(/Yaz sezonu/);
  });
});

describe('buildArtifactListTitle rejects season-label leaks', () => {
  it('skips Turkish season-hook concept titles', () => {
    expect(
      buildArtifactListTitle({
        conceptTitle: 'Yaz sezonu / serinletici menü',
        ideationHeadline: 'Meet us under the stars',
        brandName: 'Sarnic Beach',
        format: 'post',
      }),
    ).toBe('Meet us under the stars');
  });

  it('skips English season-label concept titles too', () => {
    expect(
      buildArtifactListTitle({
        conceptTitle: 'Summer season / refreshing menu',
        ideationHeadline: 'Discover golden-hour terrace nights',
        brandName: 'Coastal Club',
        format: 'post',
      }),
    ).toBe('Discover golden-hour terrace nights');
  });
});
