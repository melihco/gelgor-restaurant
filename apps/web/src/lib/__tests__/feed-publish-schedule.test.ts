import { describe, expect, it } from 'vitest';
import {
  formatPublishScheduleLabel,
  resolvePublishSchedule,
  resolveScheduleDisplayFormat,
} from '@/lib/feed-publish-schedule';

describe('resolvePublishSchedule', () => {
  it('prefers formatHint over feed director slot format at same idea_index', () => {
    const schedule = resolvePublishSchedule({
      idea: { headline: 'Yaz Kokteyl' },
      ideaIndex: 4,
      formatHint: 'reel',
      feedDirectorReport: {
        publish_schedule: {
          Wed: [{ index: 4, suggested_time: '12:00', format: 'carousel' }],
        },
      },
    });
    expect(schedule.format).toBe('reel');
    expect(schedule.day).toBe('Wed');
  });
});

describe('formatPublishScheduleLabel', () => {
  it('shows reel when artifact kind is reel but metadata says carousel', () => {
    const label = formatPublishScheduleLabel(
      {
        publish_schedule_day: 'Wed',
        publish_schedule_time: '12:00',
        publish_schedule_format: 'carousel',
        production_role: 'organic_reel',
        pipeline: 'runway_reel',
      },
      { kind: 'reel' },
    );
    expect(label).toBe('Önerilen · Çar · 12:00 · reel');
  });
});

describe('resolveScheduleDisplayFormat', () => {
  it('derives format from production_role when kind unknown', () => {
    expect(resolveScheduleDisplayFormat({
      production_role: 'organic_carousel',
      pipeline: 'carousel_gallery',
      publish_schedule_format: 'reel',
    })).toBe('carousel');
  });
});
