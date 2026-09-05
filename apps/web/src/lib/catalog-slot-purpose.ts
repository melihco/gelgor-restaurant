/**
 * Catalog slot purpose — caption must speak the slot's job.
 * Mirrors backend/app/services/slot_purpose.py. Sector-agnostic purpose stems.
 */
import { catalogSlotPurposeKey } from '@/lib/sector-slot-pack';

export type SlotPurposeRule = {
  purpose: string;
  tokens: string[];
  jobTr: string;
  jobEn: string;
};

const RULES: Array<{ pattern: RegExp; tokens: string[]; jobTr: string; jobEn: string }> = [
  {
    pattern: /weekend_hours|opening_hours/,
    tokens: ['saat', 'açık', 'cumartesi', 'pazar', 'hours', 'open', 'hafta'],
    jobTr: 'Hafta sonu / çalışma saatini söyle — kaçta açık olduğunuzu.',
    jobEn: 'Say the weekend / opening hours — when you are open.',
  },
  {
    pattern: /weekend_booking|weekend_availability/,
    tokens: ['saat', 'açık', 'rezerv', 'booking', 'hafta', 'müsait'],
    jobTr: 'Hafta sonu müsaitlik veya rezervasyonu söyle.',
    jobEn: 'Say weekend availability or the booking ask.',
  },
  {
    pattern: /customer_favorite|guest_social|client_testimonial|member_story/,
    tokens: ['müşteri', 'yorum', 'seviyor', 'favori', 'tadım', 'review', 'misafir'],
    jobTr: 'Gerçek bir müşteri / misafir sesi — yorum, tadım, favori.',
    jobEn: 'A real guest voice — review, tasting, favorite.',
  },
  {
    pattern: /farm_visit|farm.?to.?table|orchard|grove|producer_visit/,
    tokens: ['çiftlik', 'hasat', 'bahçe', 'zeytinlik', 'orchard', 'farm', 'grove'],
    jobTr: 'Çiftlik, bahçe, hasat veya üretici ziyareti — raftaki ürün satışı değil.',
    jobEn: 'Farm, orchard, harvest or producer visit — not a shelf sale.',
  },
  {
    pattern: /production_bts|craft_process|behind_scenes|kitchen_bts/,
    tokens: ['üretim', 'süreç', 'hazırlan', 'atölye', 'kulis', 'craft', 'bts'],
    jobTr: 'Üretim / mutfak kulisini göster — genel lezzet sloganı değil.',
    jobEn: 'Show the making — not a generic flavors-await line.',
  },
  {
    pattern: /gift_bundle|gift_set|hamper/,
    tokens: ['hediye', 'set', 'paket', 'bundle', 'gift'],
    jobTr: 'Hediye seti / paket — tek SKU satışı değil.',
    jobEn: 'A gift set or bundle — not a single SKU pitch.',
  },
  {
    pattern: /new_arrival/,
    tokens: ['yeni', 'geldi', 'rafta', 'arrival'],
    jobTr: 'Yeni gelen ürünü söyle.',
    jobEn: 'Name what just arrived.',
  },
  {
    pattern: /limited_batch/,
    tokens: ['sınırlı', 'parti', 'stok', 'tüken', 'batch', 'limited'],
    jobTr: 'Sınırlı parti / stok gerçeğini söyle.',
    jobEn: 'Say it is a limited batch.',
  },
  {
    pattern: /market_day/,
    tokens: ['pazar', 'tezgah', 'stand', 'market'],
    jobTr: 'Pazar / tezgah gününü söyle.',
    jobEn: 'Say it is market-stand day.',
  },
  {
    pattern: /reservation_cta|reservation_reminder|reservation_exclusive/,
    tokens: ['rezerv', 'booking', 'randevu', 'yerinizi', 'masa'],
    jobTr: 'Rezervasyon veya randevu çağrısı.',
    jobEn: 'Ask for the booking or appointment.',
  },
];

function fold(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

export function resolveSlotPurpose(slotKey: string): SlotPurposeRule | null {
  const purpose = catalogSlotPurposeKey(slotKey);
  if (!purpose) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(purpose)) {
      return {
        purpose,
        tokens: rule.tokens,
        jobTr: rule.jobTr,
        jobEn: rule.jobEn,
      };
    }
  }
  return null;
}

export function captionHitsSlotPurpose(caption: string, slotKey: string): boolean {
  const rule = resolveSlotPurpose(slotKey);
  if (!rule) return true;
  const folded = fold(caption.replace(/[#@]\S+/g, ''));
  if (!folded.trim()) return false;
  return rule.tokens.some((token) => {
    const t = fold(token);
    if (t.length >= 4) return new RegExp(`(?<![0-9a-z])${t}[a-z]*`).test(folded);
    return new RegExp(`(?<![0-9a-z])${t}(?![0-9a-z])`).test(folded);
  });
}
