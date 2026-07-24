import { describe, expect, it } from 'vitest';
import {
  buildCompanyProfilePatchFromPython,
  isBrandTonePreset,
  pythonToneToPreset,
  resolveBrandTonePreset,
} from '@/lib/sync-company-profile-from-python';

describe('pythonToneToPreset', () => {
  it('passes through wizard preset keys', () => {
    expect(pythonToneToPreset('friendly')).toBe('friendly');
    expect(pythonToneToPreset('Professional')).toBe('professional');
  });

  it('maps freeform Turkish discovery tones', () => {
    expect(pythonToneToPreset('samimi, sıcak, davetkar')).toBe('friendly');
    expect(pythonToneToPreset('samimi, sıcak, kişisel')).toBe('friendly');
    expect(pythonToneToPreset('profesyonel, güvenilir, net')).toBe('professional');
    expect(pythonToneToPreset('premium, zarif, sofistike')).toBe('luxury');
    expect(pythonToneToPreset('enerjik, dinamik, heyecanlı')).toBe('energetic');
    expect(pythonToneToPreset('rahat, gündelik, doğal')).toBe('casual');
  });
});

describe('resolveBrandTonePreset', () => {
  it('prefers company profile then python brand_tone', () => {
    expect(resolveBrandTonePreset('samimi, sıcak, davetkar', 'profesyonel')).toBe('friendly');
    expect(resolveBrandTonePreset('', 'profesyonel, güvenilir, net')).toBe('professional');
    expect(resolveBrandTonePreset(null, null)).toBe('professional');
  });
});

describe('buildCompanyProfilePatchFromPython tone normalize', () => {
  it('normalizes freeform brandTone already stored on Nexus', () => {
    const patch = buildCompanyProfilePatchFromPython(
      { brandTone: 'samimi, sıcak, davetkar' },
      { brand_tone: 'samimi, sıcak, davetkar' },
    );
    expect(patch?.brandTone).toBe('friendly');
    expect(isBrandTonePreset(patch?.brandTone)).toBe(true);
  });
});
