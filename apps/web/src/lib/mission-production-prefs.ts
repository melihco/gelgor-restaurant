/**
 * Mission Hub — operator-selected production package (weekly vs campaign vs event).
 * Persisted per tenant; injected into Strategist propose block and auto-produce manifest.
 */
import type { MissionProductionManifest } from './mission-production-manifest';

export type MissionProductionPackage = MissionProductionManifest['missionType'];

const HUB_PACKAGES = new Set<MissionProductionPackage>([
  'weekly_content',
  'campaign',
  'event',
  'ads_focus',
  'opportunity',
]);

const STORAGE_PREFIX = 'mission-production-package:';

export function parseHubProductionPackage(raw: unknown): MissionProductionPackage | null {
  const pkg = String(raw ?? '').trim() as MissionProductionPackage;
  return HUB_PACKAGES.has(pkg) ? pkg : null;
}

export function getMissionProductionPackage(tenantId: string): MissionProductionPackage {
  if (typeof window === 'undefined') return 'weekly_content';
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tenantId}`);
    if (raw === 'campaign' || raw === 'event' || raw === 'weekly_content' || raw === 'ads_focus' || raw === 'opportunity') {
      return raw;
    }
  } catch { /* ignore */ }
  return 'weekly_content';
}

export function setMissionProductionPackage(
  tenantId: string,
  pkg: MissionProductionPackage,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${tenantId}`, pkg);
  } catch { /* ignore */ }
}

const PACKAGE_LABELS: Record<MissionProductionPackage, string> = {
  weekly_content: 'Haftalık paket',
  campaign: 'Kampanya',
  event: 'Etkinlik / duyuru',
  ads_focus: 'Reklam odaklı',
  opportunity: 'Fırsat paketi',
};

export function missionProductionPackageLabel(pkg: MissionProductionPackage): string {
  return PACKAGE_LABELS[pkg] ?? pkg;
}

/** Deterministic block for Strategist + Feed Art Director context. */
export function buildProductionPackageDirective(pkg: MissionProductionPackage): string {
  const lines = [
    '=== ÜRETİM PAKETİ (Mission Hub) ===',
    `Paket: ${missionProductionPackageLabel(pkg)} (${pkg})`,
  ];
  if (pkg === 'campaign') {
    lines.push(
      'İçerik ideation: kampanya / teklif / duyuru ağırlıklı fikirler.',
      'Feed Art Director: en az 1 campaign_story_motion + designed_post; hero_reel organic veya campaign_reel.',
      'Görsel: marka template_library (kampanya story + tasarım post) — layout_family_hint çeşitlendir.',
    );
  } else if (pkg === 'event') {
    lines.push(
      'İçerik: etkinlik tarihi, mekan, CTA net; event_announcement treatment.',
      'Feed Art Director: event_story + EventAnnouncementStory uyumlu atamalar.',
      'Carousel/story: passthrough overlay — headline + CTA fotoğraf üstünde.',
    );
  } else if (pkg === 'ads_focus') {
    lines.push(
      'Reklam odaklı: paid_ad_creative (Meta) + paid_ad_google_creative (Google) slotları zorunlu.',
      'Tasarım postundan türetilmiş görsel + platforma özel başlık/CTA.',
    );
  } else if (pkg === 'opportunity') {
    lines.push(
      'Fırsat paketi (3 slot): 1 tasarım post + 1 tasarımlı story + 1 reel (veya economy: story still).',
      'Ideation genelde 3–4 acil fikir — tam haftalık 7 slot veya reklam türevi BEKLEME.',
      'production_assignments tam 3 zorunlu slot; manifest_coverage_pct = 100 hedefle.',
    );
  } else {
    lines.push(
      'Standart haftalık paket: 1 organik post + 1 tasarım post + 1 carousel + 3 tasarımlı story + 1 reel.',
      'Tasarım postundan otomatik: 1 Meta Ads + 1 Google Ads kreatifi (ek LLM yok).',
      'Marka corporate design: brand_vibe_profile + template_library slotları.',
    );
  }
  return lines.join('\n');
}

/** Map strategist mission.type + Hub package → manifest missionType for auto-produce. */
export function resolveManifestMissionType(input: {
  hubPackage?: MissionProductionPackage | null;
  missionType?: string | null;
  title?: string | null;
  creativeBrief?: string | null;
}): MissionProductionManifest['missionType'] {
  // Explicit Hub / kick payload always wins (including weekly_content).
  if (input.hubPackage) return input.hubPackage;
  // Strategist trigger types (seasonal|opportunity|competitive|recovery|manual) are NOT production packages.
  const blob = `${input.title ?? ''} ${input.creativeBrief ?? ''}`.toLowerCase();
  if (blob.includes('ads') || blob.includes('reklam')) return 'ads_focus';
  if (blob.includes('event') || blob.includes('etkinlik') || blob.includes('duyuru')) return 'event';
  if (blob.includes('campaign') || blob.includes('kampanya') || blob.includes('promo')) {
    return 'campaign';
  }
  return 'weekly_content';
}
