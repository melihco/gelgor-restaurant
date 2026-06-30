/**
 * Scheduled Template Feed Engine
 *
 * Resolves which brand scheduled templates (story/reel gallery items) should be
 * visible in the mobile feed at any given time. Templates appear when their
 * schedule window opens and disappear when it closes.
 */

export interface ScheduledMediaItem {
  url: string;
  key?: string;
  type: 'image' | 'video';
  thumbnail_url?: string;
  duration_ms?: number;
}

export interface ScheduledTemplateFeedItem {
  template_id: string;
  name: string;
  format: 'story' | 'reel';
  media_items: ScheduledMediaItem[];
  schedule_time: string;
  schedule_end_time?: string;
  is_active_now: boolean;
  category?: string;
}

export interface ScheduledTemplateConfig {
  id: string;
  name: string;
  format: 'story' | 'reel';
  media_items: ScheduledMediaItem[];
  schedule_type: 'daily' | 'specific_days';
  schedule_days: number[];
  schedule_time: string;
  schedule_end_time?: string;
  timezone: string;
  status: 'active' | 'paused' | 'archived';
  category?: string;
}

/**
 * Check if a template is within its active schedule window.
 * Uses the template's configured timezone for day/time resolution.
 */
export function isTemplateActiveNow(
  template: ScheduledTemplateConfig,
  now: Date = new Date(),
): boolean {
  if (template.status !== 'active') return false;
  if (!template.media_items.length) return false;

  // Resolve current time in template's timezone
  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone: template.timezone || 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  const hourPart = localTime.find(p => p.type === 'hour')?.value ?? '0';
  const minutePart = localTime.find(p => p.type === 'minute')?.value ?? '0';
  const dayPart = localTime.find(p => p.type === 'weekday')?.value ?? 'Mon';

  const currentMinutes = parseInt(hourPart) * 60 + parseInt(minutePart);

  // Map weekday abbreviation to 0-6 (Mon-Sun)
  const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const currentDay = dayMap[dayPart] ?? 0;

  // Check day filter
  if (template.schedule_type === 'specific_days') {
    if (!template.schedule_days.includes(currentDay)) return false;
  }

  // Parse start time
  const [startH, startM] = template.schedule_time.split(':').map(Number);
  const startMinutes = (startH ?? 10) * 60 + (startM ?? 0);

  // Parse end time
  let endMinutes: number;
  if (template.schedule_end_time) {
    const [endH, endM] = template.schedule_end_time.split(':').map(Number);
    endMinutes = (endH ?? 23) * 60 + (endM ?? 59);
  } else {
    endMinutes = startMinutes + 1440; // 24h from start
  }

  // Window check (handles midnight crossing)
  if (endMinutes > startMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * From a list of all workspace templates, resolve which are currently
 * visible in the feed. Returns only active-now templates.
 */
export function resolveActiveFeedTemplates(
  templates: ScheduledTemplateConfig[],
  now: Date = new Date(),
): ScheduledTemplateFeedItem[] {
  return templates
    .filter(t => isTemplateActiveNow(t, now))
    .map(t => ({
      template_id: t.id,
      name: t.name,
      format: t.format,
      media_items: t.media_items,
      schedule_time: t.schedule_time,
      schedule_end_time: t.schedule_end_time,
      is_active_now: true,
      category: t.category,
    }));
}

/**
 * Sector-specific default template suggestions.
 * Used when onboarding a new brand to pre-fill common scheduled content patterns.
 */
export const SECTOR_TEMPLATE_PRESETS: Record<string, Array<{
  name: string;
  category: string;
  schedule_type: 'daily' | 'specific_days';
  schedule_days: number[];
  schedule_time: string;
  schedule_end_time?: string;
}>> = {
  restaurant: [
    { name: 'Günaydın', category: 'morning_greeting', schedule_type: 'daily', schedule_days: [0,1,2,3,4,5,6], schedule_time: '09:00' },
    { name: 'Öğle Menüsü', category: 'menu_special', schedule_type: 'specific_days', schedule_days: [0,1,2,3,4], schedule_time: '11:30', schedule_end_time: '14:00' },
    { name: 'Happy Hour', category: 'happy_hour', schedule_type: 'specific_days', schedule_days: [2,4,5], schedule_time: '17:00', schedule_end_time: '19:00' },
  ],
  hotel: [
    { name: 'Günaydın', category: 'morning_greeting', schedule_type: 'daily', schedule_days: [0,1,2,3,4,5,6], schedule_time: '08:00' },
    { name: 'Sunset', category: 'daily_special', schedule_type: 'daily', schedule_days: [0,1,2,3,4,5,6], schedule_time: '18:30', schedule_end_time: '20:00' },
    { name: 'Weekend Brunch', category: 'weekend_vibe', schedule_type: 'specific_days', schedule_days: [5,6], schedule_time: '10:00', schedule_end_time: '13:00' },
  ],
  cafe: [
    { name: 'Günaydın Kahve', category: 'morning_greeting', schedule_type: 'daily', schedule_days: [0,1,2,3,4,5,6], schedule_time: '08:00' },
    { name: 'Afternoon Break', category: 'daily_special', schedule_type: 'daily', schedule_days: [0,1,2,3,4,5,6], schedule_time: '15:00', schedule_end_time: '17:00' },
  ],
  nightclub: [
    { name: 'Tonight', category: 'event_promo', schedule_type: 'specific_days', schedule_days: [3,4,5], schedule_time: '20:00', schedule_end_time: '23:59' },
    { name: 'Weekend Party', category: 'weekend_vibe', schedule_type: 'specific_days', schedule_days: [5,6], schedule_time: '21:00', schedule_end_time: '23:59' },
  ],
  spa: [
    { name: 'Günaydın Wellness', category: 'morning_greeting', schedule_type: 'daily', schedule_days: [0,1,2,3,4,5,6], schedule_time: '09:00' },
    { name: 'Akşam Relax', category: 'daily_special', schedule_type: 'specific_days', schedule_days: [0,1,2,3,4], schedule_time: '17:00', schedule_end_time: '20:00' },
  ],
};
