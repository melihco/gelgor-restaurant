import { describe, expect, it } from 'vitest';
import {
  isSublineEnabledForProduction,
  resolveSlotSublineForRender,
  showSublineFromSampleCopy,
} from '../slot-subline-policy';

describe('slot-subline-policy', () => {
  it('defaults to enabled when flags unset', () => {
    expect(isSublineEnabledForProduction({})).toBe(true);
    expect(resolveSlotSublineForRender('Hadi tatlarına bak!', {})).toBe('Hadi tatlarına bak!');
  });

  it('suppresses subline when library slot showSubline is false', () => {
    expect(isSublineEnabledForProduction({
      librarySlot: { showSubline: false },
    })).toBe(false);
    expect(resolveSlotSublineForRender('Destek satırı', {
      librarySlot: { showSubline: false },
    })).toBeUndefined();
  });

  it('suppresses subline when design template showSubline is false', () => {
    expect(resolveSlotSublineForRender('Serinletici yaz', {
      matchedShowSubline: false,
    })).toBeUndefined();
    expect(resolveSlotSublineForRender('Serinletici yaz', {
      designSpec: { showSubline: false },
    })).toBeUndefined();
  });

  it('derives persist flag from sample subtitle', () => {
    expect(showSublineFromSampleCopy('')).toBe(false);
    expect(showSublineFromSampleCopy('Sınırlı süre')).toBe(true);
  });
});
