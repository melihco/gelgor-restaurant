/**
 * Güzellik salonu showcase — ajans seviyesi copy + slot demo (vibe_beauty_salon, kit_27).
 */
import type { ShowcaseDemoProps } from './showcase-demo-props';
import type { StoryLayoutFamily } from './story-template-types';

export const BEAUTY_SALON_SLOT_DEMO: Record<string, ShowcaseDemoProps> = {
  daily_story: {
    headline: 'Soft\nGlow',
    subtitle: 'Cilt · saç · manikür',
    categoryLabel: 'DAILY',
  },
  event_story: {
    headline: 'Yeni Sezon\nLansmanı',
    subtitle: 'Hydra facial · özel paket',
    categoryLabel: 'LAUNCH',
    eventDate: 'Cumartesi',
    eventTime: '11:00',
    cta: 'Randevu al',
  },
  campaign_post: {
    headline: 'Bridal\nGlow',
    subtitle: 'Gelin paketi · 3 seans',
    categoryLabel: 'BRIDAL',
    cta: 'Paketi gör',
  },
  editorial_story: {
    headline: 'Skin\nRitual',
    subtitle: 'Signature bakım serisi',
    categoryLabel: 'RITUAL',
  },
  social_proof: {
    headline: '"Cildim\nışıldıyor"',
    subtitle: '— Elif T. · Google ★★★★★',
    categoryLabel: 'REVIEWS',
  },
};

export const BEAUTY_SALON_FAMILY_DEMO: Partial<Record<StoryLayoutFamily, ShowcaseDemoProps>> = {
  frosted_glass: { headline: 'Quiet\nLuxury', subtitle: 'Buzlu cam · yumuşak ışık', categoryLabel: 'CALM' },
  minimal_luxury: { headline: 'Pure\nGlow', subtitle: 'El yapımı bakım detayı', categoryLabel: 'LUXURY' },
  asymmetric_editorial: { headline: 'Bold\nBeauty', subtitle: 'Editorial renk blokları', categoryLabel: 'EDIT' },
  magazine_cover: { headline: 'Glow\nIssue', subtitle: 'Salon editorial · yaz', categoryLabel: 'COVER' },
  campaign_hero: { headline: 'SPRING\nRITUAL', subtitle: 'Cilt yenileme · sınırlı kontenjan', categoryLabel: 'OFFER', cta: 'Randevu' },
  event_ticket: { headline: 'VIP\nBeauty Day', subtitle: 'Masterclass · Nişantaşı', categoryLabel: 'EVENT', eventDate: '22 Haziran', eventTime: '14:00', cta: 'Kayıt' },
  vibe_fullscreen: { headline: 'Main\nCharacter\nGlow', subtitle: 'Bu haftanın favori bakımı', categoryLabel: 'VIBE' },
  quote_card: { headline: '"Harika\ndeneyim"', subtitle: '— Ayşe K. · Google ★★★★★', categoryLabel: 'REVIEWS' },
  diptych_collage: { headline: 'Before\n& After', subtitle: 'Hydra facial · 1 seans', categoryLabel: 'PROOF' },
  gallery_series: { headline: 'Salon\nMoments', subtitle: 'Bu haftanın kareleri', categoryLabel: 'GALLERY' },
  split_panel: { headline: 'Expert\nTouch', subtitle: 'Uzman ekibimizle tanış', categoryLabel: 'TEAM', cta: 'Randevu' },
  mosaic_pinterest: { headline: 'Save\nThis Mood', subtitle: 'Pinterest-worthy köşeler', categoryLabel: 'MOOD' },
  polaroid_stack: { headline: 'Glow\nRecap', subtitle: 'Haftalık salon özeti', categoryLabel: 'RECAP' },
  noir_editorial: { headline: 'After\nHours', subtitle: 'Gece bakım ritüeli', categoryLabel: 'NOIR' },
  bold_impact: { headline: 'NEW\nDROP', subtitle: 'Sezonun yıldız ürünü', categoryLabel: 'NEW', cta: 'Keşfet' },
  location_pin: { headline: 'Salonu\nBul', subtitle: 'Her gün · 10:00 – 20:00', categoryLabel: 'VISIT', cta: 'Yol tarifi' },
};

export function isBeautySalonSector(sector?: string): boolean {
  const s = String(sector ?? '').toLowerCase();
  if (s === 'beauty_salon') return true;
  if (/barber|berber/i.test(s)) return false;
  return /beauty|güzellik|guzellik|estetik|cilt|kosmetik|nail|manikür|manikur/i.test(s);
}
