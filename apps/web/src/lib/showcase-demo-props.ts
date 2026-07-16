/**
 * Per-family showcase demo copy — each template family gets distinct headline/subtitle.
 */
import type { StoryLayoutFamily, AgencyBrandKit } from './story-template-types';
import {
  BEACH_CLUB_FAMILY_DEMO,
  BEACH_CLUB_SLOT_DEMO,
  isBeachClubSector,
} from './showcase-beach-club';
import {
  BEAUTY_SALON_FAMILY_DEMO,
  BEAUTY_SALON_SLOT_DEMO,
  isBeautySalonSector,
} from './showcase-beauty-salon';

export interface ShowcaseDemoProps {
  headline: string;
  subtitle: string;
  categoryLabel: string;
  eventDate?: string;
  eventTime?: string;
  cta?: string;
}

const FAMILY_DEMO: Record<StoryLayoutFamily, ShowcaseDemoProps> = {
  editorial_bottom: { headline: 'Akşam\nBaşlıyor', subtitle: 'Rezervasyon için DM', categoryLabel: 'EVENING' },
  editorial_left: { headline: 'Season\nCollection', subtitle: 'Limited edition experience', categoryLabel: 'NEW' },
  split_panel: { headline: 'Chef\'s Table', subtitle: '8 kişilik özel masa · Cuma', categoryLabel: 'RESERVE' },
  magazine_cover: { headline: 'The\nArt of\nStay', subtitle: 'Issue 04 · Summer', categoryLabel: 'COVER' },
  cinematic_center: { headline: 'Into The Blue', subtitle: 'Cinematic summer series', categoryLabel: 'FILM' },
  campaign_hero: { headline: 'SUMMER\nOFFER', subtitle: '%20 early bird · 48 saat', categoryLabel: 'PROMO', cta: 'Book Now' },
  gallery_series: { headline: 'Moments\nWe Love', subtitle: 'Guest gallery · this week', categoryLabel: 'GALLERY' },
  frosted_glass: { headline: 'Quiet Luxury', subtitle: 'Wellness & calm', categoryLabel: 'SPA' },
  bold_impact: { headline: 'OPEN\nNIGHT', subtitle: 'Doors at 22:00', categoryLabel: 'LIVE', cta: 'Tickets' },
  noir_editorial: { headline: 'After Dark', subtitle: 'Noir editorial series', categoryLabel: 'NOIR' },
  event_ticket: { headline: 'Sunset\nSessions', subtitle: 'Live DJ · rooftop', categoryLabel: 'EVENT', eventDate: '15 Haziran', eventTime: '21:00', cta: 'Rezervasyon' },
  diptych_collage: { headline: 'Two Sides\nOne Story', subtitle: 'Before & after service', categoryLabel: 'BEHIND' },
  minimal_luxury: { headline: 'Pure\nIndulgence', subtitle: 'Handcrafted detail', categoryLabel: 'LUXURY' },
  mosaic_pinterest: { headline: 'Save\nThis Mood', subtitle: 'Pin-worthy corners', categoryLabel: 'MOOD' },
  asymmetric_editorial: { headline: 'Bold\nContrast', subtitle: 'Editorial color block', categoryLabel: 'EDIT' },
  polaroid_single: { headline: 'COOL\nOFF', subtitle: 'Mekanınızdan bir an', categoryLabel: 'DAILY' },
  polaroid_stack: { headline: 'Memory\nLane', subtitle: 'Polaroid week recap', categoryLabel: 'RECAP' },
  vibe_fullscreen: { headline: 'Main\nCharacter\nEnergy', subtitle: 'This is the vibe tonight', categoryLabel: 'VIBE' },
  bento_story: { headline: '4 Corners\nOne Mood', subtitle: 'Swipe for the full story', categoryLabel: 'BENTO' },
  neon_night: { headline: 'NEON\nHOURS', subtitle: 'Doors 22:00 · VIP', categoryLabel: 'LIVE', eventDate: 'Cuma', eventTime: '22:00', cta: 'Liste' },
  quote_card: { headline: 'Unutulmaz\ngeldi', subtitle: '— Ayşe K. · Google ★★★★★', categoryLabel: 'REVIEWS' },
  location_pin: { headline: 'Find\nUs', subtitle: 'Her gün · 10:00 – 02:00', categoryLabel: 'LOCATION', cta: 'Yol tarifi' },
  luxury_kinetic_type: { headline: 'Premium\nLaunch', subtitle: 'Ajans seviyesi motion story', categoryLabel: 'PREMIUM', cta: 'Discover' },
  glassmorphism_showcase: { headline: 'Soft\nGlow', subtitle: 'Modern glass card showcase', categoryLabel: 'STUDIO' },
  editorial_product_stage: { headline: 'Editor\'s\nStage', subtitle: 'Hero product / venue focus', categoryLabel: 'FEATURE', cta: 'Reserve' },
};

const SLOT_DEMO: Record<string, ShowcaseDemoProps> = {
  daily_story: { headline: 'Good\nMorning', subtitle: 'Start the day with us', categoryLabel: 'DAILY' },
  event_story: { headline: 'Live\nTonight', subtitle: 'Doors open 20:00', categoryLabel: 'EVENT', eventDate: 'Cuma', eventTime: '20:00', cta: 'Rezervasyon' },
  campaign_post: { headline: 'Weekend\nDeal', subtitle: 'Limited seats', categoryLabel: 'OFFER', cta: 'Book' },
  editorial_story: { headline: 'Editor\'s\nPick', subtitle: 'Curated for you', categoryLabel: 'EDIT' },
  social_proof: { headline: '"Unutulmaz\ngeldi"', subtitle: '— Guest review ★★★★★', categoryLabel: 'REVIEWS' },
};

export function resolveShowcaseDemoProps(input: {
  family: StoryLayoutFamily;
  kit: AgencyBrandKit;
  slotKey?: string;
  variantIndex?: number;
  sector?: string;
  presetKey?: string;
}): ShowcaseDemoProps {
  const sector = input.sector ?? input.kit.sector;
  const beach = isBeachClubSector(sector)
    || input.presetKey === 'yula_bodrum'
    || input.presetKey === 'vibe_beach_club';
  const beauty = isBeautySalonSector(sector) || input.presetKey === 'vibe_beauty_salon';

  const base = beach
    ? ((input.slotKey && BEACH_CLUB_SLOT_DEMO[input.slotKey])
      || BEACH_CLUB_FAMILY_DEMO[input.family]
      || FAMILY_DEMO[input.family]
      || FAMILY_DEMO.editorial_bottom)
    : beauty
      ? ((input.slotKey && BEAUTY_SALON_SLOT_DEMO[input.slotKey])
        || BEAUTY_SALON_FAMILY_DEMO[input.family]
        || FAMILY_DEMO[input.family]
        || FAMILY_DEMO.editorial_bottom)
      : ((input.slotKey && SLOT_DEMO[input.slotKey])
        || FAMILY_DEMO[input.family]
        || FAMILY_DEMO.editorial_bottom);

  const vi = input.variantIndex ?? 0;
  const headline = vi % 3 === 1 && !base.headline.includes('\n')
    ? base.headline.replace(' ', '\n')
    : base.headline;
  return {
    ...base,
    headline,
    subtitle: base.subtitle || input.kit.showcaseSubtitle,
    categoryLabel: base.categoryLabel || input.kit.showcaseCategory,
  };
}
