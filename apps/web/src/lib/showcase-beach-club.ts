/**
 * Beach club showcase — ajans seviyesi copy + slot demo (Yula, vibe_beach_club, kit_01).
 */
import type { ShowcaseDemoProps } from './showcase-demo-props';
import type { RemotionLayoutFamily } from './remotion-template-types';

export const BEACH_CLUB_SLOT_DEMO: Record<string, ShowcaseDemoProps> = {
  daily_story: {
    headline: 'Golden\nHour',
    subtitle: 'Deniz · lounge · kokteyl',
    categoryLabel: 'SUNSET',
  },
  event_story: {
    headline: 'Sunset\nSessions',
    subtitle: 'Live DJ · bu akşam',
    categoryLabel: 'LIVE',
    eventDate: 'Cuma',
    eventTime: '19:30',
    cta: 'Rezervasyon',
  },
  campaign_post: {
    headline: 'Hafta Sonu\nRitüeli',
    subtitle: 'Daybed · özel menü',
    categoryLabel: 'WEEKEND',
    cta: 'Yer ayırt',
  },
  editorial_story: {
    headline: 'Ege\nRitüeli',
    subtitle: 'Signature tabak · deniz ürünleri',
    categoryLabel: 'TASTE',
  },
  social_proof: {
    headline: '"Gün batımı\nefsane"',
    subtitle: '— Misafir · ★★★★★',
    categoryLabel: 'GUEST',
  },
};

export const BEACH_CLUB_FAMILY_DEMO: Partial<Record<RemotionLayoutFamily, ShowcaseDemoProps>> = {
  vibe_fullscreen: { headline: 'Main\nCharacter\nEnergy', subtitle: 'Bu akşamın vibe\'ı', categoryLabel: 'VIBE' },
  cinematic_center: { headline: 'Into\nThe Blue', subtitle: 'Ege · cinematic series', categoryLabel: 'FILM' },
  split_panel: { headline: 'Chef\'s\nBeach', subtitle: 'Özel masa · Cuma', categoryLabel: 'TABLE', cta: 'Rezervasyon' },
  magazine_cover: { headline: 'Summer\nIssue', subtitle: 'Beach club editorial', categoryLabel: 'COVER' },
  campaign_hero: { headline: 'SUMMER\nRITUAL', subtitle: 'Daybed paketi · sınırlı', categoryLabel: 'OFFER', cta: 'Rezervasyon' },
  event_ticket: { headline: 'Sunset\nSessions', subtitle: 'DJ · rooftop deck', categoryLabel: 'EVENT', eventDate: 'Cumartesi', eventTime: '20:00', cta: 'Liste' },
  minimal_luxury: { headline: 'Quiet\nLuxury', subtitle: 'Deniz kenarı sakinlik', categoryLabel: 'CALM' },
  gallery_series: { headline: 'Moments\nWe Love', subtitle: 'Bu haftanın kareleri', categoryLabel: 'GALLERY' },
  quote_card: { headline: '"Mükemmel\ngün batımı"', subtitle: '— Zeynep A. · Google ★★★★★', categoryLabel: 'REVIEWS' },
  frosted_glass: { headline: 'Sea\nBreeze', subtitle: 'Kokteyl · lounge', categoryLabel: 'LOUNGE' },
  location_pin: { headline: 'Bizi\nBul', subtitle: 'Her gün · 11:00 – 02:00', categoryLabel: 'LOCATION', cta: 'Yol tarifi' },
};

export function isBeachClubSector(sector?: string): boolean {
  const s = String(sector ?? '').toLowerCase();
  return /beach|marina|yacht|pool_club|yula|bodrum|sahil|plaj/.test(s);
}
