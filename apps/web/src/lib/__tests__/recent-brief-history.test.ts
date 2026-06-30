import { describe, expect, it } from 'vitest';
import { parseBriefDescription, mergeRecentBriefDrafts, briefToDraft } from '../recent-brief-history';
import type { Brief } from '@/types';

describe('parseBriefDescription', () => {
  it('parses structured New Brief description', () => {
    const desc = [
      'Çıktı tipi: story',
      'Adet: 3',
      'Kampanya: Yaz 2026',
      'Öncelik: high',
      '',
      'Dolunay gecesi, mistik ve sıcak vibe',
      '',
      '📷 Fotoğraflar:',
      'https://cdn.example.com/a.jpg',
      '/api/media/galeri/11.jpg',
    ].join('\n');

    const parsed = parseBriefDescription(desc);
    expect(parsed.outputType).toBe('story');
    expect(parsed.count).toBe('3');
    expect(parsed.campaign).toBe('Yaz 2026');
    expect(parsed.priority).toBe('high');
    expect(parsed.extraDirection).toContain('Dolunay gecesi');
    expect(parsed.photoUrls).toEqual([
      'https://cdn.example.com/a.jpg',
      '/api/media/galeri/11.jpg',
    ]);
  });

  it('returns freeform text when no structured lines', () => {
    const parsed = parseBriefDescription('Sadece serbest metin brief');
    expect(parsed.outputType).toBeNull();
    expect(parsed.extraDirection).toBe('Sadece serbest metin brief');
    expect(parsed.photoUrls).toEqual([]);
  });
});

describe('mergeRecentBriefDrafts', () => {
  it('dedupes api and local by title', () => {
    const brief: Brief = {
      id: 'b1',
      officeId: 'o1',
      title: 'Full Moon',
      description: 'Çıktı tipi: reel\nAdet: 1\nÖncelik: normal\n\nMistik vibe',
      status: 'draft',
      createdBy: 'u1',
      createdAt: '2026-06-20T10:00:00Z',
      updatedAt: '2026-06-21T10:00:00Z',
      tasks: [],
      attachments: [],
    };
    const local = [{
      id: 'local-1',
      title: 'Full Moon',
      extraDirection: 'Mistik vibe',
      outputType: 'reel' as const,
      count: '1',
      savedAt: '2026-06-22T10:00:00Z',
      source: 'local' as const,
    }];
    const merged = mergeRecentBriefDrafts([brief], local, 5);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.source).toBe('local');
  });
});

describe('briefToDraft', () => {
  it('maps API brief to draft', () => {
    const draft = briefToDraft({
      id: 'x',
      officeId: 'o',
      title: 'Test',
      description: 'Çıktı tipi: post\nAdet: 5\nÖncelik: urgent\n\nRenkli feed',
      status: 'draft',
      createdBy: 'u',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      tasks: [],
      attachments: [],
    });
    expect(draft.outputType).toBe('post');
    expect(draft.count).toBe('5');
    expect(draft.priority).toBe('urgent');
    expect(draft.extraDirection).toBe('Renkli feed');
  });
});
