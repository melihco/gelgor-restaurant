import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('openai', () => {
  const mockCreate = vi.fn();
  return {
    default: class OpenAI {
      chat = { completions: { create: mockCreate } };
    },
    __mockCreate: mockCreate,
  };
});

vi.mock('@/lib/server-config', () => ({
  serverConfig: {
    openai: { apiKey: 'sk-test-key' },
    ai: {
      chatModel: (kind: string) => (kind === 'creative' ? 'gpt-4o-mini' : 'gpt-4o-mini'),
    },
  },
}));

import { interpretBriefAsBrand } from '../brand-creative-director';

const { __mockCreate } = await import('openai') as unknown as { __mockCreate: ReturnType<typeof vi.fn> };

describe('brand-creative-director', () => {
  beforeEach(() => {
    __mockCreate.mockReset();
  });

  it('interprets "Full Moon" for a beach club brand', async () => {
    __mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            headline: 'Dolunay Partisi',
            caption: 'Bu gece denizin üzerinde dolunay yükseliyor. Sahilde müzik, yıldızlar altında dans. #FullMoonParty #SarnicBeach',
            sceneHint: 'Moonlit beach party scene: DJ booth on sand, fairy lights strung between palm trees, full moon reflecting on calm Aegean sea, silhouettes dancing',
            mood: 'mystical euphoric',
            visualDirection: 'Wide shot from behind the crowd facing the ocean, warm amber fairy lights contrasting cool moonlight on water, editorial night photography',
            strategicPurpose: 'Event awareness — drive attendance and FOMO for the monthly full moon party',
            brandInterpretation: 'Full Moon → monthly beachside DJ party under the moonlight at Sarnıç Beach',
            motionCue: 'Gentle crowd sway, flickering fairy lights, moonlight shimmering on water surface',
          }),
        },
      }],
    });

    const result = await interpretBriefAsBrand({
      title: 'Full Moon',
      extraDirection: '',
      outputType: 'story',
      brandName: 'Sarnıç Beach',
      brandBusinessType: 'beach_club',
      brandLocation: 'Alaçatı, İzmir',
      brandTone: 'samimi, sıcak, davetkar',
      brandDescription: 'Ege kıyısında plaj kulübü ve restoran. Gündüz plaj keyfi, akşam DJ setleri ve özel etkinlikler.',
      visualDna: 'Turquoise waters, sunset golden hour, bohemian elegance, Mediterranean warmth',
      contentPillars: ['beach_life', 'events', 'gastronomy', 'sunset_vibes'],
    });

    expect(result).not.toBeNull();
    expect(result!.headline).toBe('Dolunay Partisi');
    expect(result!.mood).toBe('mystical euphoric');
    expect(result!.brandInterpretation).toContain('Full Moon');
    expect(result!.sceneHint).toContain('beach');
    expect(result!.motionCue).toBeTruthy();

    const call = __mockCreate.mock.calls[0]![0];
    expect(call.model).toBe('gpt-4o-mini');
    expect(call.messages[0].content).toContain('CREATIVE DIRECTOR');
    expect(call.messages[1].content).toContain('Sarnıç Beach');
    expect(call.messages[1].content).toContain('beach_club');
    expect(call.messages[1].content).toContain('Full Moon');
  });

  it('returns null when API key is missing', async () => {
    const { serverConfig } = await import('@/lib/server-config');
    const original = serverConfig.openai.apiKey;
    (serverConfig.openai as any).apiKey = '';

    const result = await interpretBriefAsBrand({
      title: 'Test',
      outputType: 'post',
      brandName: 'X',
      brandBusinessType: 'cafe',
      brandLocation: 'Istanbul',
      brandTone: 'warm',
      brandDescription: 'Cafe',
    });

    expect(result).toBeNull();
    (serverConfig.openai as any).apiKey = original;
  });

  it('returns null on malformed JSON response', async () => {
    __mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'This is not JSON' } }],
    });

    const result = await interpretBriefAsBrand({
      title: 'Sunset',
      outputType: 'reel',
      brandName: 'Beach Bar',
      brandBusinessType: 'bar',
      brandLocation: 'Bodrum',
      brandTone: 'energetic',
      brandDescription: 'Cocktail bar by the sea',
    });

    expect(result).toBeNull();
  });

  it('falls back gracefully on API error', async () => {
    __mockCreate.mockRejectedValue(new Error('Rate limited'));

    const result = await interpretBriefAsBrand({
      title: 'Live DJ',
      outputType: 'story',
      brandName: 'Club',
      brandBusinessType: 'nightclub',
      brandLocation: 'Ankara',
      brandTone: 'bold',
      brandDescription: 'Nightclub',
    });

    expect(result).toBeNull();
  });
});
