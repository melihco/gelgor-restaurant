import {
  parseStudioFeedPack,
  STUDIO_VERSION,
  type BindFailure,
  type BindFailureCode,
  type SlotTicket,
  type StudioFeedPack,
} from '@smartagency/contracts';
import { isIncompleteOverlayPhrase } from '@/lib/fal-caption-headline';
import {
  parseFeedSlotPack,
  type FeedSlotPack,
  type FeedSlotPackIssue,
} from '@/lib/feed-slot-pack';

const PACK_ISSUE_TO_BIND: Record<FeedSlotPackIssue, BindFailureCode> = {
  missing_slot_job: 'missing_slot_job',
  missing_photo: 'missing_photo',
  missing_caption: 'missing_caption',
  missing_headline: 'missing_headline',
  missing_evidence: 'missing_evidence',
  headline_not_from_caption: 'headline_not_from_caption',
  prop_cannot_sell: 'prop_cannot_sell',
  product_needs_identity: 'product_needs_identity',
  place_cannot_sell: 'place_cannot_sell',
  copy_misses_evidence: 'copy_misses_evidence',
  invented_product_claim: 'copy_misses_evidence',
  incoherent_pack: 'copy_misses_evidence',
  empty_place_command: 'empty_place_command',
};

const BIND_MESSAGE: Record<BindFailureCode, string> = {
  missing_slot_job: 'Kartın işi boş',
  missing_photo: 'Fotoğraf yok',
  missing_caption: 'Alt yazı yok veya çok kısa',
  missing_headline: 'Üst yazı yok',
  missing_evidence: 'Fotoğrafın kanıt notu boş',
  headline_not_from_caption: 'Üst yazı alt yazıdan gelmiyor',
  prop_cannot_sell: 'Masadaki dekor, ürün kabuğuna giydirilemez',
  product_needs_identity: 'Satılık ürün dedik ama kanıtta kimlik yok',
  place_cannot_sell: 'Yer/alan işine ürün kabuğu veya satılık sepet giydirilemez',
  copy_misses_evidence: 'Yazı, fotoğrafta görünmeyen bir ürün söylüyor',
  empty_place_command: 'Yer kartında emir slogan yok',
  look_unavailable: 'Bakış yapılamadı',
  no_pick: 'Aday fotoğraflar bu işi kanıtlamıyor',
  incomplete_headline: 'Üst yazı yarım kaldı',
};

export function describeBindFailure(codes: BindFailureCode[]): string {
  return codes.map((c) => BIND_MESSAGE[c] ?? c).join('; ');
}

export function bindFailure(codes: BindFailureCode[]): BindFailure {
  const unique = [...new Set(codes)];
  return {
    ok: false,
    stage: 'bind',
    codes: unique,
    message: describeBindFailure(unique),
  };
}

/** Semantic pack + complete-sentence lock. Paint must not run without this. */
export function acceptBoundPack(
  input: Partial<FeedSlotPack | StudioFeedPack> | null | undefined,
  opts?: { adaptiveScene?: boolean },
): { ok: true; pack: FeedSlotPack } | BindFailure {
  const parsed = parseFeedSlotPack(input as Partial<FeedSlotPack>, opts);
  if (!parsed.ok) {
    return bindFailure(parsed.issues.map((i) => PACK_ISSUE_TO_BIND[i]));
  }
  if (isIncompleteOverlayPhrase(parsed.pack.headline)) {
    return bindFailure(['incomplete_headline']);
  }
  return parsed;
}

export function bindTicket(ticket: SlotTicket): { ok: true; pack: StudioFeedPack } | BindFailure {
  if (!ticket.pack) {
    return bindFailure(['missing_photo', 'missing_headline']);
  }
  const structural = parseStudioFeedPack(ticket.pack);
  if (!structural.ok) return bindFailure(structural.codes);
  const accepted = acceptBoundPack(structural.pack);
  if (!accepted.ok) return accepted;
  return { ok: true, pack: accepted.pack };
}

export function ticketWithPack(ticket: SlotTicket, pack: StudioFeedPack): SlotTicket {
  return {
    ...ticket,
    studioVersion: ticket.studioVersion || STUDIO_VERSION,
    pack,
  };
}
