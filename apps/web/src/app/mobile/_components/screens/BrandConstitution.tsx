'use client';
/**
 * BRAND CONSTITUTION — Full tenant profile: view + edit.
 * Shows ALL analysis fields. Every section editable from mobile.
 */
import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

// Tone seçenekleri — Setup Wizard ile aynı değerler
const TONE_OPTIONS = [
  { value: 'professional', label: 'Profesyonel', desc: 'Kurumsal, güven veren', emoji: '🏢' },
  { value: 'friendly',     label: 'Samimi',      desc: 'Sıcak, erişilebilir',  emoji: '😊' },
  { value: 'energetic',    label: 'Enerjik',     desc: 'Dinamik, heyecanlı',   emoji: '⚡' },
  { value: 'luxury',       label: 'Lüks',        desc: 'Lüks, sofistike',       emoji: '✨' },
  { value: 'casual',       label: 'Rahat',       desc: 'Doğal, gündelik',      emoji: '☀️' },
];
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { apiClient } from '@/lib/api-client';
import { getTenantBffHeaders } from '@/lib/runtime-config';
import { fetchTenantBff } from '@/lib/bff-fetch';
import {
  filterBrandGalleryUrls,
  filterGalleryAnalysisKeys,
  mergeBrandGalleryUrls,
  parseBrandReferenceUrls,
} from '@/lib/gallery-upload';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import type { CompanyProfile, SaveCompanyProfileRequest } from '@/types';
import type { T } from '../theme-context';
import {
  buildCompanyProfilePatchFromPython,
  isBrandTonePreset,
  isCompanyProfileSparse,
  resolveBrandTonePreset,
} from '@/lib/sync-company-profile-from-python';
import { resolveCanonicalBrandName } from '@/lib/resolve-brand-name';
import {
  resolveCoherentLogoUrl,
  isCrossTenantPollutionName,
  resolveCustomerVisibleSummary,
  isForeignBrandCustomerSummary,
} from '@/lib/brand-identity-coherence';
import {
  resolveTenantCanonicalSector,
  serviceProfileCategoryForSector,
  shouldRefreshIndustryFromPython,
} from '@/lib/canonical-sector';
import { normalizeSectorId } from '@/lib/sector-production-profile';
import { TENANT_INDUSTRY_PLAYBOOKS } from '@/lib/tenant-operating-policy';
import {
  MOTION_STYLE_OPTIONS,
  applyMotionStylePreset,
  motionProfileToThemeJson,
  parseMotionProfileFromTheme,
  type MotionStyle,
} from '@/lib/brand-motion-profile';
import { StoryAudioSettingsPanel } from '@/components/brand/StoryAudioSettingsPanel';
import { ReelMotionSettingsPanel } from '@/components/brand/ReelMotionSettingsPanel';
import { BrandProductShowcasePanel } from '@/components/brand/BrandProductShowcasePanel';
import { BrandPremiumEditorialPanel } from '@/components/brand/BrandPremiumEditorialPanel';
import { BrandProductionEnginesPanel } from '@/components/brand/BrandProductionEnginesPanel';
import { TenantOperatingCapabilitiesEditor } from '@/components/brand/TenantOperatingCapabilitiesEditor';
import { TenantGalleryPolicyBanner } from '@/components/brand/TenantGalleryPolicyBanner';
import {
  evaluateGalleryAssetPolicy,
  resolveTenantOperatingProfile,
} from '@/lib/tenant-operating-policy';
import { BrandColorPalettePicker } from '@/components/brand/BrandColorPalettePicker';
import { BrandFalTemplateGalleryPanel } from '@/components/brand/BrandFalTemplateGalleryPanel';
import { BrandSlotFacilitiesPanel } from '../BrandSlotFacilitiesPanel';
import { BrandContentStrategyPanel } from '@/components/brand/BrandContentStrategyPanel';
import { useBrandCompleteGaps } from '@/components/brand/BrandCompleteGapsButton';
import { BrandSpecialDaysPanel } from '@/components/brand/BrandSpecialDaysPanel';
import { brandReadinessFixToBrandTab, PRODUCTION_PROFILE_THRESHOLD, type ProductionProfileReadinessResult } from '@/lib/brand-readiness';
import {
  focusBrandReadinessAnchor,
  resolveBrandReadinessNav,
  type BrandGalleryGroup,
} from '@/lib/brand-readiness-navigation';
import { isDebugUiMode } from '../mobile-client-config';
import { prepareGalleryDisplayUrls, resolveGalleryImageSrc, upscaleCdnUrl, galleryUrlIdentityKey } from '@/lib/gallery-display-url';
import { themeFlag, themeString, themeStringArray, resolveVisualSourceMode } from '@/lib/brand-theme-ai-settings';
import type { VisualSourceMode } from '@/lib/brand-theme-ai-settings';
import {
  buildVisualSourceModeFromFlags,
  buildVisualSourceModePatch,
  getEmptyGalleryWarning,
  getVisualSourceModeCopy,
  labelAiVisualSubject,
} from '@/lib/visual-source-ui-copy';
import { invalidateBrandContextWriteQueries } from '@/lib/query-client-bridge';
import {
  afterPillarsMirroredToPython,
  mirrorPillarsToPythonBrandContext,
  parseContentIntentSlugs,
} from '@/lib/content-pillars-sync';
import { resolveBrandLogoDisplayUrl } from '@/lib/brand-logo-production';
import { BrandLoadingScreen } from '../BrandLoadingScreen';
import { BrandIdentityProfileCard } from '../BrandIdentityProfileCard';
import { BrandIdentityAtelier, BRAND_ATELIER_ACCENTS } from '../BrandIdentityAtelier';
import {
  ContentStudioShell,
  ContentStudioPanel,
  ContentStudioProseField,
  ContentStudioTonePicker,
  ContentStudioAction,
  ContentStudioEntityBoard,
} from '../BrandContentStudio';
import { BrandProductionRepairCard } from '../BrandProductionRepairCard';
import type { BrandPostDesignDefaults, BrandDesignTypographyConfig } from '@/types/brand-theme';
import { TYPOGRAPHY_VIBE_LABELS, defaultTypographyVibeForSector } from '@/types/brand-theme';
import {
  buildUserConfirmedTypographyPatch,
  readTypographyDesignConfig,
  TYPOGRAPHY_VIBE_ONBOARDING_OPTIONS,
} from '@/lib/typography-design-policy';
import {
  hasSavedPostDesignDefaults,
  resolvePostDesignDefaultsFromVibe,
} from '@/lib/post-design-defaults-policy';
import {
  BrandHubDashboard,
  buildBrandHubAssistantNavItem,
  buildBrandHubNavItems,
  buildBrandHubStrategyNavItem,
} from '../BrandHubDashboard';
import { BrandVisionerGroup, BrandVisionerList, BrandVisionerNavRow } from '../BrandVisionerNavRow';
import { MobileBrandNavbar } from '../MobileBrandNavbar';
import { MoreMenuPanel } from './MoreMenu';

const BrandChatbotProfileCard = dynamic(
  () => import('../BrandChatbotProfileCard').then((m) => ({ default: m.BrandChatbotProfileCard })),
  { ssr: false },
);

const BrandScheduledTemplatesPanel = dynamic(
  () => import('@/components/brand/BrandScheduledTemplatesPanel').then((m) => ({ default: m.BrandScheduledTemplatesPanel })),
  { ssr: false },
);

const POST_FONT_OPTIONS: Array<{ id: BrandPostDesignDefaults['font_preset']; label: string; desc: string; functionText: string }> = [
  { id: 'poster_3d', label: '3D Poster', desc: 'Kalın, kampanya afişi gibi', functionText: 'Post ve story ara görsellerinde büyük headline için Anton/Archivo tabanlı poster yazısı kullanır.' },
  { id: 'sticker_pop', label: 'Çıkartma Pop', desc: 'Daha eğlenceli ve sosyal', functionText: 'Bangers tarzı daha organik, etiket/sticker hissi veren yazı dili üretir.' },
  { id: 'condensed_impact', label: 'Dar & Güçlü', desc: 'Dar, güçlü, satış odaklı', functionText: 'Dar ve yüksek harflerle daha fazla vurgu sağlar; kampanya ve duyuru postlarına uygundur.' },
  { id: 'elegant_serif', label: 'Dergi Serif', desc: 'Premium ve dergi hissi', functionText: 'Playfair tabanlı serif başlıkla lüks, restoran ve lifestyle içeriklerini daha editorial gösterir.' },
  { id: 'clean_sans', label: 'Sade Sans', desc: 'Sade, kurumsal, minimal', functionText: 'Inter tabanlı sade başlık kullanır; klinik, kurumsal ve minimal markalar için daha güvenlidir.' },
];

const POST_EFFECT_OPTIONS: Array<{ id: BrandPostDesignDefaults['text_effect']; label: string; desc: string; functionText: string }> = [
  { id: 'extrude_3d', label: '3D Kabartma', desc: 'Derinlikli, dikkat çekici başlık', functionText: 'Canvas render sırasında başlığı çok katmanlı gölge ve stroke ile gerçek 3D derinlikli çizer.' },
  { id: 'gradient_stack', label: 'Gradyan Katman', desc: 'Renk geçişli poster yazısı', functionText: 'Başlıkta beyazdan marka aksan rengine inen gradient ve derinlik katmanı uygular.' },
  { id: 'neon_3d', label: 'Neon Parlama', desc: 'Gece/story enerjisi', functionText: 'Başlığa parlama/glow uygular; gece etkinliği, bar, beach club ve story/reel girişleri için daha çarpıcıdır.' },
  { id: 'editorial_outline', label: 'İnce Kontur', desc: 'Lüks, ince konturlu başlık', functionText: 'Başlık etrafına zarif kontur ve kontrollü gölge verir; premium ama sakin görünür.' },
  { id: 'soft_shadow', label: 'Yumuşak Gölge', desc: 'Daha sakin okunabilirlik', functionText: 'Sadece yumuşak okunabilirlik gölgesi kullanır; daha az agresif ve güvenli üretim modudur.' },
];

const POST_LOGO_OPTIONS: Array<{ id: BrandPostDesignDefaults['logo_position']; label: string; desc: string; functionText: string }> = [
  { id: 'top_left', label: 'Sol üst', desc: 'Feed için güvenli klasik alan', functionText: 'Logo gerçek dosya olarak canvas üstüne çizilir; Instagram UI ve metin alanıyla en az çakışan varsayılan konumdur.' },
  { id: 'top_center', label: 'Üst orta', desc: 'Story/reel girişlerinde güçlü', functionText: 'Logo üst merkezde yer alır; story açılış kartlarında marka imzası gibi çalışır.' },
  { id: 'top_right', label: 'Sağ üst', desc: 'Sol başlık alanı boş kalır', functionText: 'Başlık sola yaslandığında logoyu sağ üstte tutarak kompozisyon dengesini korur.' },
  { id: 'bottom_right', label: 'Sağ alt', desc: 'Minimal ve editorial işler', functionText: 'Logo daha az baskın görünür; minimal postlarda fotoğrafı bozmadan marka imzası bırakır.' },
];

interface BrandPostTemplateSummary {
  id: string;
  name: string;
  format: string;
  template_kind: string;
  layout_spec?: Record<string, unknown>;
  thumbnail_url?: string | null;
  example_artifact_url?: string | null;
  usage_count?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function ChevronRight({ color }: { color: string }) {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M1 1.5 5.5 6 1 10.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.38} />
    </svg>
  );
}

/** Short mission under visioner sub-nav — one line, no hero card. */
const DESIGN_GROUP_MISSIONS: Record<string, string> = {
  style: 'Palet, tipografi ve marka DNA — her üretime yansır.',
  colors: 'Palet, tipografi ve görsel dil — her üretime yansır.',
  templates: 'Tesis özellikleri ve şablonlar; beğenilenler üretimde kullanılır.',
  production: 'Motorlar, motion/ses ve onay kuralları.',
  engines: 'Hareket, müzik ve üretim motorları.',
  dna: 'AI’ın öğrendiği görsel karakter — analizi güncel tutun.',
  rules: 'Üretim sınırları ve onay akışı.',
};

/** Canonical content DNA leaves (+ legacy deep-link aliases). */
type ContentGroup =
  | 'story' | 'goals'
  | 'about' | 'voice' | 'audience'
  /** @deprecated → strategy tab */
  | 'special' | 'competitors' | 'strategy';

/** Strategy leaves — campaign / competitors / special days (not production). */
type StrategyGroup = 'campaign' | 'competitors' | 'special';

/** Canonical design leaves (+ legacy deep-link aliases). */
type DesignGroup =
  | 'style' | 'templates' | 'production'
  | 'colors' | 'engines' | 'dna' | 'rules';

function isStrategyLeaf(g: string | null | undefined): g is StrategyGroup | 'strategy' {
  return g === 'campaign' || g === 'competitors' || g === 'special' || g === 'strategy';
}

function normalizeStrategyGroup(g: StrategyGroup | 'strategy' | null): StrategyGroup | null {
  if (!g) return null;
  if (g === 'strategy') return 'campaign';
  return g;
}

function normalizeContentGroup(g: ContentGroup | null): ContentGroup | null {
  if (!g) return null;
  if (isStrategyLeaf(g)) return null;
  if (g === 'about' || g === 'voice') return 'story';
  if (g === 'audience') return 'goals';
  return g;
}

function normalizeDesignGroup(g: DesignGroup | null): DesignGroup | null {
  if (!g) return null;
  if (g === 'colors' || g === 'dna') return 'style';
  if (g === 'engines' || g === 'rules') return 'production';
  return g;
}

function isContentStory(g: ContentGroup | null): boolean {
  return g === 'story' || g === 'about' || g === 'voice';
}
function isContentGoals(g: ContentGroup | null): boolean {
  return g === 'goals' || g === 'audience';
}
function isDesignStyle(g: DesignGroup | null): boolean {
  return g === 'style' || g === 'colors' || g === 'dna';
}
function isDesignProduction(g: DesignGroup | null): boolean {
  return g === 'production' || g === 'engines' || g === 'rules';
}

/** Compact back + eyebrow — matches hub visioner chrome on all sub-screens. */
function VisionerSubNav({
  t,
  parentLabel,
  title,
  onBack,
}: {
  t: T;
  parentLabel: string;
  title: string;
  /** @deprecated unused — kept for call-site compatibility */
  mission?: string;
  onBack: () => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: t.accent,
          fontSize: 14,
          fontWeight: 600,
          padding: 0,
          minHeight: 44,
          marginBottom: 2,
        }}
      >
        <svg width="8" height="13" viewBox="0 0 9 15" fill="none" aria-hidden>
          <path d="M7.5 1.5 1.5 7.5l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {parentLabel}
      </button>
      <div className="sa-chrome-eyebrow">
        {title}
      </div>
    </div>
  );
}

// ─── Bespoke monoline section icons (premium, brand-agnostic) ──────────
function SectionIcon({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'identity':
      return (
        <svg {...common}>
          <path d="M5 9.5 6.4 4.5h11.2L19 9.5" />
          <path d="M4.6 9.5h14.8v0a2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-4.8 0Z" />
          <path d="M6 11.4V19.5h12V11.4" />
          <path d="M10 19.5v-4.6h4v4.6" />
        </svg>
      );
    case 'content':
      return (
        <svg {...common}>
          <path d="M15.5 4.5 19.5 8.5 9 19l-4.5 1L5.5 15.5 15.5 4.5Z" />
          <path d="M13.6 6.4 17.6 10.4" />
          <path d="M4 21.5h9" />
        </svg>
      );
    case 'design':
      return (
        <svg {...common}>
          <path d="M12 3.2c-4.9 0-8.8 3.7-8.8 8.4 0 4.6 3.7 8 8.2 8 1.3 0 2.2-1 2.2-2.1 0-.6-.2-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.9-1.8h1.4c2.6 0 4.6-2 4.6-4.6 0-3.2-3.5-5.6-8.4-5.6Z" />
          <circle cx="7.4" cy="11.8" r="1.05" fill={color} stroke="none" />
          <circle cx="9.8" cy="7.8" r="1.05" fill={color} stroke="none" />
          <circle cx="14.4" cy="7.6" r="1.05" fill={color} stroke="none" />
        </svg>
      );
    case 'gallery':
      return (
        <svg {...common}>
          <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2.8" />
          <circle cx="8.4" cy="10" r="1.6" />
          <path d="M4 16.5 8.8 11.9l3.6 3.4 3.1-2.4 4.5 4.1" />
        </svg>
      );
    case 'chatbot':
      return (
        <svg {...common}>
          <path d="M4.5 5.5h15v9.5h-9.5L5 19.5V5.5Z" />
          <circle cx="9.6" cy="10.2" r="1.05" fill={color} stroke="none" />
          <circle cx="14.4" cy="10.2" r="1.05" fill={color} stroke="none" />
        </svg>
      );
    case 'channels':
      return (
        <svg {...common}>
          <path d="M9.4 14.6 14.6 9.4" />
          <path d="M8.4 10 6.6 11.8a3.6 3.6 0 0 0 5.1 5.1l1.8-1.8" />
          <path d="M15.6 14 17.4 12.2a3.6 3.6 0 0 0-5.1-5.1L10.5 8.9" />
        </svg>
      );
    case 'templates':
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
        </svg>
      );
    case 'style':
    case 'colors':
      return (
        <svg {...common}>
          <path d="M12 3.2c-4.9 0-8.8 3.7-8.8 8.4 0 4.6 3.7 8 8.2 8 1.3 0 2.2-1 2.2-2.1 0-.6-.2-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.9-1.8h1.4c2.6 0 4.6-2 4.6-4.6 0-3.2-3.5-5.6-8.4-5.6Z" />
          <circle cx="7.4" cy="11.8" r="1.05" fill={color} stroke="none" />
          <circle cx="9.8" cy="7.8" r="1.05" fill={color} stroke="none" />
          <circle cx="14.4" cy="7.6" r="1.05" fill={color} stroke="none" />
        </svg>
      );
    case 'production':
    case 'engines':
      return (
        <svg {...common}>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
          <circle cx="12" cy="12" r="3.4" />
        </svg>
      );
    case 'dna':
      return (
        <svg {...common}>
          <path d="M7 3c0 4.5 10 6 10 10.5S7 16.5 7 21" />
          <path d="M17 3c0 4.5-10 6-10 10.5S17 16.5 17 21" />
          <path d="M8.5 6.5h7M8.5 17.5h7M9.8 9.5h4.4M9.8 14.5h4.4" />
        </svg>
      );
    case 'rules':
      return (
        <svg {...common}>
          <path d="M12 3.2 19 6v5.5c0 4.3-2.9 7.5-7 9.3-4.1-1.8-7-5-7-9.3V6l7-2.8Z" />
          <path d="M9 11.8 11.2 14 15 9.8" />
        </svg>
      );
    case 'story':
    case 'about':
      return (
        <svg {...common}>
          <path d="M5 5.5h14v13H5z" />
          <path d="M8 9h8M8 12.5h8M8 16h5" />
        </svg>
      );
    case 'voice':
      return (
        <svg {...common}>
          <path d="M8 8.5a4 4 0 0 1 8 0v4.5a4 4 0 0 1-8 0V8.5Z" />
          <path d="M12 17v2.5M9.5 19.5h5" />
          <path d="M5.5 11.5v1.5M18.5 11.5v1.5" />
        </svg>
      );
    case 'goals':
    case 'audience':
    case 'campaign':
      return (
        <svg {...common}>
          <circle cx="9" cy="8.5" r="2.6" />
          <circle cx="16.5" cy="9.5" r="2.1" />
          <path d="M4.5 18.5c0-2.8 2.2-4.8 4.5-4.8s4.5 2 4.5 4.8M13.5 18.5c0-2.2 1.6-3.8 3-3.8 1.8 0 3 1.8 3 3.8" />
        </svg>
      );
    case 'strategy':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="5.5" height="16" rx="1.4" />
          <rect x="11.2" y="8" width="5.5" height="12" rx="1.4" />
          <rect x="18.4" y="6" width="1.6" height="14" rx="0.8" />
        </svg>
      );
    case 'special':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2.4" />
          <path d="M4 9.5h16M8.5 3v3.5M15.5 3v3.5" />
          <path d="M8.5 13.5h2.2M13.3 13.5h2.2M8.5 16.8h2.2" />
        </svg>
      );
    case 'competitors':
      return (
        <svg {...common}>
          <path d="M4 18.5V6.5l8-3 8 3v12" />
          <path d="M9 18.5V11.5h6v7" />
          <path d="M12 8.5v3" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...common}>
          <path d="M12 15V5" />
          <path d="M8.5 8.5 12 5l3.5 3.5" />
          <path d="M5 19.5h14" />
        </svg>
      );
    case 'analyze':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16 20.5 20.5" />
          <path d="M8.5 11h5M11 8.5v5" />
        </svg>
      );
    case 'photos':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
        </svg>
      );
    case 'basics':
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="2.4" />
          <path d="M8 8.5h8M8 12h8M8 15.5h5" />
        </svg>
      );
    case 'about':
      return (
        <svg {...common}>
          <path d="M6 4.5h12v15H6z" />
          <path d="M9 9h6M9 12.5h6M9 16h4" />
        </svg>
      );
    case 'assets':
      return (
        <svg {...common}>
          <rect x="3.5" y="5.5" width="17" height="13" rx="2.2" />
          <circle cx="8.8" cy="10.5" r="1.6" />
          <path d="M4 16.5 9.2 11.8l3.2 3 3.6-3.2L20 16.5" />
        </svg>
      );
    case 'chat-info':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M6 19.5c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        </svg>
      );
    case 'chat-catalog':
      return (
        <svg {...common}>
          <path d="M5 6.5h14M5 12h14M5 17.5h14" />
          <circle cx="8" cy="6.5" r="1.2" fill={color} stroke="none" />
          <circle cx="8" cy="12" r="1.2" fill={color} stroke="none" />
          <circle cx="8" cy="17.5" r="1.2" fill={color} stroke="none" />
        </svg>
      );
    case 'chat-ai':
      return (
        <svg {...common}>
          <path d="M12 3.5 14.8 9.2 21 10l-4.8 4.2 1.2 6.3L12 17.8 6.6 20.5l1.2-6.3L3 10l6.2-.8L12 3.5Z" />
        </svg>
      );
    case 'chat-integrations':
      return (
        <svg {...common}>
          <path d="M8 12h8M12 8v8" />
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        </svg>
      );
    default:
      return null;
  }
}

function SLabel({ text }: { t?: T; text: string; accent?: string }) {
  return <div className="sa-chrome-eyebrow" style={{ marginBottom: 10 }}>{text}</div>;
}
function parseArr(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try { const p = JSON.parse(trimmed); return Array.isArray(p) ? p.map(String) : []; } catch {}
    }
    return trimmed.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function parseObj(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, string>;
  return {};
}

function arrToStr(arr: string[]): string { return arr.join(', '); }

function cleanProfileText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// ─── Inline field editor (iOS Settings row) ─────────────────────────────
function formatChannelDisplay(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('@')) return value.slice(1);
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, '');
    if (host.includes('google.') && (url.pathname.includes('/maps') || url.pathname.includes('/place'))) {
      return 'Google Maps profili';
    }
    if (host.includes('business.google') || host.includes('g.page')) {
      return 'Google Business';
    }
    if (host.includes('instagram.com')) {
      const handle = url.pathname.split('/').filter(Boolean)[0];
      return handle ? `@${handle}` : 'Instagram';
    }
    return host;
  } catch {
    return value.length > 34 ? `${value.slice(0, 32)}…` : value;
  }
}

function Field({ t, label, value, onSave, multiline = false, hint, displayValue }: {
  t: T; label: string; value: string; onSave: (v: string) => void;
  multiline?: boolean; hint?: string; displayValue?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: t.textTertiary, marginBottom: 8 }}>{label}</div>
        {multiline ? (
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={6}
            style={{ width: '100%', minHeight: 140, padding: '12px 14px', borderRadius: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontSize: 16, lineHeight: 1.45, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', border: 'none', color: t.textPrimary }} autoFocus
          />
        ) : (
          <input value={draft} onChange={e => setDraft(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 12, outline: 'none', boxSizing: 'border-box', fontSize: 16, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', border: 'none', color: t.textPrimary }} autoFocus
          />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => { onSave(draft); setEditing(false); }} style={{ flex: 1, padding: '11px 16px', borderRadius: 12, cursor: 'pointer', background: t.accent, border: 'none', color: '#fff', fontSize: 15, fontWeight: 600 }}>
            Kaydet
          </button>
          <button type="button" onClick={() => { setDraft(value); setEditing(false); }} style={{ padding: '11px 16px', borderRadius: 12, cursor: 'pointer', background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border: 'none', color: t.textSecondary, fontSize: 15, fontWeight: 500 }}>
            İptal
          </button>
        </div>
      </div>
    );
  }

  const shown = (displayValue ?? value).trim();
  const display = shown || hint || 'Ekle';
  const isPlaceholder = !value;

  if (multiline) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(value); setEditing(true); }}
        style={{
          width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8,
          padding: '14px 16px', minHeight: 44, cursor: 'pointer', background: 'transparent', border: 'none', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 400, color: t.textPrimary }}>{label}</span>
          <ChevronRight color={t.textMuted} />
        </div>
        <span style={{
          fontSize: 15, lineHeight: 1.45, color: isPlaceholder ? t.textMuted : t.textTertiary,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical' as const,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}
        >
          {display}
        </span>
      </button>
    );
  }

  return (
    <button type="button" onClick={() => { setDraft(value); setEditing(true); }} style={{
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '13px 16px', minHeight: 44, cursor: 'pointer', background: 'transparent', border: 'none', textAlign: 'left',
    }}>
      <span style={{ fontSize: 16, fontWeight: 400, color: t.textPrimary, flexShrink: 0, maxWidth: '42%' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, justifyContent: 'flex-end' }}>
        <span style={{
          fontSize: 16, color: isPlaceholder ? t.textMuted : t.textTertiary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'right',
        }}>
          {display}
        </span>
        <ChevronRight color={t.textMuted} />
      </div>
    </button>
  );
}
Field.displayName = 'Field';

// ─── Read-only info row ────────────────────────────────────────────────
/**
 * iOS-style switch. The visual track stays 28px tall, but the button around it
 * spans 44px so the tap target clears the minimum without changing the layout.
 */
function Toggle({ t, on, onToggle, label, color }: {
  t: T; on: boolean; onToggle: () => void; label: string; color?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      style={{
        flexShrink: 0, minWidth: 44, minHeight: 44, padding: 0,
        border: 'none', background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      }}
    >
      <span aria-hidden style={{
        display: 'block', position: 'relative', width: 50, height: 28, borderRadius: 14,
        background: on ? (color ?? t.accent) : t.separator, transition: 'background 0.2s',
      }}>
        <span style={{
          position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%',
          background: '#fff', left: on ? 25 : 3, transition: 'left 0.2s',
        }} />
      </span>
    </button>
  );
}

function InfoRow({ t, label, value, color }: { t: T; label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '13px 16px', minHeight: 44 }}>
      <span style={{ fontSize: 16, color: t.textPrimary, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 16, color: color ?? t.textTertiary, textAlign: 'right', lineHeight: 1.45 }}>{value}</span>
    </div>
  );
}

function ParameterHelpModal({
  t,
  title,
  body,
  bullets,
  onClose,
}: {
  t: T;
  title: string;
  body: string;
  bullets: string[];
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.48)',
        padding: 14,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 430,
          borderRadius: 24,
          padding: 18,
          background: t.isDark ? '#111827' : '#ffffff',
          border: `0.5px solid ${t.separator}`,
          boxShadow: '0 24px 70px rgba(0,0,0,0.34)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: t.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
              Üretim Parametresi
            </div>
            <div style={{ fontSize: 18, color: t.textPrimary, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              border: 'none',
              cursor: 'pointer',
              color: t.textSecondary,
              background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
              fontSize: 18,
              lineHeight: '32px',
            }}
          >
            ×
          </button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6, color: t.textMuted }}>{body}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bullets.map((item) => (
            <div
              key={item}
              style={{
                padding: '10px 12px',
                borderRadius: 14,
                background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                color: t.textSecondary,
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ParameterGroupHeader({
  t,
  title,
  onHelp,
}: {
  t: T;
  title: string;
  /** @deprecated unused — kept for call-site compatibility */
  subtitle?: string;
  /** Operator/debug only — omit in customer UI */
  onHelp?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.01em' }}>{title}</div>
      {onHelp ? (
        <button
          type="button"
          onClick={onHelp}
          aria-label={`${title} açıklaması`}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            border: `0.5px solid ${t.accentBorder}`,
            background: t.accentDim,
            color: t.accent,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 800,
            lineHeight: '22px',
            flexShrink: 0,
          }}
        >
          ?
        </button>
      ) : null}
    </div>
  );
}

function ParameterOptionCard({
  t,
  active,
  label,
  onClick,
}: {
  t: T;
  active: boolean;
  label: string;
  /** @deprecated unused — kept for call-site compatibility */
  desc?: string;
  /** @deprecated unused — kept for call-site compatibility */
  functionText?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '12px',
        borderRadius: 16,
        cursor: 'pointer',
        border: `0.5px solid ${active ? t.accentBorder : t.separator}`,
        background: active
          ? (t.isDark ? 'linear-gradient(135deg, rgba(77,112,136,0.22), rgba(77,112,136,0.08))' : 'linear-gradient(135deg, rgba(77,112,136,0.13), rgba(77,112,136,0.04))')
          : (t.isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.025)'),
        boxShadow: active ? '0 12px 28px rgba(0,0,0,0.12)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: active ? t.accent : t.separator,
          boxShadow: active ? `0 0 0 4px ${t.accentDim}` : 'none',
          flexShrink: 0,
        }} />
        <div style={{ fontSize: 13, fontWeight: 800, color: active ? t.accent : t.textPrimary }}>{label}</div>
      </div>
    </button>
  );
}

/**
 * Katlanabilir grup — gelişmiş / teknik kartları varsayılan kapalı gösterir.
 * Kullanıcı yalnızca ilgilendiği grubu açar; ekran karmaşası dramatik düşer.
 */
function CollapsibleGroup({
  t,
  title,
  defaultOpen = false,
  accent,
  children,
}: {
  t: T;
  title: string;
  /** @deprecated unused — kept for call-site compatibility */
  subtitle?: string;
  defaultOpen?: boolean;
  accent?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ marginBottom: open ? 24 : 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 16,
          cursor: 'pointer',
          textAlign: 'left',
          background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: `0.5px solid ${open ? (accent ? accent + '55' : t.accentBorder) : t.separator}`,
          transition: 'border-color 180ms ease',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>{title}</div>
        </div>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 200ms ease',
          }}
        >
          <ChevronRight color={accent ?? t.textMuted} />
        </span>
      </button>
      {open ? <div style={{ marginTop: 14 }}>{children}</div> : null}
    </section>
  );
}

const TYPOGRAPHY_VIBE_OPTIONS = TYPOGRAPHY_VIBE_ONBOARDING_OPTIONS;

const BACKGROUND_STYLE_OPTIONS: Array<{ id: BrandDesignTypographyConfig['background_style']; label: string }> = [
  { id: 'gradient_mesh', label: 'Gradient Mesh' },
  { id: 'photo_overlay', label: 'Fotoğraf Üzeri' },
  { id: 'solid_brand', label: 'Düz Marka Rengi' },
  { id: 'transparent', label: 'Transparan' },
];


function PostDesignDefaultsPanel({
  t,
  workspaceId,
  theme,
  sector,
  onSave,
  onSaveTypography,
}: {
  t: T;
  workspaceId?: string | null;
  theme: Record<string, unknown>;
  sector: string;
  onSave: (next: BrandPostDesignDefaults) => void;
  onSaveTypography: (next: BrandDesignTypographyConfig) => void;
}) {
  const debugUi = isDebugUiMode();
  const saved = hasSavedPostDesignDefaults(theme);
  const typoCfg = readTypographyDesignConfig(theme);
  const suggested = resolvePostDesignDefaultsFromVibe(typoCfg?.vibe ?? 'retro_poster', {
    accentColor: typoCfg?.accent_color,
  });
  // Theme JSON may store camelCase twins from older Hub writes — read both without widening the SSOT type.
  const raw = (theme.post_design_defaults ?? theme.postDesignDefaults ?? {}) as Partial<BrandPostDesignDefaults> & {
    fontPreset?: BrandPostDesignDefaults['font_preset'];
    textEffect?: BrandPostDesignDefaults['text_effect'];
    logoPosition?: BrandPostDesignDefaults['logo_position'];
    accentColor?: string;
    defaultTemplateId?: string;
  };
  // Empty Hub must not pretend poster_3d / extrude_3d is selected — show DNA-aware suggestion only.
  const active: BrandPostDesignDefaults = saved
    ? {
        font_preset: (raw.font_preset ?? raw.fontPreset ?? suggested.font_preset) as BrandPostDesignDefaults['font_preset'],
        text_effect: (raw.text_effect ?? raw.textEffect ?? suggested.text_effect) as BrandPostDesignDefaults['text_effect'],
        logo_position: (raw.logo_position ?? raw.logoPosition ?? suggested.logo_position) as BrandPostDesignDefaults['logo_position'],
        accent_color: (raw.accent_color ?? raw.accentColor ?? suggested.accent_color) as string | undefined,
        default_template_id: raw.default_template_id ?? raw.defaultTemplateId,
      }
    : { ...suggested, default_template_id: undefined };
  const savePatch = (patch: Partial<BrandPostDesignDefaults>) => onSave({ ...active, ...patch });

  const typoRaw = (theme.typography_design ?? theme.typographyDesign ?? {}) as Partial<BrandDesignTypographyConfig>;
  const suggestedVibe = defaultTypographyVibeForSector(sector);
  const activeTypo: BrandDesignTypographyConfig = {
    vibe: typoRaw.vibe ?? suggestedVibe,
    text_effect: typoRaw.text_effect ?? active.text_effect ?? 'soft_shadow',
    accent_color: typoRaw.accent_color ?? active.accent_color,
    background_style: typoRaw.background_style ?? 'photo_overlay',
    logo_treatment: typoRaw.logo_treatment ?? 'watermark',
  };
  const saveTypoPatch = (patch: Partial<BrandDesignTypographyConfig>) => {
    onSaveTypography({ ...activeTypo, ...patch });
  };

  const { data: postTemplates = [] } = useQuery<BrandPostTemplateSummary[]>({
    queryKey: ['brandPostTemplates', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const res = await fetchTenantBff(`/api/brand-context/${workspaceId}/post-templates`, workspaceId, {
        headers: { 'X-Tenant-Id': workspaceId },
      });
      if (!res.ok) return [];
      return await res.json() as BrandPostTemplateSummary[];
    },
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
  const [helpTopic, setHelpTopic] = useState<'template' | 'font' | 'effect' | 'logo' | null>(null);
  const selectedFont = POST_FONT_OPTIONS.find((opt) => opt.id === active.font_preset) ?? POST_FONT_OPTIONS[0]!;
  const selectedEffect = POST_EFFECT_OPTIONS.find((opt) => opt.id === active.text_effect) ?? POST_EFFECT_OPTIONS[0]!;
  const selectedLogo = POST_LOGO_OPTIONS.find((opt) => opt.id === active.logo_position) ?? POST_LOGO_OPTIONS[0]!;
  const selectedTemplate = postTemplates.find((tmpl) => tmpl.id === active.default_template_id) ?? null;
  const helpCopy = {
    template: {
      title: 'Varsayılan Post Template',
      body: 'Bu seçim markanın post üretiminde hangi kayıtlı şablonun önce kullanılacağını belirler.',
      bullets: [
        'Otomatik seçilirse sistem sadece marka font/efekt/logo standardını kullanır ve içerik tipine göre tasarım seçer.',
        'Bir template seçilirse MissionContentFactory o şablonun canvas/agency spec değerlerini varsayılan üretim davranışına taşır.',
        'Template kütüphanesi, onaylanan post tasarımlarından büyür; iyi çalışan tasarımları kaydettikçe marka standardı güçlenir.',
      ],
    },
    font: {
      title: 'Yazı Karakteri',
      body: 'Bu seçim markanın post ve story ara görsellerindeki headline karakterini belirler. Üretim sırasında Canvas renderer bu preset’i gerçek font ailesine çevirir.',
      bullets: [
        'MissionContentFactory post, carousel ve story→reel ara kartlarında varsayılan font olarak kullanılır.',
        'Kayıtlı bir post şablonu kendi fontunu taşıyorsa şablon değeri marka standardının önüne geçer.',
        'Amaç her firmanın postlarında story şablonları gibi tutarlı bir tipografi imzası oluşturmak.',
      ],
    },
    effect: {
      title: 'Yazı Efekti',
      body: 'Bu seçim başlığın Canvas üzerinde nasıl çizileceğini belirler: 3D derinlik, glow, outline, gradient veya sade gölge.',
      bullets: [
        'AI prompt’a bırakılmaz; gerçek render katmanları Canvas içinde deterministik çizilir.',
        '3D Extrude ve Gradient Stack daha kampanya/poster odaklıdır; Outline ve Soft Shadow daha premium/minimaldir.',
        'Reel için ürün görselleri de bu yazı efektini taşıdığı için hareketli içerik standardını etkiler.',
      ],
    },
    logo: {
      title: 'Logo Alanı',
      body: 'Bu seçim gerçek marka logosunun post/story canvasında hangi güvenli alana yerleşeceğini belirler.',
      bullets: [
        'Logo URL varsa dosya olarak çizilir; modelin logoyu hayal etmesine bırakılmaz.',
        'Top-left feed için en güvenli default; top-center story girişlerinde daha güçlü marka imzası verir.',
        'Minimal postlarda bottom-right daha az baskın ve daha editorial görünür.',
      ],
    },
  } as const;

  return (
    <SCard t={t} title="Yazı & başlık" accent={t.accent}>
      <div style={{ padding: 14 }}>
        <div style={{
          borderRadius: 18,
          padding: 14,
          marginBottom: 14,
          background: t.isDark ? 'rgba(77,112,136,0.13)' : 'rgba(77,112,136,0.07)',
          border: `0.5px solid ${t.accentBorder}`,
        }}>
          <div style={{ fontSize: 11, color: t.accent, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            {saved ? 'Aktif Marka Standardı' : 'Önerilen · henüz kaydedilmedi'}
          </div>
          <div style={{ fontSize: 13, color: t.textPrimary, fontWeight: 700, lineHeight: 1.45 }}>
            {selectedFont.label} · {selectedEffect.label} · Logo: {selectedLogo.label}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.45, marginTop: 6 }}>
            {TYPOGRAPHY_VIBE_LABELS[activeTypo.vibe].emoji}{' '}
            {TYPOGRAPHY_VIBE_LABELS[activeTypo.vibe].tr}
            {' · '}
            {saved
              ? `Şablon: ${selectedTemplate?.name ?? 'Otomatik'}`
              : 'Öneri'}
          </div>
        </div>

        <ParameterGroupHeader
          t={t}
          title="Varsayılan Post Template"
          onHelp={debugUi ? () => setHelpTopic('template') : undefined}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <ParameterOptionCard
            t={t}
            active={saved && !active.default_template_id}
            label="Otomatik"
            desc="İçeriğe göre en uygun tasarım seçilsin"
            functionText={saved && !active.default_template_id ? 'Mission üretimi mevcut marka font/efekt standardını kullanır, sabit bir template zorlamaz.' : undefined}
            onClick={() => savePatch({ default_template_id: undefined, defaultTemplateId: undefined })}
          />
          {postTemplates.slice(0, 7).map((tmpl) => {
            const spec = tmpl.layout_spec ?? {};
            const isActive = saved && active.default_template_id === tmpl.id;
            return (
              <ParameterOptionCard
                key={tmpl.id}
                t={t}
                active={isActive}
                label={tmpl.name || 'Post Template'}
                desc={`${tmpl.template_kind || spec.source || 'canvas'} · ${tmpl.format || spec.contentType || 'post'}`}
                functionText={isActive ? 'Bu template, MissionContentFactory içinde varsayılan tasarım şablonu olarak uygulanır.' : undefined}
                onClick={() => savePatch({ default_template_id: tmpl.id, defaultTemplateId: tmpl.id })}
              />
            );
          })}
        </div>
        {!postTemplates.length && (
          <div style={{
            padding: '11px 12px',
            borderRadius: 14,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            color: t.textMuted,
            fontSize: 11,
            lineHeight: 1.45,
            marginBottom: 14,
          }}>
            Henüz kayıtlı şablon yok.
          </div>
        )}

        <ParameterGroupHeader
          t={t}
          title="Yazı Karakteri"
          onHelp={debugUi ? () => setHelpTopic('font') : undefined}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {POST_FONT_OPTIONS.map((opt) => (
            <ParameterOptionCard
              key={opt.id}
              t={t}
              active={saved && active.font_preset === opt.id}
              label={opt.label}
              desc={saved ? opt.desc : (opt.id === suggested.font_preset ? `${opt.desc} · önerilen` : opt.desc)}
              functionText={saved && active.font_preset === opt.id ? opt.functionText : undefined}
              onClick={() => savePatch({ font_preset: opt.id })}
            />
          ))}
        </div>

        <ParameterGroupHeader
          t={t}
          title="Yazı Efekti"
          onHelp={debugUi ? () => setHelpTopic('effect') : undefined}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {POST_EFFECT_OPTIONS.map((opt) => (
            <ParameterOptionCard
              key={opt.id}
              t={t}
              active={saved && active.text_effect === opt.id}
              label={opt.label}
              desc={saved ? opt.desc : (opt.id === suggested.text_effect ? `${opt.desc} · önerilen` : opt.desc)}
              functionText={saved && active.text_effect === opt.id ? opt.functionText : undefined}
              onClick={() => savePatch({ text_effect: opt.id })}
            />
          ))}
        </div>

        <ParameterGroupHeader
          t={t}
          title="Logo Alanı"
          onHelp={debugUi ? () => setHelpTopic('logo') : undefined}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {POST_LOGO_OPTIONS.map((opt) => (
            <ParameterOptionCard
              key={opt.id}
              t={t}
              active={saved && active.logo_position === opt.id}
              label={opt.label}
              desc={saved ? opt.desc : (opt.id === suggested.logo_position ? `${opt.desc} · önerilen` : opt.desc)}
              functionText={saved && active.logo_position === opt.id ? opt.functionText : undefined}
              onClick={() => savePatch({ logo_position: opt.id })}
            />
          ))}
        </div>

        {/* AI typography layers — same card; separate theme key (typography_design). */}
        <div data-brand-form="theme-layers">
          <ParameterGroupHeader
            t={t}
            title="AI Tipografi Stili"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            {TYPOGRAPHY_VIBE_OPTIONS.map((opt) => (
              <ParameterOptionCard
                key={opt.id}
                t={t}
                active={activeTypo.vibe === opt.id}
                label={`${opt.emoji} ${opt.label}`}
                desc={opt.desc}
                onClick={() => saveTypoPatch({ vibe: opt.id })}
              />
            ))}
          </div>

          <ParameterGroupHeader
            t={t}
            title="Arka Plan Stili"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {BACKGROUND_STYLE_OPTIONS.map((opt) => (
              <ParameterOptionCard
                key={opt.id}
                t={t}
                active={activeTypo.background_style === opt.id}
                label={opt.label}
                desc=""
                onClick={() => saveTypoPatch({ background_style: opt.id })}
              />
            ))}
          </div>
        </div>
      </div>
      {helpTopic && (
        <ParameterHelpModal
          t={t}
          title={helpCopy[helpTopic].title}
          body={helpCopy[helpTopic].body}
          bullets={[...helpCopy[helpTopic].bullets]}
          onClose={() => setHelpTopic(null)}
        />
      )}
    </SCard>
  );
}

// ─── Section card (iOS grouped list) ───────────────────────────────────
function SCard({ t, title, children, accent }: { t: T; title: string; children: React.ReactNode; accent?: string }) {
  const items = React.Children.toArray(children);
  const allFields = items.length > 0 && items.every(
    (c) => React.isValidElement(c) && (c.type as { displayName?: string }).displayName === 'Field',
  );

  return (
    <section style={{ marginBottom: 22 }}>
      <SLabel t={t} text={title} accent={accent} />
      {allFields ? (
        <div className="brand-grouped-fields" style={{ ...t.surfaceGroup }}>
          {children}
        </div>
      ) : (
        <div style={{ ...t.surfaceCard, padding: '14px 16px' }}>
          {children}
        </div>
      )}
    </section>
  );
}

// ─── Tag chip ─────────────────────────────────────────────────────────
function TagChip({ text, color, t }: { text: string; color: string; t: T }) {
  return (
    <span style={{ padding: '5px 12px', borderRadius: 30, fontSize: 12, fontWeight: 500, background: `${color}0d`, border: `0.5px solid ${color}22`, color, display: 'inline-block' }}>
      {text.replace(/_/g, ' ')}
    </span>
  );
}

type Tab = 'identity' | 'content' | 'design' | 'gallery' | 'strategy' | 'chatbot';

// ─── Gallery Tab ────────────────────────────────────────────────────────────
// Patterns to auto-flag as non-product (harita, logo, footer, menu, etc.)
const AUTO_EXCLUDE = ['harita', '-map', 'map-', '_map', 'footer', 'menu.', 'fran', 'franchise',
  'bayilik', 'banner', 'icon', '-150x', '-300x', '-100x', 'logo'];

function GalleryTab({ t, tenantId, pyCtx, queryClient, companyProfile, initialGroup, onInitialGroupConsumed }: {
  t: T;
  tenantId: string;
  pyCtx: Record<string, unknown> | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
  companyProfile?: CompanyProfile | null;
  initialGroup?: BrandGalleryGroup | null;
  onInitialGroupConsumed?: () => void;
}) {
  type GalleryGroup = 'upload' | 'analyze' | 'photos';
  const [galleryGroup, setGalleryGroup] = useState<GalleryGroup>(initialGroup ?? 'photos');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(0);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [uploadAssetType, setUploadAssetType] = useState<'venue_photo' | 'client_photo' | 'before_after_image'>('venue_photo');
  const galleryFileInputRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 18;

  const operatingProfile = companyProfile
    ? resolveTenantOperatingProfile({
        tenantId,
        industry: companyProfile.industry,
        contentNeedsJson: companyProfile.contentNeeds,
        operatingCapabilitiesJson: companyProfile.operatingCapabilities,
        galleryPolicyJson: companyProfile.galleryPolicy,
        riskRulesJson: companyProfile.riskRules,
        customRules: companyProfile.customRules,
      })
    : null;

  const uploadGate = operatingProfile
    ? evaluateGalleryAssetPolicy(operatingProfile, uploadAssetType)
    : null;

  // Reference images from Python brand context (http + persisted /api/media R2 URLs)
  const refUrls: string[] = (() => {
    const raw = (pyCtx as any)?.reference_image_urls ?? [];
    if (Array.isArray(raw)) return filterBrandGalleryUrls(raw.filter((u: unknown) => typeof u === 'string'));
    try {
      return filterBrandGalleryUrls(JSON.parse(String(raw)).filter((u: unknown) => typeof u === 'string'));
    } catch {
      return [];
    }
  })();

  const galleryUrlKey = galleryUrlIdentityKey;

  const { data: assets = [] } = useQuery({
    queryKey: ['media-assets-mobile', tenantId],
    queryFn: () => apiClient.getTenantMediaAssets({ officeId: '' }).catch(() => []),
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: galleryAnalysis = {} } = useQuery<Record<string, unknown>>({
    queryKey: ['gallery-analysis', tenantId],
    queryFn: async () => {
      const r = await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId);
      if (!r.ok) return {};
      return r.json() as Promise<Record<string, unknown>>;
    },
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  // Union refs + analysis keys — rediscovery used to wipe /api/media from refs while
  // leaving analysis keys; login refetch then made uploads look "gone".
  const gallerySourceUrls = mergeBrandGalleryUrls(
    refUrls,
    filterGalleryAnalysisKeys(galleryAnalysis),
    (assets as { url?: string }[]).map((a) => String(a?.url || '')).filter(Boolean),
  );

  /**
   * Remove photos from the full gallery SSOT.
   *
   * Always derives the next list from `gallerySourceUrls`. The display list is
   * deduped and CDN-upscaled, so writing it back would drop merged entries and
   * rewrite the stored URLs.
   */
  async function deleteGalleryUrls(keysToRemove: Set<string>): Promise<boolean> {
    if (keysToRemove.size === 0) return false;
    setDeleting(true);
    setDeleteError(null);
    try {
      const updated = gallerySourceUrls.filter((u) => !keysToRemove.has(galleryUrlKey(u)));
      const res = await fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_image_urls: JSON.stringify(updated) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await invalidateBrandContextWriteQueries(queryClient, tenantId);
      return true;
    } catch {
      setDeleteError('Fotoğraflar silinemedi — bağlantını kontrol edip tekrar dene.');
      return false;
    } finally {
      setDeleting(false);
    }
  }

  const openGalleryGroup = React.useCallback((g: GalleryGroup) => {
    setGalleryGroup(g);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!initialGroup) return;
    setGalleryGroup(initialGroup);
    onInitialGroupConsumed?.();
    focusBrandReadinessAnchor(initialGroup === 'analyze' ? 'gallery-analyze' : initialGroup === 'upload' ? 'gallery-upload' : 'gallery-photos', 420);
  }, [initialGroup, onInitialGroupConsumed]);

  const normGalleryUrl = (u: string) => u.split('?')[0];
  const analyzedKeySet = new Set(Object.keys(galleryAnalysis).map(normGalleryUrl));

  // AI analyze all gallery photos — incremental: skip already-persisted entries
  async function analyzeGallery() {
    const urls = filterBrandGalleryUrls(gallerySourceUrls);
    if (!urls.length) {
      setAnalyzeStatus('Galeri boş — önce fotoğraf yükleyin.');
      return;
    }

    setAnalyzing(true);
    setAnalyzeStatus(`${urls.length} fotoğraf kontrol ediliyor…`);

    // Load persisted analysis — only analyze NEW photos
    let existingAnalysis: Record<string, unknown> = {};
    try {
      const cacheRes = await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId);
      if (cacheRes.ok) existingAnalysis = await cacheRes.json();
    } catch { /* proceed without cache */ }

    const normExisting = new Set(Object.keys(existingAnalysis).map(u => u.split('?')[0]));
    const newUrls = urls.filter(u => !normExisting.has(u.split('?')[0]));
    const cachedCount = urls.length - newUrls.length;

    if (newUrls.length === 0) {
      setAnalyzeStatus(`✓ ${cachedCount} fotoğraf zaten analiz edilmiş — yeniden analiz gerekmiyor.`);
      setAnalyzing(false);
      return;
    }

    setAnalyzeStatus(`${newUrls.length} yeni fotoğraf analiz ediliyor (${cachedCount} cache'den atlandı)…`);
    try {
      const BATCH = 25;
      let allResults: Array<{ url: string; contentTags?: string[]; description?: string; usageContext?: string }> = [];
      let allErrors: { url: string; error: string }[] = [];

      for (let i = 0; i < newUrls.length; i += BATCH) {
        const batch = newUrls.slice(i, i + BATCH);
        setAnalyzeStatus(`${Math.min(i + BATCH, newUrls.length)} / ${newUrls.length} yeni fotoğraf analiz ediliyor…`);
      const res = await fetch('/api/analyze-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetUrls: batch, maxImages: BATCH, existingAnalysis }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
        const batchResults: typeof allResults = Array.isArray(data) ? data : data.results ?? [];
        allResults = allResults.concat(batchResults);
        allErrors = allErrors.concat(data.errors ?? []);
      }

      const results = allResults;
      const count = results.length;
      const errors = allErrors;
      const quotaError = errors.some((e: { error: string }) => e.error?.includes('429') || e.error?.includes('quota'));

      if (count > 0) {
      await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results }),
      }).catch((err) => console.warn('[gallery-analysis] persist failed:', err));
      }

      if (count === 0 && quotaError) {
        setAnalyzeStatus('⚠ OpenAI API kotası tükenmiş — kredi ekleyin ve tekrar deneyin.');
      } else if (count === 0 && errors.length > 0) {
        setAnalyzeStatus(`⚠ ${errors.length} fotoğraf analiz edilemedi: ${errors[0]?.error?.slice(0, 80)}`);
      } else {
        setAnalyzeStatus(`✓ ${count} yeni fotoğraf analiz edildi (${cachedCount} zaten vardı).`);
      }
      await invalidateBrandContextWriteQueries(queryClient, tenantId, [['gallery-analysis', tenantId]]);
    } catch (e) {
      setAnalyzeStatus(`Hata: ${e instanceof Error ? e.message : 'Bilinmeyen hata'}`);
    } finally {
      setAnalyzing(false);
    }
  }

  // Poll gallery-analysis after background upload so tags appear without manual refresh.
  async function pollGalleryAnalysisAfterUpload(expectedNew: number) {
    const baseline = Object.keys(
      (await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}))) as Record<string, unknown>,
    ).length;
    const target = baseline + expectedNew;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      try {
        const cacheRes = await fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId);
        if (!cacheRes.ok) continue;
        const meta = await cacheRes.json() as Record<string, unknown>;
        const count = Object.keys(meta).length;
        if (count >= target) {
          setAnalyzeStatus(`✓ ${expectedNew} fotoğraf yüklendi ve AI etiketleme tamamlandı.`);
          await invalidateBrandContextWriteQueries(queryClient, tenantId, [['gallery-analysis', tenantId]]);
          return;
        }
      } catch { /* keep polling */ }
    }
    setAnalyzeStatus((prev) =>
      prev.includes('arka planda')
        ? `✓ ${expectedNew} fotoğraf yüklendi. AI etiketleme sürüyor — birkaç dakika sonra "AI ile Analiz Et" ile kontrol edin.`
        : prev,
    );
  }

  // Upload one or more photos — R2 persist; vision analysis runs in background
  async function handleUpload(files: File | File[]) {
    if (!tenantId?.trim()) {
      setAnalyzeStatus('Hata: marka oturumu bulunamadı — sayfayı yenileyin.');
      return;
    }
    if (uploadGate?.decision === 'blocked') {
      setAnalyzeStatus('Bu fotoğraf türü işletme politikanızda kapalı. Marka → Üretim → Galeri yönetimi açık olmalı.');
      return;
    }
    const fileList = Array.isArray(files) ? files : [files];
    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of fileList) formData.append('file', file);

      setAnalyzeStatus(`${fileList.length} fotoğraf yükleniyor…`);
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/gallery-upload`,
        tenantId,
        { method: 'POST', body: formData },
      );
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        uploaded?: number;
        analyzed?: number;
        analysisPending?: boolean;
        total?: number;
        urls?: string[];
        errors?: Array<{ url: string; error: string }>;
      };

      if (!res.ok) {
        const errMap: Record<string, string> = {
          file_too_large_max_10mb: 'Dosya 10 MB sınırını aşıyor.',
          images_only_jpg_png_webp: 'Sadece JPG, PNG, WebP veya HEIC yükleyebilirsiniz.',
          heic_unsupported_convert_to_jpg: 'HEIC dönüştürülemedi — fotoğrafı JPG olarak kaydedip tekrar yükleyin.',
          no_files: 'Dosya seçilemedi — tekrar deneyin.',
          'R2 storage not configured': 'Depolama yapılandırması eksik — destek ile iletişime geçin.',
          tenant_required: 'Oturum hatası — çıkış yapıp tekrar giriş yapın.',
        };
        const raw = data.error ?? '';
        const errMsg = errMap[raw]
          || (raw.includes('X-Tenant-Id') ? errMap.tenant_required : null)
          || raw
          || `Yükleme başarısız (${res.status})`;
        throw new Error(errMsg);
      }

      const uploaded = data.uploaded ?? data.urls?.length ?? 0;
      const total = data.total ?? uploaded;
      if (data.analysisPending && uploaded > 0) {
        setAnalyzeStatus(`✓ ${uploaded} fotoğraf yüklendi (galeri: ${total}). AI etiketleme arka planda devam ediyor…`);
      } else if ((data.analyzed ?? 0) > 0) {
        setAnalyzeStatus(`✓ ${uploaded} fotoğraf yüklendi, ${data.analyzed} tanesi AI ile analiz edildi.`);
      } else if (uploaded > 0) {
        setAnalyzeStatus(`✓ ${uploaded} fotoğraf yüklendi; analiz sonucu boş — "AI ile Analiz Et" ile tekrar deneyin.`);
      } else {
        setAnalyzeStatus('Yükleme tamamlandı.');
      }

      await invalidateBrandContextWriteQueries(
        queryClient,
        tenantId,
        [['media-assets-mobile', tenantId], ['gallery-analysis', tenantId]],
      );

      if (data.analysisPending && uploaded > 0) {
        void pollGalleryAnalysisAfterUpload(uploaded);
      }
    } catch (e) {
      setAnalyzeStatus(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setUploading(false);
      if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
    }
  }

  const displayUrls = prepareGalleryDisplayUrls(gallerySourceUrls);

  // Heal: re-attach analysis-only /api/media uploads into reference_image_urls once.
  const galleryHealRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    const analysisOnly = filterGalleryAnalysisKeys(galleryAnalysis).filter((u) => {
      const k = galleryUrlKey(u);
      return u.includes('/api/media') && !refUrls.some((r) => galleryUrlKey(r) === k);
    });
    if (analysisOnly.length === 0) return;
    const healKey = `${tenantId}:${analysisOnly.length}:${analysisOnly[0]}`;
    if (galleryHealRef.current === healKey) return;
    galleryHealRef.current = healKey;
    const healed = mergeBrandGalleryUrls(analysisOnly, refUrls);
    void fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference_image_urls: JSON.stringify(healed) }),
    })
      .then((r) => {
        if (r.ok) return invalidateBrandContextWriteQueries(queryClient, tenantId);
      })
      .catch(() => { /* non-fatal */ });
  }, [tenantId, galleryAnalysis, refUrls, queryClient]);

  const analyzedCount = displayUrls.filter((u) => analyzedKeySet.has(normGalleryUrl(u))).length;
  const pendingCount = Math.max(0, displayUrls.length - analyzedCount);

  const GALLERY_SEGMENTS: { key: GalleryGroup; label: string }[] = [
    { key: 'photos', label: 'Fotoğraflar' },
    { key: 'upload', label: 'Yükle' },
    { key: 'analyze', label: 'Analiz' },
  ];

  return (
    <>
      <div
        role="tablist"
        aria-label="Galeri"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 4,
          marginBottom: 14,
          padding: 4,
          borderRadius: 14,
          background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
          border: `0.5px solid ${t.separator}`,
        }}
      >
        {GALLERY_SEGMENTS.map((seg) => {
          const active = galleryGroup === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => openGalleryGroup(seg.key)}
              style={{
                minHeight: 44,
                border: 'none',
                borderRadius: 11,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                letterSpacing: '-0.01em',
                color: active ? t.textPrimary : t.textMuted,
                background: active
                  ? (t.isDark ? 'rgba(138,171,189,0.22)' : 'rgba(255,255,255,0.95)')
                  : 'transparent',
                boxShadow: active
                  ? (t.isDark ? 'inset 0 0 0 1px rgba(138,171,189,0.35)' : '0 1px 4px rgba(15,23,42,0.08)')
                  : 'none',
              }}
            >
              {seg.label}
            </button>
          );
        })}
      </div>

      {galleryGroup === 'analyze' && (
        <div data-brand-fix="gallery-analyze">
          {displayUrls.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14,
            }}>
              {[
                { label: 'Toplam', value: String(displayUrls.length), color: t.textPrimary },
                { label: 'Analizli', value: String(analyzedCount), color: t.success },
                { label: 'Bekleyen', value: String(pendingCount), color: pendingCount > 0 ? t.warning : t.textMuted },
              ].map((stat) => (
                <div key={stat.label} style={{
                  padding: '12px 10px', borderRadius: 14, textAlign: 'center',
                  background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: `0.5px solid ${t.separator}`,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: stat.color, letterSpacing: '-0.03em' }}>{stat.value}</div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          )}
          <SCard t={t} title="Tümünü Analiz Et" accent={t.accent}>
            <button
              onClick={analyzeGallery}
              disabled={analyzing || displayUrls.length === 0}
              style={{
                width: '100%', padding: '13px 14px', borderRadius: 14, cursor: analyzing || displayUrls.length === 0 ? 'default' : 'pointer',
                background: t.accentDim,
                border: `0.5px solid ${t.accentBorder}`,
                color: t.accent, fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: displayUrls.length === 0 ? 0.55 : 1,
              }}>
              {analyzing
                ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${t.accentBorder}`, borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 0.8s linear infinite' }} />Analiz ediliyor…</>
                : displayUrls.length > 0
                  ? `✦ ${displayUrls.length} Fotoğrafı AI ile Analiz Et`
                  : 'Önce fotoğraf yükleyin'}
            </button>
            {analyzeStatus && (
              <p style={{ fontSize: 12, color: analyzeStatus.startsWith('✓') ? '#10B981' : analyzeStatus.startsWith('Hata') || analyzeStatus.startsWith('⚠') ? '#EF4444' : t.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 1.45 }}>
                {analyzeStatus}
              </p>
            )}
          </SCard>

          {operatingProfile && (
            <SCard t={t} title="Galeri Kuralları" accent={t.accent}>
              <TenantGalleryPolicyBanner profile={operatingProfile} variant="mobile" theme={t} />
            </SCard>
          )}
        </div>
      )}

      {galleryGroup === 'upload' && (
        <div data-brand-fix="gallery-upload">
          <SCard t={t} title="Yükleme">
        {operatingProfile && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {(
              [
                { id: 'venue_photo' as const, label: 'Mekan' },
                { id: 'client_photo' as const, label: 'Müşteri sonucu' },
                { id: 'before_after_image' as const, label: 'Önce/sonra' },
              ] as const
            ).map((opt) => {
              const gate = evaluateGalleryAssetPolicy(operatingProfile, opt.id);
              const blocked = gate.decision === 'blocked';
              const active = uploadAssetType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => setUploadAssetType(opt.id)}
                  style={{
                    minHeight: 44,
                    padding: '0 16px',
                    borderRadius: 22,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: blocked ? 'not-allowed' : 'pointer',
                    opacity: blocked ? 0.35 : 1,
                    border: `0.5px solid ${active ? t.accentBorder : t.separator}`,
                    background: active ? t.accentDim : 'transparent',
                    color: active ? t.accent : t.textMuted,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
        {uploadGate?.decision === 'approval_required' && (
          <p style={{ fontSize: 11, color: t.warning, marginBottom: 10 }}>
            Bu tür görseller onay bekleyecek şekilde işlenir.
          </p>
        )}
        <div style={{ position: 'relative', width: '100%' }}>
          <button
            type="button"
            disabled={uploading}
            onClick={() => {
              if (uploading) return;
              const el = galleryFileInputRef.current;
              if (!el) {
                setAnalyzeStatus('Dosya seçici açılamadı — sayfayı yenileyip tekrar deneyin.');
                return;
              }
              el.value = '';
              el.click();
            }}
            style={{
              width: '100%',
              minHeight: 48,
              padding: '13px 14px',
              borderRadius: 14,
              cursor: uploading ? 'wait' : 'pointer',
              opacity: uploading ? 0.6 : 1,
              background: 'rgba(255,255,255,0.03)',
              border: `0.5px solid ${t.separator}`,
              color: t.textSecondary,
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {uploading ? 'Yükleniyor…' : 'Yeni Fotoğraf Yükle'}
          </button>
          <input
            ref={galleryFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            multiple
            disabled={uploading}
            // WebView: keep in DOM (not display:none) so programmatic click() opens picker.
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length > 0) void handleUpload(fs);
            }}
          />
        </div>
        {analyzeStatus && (
          <p style={{
            fontSize: 12,
            color: analyzeStatus.startsWith('✓')
              ? '#10B981'
              : /hata|başarısız|tenant|R2|sınır|desteklenir/i.test(analyzeStatus)
                ? '#F87171'
                : t.textMuted,
            marginTop: 10,
            textAlign: 'center',
            lineHeight: 1.45,
          }}>
            {analyzeStatus}
          </p>
        )}
      </SCard>
        </div>
      )}

      {galleryGroup === 'photos' && (
        <>
      {displayUrls.length > 0 && (() => {
        const totalPages = Math.ceil(displayUrls.length / PAGE_SIZE);
        const pageUrls = displayUrls.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        const autoFlaggedCount = displayUrls.filter(u =>
          AUTO_EXCLUDE.some(p => u.toLowerCase().includes(p))).length;
        const selectedCount = selectedKeys.size;

        return (
          <SCard t={t} title={`${displayUrls.length} fotoğraf`}>
            <p style={{ fontSize: 11, color: t.textMuted, marginBottom: 12, lineHeight: 1.45 }}>
              {analyzedCount} analizli · {pendingCount} bekliyor
              {autoFlaggedCount > 0 ? ` · ${autoFlaggedCount} uyarı` : ''}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {autoFlaggedCount > 0 && (
                <div style={{ flex: 1, fontSize: 11, color: t.warning,
                  background: 'rgba(245,158,11,0.08)', border: `0.5px solid rgba(245,158,11,0.2)`,
                  borderRadius: 8, padding: '6px 10px', lineHeight: 1.4 }}>
                  ⚠ {autoFlaggedCount} görsel harita/logo/footer içeriyor
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setDeleteMode(d => !d);
                  setSelectedKeys(new Set());
                  setConfirmingDelete(false);
                  setDeleteError(null);
                }}
                style={{
                  flexShrink: 0, minHeight: 44, padding: '0 16px', borderRadius: 22, cursor: 'pointer',
                  background: deleteMode ? 'rgba(239,68,68,0.12)' : t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                  border: `0.5px solid ${deleteMode ? 'rgba(239,68,68,0.3)' : t.separator}`,
                  color: deleteMode ? '#F87171' : t.textSecondary, fontSize: 13, fontWeight: 600,
                }}
              >
                {deleteMode ? 'Bitti' : 'Seç'}
              </button>
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {pageUrls.map((url, i) => {
                const isAutoFlagged = AUTO_EXCLUDE.some(p => url.toLowerCase().includes(p));
                const isAnalyzed = analyzedKeySet.has(normGalleryUrl(url));
                const key = galleryUrlKey(url);
                const isSelected = selectedKeys.has(key);
                const toggleSelected = () => {
                  setConfirmingDelete(false);
                  setDeleteError(null);
                  setSelectedKeys(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                };
                return (
                  <div
                    key={page * PAGE_SIZE + i}
                    // Whole tile is the selection target — a small overlay button
                    // would sit far below the 44px minimum on a 3-column grid.
                    role={deleteMode ? 'checkbox' : undefined}
                    aria-checked={deleteMode ? isSelected : undefined}
                    tabIndex={deleteMode ? 0 : undefined}
                    onClick={deleteMode ? toggleSelected : undefined}
                    onKeyDown={deleteMode ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleSelected();
                      }
                    } : undefined}
                    style={{ position: 'relative', aspectRatio: '1/1',
                    borderRadius: 10, overflow: 'hidden',
                    background: t.isDark ? '#111120' : '#E8E8EF',
                    cursor: deleteMode ? 'pointer' : 'default',
                    border: isAutoFlagged && deleteMode && !isSelected ? '2px solid rgba(245,158,11,0.6)' : 'none',
                    opacity: deleting && isSelected ? 0.4 : 1, transition: 'opacity 200ms' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveGalleryImageSrc(url)}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        if (!img.dataset.fallback) {
                          img.dataset.fallback = '1';
                          const direct = url.startsWith('http') ? upscaleCdnUrl(url) : url;
                          if (direct !== img.src) {
                            img.src = resolveGalleryImageSrc(direct);
                            return;
                          }
                        }
                        img.style.opacity = '0.3';
                      }}
                    />

                    {/* Analyzed badge */}
                    {isAnalyzed && !deleteMode && (
                      <div style={{ position: 'absolute', top: 4, right: 4,
                        background: 'rgba(16,185,129,0.92)', borderRadius: 6,
                        fontSize: 8, fontWeight: 700, color: '#fff', padding: '2px 5px' }}>
                        AI
                      </div>
                    )}

                    {/* Auto-flag badge */}
                    {isAutoFlagged && !deleteMode && (
                      <div style={{ position: 'absolute', top: 4, left: 4,
                        background: 'rgba(245,158,11,0.85)', borderRadius: 6,
                        fontSize: 8, fontWeight: 700, color: '#000', padding: '2px 5px' }}>
                        harita/logo
                      </div>
                    )}

                    {/* Selection mark — the tile itself carries the tap */}
                    {deleteMode && (
                      <>
                        {isSelected && (
                          // Sits after the <img> so the tint and ring always paint on top.
                          <div style={{
                            position: 'absolute', inset: 0, borderRadius: 10,
                            background: 'rgba(239,68,68,0.28)',
                            boxShadow: 'inset 0 0 0 2px #F87171',
                          }} />
                        )}
                        <div aria-hidden style={{
                          position: 'absolute', top: 6, right: 6, width: 26, height: 26,
                          borderRadius: '50%',
                          background: isSelected ? '#EF4444' : 'rgba(0,0,0,0.35)',
                          border: `1.5px solid ${isSelected ? '#EF4444' : 'rgba(255,255,255,0.85)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, color: '#fff', fontWeight: 800, lineHeight: 1,
                        }}>
                          {isSelected ? '✓' : ''}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Selection actions — deletion always goes through one confirmed path */}
            {deleteMode && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deleteError && (
                  <p style={{ fontSize: 12, color: '#F87171', lineHeight: 1.45, margin: 0 }}>
                    {deleteError}
                  </p>
                )}

                {selectedCount === 0 ? (
                  <>
                    <p style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.45, margin: 0 }}>
                      Silmek istediğin fotoğraflara dokun.
                    </p>
                    {autoFlaggedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setSelectedKeys(new Set(
                            displayUrls
                              .filter(u => AUTO_EXCLUDE.some(p => u.toLowerCase().includes(p)))
                              .map(galleryUrlKey),
                          ));
                        }}
                        style={{
                          width: '100%', minHeight: 44, padding: '0 14px', borderRadius: 12, cursor: 'pointer',
                          background: 'rgba(245,158,11,0.1)', border: '0.5px solid rgba(245,158,11,0.3)',
                          color: t.warning, fontSize: 13, fontWeight: 700,
                        }}
                      >
                        Uyarılı {autoFlaggedCount} görseli seç
                      </button>
                    )}
                  </>
                ) : confirmingDelete ? (
                  <>
                    <p style={{ fontSize: 13, color: t.textPrimary, lineHeight: 1.45, margin: 0, fontWeight: 600 }}>
                      {selectedCount} fotoğraf galeriden kalıcı olarak silinecek.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => setConfirmingDelete(false)}
                        style={{
                          flex: 1, minHeight: 44, borderRadius: 12, cursor: deleting ? 'default' : 'pointer',
                          background: 'transparent', border: `0.5px solid ${t.separator}`,
                          color: t.textSecondary, fontSize: 14, fontWeight: 600,
                        }}
                      >
                        Vazgeç
                      </button>
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={async () => {
                          const ok = await deleteGalleryUrls(selectedKeys);
                          if (!ok) return;
                          setSelectedKeys(new Set());
                          setConfirmingDelete(false);
                          setDeleteMode(false);
                          setPage(0);
                        }}
                        style={{
                          flex: 1, minHeight: 44, borderRadius: 12, cursor: deleting ? 'wait' : 'pointer',
                          background: 'rgba(239,68,68,0.14)', border: '0.5px solid rgba(239,68,68,0.35)',
                          color: '#F87171', fontSize: 14, fontWeight: 700, opacity: deleting ? 0.6 : 1,
                        }}
                      >
                        {deleting ? 'Siliniyor…' : 'Sil'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedKeys(new Set())}
                      style={{
                        minHeight: 44, padding: '0 14px', borderRadius: 12, cursor: 'pointer',
                        background: 'transparent', border: `0.5px solid ${t.separator}`,
                        color: t.textSecondary, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                      }}
                    >
                      Temizle
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      style={{
                        flex: 1, minHeight: 44, borderRadius: 12, cursor: 'pointer',
                        background: 'rgba(239,68,68,0.12)', border: '0.5px solid rgba(239,68,68,0.3)',
                        color: '#F87171', fontSize: 14, fontWeight: 700,
                      }}
                    >
                      {selectedCount} fotoğrafı sil
                    </button>
                  </div>
                )}
              </div>
            )}

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 12, padding: '8px 0' }}>
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, cursor: page === 0 ? 'default' : 'pointer',
                    background: page === 0 ? 'transparent' : t.accentDim,
                    border: `0.5px solid ${page === 0 ? t.separator : t.accentBorder}`,
                    color: page === 0 ? t.textMuted : t.accent, fontSize: 14, fontWeight: 600 }}>
                  ← Önceki
                </button>
                <span style={{ fontSize: 12, color: t.textMuted }}>
                  {page + 1} / {totalPages}
                  <span style={{ color: t.textTertiary }}> · {displayUrls.length} fotoğraf</span>
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  style={{ minHeight: 44, padding: '0 18px', borderRadius: 22,
                    cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                    background: page >= totalPages - 1 ? 'transparent' : t.accentDim,
                    border: `0.5px solid ${page >= totalPages - 1 ? t.separator : t.accentBorder}`,
                    color: page >= totalPages - 1 ? t.textMuted : t.accent, fontSize: 14, fontWeight: 600 }}>
                  Sonraki →
                </button>
              </div>
            )}
          </SCard>
        );
      })()}

      {displayUrls.length === 0 && (
        <SCard t={t} title="Boş galeri">
          <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
            <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 14 }}>
              Henüz galeri fotoğrafı yok. Yükleme ekranından ekleyebilir veya marka analizi ile Instagram'dan çekebilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => openGalleryGroup('upload')}
              style={{
                padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: t.accentDim, color: t.accent, fontSize: 13, fontWeight: 700,
              }}
            >
              Fotoğraf Yükle →
            </button>
          </div>
        </SCard>
      )}
        </>
      )}
    </>
  );
}

// ─── Vibe DNA tab ──────────────────────────────────────────────────────
function VibeDnaTab({ t, tenantId, pyCtx, queryClient }: {
  t: T; tenantId: string | null; pyCtx: any; queryClient: ReturnType<typeof useQueryClient>;
}) {
  const existingVibe = (pyCtx as any)?.brand_vibe_profile as Record<string, any> | null | undefined;
  const vibeUpdatedAt = (pyCtx as any)?.brand_vibe_profile_updated_at as string | null | undefined;

  const [handles, setHandles] = useState<string[]>(
    existingVibe?.source_accounts?.length ? existingVibe.source_accounts : ['']
  );
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<Record<string, any> | null>(existingVibe ?? null);

  // Keep in sync when pyCtx reloads
  useEffect(() => {
    if (existingVibe && !result) setResult(existingVibe);
  }, [existingVibe]);

  async function extract() {
    const cleaned = handles.map(h => h.replace(/^@/, '').trim()).filter(Boolean);
    if (!cleaned.length) { setStatus('En az 1 Instagram hesabı girin.'); return; }
    if (!tenantId) { setStatus('Workspace bulunamadı.'); return; }
    setLoading(true);
    setStatus('Apify ile postlar çekiliyor…');
    try {
      const res = await fetchTenantBff(`/api/brand-context/${tenantId}/extract-vibe`, tenantId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handles: cleaned, posts_per_handle: 10, max_images: 10, persist: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus(`Hata: ${data.message ?? data.error ?? 'Bilinmeyen hata'}`);
        return;
      }
      setResult(data.profile);
      await invalidateBrandContextWriteQueries(queryClient, tenantId);
      setStatus(`✓ Tamamlandı — ${data.stats?.images_analyzed ?? '?'} görsel analiz edildi.`);
    } catch (e) {
      setStatus(`Hata: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  const swatch = (hex: string, label: string) => (
    <div key={hex} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 18, height: 18, borderRadius: 5, background: hex, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />
      <span style={{ fontSize: 11, color: t.textMuted, fontFamily: 'monospace' }}>{hex}</span>
      <span style={{ fontSize: 10, color: t.textTertiary }}>{label}</span>
    </div>
  );

  return (
    <>
      <SCard t={t} title="Vibe DNA" accent={t.accent}>
        <div style={{ marginBottom: 12 }}>
          {handles.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: t.textMuted, pointerEvents: 'none' }}>@</span>
                <input
                  value={h}
                  onChange={e => { const next = [...handles]; next[i] = e.target.value; setHandles(next); }}
                  placeholder="markaniz"
                  disabled={loading}
                  style={{ width: '100%', paddingLeft: 28, paddingRight: 12, paddingTop: 11, paddingBottom: 11, borderRadius: 12, outline: 'none', boxSizing: 'border-box', fontSize: 16, background: t.isDark ? 'rgba(255,255,255,0.06)' : '#fff', border: `1px solid ${t.separator}`, color: t.textPrimary }}
                />
              </div>
              {handles.length > 1 && (
                <button type="button" onClick={() => setHandles(handles.filter((_, j) => j !== i))} disabled={loading}
                  aria-label="Hesabı kaldır"
                  style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', color: '#EF4444', fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ×
                </button>
              )}
            </div>
          ))}
          {handles.length < 5 && (
            <button type="button" onClick={() => setHandles([...handles, ''])} disabled={loading}
              style={{ fontSize: 13, color: t.accent, background: 'transparent', border: 'none', cursor: 'pointer', minHeight: 44, padding: '10px 0', fontWeight: 600 }}>
              + hesap ekle
            </button>
          )}
        </div>

        {/* Extract button */}
        <button
          onClick={extract}
          disabled={loading || !tenantId}
          style={{ width: '100%', padding: '13px', borderRadius: 14, cursor: loading ? 'default' : 'pointer', fontWeight: 700, fontSize: 15, border: 'none', background: loading ? t.accentDim : t.accent, color: loading ? t.accent : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading ? (
            <>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${t.accent}`, borderTop: '2px solid transparent', animation: 'spinSlow 0.8s linear infinite' }} />
              Analiz ediliyor…
            </>
          ) : 'Vibe DNA\'yı Çıkar'}
        </button>

        {/* Status */}
        {status && (
          <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
            background: status.startsWith('✓') ? t.successDim : status.startsWith('Hata') ? 'rgba(239,68,68,0.08)' : t.accentDim,
            color: status.startsWith('✓') ? t.success : status.startsWith('Hata') ? '#EF4444' : t.accent,
            border: `0.5px solid ${status.startsWith('✓') ? t.success + '30' : status.startsWith('Hata') ? 'rgba(239,68,68,0.25)' : t.accentBorder}`,
          }}>
            {status}
          </div>
        )}
      </SCard>

      {/* Results card */}
      {result && (
        <SCard t={t} title="Çıkarılan Vibe" accent={t.success}>
          {/* Meta */}
          {(result.source_accounts?.length || vibeUpdatedAt || result.extracted_at) && (
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {result.source_accounts?.map((a: string) => (
                <span key={a} style={{ background: t.accentDim, color: t.accent, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>@{a}</span>
              ))}
              {(result.extracted_at || vibeUpdatedAt) && (
                <span>{new Date((result.extracted_at ?? vibeUpdatedAt)!).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {result.image_sample_count > 0 && <span>📷 {result.image_sample_count} görsel</span>}
            </div>
          )}

          {/* Palette — read-only source summary; edit production colors in Renk Paleti */}
          {result.palette && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Palet
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, opacity: 0.9 }}>
                {swatch(result.palette.primary, 'ana renk')}
                {swatch(result.palette.accent, 'vurgu')}
                {swatch(result.palette.neutral, 'nötr')}
                {swatch(result.palette.shadow, 'gölge')}
              </div>
              {result.palette.palette_description && (
                <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 8, lineHeight: 1.5 }}>{result.palette.palette_description}</div>
              )}
            </div>
          )}

          {/* Grading */}
          {result.grading && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Renk Gradyanı</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ background: t.accentDim, color: t.accent, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{result.grading.look}</span>
              </div>
              {result.grading.lut_directive && (
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6, lineHeight: 1.5, fontStyle: 'italic' }}>{result.grading.lut_directive}</div>
              )}
            </div>
          )}

          {/* Composition */}
          {result.composition && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Kompozisyon</div>
              <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>
                {result.composition.framing_rules}
                {result.composition.subject_focus && <div style={{ marginTop: 4, color: t.textMuted, fontSize: 12 }}>{result.composition.subject_focus}</div>}
              </div>
            </div>
          )}

          {/* Content pillars */}
          {result.content_pillars_visual?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Görsel Temalar</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.content_pillars_visual.map((p: string) => (
                  <span key={p} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: t.textSecondary }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Anti-patterns */}
          {result.anti_patterns?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Anti-Patterns</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.anti_patterns.map((p: string) => (
                  <span key={p} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '0.5px solid rgba(239,68,68,0.2)' }}>✗ {p}</span>
                ))}
              </div>
            </div>
          )}

          {/* What makes it agency level */}
          {result.what_makes_this_agency_level && (
            <div style={{ padding: '10px 12px', borderRadius: 12, background: t.successDim, border: `0.5px solid ${t.success}30` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.success, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Ajans Kalitesini Yapan</div>
              <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>{result.what_makes_this_agency_level}</div>
            </div>
          )}
        </SCard>
      )}

      {/* Reference frames preview */}
      {result && result.reference_frames?.length > 0 && (
        <SCard t={t} title={`Referans Görseller (${result.reference_frames.length})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {result.reference_frames.slice(0, 9).map((f: { url: string }, i: number) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={f.url} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 10, display: 'block' }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            ))}
          </div>
        </SCard>
      )}
    </>
  );
}

// ─── Advanced Visual Settings (collapsible sub-component) ───────────────
function AdvancedVisualSettings({ t, aiEnabled, aiLevel, aiGalleryRevise, aiUseIdentity, aiBriefDrives, aiEmbedLogo, aiSubject, aiCaptionDriven, aiAdaptiveScene, aiAdaptiveMode, aiFormats, currentTheme, sector, saveAiSetting, toggleFormat }: {
  t: T; aiEnabled: boolean; aiLevel: string; aiGalleryRevise: boolean;
  aiUseIdentity: boolean; aiBriefDrives: boolean; aiEmbedLogo: boolean;
  aiSubject: string; aiCaptionDriven: boolean; aiAdaptiveScene: boolean;
  aiAdaptiveMode: string; aiFormats: Set<string>;
  currentTheme: Record<string, unknown>;
  sector?: string | null;
  saveAiSetting: (patch: Record<string, unknown>) => void;
  toggleFormat: (fmt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `0.5px solid ${t.separator}`, paddingTop: 12, marginTop: 4 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 0', background: 'transparent', border: 'none', cursor: 'pointer',
        }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary }}>İleri Ayarlar</span>
        <span style={{ fontSize: 14, color: t.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>{'\u25BC'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderRadius: 14, marginBottom: 12,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            border: `0.5px solid ${aiEnabled ? (t as any).accentBorder ?? t.accent : t.separator}`,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>AI Fotoğraf İyileştirme</div>
            </div>
            <Toggle
              t={t}
              on={aiEnabled}
              label="AI Fotoğraf İyileştirme"
              onToggle={() => {
                const next = !aiEnabled;
                saveAiSetting(buildVisualSourceModeFromFlags({
                  aiPhotoEnhance: next,
                  aiCaptionDrivenVisual: next ? aiCaptionDriven : false,
                }));
              }}
            />
          </div>

          {aiEnabled && (
            <div>
              <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Geliştirme Seviyesi</div>
              {[
                { level: 'subtle', label: 'Hafif' },
                { level: 'moderate', label: 'Orta' },
                { level: 'full', label: 'Tam' },
              ].map(({ level, label }) => {
                const isActive = aiLevel === level;
                return (
                  <button key={level} onClick={() => saveAiSetting({ ai_photo_enhance_level: level })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', marginBottom: 6, background: isActive ? (t as any).accentDim ?? 'rgba(139,171,189,0.1)' : 'transparent', border: `0.5px solid ${isActive ? t.accent : t.separator}` }}>
                    <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? t.accent : t.textPrimary }}>{label}</div>
                  </button>
                );
              })}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, margin: '14px 0 8px', background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `0.5px solid ${aiGalleryRevise ? t.accent : t.separator}` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Galeri fotoğrafını düzelt</div>
                </div>
                <Toggle
                  t={t}
                  on={aiGalleryRevise}
                  color="#10B981"
                  label="Galeri fotoğrafını düzelt"
                  onToggle={() => saveAiSetting({ ai_enhance_gallery_selected: !aiGalleryRevise })}
                />
              </div>

              <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '16px 0 10px' }}>Görsel standardı</div>
              {[
                { key: 'ai_use_brand_identity', on: aiUseIdentity, title: 'Marka kimliği' },
                { key: 'ai_brief_drives_scene', on: aiBriefDrives, title: 'Brief sahneyi yönetir' },
                { key: 'ai_embed_logo', on: aiEmbedLogo, title: 'Logo yerleştir' },
              ].map(({ key, on, title }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, marginBottom: 6, border: `0.5px solid ${t.separator}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{title}</div>
                  <Toggle t={t} on={on} label={title} onToggle={() => saveAiSetting({ [key]: !on })} />
                </div>
              ))}

              <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '12px 0 8px' }}>Görsel konu</div>
              {[
                { id: 'auto' },
                { id: 'venue_ambiance' },
                { id: 'product_hero' },
              ].map(({ id }) => {
                const active = aiSubject === id;
                const label = labelAiVisualSubject(id, sector);
                return (
                  <button key={id} onClick={() => saveAiSetting({ ai_visual_subject: id })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', marginBottom: 6, background: active ? (t as any).accentDim ?? 'rgba(139,171,189,0.1)' : 'transparent', border: `0.5px solid ${active ? t.accent : t.separator}` }}>
                    <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? t.accent : t.textPrimary }}>{label}</div>
                  </button>
                );
              })}

              <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '16px 0 10px' }}>AI Sahne Uyarlama</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, marginBottom: 10, background: t.isDark ? 'rgba(77,112,136,0.08)' : 'rgba(77,112,136,0.06)', border: `0.5px solid ${aiAdaptiveScene ? 'rgba(77,112,136,0.35)' : t.separator}` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Caption&apos;a uygun sahne</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{aiAdaptiveScene ? 'Aktif' : 'Kapalı'}</div>
                </div>
                <Toggle
                  t={t}
                  on={aiAdaptiveScene}
                  color="#4D7088"
                  label="Caption'a uygun sahne"
                  onToggle={() => saveAiSetting({ ai_adaptive_scene: !aiAdaptiveScene })}
                />
              </div>
              {aiAdaptiveScene && (
                <div style={{ marginBottom: 12 }}>
                  {[
                    { id: 'auto', label: 'Otomatik' },
                    { id: 'venue_context', label: 'Mekan / operasyon' },
                    { id: 'product_showcase', label: 'Ürün vitrin' },
                    { id: 'lifestyle_composite', label: 'Lifestyle kompozit' },
                  ].map(({ id, label }) => {
                    const active = aiAdaptiveMode === id;
                    return (
                      <button key={id} onClick={() => saveAiSetting({ ai_adaptive_scene_mode: id })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', marginBottom: 6, background: active ? 'rgba(77,112,136,0.12)' : 'transparent', border: `0.5px solid ${active ? 'rgba(77,112,136,0.35)' : t.separator}` }}>
                        <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#4D7088' : t.textPrimary }}>{label}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '12px 0 8px' }}>AI formatları</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(['post', 'story', 'carousel', 'reel'] as const).map((fmt) => {
                  const on = aiFormats.has(fmt);
                  const labels = { post: 'Post', story: 'Story', carousel: 'Carousel', reel: 'Reel' };
                  return (
                    <button key={fmt} onClick={() => toggleFormat(fmt)} style={{ padding: '8px 12px', borderRadius: 20, border: `0.5px solid ${on ? t.accent : t.separator}`, background: on ? (t as any).accentDim ?? 'rgba(139,171,189,0.1)' : 'transparent', fontSize: 12, fontWeight: on ? 700 : 500, color: on ? t.accent : t.textMuted, cursor: 'pointer' }}>
                      {labels[fmt]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `0.5px solid ${t.separator}` }}>
            <div style={{ fontSize: 11, color: (t as any).labelColor ?? t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Visual Production Director</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `0.5px solid ${themeFlag(currentTheme, 'enable_visual_production_director') ? t.accent : t.separator}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>Crew görsel direktör</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{themeFlag(currentTheme, 'enable_visual_production_director') ? 'Açık' : 'Kapalı'}</div>
              </div>
              <Toggle
                t={t}
                on={themeFlag(currentTheme, 'enable_visual_production_director')}
                label="Crew görsel direktör"
                onToggle={() => saveAiSetting({ enable_visual_production_director: !themeFlag(currentTheme, 'enable_visual_production_director') })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────
export function BrandConstitution() {
  const { t } = useTheme();
  const queryClient = useQueryClient();
  const { tenantId: storeTenantId } = useWorkspaceStore();
  const tenantId = useActiveTenantId() ?? storeTenantId;
  const brandGaps = useBrandCompleteGaps(tenantId);
  const { goBack, brandReadinessFix, brandReadinessCheckId, clearBrandReadinessFix, history, brandHomeNonce } = useMobileStore();
  const debugUi = isDebugUiMode();
  type IdentityGroup = 'basics' | 'channels' | 'about';
  const [tab, setTab] = useState<Tab>('identity');
  const [view, setView] = useState<'dashboard' | 'section'>('dashboard');
  const [designGroup, setDesignGroup] = useState<DesignGroup | null>(null);
  const [contentGroup, setContentGroup] = useState<ContentGroup | null>(null);
  const [strategyGroup, setStrategyGroup] = useState<StrategyGroup | null>(null);
  const [identityGroup, setIdentityGroup] = useState<IdentityGroup | null>(null);
  const [saved, setSaved] = useState(false);
  // A rejected settings PATCH silently reverted the toggle; the user had no way
  // to tell the setting never took.
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const openSection = React.useCallback((
    next: Tab,
    opts?: {
      identityGroup?: IdentityGroup | null;
      contentGroup?: ContentGroup | null;
      strategyGroup?: StrategyGroup | null;
      designGroup?: DesignGroup | null;
    },
  ) => {
    const rawContent = opts?.contentGroup ?? null;
    // Legacy deep-links under İçerik DNA → Strateji tab
    if (next === 'content' && isStrategyLeaf(rawContent)) {
      setTab('strategy');
      setView('section');
      setStrategyGroup(normalizeStrategyGroup(rawContent));
      setContentGroup(null);
      setDesignGroup(null);
      setIdentityGroup(null);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
      return;
    }
    setTab(next);
    setView('section');
    setDesignGroup(normalizeDesignGroup(opts?.designGroup ?? null));
    setContentGroup(normalizeContentGroup(rawContent));
    setStrategyGroup(
      next === 'strategy'
        ? normalizeStrategyGroup(opts?.strategyGroup ?? null)
        : null,
    );
    setIdentityGroup(opts?.identityGroup ?? null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);

  const openDesignGroup = React.useCallback((g: DesignGroup | null) => {
    setDesignGroup(normalizeDesignGroup(g));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);

  const openContentGroup = React.useCallback((g: ContentGroup | null) => {
    if (isStrategyLeaf(g)) {
      setTab('strategy');
      setView('section');
      setStrategyGroup(normalizeStrategyGroup(g));
      setContentGroup(null);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
      return;
    }
    setContentGroup(normalizeContentGroup(g));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);

  const openStrategyGroup = React.useCallback((g: StrategyGroup | null) => {
    setStrategyGroup(normalizeStrategyGroup(g));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);

  const openIdentityGroup = React.useCallback((g: IdentityGroup | null) => {
    // Açıklama & Ürünler → İçerik DNA → Hikaye & Ses
    if (g === 'about') {
      setTab('content');
      setView('section');
      setContentGroup('story');
      setIdentityGroup(null);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
      return;
    }
    // Kanallar — Studio alt ekranı (Marka Profili ana listesinden ayrıldı).
    if (g === 'channels') {
      setTab('identity');
      setView('section');
      setIdentityGroup('channels');
      if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
      return;
    }
    // Basics — scroll to Kimlik on the main Marka Profili screen.
    setIdentityGroup(null);
    if (typeof window === 'undefined') return;
    if (g === 'basics') {
      window.setTimeout(() => {
        const el = document.querySelector('[data-brand-form="service-profile"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return;
    }
    window.scrollTo({ top: 0 });
  }, []);
  const [analyzeFeedback, setAnalyzeFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [descriptionAiFeedback, setDescriptionAiFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [newCompetitor, setNewCompetitor] = useState('');
  const [confirmingConstitution, setConfirmingConstitution] = useState(false);
  const [constitutionConfirmError, setConstitutionConfirmError] = useState<string | null>(null);

  const [galleryInitialGroup, setGalleryInitialGroup] = useState<BrandGalleryGroup | null>(null);
  const [focusAnchor, setFocusAnchor] = useState<string | null>(null);

  // Bottom Marka orb (and other setTab('brand') entry points) must always land on the hub,
  // even though the brand tab pane stays mounted across navigation.
  useEffect(() => {
    if (brandHomeNonce === 0) return;
    setTab('identity');
    setView('dashboard');
    setDesignGroup(null);
    setContentGroup(null);
    setStrategyGroup(null);
    setIdentityGroup(null);
    setGalleryInitialGroup(null);
    setFocusAnchor(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, [brandHomeNonce]);

  useEffect(() => {
    if (!brandReadinessFix && !brandReadinessCheckId) return;
    const target = resolveBrandReadinessNav(brandReadinessFix, brandReadinessCheckId);
    if (target) {
      // Legacy identity/about deep-links → İçerik DNA → Hikaye & Ses
      const aboutFromIdentity = target.identityGroup === 'about' && !target.contentGroup;
      const rawContent = aboutFromIdentity
        ? 'story' as const
        : ((target.contentGroup as ContentGroup | null | undefined) ?? null);
      const strategyFromContent = isStrategyLeaf(rawContent)
        ? normalizeStrategyGroup(rawContent)
        : normalizeStrategyGroup((target.strategyGroup as StrategyGroup | null | undefined) ?? null);
      const nextTab: Tab = aboutFromIdentity
        ? 'content'
        : strategyFromContent
          ? 'strategy'
          : (target.tab as Tab);
      setTab(nextTab);
      setView('section');
      setDesignGroup(normalizeDesignGroup((target.designGroup as DesignGroup | null | undefined) ?? null));
      setContentGroup(strategyFromContent ? null : normalizeContentGroup(rawContent));
      setStrategyGroup(strategyFromContent);
      setIdentityGroup(aboutFromIdentity ? null : (target.identityGroup ?? null));
      if (target.galleryGroup) setGalleryInitialGroup(target.galleryGroup);
      setFocusAnchor(aboutFromIdentity ? 'brand-about' : target.anchor);
    } else if (brandReadinessFix) {
      const nextTab = brandReadinessFixToBrandTab(brandReadinessFix);
      if (nextTab) {
        setTab(nextTab);
        setView('section');
        setDesignGroup(null);
        setContentGroup(null);
        setStrategyGroup(null);
        setIdentityGroup(null);
      }
    }
    clearBrandReadinessFix();
  }, [brandReadinessFix, brandReadinessCheckId, clearBrandReadinessFix]);

  useEffect(() => {
    if (!focusAnchor) return;
    focusBrandReadinessAnchor(focusAnchor, 480);
    const timer = window.setTimeout(() => setFocusAnchor(null), 3000);
    return () => window.clearTimeout(timer);
  }, [focusAnchor, tab, designGroup, contentGroup, strategyGroup, identityGroup, galleryInitialGroup]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['company-profile', tenantId],
    queryFn: () => apiClient.getCompanyProfile(tenantId ?? undefined),
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: pyCtx, isError: pyCtxLoadFailed, error: pyCtxLoadError } = useQuery({
    queryKey: ['brand-context-data', tenantId],
    queryFn: () => apiClient.getBrandContextData(tenantId!),
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
    retry: 1,
  });

  const { data: brandThemePayload } = useQuery({
    queryKey: ['brand-theme-kit', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const r = await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
        headers: getTenantBffHeaders(tenantId),
      });
      if (!r.ok) return null;
      return r.json() as Promise<{ theme?: Record<string, unknown> | null }>;
    },
    staleTime: 5 * 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: productionReadiness } = useQuery<{
    score?: number;
    productionProfile?: ProductionProfileReadinessResult;
  }>({
    queryKey: ['brand-readiness', tenantId],
    queryFn: async () => {
      if (!tenantId) return {};
      const r = await fetchTenantBff(`/api/brand-readiness/${tenantId}`, tenantId);
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: metaCampaigns = [] } = useQuery({
    queryKey: ['meta-campaigns', tenantId],
    queryFn: () => apiClient.getMetaCampaigns(tenantId),
    staleTime: 2 * 60_000,
    // Debug-only Marka Analiz surface — Ads live under Menü → Reklamlar for customers.
    enabled: Boolean(tenantId) && debugUi,
  });

  // One-time backfill: push .NET profile fields into Python brand_context so
  // Mission Hub readiness checks (location, description, target_audience, brand_tone)
  // reflect the latest values even if the user never re-saved them.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (backfilledRef.current || !tenantId || !profile || !pyCtx) return;
    const p = profile as any;
    const b = pyCtx as any;
    const patch: Record<string, string> = {};
    const profileName = String(p.brandName || '').trim();
    const pyName = String(b.business_name || '').trim();
    if (profileName && profileName !== pyName && !isCrossTenantPollutionName(profileName, b)) {
      patch.business_name = profileName;
    }
    if (!b.location && p.location?.trim()) patch.location = p.location.trim();
    if (!b.description && p.description?.trim()) patch.description = p.description.trim();
    if (!b.target_audience && p.targetAudience?.trim()) patch.target_audience = p.targetAudience.trim();
    if (!b.brand_tone && p.brandTone?.trim()) {
      patch.brand_tone = TONE_TO_PYTHON[p.brandTone] || p.brandTone;
    }
    const nexusLang = String(p.languages || '').split(',')[0]?.trim().toLowerCase();
    const pyLang = String(b.languages || '').split(',')[0]?.trim().toLowerCase();
    if (nexusLang && nexusLang !== pyLang && (nexusLang === 'en' || nexusLang === 'tr' || nexusLang === 'de')) {
      fetchTenantBff(`/api/brand-context/${tenantId}/set-language`, tenantId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: nexusLang }),
      }).then(() => {
        void invalidateBrandContextWriteQueries(queryClient, tenantId);
      }).catch(() => {/* non-fatal */});
    }
    if (Object.keys(patch).length === 0) { backfilledRef.current = true; return; }
    backfilledRef.current = true;
    fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(() => {
      void invalidateBrandContextWriteQueries(queryClient, tenantId);
    }).catch(() => {/* non-fatal */});
  }, [tenantId, profile, pyCtx, queryClient]);

  // Mutation to save profile
  const saveMutation = useMutation({
    mutationFn: (data: Partial<SaveCompanyProfileRequest>) => {
      const merged = { ...(profile as any), ...data } as SaveCompanyProfileRequest;
      const brandName = String(merged.brandName || '').trim();
      // Never re-persist a summary that names another tenant (partial saves spread old fields).
      if (
        brandName
        && isForeignBrandCustomerSummary(
          merged.customerVisibleSummary,
          brandName,
          pyCtx as Record<string, unknown> | undefined,
        )
      ) {
        merged.customerVisibleSummary = resolveCustomerVisibleSummary(
          '',
          brandName,
          pyCtx as Record<string, unknown> | undefined,
        );
      }
      return apiClient.saveCompanyProfile(merged);
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      const name = String(variables.brandName || '').trim();
      if (name && tenantId) {
        fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_name: name }),
        }).then(() => {
          void invalidateBrandContextWriteQueries(queryClient, tenantId);
        }).catch(() => {/* non-fatal */});
      }
      if (tenantId && variables.contentNeeds !== undefined) {
        const pillars = parseContentIntentSlugs(variables.contentNeeds);
        try {
          await mirrorPillarsToPythonBrandContext(tenantId, pillars);
          await afterPillarsMirroredToPython(queryClient, tenantId);
        } catch {
          /* Nexus saved; Python mirror is best-effort */
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const descriptionAiMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId || !profile) throw new Error('tenant_required');
      setDescriptionAiFeedback(null);

      const current = profile as CompanyProfile & Record<string, unknown>;
      const websiteUrl = cleanProfileText(current.websiteUrl || (pyCtx as Record<string, unknown> | undefined)?.website_url);
      const instagramHandle = cleanProfileText(
        current.instagramHandle || (pyCtx as Record<string, unknown> | undefined)?.instagram_handle,
      ).replace(/^@/, '');
      const googleBusinessUrl = cleanProfileText(
        current.googleBusinessUrl || (pyCtx as Record<string, unknown> | undefined)?.google_business_url,
      );
      if (!websiteUrl && !instagramHandle && !googleBusinessUrl) {
        throw new Error('AI analizi için web sitesi, Instagram veya Google Business bilgisi ekleyin.');
      }

      try {
        await apiClient.discoverBrand({
          websiteUrl: websiteUrl || undefined,
          instagramHandle: instagramHandle || undefined,
          googleBusinessUrl: googleBusinessUrl || undefined,
          applyToProfile: true,
        });
      } catch {
        // Python analysis below is the source of truth for this field.
      }

      const analysis = await apiClient.analyzeBrandContext(tenantId, {
        websiteUrl,
        instagramHandle,
        googleBusinessUrl,
        brandName: cleanProfileText(current.brandName || (pyCtx as Record<string, unknown> | undefined)?.business_name),
      });
      const ctx = (analysis.brand_context ?? {}) as Record<string, unknown>;
      const pillars = analysis.content_pillars?.length
        ? analysis.content_pillars
        : parseArr(ctx.content_pillars);
      const ctas = analysis.default_ctas?.length
        ? analysis.default_ctas
        : parseArr(ctx.default_ctas);
      const industry = cleanProfileText(current.industry)
        || cleanProfileText(analysis.inferred_industry)
        || cleanProfileText(ctx.business_type)
        || cleanProfileText(ctx.industry);
      const langRaw = String(current.languages || (pyCtx as Record<string, unknown> | undefined)?.languages || 'tr')
        .split(',')[0]
        ?.trim()
        .toLowerCase() || 'tr';
      const language = langRaw.startsWith('en') ? 'en' : 'tr';

      const sp = ctx.brand_service_profile;
      const signatureOfferings = Array.isArray((sp as Record<string, unknown> | undefined)?.signature_offerings)
        ? ((sp as Record<string, unknown>).signature_offerings as unknown[])
            .map((x) => cleanProfileText(x))
            .filter(Boolean)
        : [];

      const synthRes = await fetchTenantBff(
        `/api/brand-context/${tenantId}/synthesize-description`,
        tenantId,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getTenantBffHeaders(tenantId),
          },
          body: JSON.stringify({
            language,
            brandName: cleanProfileText(current.brandName || ctx.business_name),
            industry,
            location: cleanProfileText(current.location || ctx.location),
            websiteSummary: cleanProfileText(analysis.website_summary || ctx.website_summary || ctx.description),
            instagramBio: cleanProfileText(analysis.instagram_bio || ctx.instagram_bio),
            googleDescription: cleanProfileText(ctx.google_description),
            targetAudience: cleanProfileText(current.targetAudience || ctx.target_audience),
            brandTone: cleanProfileText(analysis.inferred_tone || ctx.brand_tone || current.brandTone),
            contentPillars: pillars,
            defaultCtas: ctas,
            signatureOfferings,
          }),
        },
      );
      const synthJson = (await synthRes.json().catch(() => ({}))) as {
        description?: string;
        message?: string;
        error?: string;
      };
      if (!synthRes.ok) {
        throw new Error(
          synthJson.message || synthJson.error || 'AI açıklama sentezi başarısız oldu.',
        );
      }
      const nextDescription = String(synthJson.description ?? '')
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!nextDescription) throw new Error('AI analizinden açıklama üretilemedi.');

      const updates: Partial<SaveCompanyProfileRequest> = {
        description: nextDescription,
      };
      if (!cleanProfileText(current.targetAudience) && cleanProfileText(ctx.target_audience)) {
        updates.targetAudience = cleanProfileText(ctx.target_audience).slice(0, 500);
      }
      if (!cleanProfileText(current.visualStyle) && cleanProfileText(ctx.visual_style)) {
        updates.visualStyle = cleanProfileText(ctx.visual_style).slice(0, 200);
      }
      if (!cleanProfileText(current.campaignGoals) && ctas.length) {
        updates.campaignGoals = ctas.join(', ').slice(0, 1000);
      }
      if (!cleanProfileText(current.contentNeeds) && pillars.length) {
        updates.contentNeeds = JSON.stringify(pillars);
      }

      await apiClient.saveCompanyProfile({ ...(current as any), ...updates } as SaveCompanyProfileRequest);
      patchPythonBrandFields({
        description: nextDescription,
        ...(updates.targetAudience ? { target_audience: updates.targetAudience } : {}),
        ...(updates.visualStyle ? { visual_style: updates.visualStyle } : {}),
      });
      return nextDescription;
    },
    onSuccess: () => {
      setDescriptionAiFeedback({
        kind: 'ok',
        text: 'AI açıklama + ürün/hizmet listesi oluşturuldu ve kaydedildi.',
      });
      queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      void invalidateBrandContextWriteQueries(queryClient, tenantId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => {
      setDescriptionAiFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'AI açıklama analizi başarısız oldu.',
      });
    },
  });

  // Python → Nexus: UI reads CompanyProfile; discovery lives in brand_contexts.
  const hydratedFromPythonRef = useRef(false);
  const hydrateMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('tenant_required');
      return apiClient.hydrateCompanyProfileFromPython(tenantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      void invalidateBrandContextWriteQueries(queryClient, tenantId);
    },
  });

  useEffect(() => {
    if (hydratedFromPythonRef.current || !tenantId || !profile || hydrateMutation.isPending) return;
    const profileRec = profile as unknown as Record<string, unknown>;
    const needsIndustrySync = Boolean(
      pyCtx && !pyCtxLoadFailed
      && shouldRefreshIndustryFromPython(profileRec, pyCtx as Record<string, unknown>),
    );
    if (!isCompanyProfileSparse(profileRec) && !needsIndustrySync) return;
    if (pyCtx && !pyCtxLoadFailed) {
      const patch = buildCompanyProfilePatchFromPython(profileRec, pyCtx as Record<string, unknown>);
      if (patch) {
        hydratedFromPythonRef.current = true;
        saveMutation.mutate(patch);
        return;
      }
    }
    hydratedFromPythonRef.current = true;
    hydrateMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydrate when profile sparse or sector stale
  }, [tenantId, profile, pyCtx, pyCtxLoadFailed]);

  const brandKitEnrichedRef = useRef(false);
  useEffect(() => {
    if (brandKitEnrichedRef.current || !tenantId || !profile) return;
    const p = profile as CompanyProfile & Record<string, unknown>;
    const b = pyCtx as Record<string, unknown> | undefined;
    const website = String(p.websiteUrl || b?.website_url || '').trim();
    if (!website) return;

    const themeTypo = (brandThemePayload?.theme as Record<string, unknown> | undefined)?.typography as Record<string, string> | undefined;
    const hasPrimaryFont = Boolean(
      String(p.primaryFont || b?.brand_font_family || themeTypo?.heading_font || '').trim(),
    );
    const hasSecondaryFont = Boolean(
      String(p.secondaryFont || themeTypo?.body_font || '').trim(),
    );
    const hasColors = Boolean(b?.brand_primary_color && b?.brand_accent_color);
    if (hasPrimaryFont && hasSecondaryFont && hasColors) return;

    brandKitEnrichedRef.current = true;
    fetchTenantBff(`/api/brand-context/${tenantId}/enrich-brand-kit`, tenantId, { method: 'POST' })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((data: {
        ok?: boolean;
        primary_font?: string;
        secondary_font?: string;
        brand_colors?: string;
        accent_color?: string;
      } | null) => {
        if (!data?.ok) return;
        const updates: Partial<SaveCompanyProfileRequest> = {};
        if (!String(p.primaryFont || '').trim() && data.primary_font) updates.primaryFont = data.primary_font;
        if (!String(p.secondaryFont || '').trim() && data.secondary_font) updates.secondaryFont = data.secondary_font;
        if (!String(p.brandColors || '').trim() && data.brand_colors) updates.brandColors = data.brand_colors;
        if (!String(p.accentColors || '').trim() && data.accent_color) updates.accentColors = data.accent_color;
        if (Object.keys(updates).length === 0) return;
        return saveMutation.mutateAsync(updates);
      })
      .then(() => {
        void invalidateBrandContextWriteQueries(queryClient, tenantId);
        queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
        queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      })
      .catch(() => { brandKitEnrichedRef.current = false; });
  }, [tenantId, profile, pyCtx, brandThemePayload, queryClient, saveMutation]);

  // Re-analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setAnalyzeFeedback(null);
      const websiteUrl       = ((profile as any)?.websiteUrl ?? '').trim();
      const instagramHandle  = ((profile as any)?.instagramHandle ?? '').trim();
      const googleUrl        = ((profile as any)?.googleBusinessUrl ?? '').trim();

      if (!websiteUrl && !instagramHandle && !googleUrl) {
        throw new Error('Marka analizi için web sitesi veya Instagram bilgisi gerekli.');
      }

      // Step 1: .NET discovery (applyToProfile persists CompanyProfile + brand memory).
      try {
        await apiClient.discoverBrand({
          websiteUrl: websiteUrl || undefined,
          instagramHandle: instagramHandle || undefined,
          googleBusinessUrl: googleUrl || undefined,
          applyToProfile: true,
        });
      } catch {
        await apiClient.analyzeBrand();
      }

      // Step 2: Python deep crawl + persist brand_context.
      if (tenantId) {
        return apiClient.analyzeBrandContext(tenantId, {
          websiteUrl,
          instagramHandle,
          googleBusinessUrl: googleUrl,
          brandName: String((profile as any)?.brandName || ''),
        });
      }
      return null;
    },
    onSuccess: () => {
      setAnalyzeFeedback({ kind: 'ok', text: 'Marka analizi tamamlandı.' });
      queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] });
      void invalidateBrandContextWriteQueries(queryClient, tenantId);
    },
    onError: (err) => {
      setAnalyzeFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Marka analizi başarısız oldu.',
      });
    },
  });


  if (isLoading) {
    return (
      <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex' }}>
        <BrandLoadingScreen fillParent showLabel label="Marka profili yükleniyor…" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ height: '100dvh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: '0 32px' }}>
        <div style={{ fontSize: 36, opacity: 0.2 }}>!</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, textAlign: 'center' }}>Profil yüklenemedi</div>
        <div style={{ fontSize: 13, color: t.textMuted, textAlign: 'center', lineHeight: 1.6 }}>
          Bağlantı sorunu olabilir. Geri dönüp tekrar deneyin.
        </div>
        <button
          onClick={goBack}
          style={{ marginTop: 8, padding: '10px 24px', borderRadius: 30, border: 'none', cursor: 'pointer',
            background: t.accent, color: '#fff', fontSize: 13, fontWeight: 700 }}>
          Geri Dön
        </button>
      </div>
    );
  }

  const p = profile as CompanyProfile & Record<string, unknown>;
  const showStackBack = history.length > 1;
  const brandNameDisplay = resolveCanonicalBrandName(
    p as CompanyProfile,
    pyCtx as Record<string, unknown> | undefined,
  ) || String((pyCtx as any)?.business_name || '');
  const brandLogoDisplay = resolveCoherentLogoUrl(
    p as CompanyProfile,
    pyCtx as Record<string, unknown> | undefined,
  );
  const industrySlug = resolveTenantCanonicalSector(
    p,
    pyCtx as Record<string, unknown> | undefined,
  );
  const industryDisplay =
    TENANT_INDUSTRY_PLAYBOOKS.find((pb) => pb.id === industrySlug)?.label || industrySlug;
  const locationDisplay = String(p.location || (pyCtx as any)?.location || '');
  const websiteDisplay = String(p.websiteUrl || (pyCtx as any)?.website_url || '');
  const instagramDisplay = String((p as any).instagramHandle || (pyCtx as any)?.instagram_handle || '');
  const descriptionDisplay = String(p.description || (pyCtx as any)?.description || (pyCtx as any)?.website_summary || '');
  const score         = productionReadiness?.score ?? (p as any).discoveryConfidence ?? 0;
  const logoCandidate = brandLogoDisplay || p.logoUrl || (pyCtx as any)?.logo_url || '';
  const logoUrl = resolveBrandLogoDisplayUrl(logoCandidate);
  const contentNeeds  = parseArr((p as any).contentNeeds);
  const templateFams  = parseArr((p as any).templateFamilies);
  const riskRules     = parseObj((p as any).riskRules);
  const galleryRefUrls = parseBrandReferenceUrls((pyCtx as any)?.reference_image_urls);

  const contentLanguage = String((pyCtx as any)?.languages ?? p.languages ?? 'tr').trim().toLowerCase();

  // Field save helper
  // Tone preset → Turkish writing rule label for Python
  const TONE_TO_PYTHON: Record<string, string> = {
    professional: 'profesyonel, güvenilir, net',
    friendly:     'samimi, sıcak, kişisel',
    energetic:    'enerjik, dinamik, heyecanlı',
    luxury:       'premium, zarif, sofistike',
    casual:       'rahat, gündelik, doğal',
  };

  // .NET camelCase field → Python snake_case field mapping for fields the
  // Mission Hub readiness check reads from Python brand_contexts.
  const PYTHON_FIELD_MAP: Record<string, string> = {
    location:       'location',
    description:    'description',
    targetAudience: 'target_audience',
    brandTone:      'brand_tone',
    visualStyle:    'visual_style',
    primaryFont:    'brand_font_family',
    logoUrl:        'logo_url',
    websiteUrl:     'website_url',
    instagramHandle:'instagram_handle',
  };

  function patchPythonBrandFields(body: Record<string, unknown>) {
    if (!tenantId) return;
    fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(() => {
      void invalidateBrandContextWriteQueries(queryClient, tenantId);
      queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
    }).catch(() => {/* non-fatal */});
  }

  async function syncSecondaryFontToTheme(bodyFont: string) {
    if (!tenantId || !bodyFont.trim()) return;
    const existing = brandThemePayload?.theme as Record<string, unknown> | undefined;
    const typo = { ...((existing?.typography as Record<string, unknown>) ?? {}) };
    typo.body_font = bodyFont.trim();
    const palette = (existing?.palette as Record<string, unknown>) ?? {};
    const payload = {
      theme: {
        workspace_id: tenantId,
        derived_at: new Date().toISOString(),
        source: 'manual_colors',
        typography: typo,
        palette,
        composition: existing?.composition ?? {},
        grading: existing?.grading ?? {},
        overlay: existing?.overlay ?? { opacity: 0.25, color: '#000000' },
        layout: existing?.layout ?? { border_radius: 12, spacing_base: 8, default_layout_id: 'feed_square' },
        caption_voice_rules: existing?.caption_voice_rules ?? [],
        anti_patterns: existing?.anti_patterns ?? [],
        contrast_valid: true,
      },
    };
    await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
      body: JSON.stringify(payload),
    }).catch(() => {/* non-fatal */});
    queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
  }

  function syncToPython(field: string, value: string) {
    if (!tenantId) return;

    if (field === 'brandColors') {
      const hexes = [...value.matchAll(/#[0-9a-fA-F]{3,8}\b/gi)].map((m) => m[0]);
      const patch: Record<string, string> = {};
      if (hexes[0]) patch.brand_primary_color = hexes[0];
      if (hexes[1]) patch.brand_accent_color = hexes[1];
      if (Object.keys(patch).length) patchPythonBrandFields(patch);
      return;
    }
    if (field === 'accentColors') {
      const hex = value.match(/#[0-9a-fA-F]{3,8}\b/)?.[0];
      if (hex) patchPythonBrandFields({ brand_accent_color: hex });
      return;
    }
    if (field === 'secondaryFont') {
      void syncSecondaryFontToTheme(value);
      return;
    }
    // Sektör: Nexus industry alone is not enough — readiness + kits read SP.category.
    if (field === 'industry') {
      const sector = normalizeSectorId(value);
      const category = serviceProfileCategoryForSector(sector);
      const existingSp = (
        (pyCtx as { brand_service_profile?: Record<string, unknown> } | undefined)
          ?.brand_service_profile
      ) ?? {};
      const patch: Record<string, unknown> = {
        business_type: sector || value.trim(),
      };
      if (category) {
        patch.brand_service_profile = {
          ...existingSp,
          category,
          source: 'manual_override',
          category_confidence: 1,
          category_reason: `Operator sector edit → ${category}`,
        };
      }
      patchPythonBrandFields(patch);
      queryClient.invalidateQueries({ queryKey: ['brand-readiness', tenantId] });
      return;
    }

    const pythonKey = PYTHON_FIELD_MAP[field];
    if (!pythonKey) return;

    let pythonValue = value;
    if (field === 'brandTone') pythonValue = TONE_TO_PYTHON[value] || value;

    patchPythonBrandFields({ [pythonKey]: pythonValue });
  }

  function save(field: string) {
    return (value: string) => {
      saveMutation.mutate({ [field]: value } as any);

      // Sync mission-critical fields to Python so StrategistAgent has the latest values
      syncToPython(field, value);

      // Languages need the dedicated /set-language endpoint (not the generic PATCH)
      if (field === 'languages' && tenantId) {
        fetchTenantBff(`/api/brand-context/${tenantId}/set-language`, tenantId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: value }),
        }).then(() => {
          void invalidateBrandContextWriteQueries(queryClient, tenantId);
          queryClient.invalidateQueries({ queryKey: ['python-brand-ctx-display', tenantId] });
        }).catch(() => {/* non-fatal */});
      }
    };
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'identity', label: 'Kimlik' },
    { id: 'content', label: 'İçerik DNA' },
    { id: 'design', label: 'Görünüm' },
    { id: 'gallery', label: 'Galeri' },
    { id: 'strategy', label: 'Strateji' },
    { id: 'chatbot', label: 'Müşteri Asistanı' },
  ];
  const constitutionConfirmedAt = (pyCtx as { brand_constitution_confirmed_at?: string | null } | undefined)
    ?.brand_constitution_confirmed_at;

  const handleConfirmConstitution = async () => {
    if (!tenantId || confirmingConstitution) return;
    setConfirmingConstitution(true);
    setConstitutionConfirmError(null);
    try {
      await apiClient.confirmBrandConstitution(tenantId);
      await invalidateBrandContextWriteQueries(queryClient, tenantId);
      queryClient.invalidateQueries({ queryKey: ['brand-readiness', tenantId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Onay başarısız';
      setConstitutionConfirmError(
        msg.includes('503') || msg.toLowerCase().includes('reach')
          ? 'Marka servisi şu an ulaşılamıyor. Birkaç dakika sonra tekrar deneyin.'
          : msg,
      );
    } finally {
      setConfirmingConstitution(false);
    }
  };

  // ── Section navigation metadata (dashboard grid) ──
  const pprReady = productionReadiness?.productionProfile?.isProductionReady ?? false;
  const pprScore = productionReadiness?.productionProfile?.score ?? 0;
  const pillarsCount = (parseArr((pyCtx as any)?.content_pillars).length || contentNeeds.length);
  const ctasCount = parseArr((pyCtx as any)?.default_ctas).length;
  const photoCount = galleryRefUrls.length;
  const hasChatbot = Boolean((pyCtx as any)?.chatbot_profile);
  const channelsConnected = Boolean(websiteDisplay && instagramDisplay);

  const HUB_NAV_ITEMS = buildBrandHubNavItems({
    constitutionConfirmedAt,
    pillarsCount,
    ctasCount,
    pprReady,
    pprScore,
    photoCount,
    channelsConnected,
  });
  const HUB_ASSISTANT_ITEM = buildBrandHubAssistantNavItem(hasChatbot);

  const DESIGN_GROUPS: { key: DesignGroup; label: string; hint: string; accent: string }[] = [
    { key: 'style', label: 'Stil & DNA', hint: 'Palet, tipografi, vibe DNA', accent: '#C79A4B' },
    { key: 'templates', label: 'Şablonlar', hint: 'Tesis özellikleri ve şablon kütüphanesi', accent: '#5AA0D6' },
    { key: 'production', label: 'Üretim ayarları', hint: 'Motorlar, motion, ses, kurallar', accent: '#A985E0' },
  ];
  const activeDesignGroup = DESIGN_GROUPS.find((g) => g.key === designGroup)
    ?? (isDesignStyle(designGroup)
      ? DESIGN_GROUPS[0]
      : isDesignProduction(designGroup)
        ? DESIGN_GROUPS[2]
        : undefined);

  const resolvedTone = resolveBrandTonePreset(
    p.brandTone,
    (pyCtx as { brand_tone?: string | null } | undefined)?.brand_tone,
  );
  const toneLabel = TONE_OPTIONS.find((o) => o.value === resolvedTone)?.label ?? 'Profesyonel';
  const rawToneForHint = String(
    p.brandTone || (pyCtx as { brand_tone?: string | null } | undefined)?.brand_tone || '',
  ).trim();
  const audienceFilled = Boolean(String(p.targetAudience || (pyCtx as any)?.target_audience || '').trim());
  const goalsFilled = Boolean(String(p.campaignGoals || (pyCtx as any)?.campaign_goals || '').trim());
  const competitorsRaw = String(p.competitors || (pyCtx as any)?.competitors || '');
  const competitorCount = competitorsRaw ? competitorsRaw.split(',').map((s) => s.trim()).filter(Boolean).length : 0;
  const HUB_STRATEGY_ITEM = buildBrandHubStrategyNavItem({
    goalsFilled,
    competitorCount,
  });

  const descriptionFilled = Boolean(String(descriptionDisplay || '').trim());
  /** Production content DNA only — strategy leaves live under Strateji. */
  const CONTENT_GROUPS: { key: ContentGroup; label: string; hint: string; accent: string }[] = [
    {
      key: 'story',
      label: 'Hikaye & Ses',
      hint: descriptionFilled ? `${toneLabel} · tanım hazır` : 'Açıklama, ürünler ve marka tonu',
      accent: '#6B9BD1',
    },
    {
      key: 'goals',
      label: 'Kitle & Sütunlar',
      hint: audienceFilled
        ? `${pillarsCount} sütun · ${ctasCount} CTA`
        : 'Hedef kitle, içerik sütunları ve CTA',
      accent: '#4FB597',
    },
  ];
  const activeContentGroup = CONTENT_GROUPS.find((g) => g.key === contentGroup)
    ?? (isContentStory(contentGroup)
      ? CONTENT_GROUPS[0]
      : isContentGoals(contentGroup)
        ? CONTENT_GROUPS[1]
        : undefined);

  const STRATEGY_GROUPS: { key: StrategyGroup; label: string; hint: string; accent: string }[] = [
    {
      key: 'campaign',
      label: 'Kampanya hedefleri',
      hint: goalsFilled ? 'Hedefler tanımlı' : 'Ne başarmak istiyoruz',
      accent: '#4FB597',
    },
    {
      key: 'competitors',
      label: 'Rakipler',
      hint: competitorCount > 0 ? `${competitorCount} rakip tanımlı` : 'Rakip ekle veya AI önerisi al',
      accent: '#E08A6B',
    },
    {
      key: 'special',
      label: 'Özel Günler',
      hint: 'Tatiller, sektör günleri, zamanlı şablonlar',
      accent: '#A985E0',
    },
  ];
  const activeStrategyGroup = STRATEGY_GROUPS.find((g) => g.key === strategyGroup);

  /** Top-level section only — subgroup titles live in VisionerSubNav. */
  const sectionEyebrow = (() => {
    if (tab === 'identity') return 'Kimlik';
    if (tab === 'content') return 'İçerik DNA';
    if (tab === 'design') return 'Görünüm';
    if (tab === 'gallery') return 'Galeri';
    if (tab === 'strategy') return 'Strateji';
    if (tab === 'chatbot') return 'Müşteri Asistanı';
    return TABS.find((tb) => tb.id === tab)?.label ?? 'Marka';
  })();

  const monogram = (brandNameDisplay || 'B').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const brandColorHexes = String((pyCtx as any)?.brand_primary_color
    ? `${(pyCtx as any).brand_primary_color} ${(pyCtx as any).brand_accent_color || ''}`
    : (p as any).brandColors || t.accent)
    .match(/#[0-9a-fA-F]{3,8}/g) ?? [];
  const brandPrimary = brandColorHexes[0]
    || String((pyCtx as any)?.brand_primary_color || '').match(/#[0-9a-fA-F]{3,8}/)?.[0]
    || t.accent;
  const brandAccent = String((pyCtx as any)?.brand_accent_color || '').match(/#[0-9a-fA-F]{3,8}/)?.[0]
    || brandColorHexes[1]
    || brandPrimary;

  const sharedStatusBanners = (
    <>
      {saved && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: t.successDim, fontSize: 14, color: t.success, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          ✓ Kaydedildi
        </div>
      )}
      {settingsError && (
        <div
          role="status"
          aria-live="polite"
          style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', fontSize: 14, color: '#F87171', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span aria-hidden>⚠</span>
          <span style={{ flex: 1, lineHeight: 1.45 }}>{settingsError}</span>
          <button
            type="button"
            onClick={() => setSettingsError(null)}
            aria-label="Uyarıyı kapat"
            style={{ minWidth: 44, minHeight: 44, marginRight: -10, background: 'transparent', border: 'none', color: '#F87171', fontSize: 18, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}
      {(pyCtxLoadFailed || hydrateMutation.isPending) && (
        <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.12)', border: '0.5px solid rgba(245,158,11,0.35)', fontSize: 13, color: '#F59E0B', lineHeight: 1.5 }}>
          {hydrateMutation.isPending
            ? 'Kayıtlı marka analizi profilinize aktarılıyor…'
            : (
              <>
                Analiz verisi veritabanında duruyor; ekran boş çünkü Python servisi veya profil senkronu eksik.
                {pyCtxLoadError instanceof Error ? ` (${pyCtxLoadError.message})` : ''}
              </>
            )}
          <button
            type="button"
            onClick={() => { hydratedFromPythonRef.current = false; hydrateMutation.mutate(); }}
            disabled={hydrateMutation.isPending}
            style={{ display: 'block', marginTop: 8, padding: '8px 12px', borderRadius: 10, border: 'none', background: '#F59E0B', color: '#1a1200', fontWeight: 600, fontSize: 13, cursor: hydrateMutation.isPending ? 'wait' : 'pointer' }}
          >
            Kayıtlı veriyi yükle
          </button>
        </div>
      )}
      {saveMutation.isPending && (
        <div style={{ marginBottom: 12, fontSize: 13, color: t.textTertiary, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${t.separator}`, borderTopColor: t.accent, animation: 'spinSlow 0.8s linear infinite' }} />
          Kaydediliyor…
        </div>
      )}
    </>
  );

  return (
    <div className="sa-stack-screen" style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 96, transition: 'background 250ms' }}>

      {/* ── DASHBOARD VIEW ── */}
      {view === 'dashboard' && (
        <>
          <BrandHubDashboard
            t={t}
            showStackBack={showStackBack}
            onBack={goBack}
            brandName={brandNameDisplay}
            logoUrl={logoUrl}
            monogram={monogram}
            brandPrimary={brandPrimary}
            brandAccent={brandAccent}
            industryLabel={industryDisplay || null}
            locationLabel={locationDisplay || null}
            navItems={HUB_NAV_ITEMS}
            strategyItem={HUB_STRATEGY_ITEM}
            assistantItem={HUB_ASSISTANT_ITEM}
            constitutionConfirmedAt={constitutionConfirmedAt}
            confirmingConstitution={confirmingConstitution}
            constitutionConfirmError={constitutionConfirmError}
            onConfirmConstitution={() => void handleConfirmConstitution()}
            onOpenSection={openSection}
            showPprBanner={Boolean(productionReadiness?.productionProfile && !pprReady)}
            pprScore={pprScore}
            statusBanners={sharedStatusBanners}
          />
          {/* Menü — continues after production + assistant sections. */}
          <div style={{ marginTop: 0 }}>
            <MoreMenuPanel horizontalPadding={18} flushTop />
          </div>
        </>
      )}

      {/* ── SECTION HEADER — same visioner chrome as Marka hub ── */}
      {view === 'section' && (
        <MobileBrandNavbar
          dark={t.isDark}
          logoCentered
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: t.bg,
            borderBottom: `0.5px solid ${t.separator}`,
          }}
          leftSlot={(
            <button
              type="button"
              onClick={() => setView('dashboard')}
              aria-label="Marka ayarlarına dön"
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                border: `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                color: t.textSecondary,
              }}
            >
              <svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden>
                <path d="M7.5 1.5 1.5 7.5l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          rightSlot={(
            <div style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              {saveMutation.isPending ? (
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${t.separator}`, borderTopColor: t.accent, animation: 'spinSlow 0.8s linear infinite' }} />
              ) : saved ? (
                <span style={{ fontSize: 14, fontWeight: 600, color: t.success }}>✓</span>
              ) : null}
            </div>
          )}
        />
      )}

      {/* ── SECTION CONTENT ── */}
      {view === 'section' && (
      <div style={{ padding: '10px 18px 0' }}>
        {!(
          (tab === 'content' && contentGroup !== null)
          || (tab === 'strategy' && strategyGroup !== null)
          || (tab === 'design' && designGroup !== null)
          || (tab === 'identity' && identityGroup !== null)
        ) && (
          <div
            className="sa-chrome-eyebrow"
            style={{ marginBottom: tab === 'identity' ? 8 : 14 }}
          >
            {sectionEyebrow}
          </div>
        )}
        {sharedStatusBanners}

        {tab === 'design' && productionReadiness?.productionProfile
          && !productionReadiness.productionProfile.isProductionReady && (
          <div style={{
            marginBottom: 16,
            padding: '14px 16px',
            borderRadius: 14,
            background: t.isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)',
            border: `0.5px solid ${t.isDark ? 'rgba(239,68,68,0.28)' : 'rgba(239,68,68,0.22)'}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
              Tasarım eksik ({productionReadiness.productionProfile.score}/{PRODUCTION_PROFILE_THRESHOLD})
            </div>
            {(productionReadiness.productionProfile.missing ?? []).slice(0, 3).map((item) => (
              <div key={item.id} style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.4, marginTop: 4 }}>
                · {item.label}: {item.detail}
              </div>
            ))}
          </div>
        )}

        {/* Marka Profili → Kanallar (Studio alt ekranı) */}
        {tab === 'identity' && identityGroup === 'channels' && (
          <>
            <VisionerSubNav
              t={t}
              parentLabel="Kimlik"
              title="Kanallar"
              onBack={() => openIdentityGroup(null)}
            />
            <div data-brand-form="discovery-channels">
              <section style={{ marginBottom: 16 }}>
                <div className="brand-grouped-fields" style={{ ...t.surfaceGroup, overflow: 'hidden' }}>
                  <Field
                    t={t}
                    label="Web Sitesi"
                    value={websiteDisplay}
                    displayValue={formatChannelDisplay(websiteDisplay)}
                    onSave={save('websiteUrl')}
                    hint="https://..."
                  />
                  <Field
                    t={t}
                    label="Instagram"
                    value={instagramDisplay}
                    displayValue={formatChannelDisplay(instagramDisplay)}
                    onSave={save('instagramHandle')}
                    hint="Kullanıcı adı"
                  />
                  <Field
                    t={t}
                    label="Google Business"
                    value={(p as any).googleBusinessUrl ?? ''}
                    displayValue={formatChannelDisplay(String((p as any).googleBusinessUrl ?? ''))}
                    onSave={save('googleBusinessUrl')}
                    hint="Maps veya Business linki"
                  />
                </div>
              </section>
            </div>
          </>
        )}

        {/* Marka Profili — kimlik → studio → içerik dili (tek ekrana sığacak yoğunluk) */}
        {tab === 'identity' && identityGroup === null && (
          <div className="brand-identity-home">
            {!constitutionConfirmedAt && (
              <div
                data-brand-form="constitution-confirm"
                style={{
                  marginBottom: 8,
                  padding: '12px 12px',
                  borderRadius: 14,
                  background: t.isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.06)',
                  border: `0.5px solid ${t.isDark ? 'rgba(245,158,11,0.28)' : 'rgba(245,158,11,0.22)'}`,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary, marginBottom: 2, letterSpacing: '-0.02em' }}>
                  Marka Anayasası onay bekliyor
                </div>
                <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.4, marginBottom: 10 }}>
                  Profili gözden geçirip onaylayın — hazırlık skoruna +20 puan.
                </div>
                {constitutionConfirmError && (
                  <div style={{ fontSize: 13, color: t.danger, lineHeight: 1.45, marginBottom: 8, padding: '8px 10px', borderRadius: 10, background: t.dangerDim }}>
                    {constitutionConfirmError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void handleConfirmConstitution()}
                  disabled={confirmingConstitution}
                  style={{
                    width: '100%', padding: '11px 14px', minHeight: 44, borderRadius: 12, border: 'none',
                    cursor: confirmingConstitution ? 'wait' : 'pointer', fontSize: 15, fontWeight: 600, color: '#fff',
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  }}
                >
                  {confirmingConstitution ? 'Onaylanıyor…' : 'Anayasayı Onayla'}
                </button>
              </div>
            )}

            {tenantId && (
              <BrandProductionRepairCard
                t={t}
                brandGaps={brandGaps}
                productionProfile={productionReadiness?.productionProfile ?? null}
              />
            )}

            <div className="brand-identity-home__section">
              <BrandIdentityProfileCard
                t={t}
                brandName={brandNameDisplay}
                industry={industryDisplay}
                location={locationDisplay}
                logoUrl={logoUrl ?? ''}
                logoSource={String(logoCandidate || '')}
                monogram={monogram}
                brandPrimary={brandPrimary}
                coverUrl={galleryRefUrls[0] ?? null}
                readinessScore={Number(score) || 0}
                tonePreset={resolvedTone}
                toneLabel={toneLabel}
                onSaveLogo={save('logoUrl')}
                onSaveBrandName={save('brandName')}
                onSaveIndustry={save('industry')}
                onSaveLocation={save('location')}
              />
            </div>

            <div className="brand-identity-home__section">
              <BrandIdentityAtelier
                t={t}
                brandPrimary={brandPrimary}
                contentLanguage={contentLanguage}
                onLanguageChange={(lang) => save('languages')(lang)}
                tiles={[
                  {
                    key: 'channels',
                    label: 'Web · Instagram · Google',
                    meta: channelsConnected ? 'Keşif linkleri tanımlı' : 'Profil linklerini ekle',
                    accent: BRAND_ATELIER_ACCENTS.channels,
                    icon: 'channels',
                    ready: channelsConnected,
                    onClick: () => openIdentityGroup('channels'),
                  },
                ]}
              />
            </div>
          </div>
        )}

        {/* Content group index */}
        {tab === 'content' && contentGroup === null && (
          <BrandVisionerList>
            {CONTENT_GROUPS.map((g) => (
              <BrandVisionerGroup key={g.key}>
                <BrandVisionerNavRow
                  t={t}
                  label={g.label}
                  hint={g.hint}
                  accent={g.accent}
                  icon={<SectionIcon name={g.key} color={g.accent} size={18} />}
                  onClick={() => openContentGroup(g.key)}
                />
              </BrandVisionerGroup>
            ))}
          </BrandVisionerList>
        )}

        {tab === 'content' && contentGroup !== null && activeContentGroup && (
          <VisionerSubNav
            t={t}
            parentLabel="İçerik DNA"
            title={activeContentGroup.label}
            onBack={() => openContentGroup(null)}
          />
        )}

        {tab === 'content' && isContentStory(contentGroup) && (
          <ContentStudioShell t={t} brandPrimary={brandPrimary}>
            <ContentStudioPanel t={t} eyebrow="Marka anlatısı">
              <ContentStudioAction
                t={t}
                label="AI ile analiz et ve doldur"
                pendingLabel="AI markayı analiz ediyor…"
                pending={descriptionAiMutation.isPending}
                onClick={() => descriptionAiMutation.mutate()}
              />
              {descriptionAiFeedback && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    borderRadius: 12,
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: descriptionAiFeedback.kind === 'err' ? '#b45309' : t.textSecondary,
                    background: descriptionAiFeedback.kind === 'err'
                      ? 'rgba(245,158,11,0.12)'
                      : (t.isDark ? 'rgba(138,171,189,0.10)' : 'rgba(138,171,189,0.08)'),
                    border: `0.5px solid ${descriptionAiFeedback.kind === 'err' ? 'rgba(245,158,11,0.35)' : 'rgba(138,171,189,0.28)'}`,
                  }}
                >
                  {descriptionAiFeedback.text}
                </div>
              )}
              <div style={{ marginTop: 12 }} data-brand-form="brand-about">
                <ContentStudioProseField
                  t={t}
                  label="Açıklama & ürünler"
                  value={descriptionDisplay}
                  onSave={save('description')}
                  hint="Marka tanımı, ürün ve hizmetler"
                  rows={7}
                />
              </div>
            </ContentStudioPanel>
            <ContentStudioPanel t={t} eyebrow="Marka tonu">
              <ContentStudioTonePicker
                t={t}
                selected={resolvedTone}
                onSelect={(tone) => save('brandTone')(tone)}
                rawHint={rawToneForHint && !isBrandTonePreset(rawToneForHint) ? rawToneForHint : null}
              />
            </ContentStudioPanel>
          </ContentStudioShell>
        )}

        {tab === 'content' && isContentGoals(contentGroup) && (
          <ContentStudioShell t={t} brandPrimary={brandPrimary}>
            <ContentStudioPanel t={t} eyebrow="Hedef kitle">
              <ContentStudioProseField
                t={t}
                label="Kime konuşuyoruz"
                value={p.targetAudience || (pyCtx as any)?.target_audience || ''}
                onSave={save('targetAudience')}
                hint="Yaş, tarz, ziyaret motivasyonu…"
                rows={5}
              />
            </ContentStudioPanel>
            {tenantId && (
              <ContentStudioPanel t={t} eyebrow="Sütunlar & CTA">
                <div data-brand-form="content-pillars">
                  <BrandContentStrategyPanel
                    tenantId={tenantId}
                    t={t}
                    pyCtx={pyCtx as Record<string, unknown> | undefined}
                    sector={industrySlug || 'restaurant_cafe'}
                    onSaved={() => {
                      void queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
                      void queryClient.invalidateQueries({ queryKey: ['brand-readiness', tenantId] });
                    }}
                  />
                </div>
              </ContentStudioPanel>
            )}
          </ContentStudioShell>
        )}

        {/* Strategy group index — campaign / competitors / special days */}
        {tab === 'strategy' && strategyGroup === null && (
          <BrandVisionerList>
            {STRATEGY_GROUPS.map((g) => (
              <BrandVisionerGroup key={g.key}>
                <BrandVisionerNavRow
                  t={t}
                  label={g.label}
                  hint={g.hint}
                  accent={g.accent}
                  icon={<SectionIcon name={g.key} color={g.accent} size={18} />}
                  onClick={() => openStrategyGroup(g.key)}
                />
              </BrandVisionerGroup>
            ))}
          </BrandVisionerList>
        )}

        {tab === 'strategy' && strategyGroup !== null && activeStrategyGroup && (
          <VisionerSubNav
            t={t}
            parentLabel="Strateji"
            title={activeStrategyGroup.label}
            onBack={() => openStrategyGroup(null)}
          />
        )}

        {tab === 'strategy' && strategyGroup === 'campaign' && (
          <ContentStudioShell t={t} brandPrimary={brandPrimary}>
            <ContentStudioPanel t={t} eyebrow="Kampanya hedefleri">
              <ContentStudioProseField
                t={t}
                label="Ne başarmak istiyoruz"
                value={p.campaignGoals || (pyCtx as any)?.campaign_goals || ''}
                onSave={save('campaignGoals')}
                hint="Rezervasyon, farkındalık, etkinlik…"
                rows={5}
              />
            </ContentStudioPanel>
          </ContentStudioShell>
        )}

        {tab === 'strategy' && strategyGroup === 'special' && tenantId && (
          <ContentStudioShell t={t} brandPrimary={brandPrimary}>
            <ContentStudioPanel t={t} eyebrow="Özel günler">
              <BrandSpecialDaysPanel tenantId={tenantId} t={t} />
            </ContentStudioPanel>
            <ContentStudioPanel t={t} eyebrow="Zamanlı şablonlar">
              <BrandScheduledTemplatesPanel
                tenantId={tenantId}
                t={t}
                sector={industrySlug || 'restaurant'}
              />
            </ContentStudioPanel>
          </ContentStudioShell>
        )}

        {tab === 'strategy' && strategyGroup === 'competitors' && (() => {
          const confirmedRaw = p.competitors || (pyCtx as any)?.competitors || '';
          const confirmed: string[] = confirmedRaw
            ? confirmedRaw.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];
          const suggestedRaw = (pyCtx as any)?.suggested_competitors || '';
          let suggested: string[] = [];
          try { suggested = JSON.parse(suggestedRaw); } catch { suggested = []; }
          const unconfirmedSuggestions = suggested.filter((s: string) => !confirmed.includes(s));
          const saveCompetitors = (list: string[]) => save('competitors')(list.join(', '));
          return (
            <ContentStudioShell t={t} brandPrimary={brandPrimary}>
              <ContentStudioPanel t={t} eyebrow="Rakipler">
                <ContentStudioEntityBoard
                  t={t}
                  confirmed={confirmed}
                  suggestions={unconfirmedSuggestions}
                  draft={newCompetitor}
                  onDraftChange={setNewCompetitor}
                  onAdd={(name) => saveCompetitors([...confirmed, name])}
                  onRemove={(name) => saveCompetitors(confirmed.filter((c) => c !== name))}
                  emptyHint="Rakip yok — önerilerden seç veya manuel ekle."
                />
              </ContentStudioPanel>
            </ContentStudioShell>
          );
        })()}

        {/* Design group index */}
        {tab === 'design' && designGroup === null && (
          <BrandVisionerList>
            {DESIGN_GROUPS.map((g) => (
              <BrandVisionerGroup key={g.key}>
                <BrandVisionerNavRow
                  t={t}
                  label={g.label}
                  hint={g.hint}
                  accent={g.accent}
                  icon={<SectionIcon name={g.key} color={g.accent} size={18} />}
                  onClick={() => openDesignGroup(g.key)}
                />
              </BrandVisionerGroup>
            ))}
          </BrandVisionerList>
        )}

        {tab === 'design' && designGroup !== null && activeDesignGroup && (
          <VisionerSubNav
            t={t}
            parentLabel="Görünüm"
            title={activeDesignGroup.label}
            mission={DESIGN_GROUP_MISSIONS[activeDesignGroup.key]}
            onBack={() => openDesignGroup(null)}
          />
        )}

        {tab === 'design' && isDesignStyle(designGroup) && (() => {
          const visualDna = String((pyCtx as any)?.visual_dna || '').trim();
          const visualStyleText = String(p.visualStyle || (pyCtx as any)?.visual_style || '').trim();
          const summary = visualDna || visualStyleText;
          return (
            <SCard t={t} title="Görsel Dil">
              {debugUi ? (
                <Field
                  t={t}
                  label="Görsel Stil"
                  value={visualStyleText}
                  onSave={save('visualStyle')}
                  multiline
                  hint="örn: minimal, luxury, cinematic..."
                />
              ) : (
                <div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: summary ? t.textSecondary : t.textMuted }}>
                    {summary
                      ? (summary.length > 280 ? `${summary.slice(0, 280)}…` : summary)
                      : 'Henüz görsel dil özeti yok.'}
                  </p>
                </div>
              )}
            </SCard>
          );
        })()}

        {tab === 'design' && designGroup === 'templates' && (
          <div
            data-brand-form="story-templates"
            className="brand-templates-studio"
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {tenantId && (
              <BrandSlotFacilitiesPanel
                tenantId={tenantId}
                sector={industrySlug}
                t={t}
              />
            )}
            <div style={{ height: 1, background: t.separator, opacity: 0.7 }} />
            {tenantId && (
              <BrandFalTemplateGalleryPanel
                tenantId={tenantId}
                sector={industrySlug}
                theme={(brandThemePayload?.theme ?? null) as Record<string, unknown> | null}
                t={t}
              />
            )}
          </div>
        )}

        {tab === 'design' && isDesignStyle(designGroup) && (
          <div data-brand-fix="brand-theme">
            <CollapsibleGroup
              t={t}
              title="Yazı & başlık"
              subtitle="Post font/efekt/logo · AI tipografi vibe · arka plan — tek yüzey"
              defaultOpen
            >
            {tenantId && (
              <PostDesignDefaultsPanel
                t={t}
                workspaceId={tenantId}
                theme={(brandThemePayload?.theme ?? {}) as Record<string, unknown>}
                sector={normalizeSectorId(p.sector || (pyCtx as any)?.business_type || '')}
                onSave={async (next) => {
                  const currentTheme = (brandThemePayload?.theme ?? {}) as Record<string, unknown>;
                  // Keep AI Tipografi text_effect in sync so fal production sees the same Hub choice.
                  const prevTypo = (currentTheme.typography_design ?? currentTheme.typographyDesign ?? {}) as Record<string, unknown>;
                  const syncedTypo = {
                    ...prevTypo,
                    text_effect: next.text_effect,
                    accent_color: next.accent_color ?? prevTypo.accent_color,
                  };
                  await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
                    body: JSON.stringify({
                      theme: {
                        ...currentTheme,
                        post_design_defaults: next,
                        postDesignDefaults: next,
                        typography_design: syncedTypo,
                        typographyDesign: syncedTypo,
                      },
                    }),
                  }).catch(() => {/* non-fatal */});
                  queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                }}
                onSaveTypography={async (next) => {
                  const currentTheme = (brandThemePayload?.theme ?? {}) as Record<string, unknown>;
                  const confirmed = buildUserConfirmedTypographyPatch(next);
                  const postDefaults = currentTheme.post_design_defaults ?? currentTheme.postDesignDefaults;
                  await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
                    body: JSON.stringify({
                      theme: {
                        ...currentTheme,
                        typography_design: confirmed,
                        typographyDesign: confirmed,
                        ...(postDefaults
                          ? { post_design_defaults: postDefaults, postDesignDefaults: postDefaults }
                          : {}),
                      },
                    }),
                  }).catch(() => {/* non-fatal */});
                  queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                }}
              />
            )}

            {(() => {
              const themeTy = (brandThemePayload?.theme as Record<string, unknown> | undefined)?.typography as Record<string, string> | undefined;
              const heading = String(
                p.primaryFont
                || (pyCtx as any)?.brand_font_family
                || themeTy?.heading_font
                || themeTy?.headingFont
                || '',
              ).trim();
              const body = String(
                p.secondaryFont
                || themeTy?.body_font
                || themeTy?.bodyFont
                || '',
              ).trim();
              return (
                <SCard t={t} title="Font özeti">
                  <InfoRow t={t} label="Başlık" value={heading || 'Preset'} />
                  <InfoRow t={t} label="Gövde" value={body || 'Varsayılan'} />
                  {debugUi && (
                    <div style={{ marginTop: 12 }}>
                      <Field t={t} label="Ana Font"
                        value={heading}
                        onSave={save('primaryFont')} hint="örn: Nunito, Playfair Display" />
                      <Field t={t} label="İkincil Font"
                        value={body}
                        onSave={save('secondaryFont')} hint="örn: Lato, Inter" />
                    </div>
                  )}
                </SCard>
              );
            })()}
            </CollapsibleGroup>

            <SCard t={t} title="Renk Paleti" accent={t.accent}>
              <BrandColorPalettePicker
                tenantId={tenantId!}
                sector={industrySlug || industryDisplay}
                brandName={brandNameDisplay}
                brandColors={String(p.brandColors || '')}
                accentColors={String(p.accentColors || '')}
                brandPrimary={(pyCtx as any)?.brand_primary_color as string | undefined}
                brandAccent={(pyCtx as any)?.brand_accent_color as string | undefined}
                themePalette={(brandThemePayload?.theme as Record<string, unknown> | undefined)?.palette as Record<string, string> | undefined}
                existingTheme={brandThemePayload?.theme as Record<string, unknown> | undefined}
                t={t}
                onSaved={(_palette, profileFields) => {
                  saveMutation.mutate({
                    brandColors: profileFields.brandColors,
                    accentColors: profileFields.accentColors,
                  } as Partial<SaveCompanyProfileRequest>);
                  void invalidateBrandContextWriteQueries(queryClient, tenantId!);
                  queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                }}
              />
            </SCard>

          </div>
        )}

        {tab === 'design' && isDesignStyle(designGroup) && (
          <div data-brand-fix="brand-dna-analyze">
            <CollapsibleGroup
              t={t}
              title="Marka DNA"
              subtitle="Vibe çıkarımı — üretim paleti Renk Paleti’nde düzenlenir"
              defaultOpen
            >
            <VibeDnaTab t={t} tenantId={tenantId} pyCtx={pyCtx} queryClient={queryClient} />
            </CollapsibleGroup>
          </div>
        )}

        {tab === 'design' && isDesignProduction(designGroup) && (
          <>
            <CollapsibleGroup
              t={t}
              title="Kurallar & yetenekler"
              subtitle="Özel kurallar, risk sınırları ve işletme yetenekleri"
              defaultOpen
            >
            <SCard t={t} title="Özel Kurallar" accent={t.warning}>
              <Field t={t} label="Özel Kurallar & Kısıtlamalar" value={p.customRules ?? ''} onSave={save('customRules')} multiline />
            </SCard>

            {Object.keys(riskRules).length > 0 && (
              <SCard t={t} title="Risk Kuralları" accent={t.danger}>
                <div style={{ marginBottom: 12 }}>
                  {Object.entries(riskRules).map(([key, value], i) => {
                    const isForbid = String(value).includes('forbid') || String(value).includes('block');
                    const isApproval = String(value).includes('approval');
                    const color = isForbid ? t.danger : isApproval ? t.warning : t.success;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: `${color}07`, border: `0.5px solid ${color}20`, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color, flexShrink: 0 }}>{isForbid ? '⛔' : isApproval ? '⚑' : '✓'}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{key.replace(/_/g, ' ')}</div>
                          <div style={{ fontSize: 12, color, fontWeight: 500 }}>{String(value).replace(/_/g, ' ')}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {debugUi && (
                  <Field t={t} label="Risk Kuralları (JSON)" value={JSON.stringify(riskRules, null, 2)} onSave={save('riskRules')} multiline />
                )}
              </SCard>
            )}

            <SCard t={t} title="İşletme yetenekleri" accent={t.accent}>
              <TenantOperatingCapabilitiesEditor
                variant="mobile"
                theme={t}
                tenantId={tenantId!}
                industry={industryDisplay || String(p.industry || '')}
                contentNeedsJson={String((p as any).contentNeeds ?? '[]')}
                operatingCapabilitiesJson={String((p as any).operatingCapabilities ?? '[]')}
                galleryPolicyJson={String((p as any).galleryPolicy ?? '{}')}
                riskRulesJson={String((p as any).riskRules ?? '{}')}
                customRules={String(p.customRules ?? '')}
                saving={saveMutation.isPending}
                onSave={(payload) => {
                  saveMutation.mutate(payload as Partial<SaveCompanyProfileRequest>);
                }}
              />
            </SCard>

            {debugUi && contentNeeds.length > 0 && (
              <SCard t={t} title="Kayıtlı içerik ihtiyaçları">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                  {contentNeeds.map(cn => <TagChip key={cn} text={cn} color="#34D399" t={t} />)}
                </div>
              </SCard>
            )}

            {debugUi && templateFams.length > 0 && (
              <SCard t={t} title="Template Aileleri">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {templateFams.map((tf, i) => (
                    <div key={i} style={{ fontSize: 12, color: t.textTertiary, padding: '8px 12px', borderRadius: 10, background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', fontFamily: 'monospace' }}>
                      {tf}
                    </div>
                  ))}
                </div>
              </SCard>
            )}
            </CollapsibleGroup>
          </>
        )}

        {tab === 'design' && isDesignStyle(designGroup) && (
          <div data-brand-fix="brand-dna-analyze">
            {/* Re-analyze button */}
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              style={{ width: '100%', padding: '14px', borderRadius: 16, cursor: 'pointer', marginBottom: analyzeFeedback ? 8 : 14, background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {analyzeMutation.isPending ? (
                <><div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${t.accent}40`, borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 0.8s linear infinite' }} /> Analiz Ediliyor...</>
              ) : '✦ Markayı Yeniden Analiz Et'}
            </button>
            {analyzeFeedback && (
              <div style={{
                marginBottom: 14,
                padding: '10px 12px',
                borderRadius: 12,
                fontSize: 12,
                lineHeight: 1.5,
                color: analyzeFeedback.kind === 'err' ? '#b45309' : t.textSecondary,
                background: analyzeFeedback.kind === 'err' ? 'rgba(245,158,11,0.12)' : t.surface,
                border: `0.5px solid ${analyzeFeedback.kind === 'err' ? 'rgba(245,158,11,0.35)' : t.separator}`,
              }}>
                {analyzeFeedback.text}
              </div>
            )}

            <CollapsibleGroup
              t={t}
              title="Analiz & performans"
              subtitle={debugUi
                ? 'AI değerlendirmesi, sistem analizi, ham veriler ve Meta reklam özeti'
                : 'AI değerlendirmesi ve marka tamamlanma durumu'}
              defaultOpen
            >
            <SCard t={t} title="AI Değerlendirmesi" accent={t.accent}>
              <InfoRow t={t} label="Tamamlanma Skoru" value={`${score}%`} color={t.accent} />
              {(() => {
                const summary = resolveCustomerVisibleSummary(
                  (p as any).customerVisibleSummary,
                  brandNameDisplay,
                  pyCtx as Record<string, unknown> | undefined,
                );
                return summary ? <InfoRow t={t} label="Özet" value={summary} /> : null;
              })()}
              {(p as any).brandAnalyzedAt && (
                <InfoRow t={t} label="Son Analiz" value={new Date((p as any).brandAnalyzedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
              )}
            </SCard>

            {/* Sistem Analizi + ham analiz raporu — operatör/teşhis görünümü */}
            {debugUi && (<>
            <SCard t={t} title="Sistem Analizi">
              {pyCtx ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <InfoRow t={t} label="Sektör (Python)" value={pyCtx.industry ?? (pyCtx as any).business_type ?? '—'} color={t.accent} />
                  <InfoRow t={t} label="Ton" value={pyCtx.brand_tone ?? '—'} />
                  <InfoRow t={t} label="Lokasyon" value={pyCtx.location ?? '—'} />
                  <InfoRow t={t} label="Hedef Kitle" value={(pyCtx as any).target_audience ?? '—'} />
                  <InfoRow t={t} label="Content Pillars"
                    value={(() => {
                      const cp = pyCtx.content_pillars;
                      if (Array.isArray(cp)) return cp.join(', ');
                      if (typeof cp === 'string' && (cp as string).trim().startsWith('[')) {
                        try { const p = JSON.parse(cp); return Array.isArray(p) ? p.join(', ') : cp; } catch {}
                      }
                      return cp ? String(cp) : '—';
                    })()} />
                  <InfoRow t={t} label="Visual DNA"
                    value={(() => {
                      const vd = (pyCtx as any).visual_dna || (pyCtx as any).visual_style;
                      return vd ? String(vd).slice(0, 140) + (String(vd).length > 140 ? '…' : '') : '—';
                    })()} />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: t.textMuted }}>Yükleniyor…</p>
              )}
            </SCard>

            {/* Marka Analiz Raporu — tüm analiz verisi */}
            <SCard t={t} title="Marka Analiz Raporu">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Website summary — full crawl output */}
                {pyCtx?.website_summary && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                      🌐 Website Crawl
                    </p>
                    <pre style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', padding: '10px 12px', borderRadius: 10 }}>
                      {/* Safe HTML entity decode via <textarea> — no DOM parsing, no XSS exposure */}
                      {typeof document !== 'undefined'
                        ? (() => {
                            const ta = document.createElement('textarea');
                            ta.innerHTML = String(pyCtx.website_summary);
                            return ta.value || String(pyCtx.website_summary);
                          })()
                        : String(pyCtx.website_summary)}
                    </pre>
                  </div>
                )}

                {/* Instagram bio + live profile stats (Apify) */}
                {(pyCtx?.instagram_bio || pyCtx?.instagram_followers != null) && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#E1306C', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                      📸 Instagram Profil
                    </p>
                    <div style={{ background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', padding: '10px 12px', borderRadius: 10 }}>
                      {pyCtx?.instagram_bio && (
                        <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                          {pyCtx.instagram_bio}
                        </p>
                      )}
                      {(pyCtx?.instagram_followers != null || pyCtx?.instagram_posts_count != null) && (
                        <p style={{ fontSize: 11, color: t.textMuted, margin: pyCtx?.instagram_bio ? '8px 0 0' : 0 }}>
                          {[
                            pyCtx?.instagram_posts_count != null ? `${pyCtx.instagram_posts_count} gönderi` : null,
                            pyCtx?.instagram_followers != null ? `${pyCtx.instagram_followers} takipçi` : null,
                            pyCtx?.instagram_following != null ? `${pyCtx.instagram_following} takip` : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Visual DNA */}
                {pyCtx?.visual_dna && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#9DBECE', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                      🎨 Visual DNA
                    </p>
                    <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6, background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', padding: '10px 12px', borderRadius: 10, margin: 0 }}>
                      {pyCtx.visual_dna}
                    </p>
                  </div>
                )}

                {/* Fallback: .NET brandAnalysis */}
                {!pyCtx?.website_summary && (p as any).brandAnalysis && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                      📋 Analiz (eski)
                    </p>
                    <pre style={{ fontSize: 11, color: t.textTertiary, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {String((p as any).brandAnalysis)}
                    </pre>
                  </div>
                )}

                {!pyCtx?.website_summary && !pyCtx?.instagram_bio && !(p as any).brandAnalysis && (
                  <p style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', padding: '16px 0' }}>
                    Henüz analiz yapılmadı. "Markayı Yeniden Analiz Et" butonuna bas.
                  </p>
                )}
              </div>
            </SCard>

            {/* ── Meta Reklamları Özeti ── */}
            <SCard t={t} title="📣 Meta Reklamları">
              {metaCampaigns.length === 0 ? (
                <div style={{ padding: '8px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: t.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
                    Henüz kampanya yok. Onaylı bir içerikten "Bu Görseli Tanıt" ile başlat.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Summary stats */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {[
                      { label: 'Toplam',  value: metaCampaigns.length, color: t.accent },
                      { label: 'Aktif',   value: metaCampaigns.filter((c: any) => c.status === 'ACTIVE').length, color: '#10B981' },
                      { label: 'Harcama', value: `${metaCampaigns.reduce((s: number, c: any) => s + (c.spendTl || 0), 0).toFixed(0)}₺`, color: '#F59E0B' },
                    ].map(s => (
                      <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '10px 6px',
                        background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderRadius: 10, border: `0.5px solid ${t.separator}` }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Last 3 campaigns */}
                  {metaCampaigns.slice(0, 3).map((c: any) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 0', borderBottom: `0.5px solid ${t.separator}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.objective === 'OUTCOME_AWARENESS' ? 'Erişim' : c.objective === 'OUTCOME_ENGAGEMENT' ? 'Etkileşim' : 'Trafik'}
                          {' · '}{c.budgetTl}₺ / {c.durationDays}g
                        </div>
                        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                          {c.actualReach > 0 ? `👁 ${c.actualReach.toLocaleString('tr-TR')} erişim` : `~${c.estimatedReach.toLocaleString('tr-TR')} tahmini`}
                          {c.spendTl > 0 ? ` · ${c.spendTl.toFixed(2)}₺ harcandı` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
                        marginLeft: 8, fontWeight: 700,
                        background: c.status === 'ACTIVE' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)',
                        color: c.status === 'ACTIVE' ? '#10B981' : '#F59E0B' }}>
                        {c.status === 'ACTIVE' ? 'Aktif' : 'Duraklatıldı'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SCard>
            </>)}
            </CollapsibleGroup>
          </div>
        )}

        {tab === 'design' && isDesignProduction(designGroup) && (
          <>
            <SCard t={t} title="Onay Modu" accent={t.warning}>
              <div style={{ marginBottom: 10 }}>
                {[
                  { mode: 0, label: 'Sadece Öner' },
                  { mode: 1, label: 'Öner & Bekle' },
                  { mode: 2, label: 'Otomatik Yayınla' },
                ].map(item => {
                  const isActive = Number(p.defaultApprovalMode ?? 1) === item.mode;
                  return (
                    <button key={item.mode} onClick={() => saveMutation.mutate({ defaultApprovalMode: item.mode } as any)} style={{ width: '100%', padding: '13px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left', marginBottom: 8, background: isActive ? t.accentDim : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'), border: `0.5px solid ${isActive ? t.accentBorder : t.separator}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${isActive ? t.accent : t.textMuted}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.accent }} />}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? t.accent : t.textPrimary }}>{item.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SCard>

            {/* Mertcafe entegrasyonu → Chatbot sekmesine taşındı */}

            {/* ── AI Görsel Geliştirme ── */}
            {(() => {
              // Read from brand_theme JSON (Python-side) — auto-produce also reads from here
              const currentTheme = (brandThemePayload?.theme ?? {}) as Record<string, unknown>;
              const saveAiSetting = async (patch: Record<string, unknown>) => {
                if (!tenantId) return;
                const prev = brandThemePayload?.theme ?? null;
                const optimistic = { ...(prev ?? {}), ...patch };
                queryClient.setQueryData(
                  ['brand-theme-kit', tenantId],
                  (old: { theme?: Record<string, unknown> | null } | null | undefined) => ({
                    ...(old ?? {}),
                    theme: optimistic,
                  }),
                );
                setSettingsError(null);
                try {
                  const res = await fetchTenantBff(`/api/brand-context/${tenantId}/theme/ai-settings`, tenantId, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
                    body: JSON.stringify(patch),
                  });
                  if (!res.ok) {
                    const err = await res.text().catch(() => '');
                    console.warn('[BrandConstitution] AI settings save failed:', res.status, err);
                    queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: prev });
                    setSettingsError('Ayar kaydedilemedi — eski değere döndürüldü. Tekrar dene.');
                    return;
                  }
                  const data = await res.json() as { theme?: Record<string, unknown> | null };
                  if (data.theme) {
                    queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: data.theme });
                  }
                } catch (e) {
                  console.warn('[BrandConstitution] AI settings save error:', e);
                  queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: prev });
                  setSettingsError('Ayar kaydedilemedi — bağlantını kontrol edip tekrar dene.');
                }
              };

              const aiEnabled = themeFlag(currentTheme, 'ai_photo_enhance');
              const aiLevel = themeString(currentTheme, 'ai_photo_enhance_level', 'moderate');
              const themeBoolDefault = (key: string, defaultOn = true) => {
                const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                if (key in currentTheme || camel in currentTheme) return themeFlag(currentTheme, key);
                return defaultOn;
              };
              const aiGalleryRevise = aiEnabled && themeBoolDefault('ai_enhance_gallery_selected', true);
              const aiUseIdentity = themeBoolDefault('ai_use_brand_identity');
              const aiBriefDrives = themeBoolDefault('ai_brief_drives_scene');
              const aiEmbedLogo = themeBoolDefault('ai_embed_logo');
              const aiSubject = themeString(currentTheme, 'ai_visual_subject', 'auto');
              const aiCaptionDriven = themeBoolDefault('ai_caption_driven_visual', false);
              const aiAdaptiveScene = themeBoolDefault('ai_adaptive_scene', false);
              const aiAdaptiveMode = themeString(currentTheme, 'ai_adaptive_scene_mode', 'auto');
              const aiFormats = new Set(
                themeStringArray(currentTheme, 'ai_enhance_formats', ['post', 'story', 'carousel', 'reel']),
              );
              const toggleFormat = (fmt: string) => {
                const next = new Set(aiFormats);
                if (next.has(fmt)) {
                  if (next.size <= 1) return;
                  next.delete(fmt);
                } else {
                  next.add(fmt);
                }
                void saveAiSetting({ ai_enhance_formats: [...next] });
              };

              return (
                <SCard t={t} title="Görsel Kaynak Tercihi" accent={t.accent}>
                  <div style={{ marginBottom: 14 }}>
                    {/* ── 3-mode radio cards ── */}
                    {(() => {
                      const currentMode = resolveVisualSourceMode(currentTheme);
                      const modes = getVisualSourceModeCopy(industrySlug);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                          {modes.map(({ id, icon, title }) => {
                            const active = currentMode === id;
                            return (
                              <button key={id}
                                onClick={() => saveAiSetting(buildVisualSourceModePatch(id as VisualSourceMode))}
                                style={{
                                  width: '100%', padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                                  textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14,
                                  background: active
                                    ? (t.isDark ? 'rgba(139,171,189,0.12)' : 'rgba(59,130,246,0.06)')
                                    : 'transparent',
                                  border: `1.5px solid ${active ? t.accent : t.separator}`,
                                  transition: 'all 0.2s',
                                }}>
                                <div style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{icon}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: active ? 700 : 600, color: active ? t.accent : t.textPrimary }}>{title}</div>
                                </div>
                                <div style={{
                                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                  border: `2px solid ${active ? t.accent : t.separator}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  {active && <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.accent }} />}
                                </div>
                              </button>
                            );
                          })}
                          {(currentMode === 'gallery_only' || currentMode === 'gallery_enhanced') && (() => {
                            const rawRefs = (pyCtx as any)?.reference_image_urls;
                            const hasGallery = Array.isArray(rawRefs) ? rawRefs.length > 0 : Boolean(rawRefs);
                            if (hasGallery) return null;
                            return (
                              <div style={{
                                padding: '10px 14px', borderRadius: 12, marginTop: 8,
                                background: t.isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.06)',
                                border: '0.5px solid rgba(251,191,36,0.3)',
                                display: 'flex', alignItems: 'flex-start', gap: 10,
                              }}>
                                <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{'\u26A0\uFE0F'}</span>
                                <div style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>
                                  {getEmptyGalleryWarning(industrySlug)}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}

                    {/* ── İleri Ayarlar (collapsible) ── */}
                    <AdvancedVisualSettings
                      t={t}
                      aiEnabled={aiEnabled}
                      aiLevel={aiLevel}
                      aiGalleryRevise={aiGalleryRevise}
                      aiUseIdentity={aiUseIdentity}
                      aiBriefDrives={aiBriefDrives}
                      aiEmbedLogo={aiEmbedLogo}
                      aiSubject={aiSubject}
                      aiCaptionDriven={aiCaptionDriven}
                      aiAdaptiveScene={aiAdaptiveScene}
                      aiAdaptiveMode={aiAdaptiveMode}
                      aiFormats={aiFormats}
                      currentTheme={currentTheme}
                      sector={industrySlug}
                      saveAiSetting={saveAiSetting}
                      toggleFormat={toggleFormat}
                    />

                  </div>
                </SCard>
              );
            })()}
          </>
        )}

        {tab === 'design' && isDesignProduction(designGroup) && (
          <>
            <CollapsibleGroup
              t={t}
              title="Tasarım motorları & hareket"
              subtitle="Premium Editorial, ürün vitrini, üretim motorları, hareket stili, reel ve story sesi"
              accent="#8B5CF6"
              defaultOpen
            >

            {tenantId && (
              <SCard t={t} title="Premium Editorial Campaign" accent="#C9A227">
                <BrandPremiumEditorialPanel
                  tenantId={tenantId}
                  t={t}
                  galleryUrls={galleryRefUrls}
                  logoUrl={typeof (pyCtx as { logo_url?: string } | undefined)?.logo_url === 'string'
                    ? (pyCtx as { logo_url?: string }).logo_url
                    : null}
                />
              </SCard>
            )}

            {tenantId && (
              <SCard t={t} title="Ürün Vitrin (Product Showcase)" accent="#10B981">
                <BrandProductShowcasePanel
                  tenantId={tenantId}
                  theme={((brandThemePayload?.theme ?? {}) as Record<string, unknown>)}
                  t={t}
                  onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                  }}
                />
              </SCard>
            )}

            {tenantId && (
              <SCard t={t} title="Üretim Motorları" accent="#8B5CF6">
                <BrandProductionEnginesPanel
                  tenantId={tenantId}
                  theme={((brandThemePayload?.theme ?? {}) as Record<string, unknown>)}
                  t={t}
                  onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                  }}
                />
              </SCard>
            )}

            {(() => {
              const currentTheme = (brandThemePayload?.theme ?? {}) as Record<string, unknown>;
              const motionRaw = (currentTheme.motion_profile ?? currentTheme.motionProfile) as Record<string, unknown> | undefined;
              const activeStyle = String(motionRaw?.motion_style ?? motionRaw?.motionStyle ?? 'editorial') as MotionStyle;
              const sectorNorm = industrySlug;

              const saveMotionStyle = async (style: MotionStyle) => {
                if (!tenantId) return;
                const base = parseMotionProfileFromTheme(currentTheme, { sector: sectorNorm, tenantId: tenantId ?? undefined });
                const next = applyMotionStylePreset(base, style);
                const motion_profile = motionProfileToThemeJson({
                  ...next,
                  operatorOverride: true,
                });
                await fetchTenantBff(`/api/brand-context/${tenantId}/theme`, tenantId, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
                  body: JSON.stringify({
                    theme: {
                      ...currentTheme,
                      motion_profile,
                    },
                  }),
                }).catch(() => {/* non-fatal */});
                queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
              };

              return (
                <SCard t={t} title="Motion Stili" accent={t.accent}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {MOTION_STYLE_OPTIONS.map(({ id, label }) => {
                      const isActive = activeStyle === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => saveMotionStyle(id)}
                          style={{
                            textAlign: 'left', padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                            border: `0.5px solid ${isActive ? t.accentBorder : t.separator}`,
                            background: isActive
                              ? (t.isDark ? 'rgba(77,112,136,0.12)' : 'rgba(77,112,136,0.08)')
                              : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 600, color: isActive ? t.accent : t.textPrimary }}>
                            {label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </SCard>
              );
            })()}

            {tenantId && (
              <SCard t={t} title="Reel Motion">
                <ReelMotionSettingsPanel
                  tenantId={tenantId}
                  theme={((brandThemePayload?.theme ?? {}) as Record<string, unknown>)}
                  sector={industrySlug}
                  t={t}
                  onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                  }}
                />
              </SCard>
            )}

            {tenantId && (
              <SCard t={t} title="Story Ses Ayarları">
                <StoryAudioSettingsPanel
                  tenantId={tenantId}
                  theme={((brandThemePayload?.theme ?? {}) as Record<string, unknown>)}
                  sector={industrySlug}
                  t={t}
                  onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] });
                  }}
                />
              </SCard>
            )}

            {(p as any).setupCompletedAt && (
              <SCard t={t} title="Kurulum Bilgisi">
                <InfoRow t={t} label="Kurulum Tamamlandı" value={new Date((p as any).setupCompletedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} color={t.success} />
                <InfoRow t={t} label="Platform Profilleri" value={parseArr((p as any).platformProfiles).join(', ') || 'Bağlı değil'} />
              </SCard>
            )}
            </CollapsibleGroup>
          </>
        )}

        {tab === 'chatbot' && tenantId && (
          <BrandChatbotProfileCard
              t={t}
              workspaceId={tenantId}
              brandName={brandNameDisplay}
              saveThemePatch={async (patch) => {
                const prev = brandThemePayload?.theme ?? null;
                const optimistic = { ...(prev ?? {}), ...patch };
                queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: optimistic });
                try {
                  const res = await fetchTenantBff(`/api/brand-context/${tenantId}/theme/ai-settings`, tenantId, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
                    body: JSON.stringify(patch),
                  });
                  if (!res.ok) {
                    queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: prev });
                    return;
                  }
                  const data = await res.json() as { theme?: Record<string, unknown> | null };
                  if (data.theme) {
                    queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: data.theme });
                  }
                } catch {
                  queryClient.setQueryData(['brand-theme-kit', tenantId], { theme: prev });
                }
              }}
            />
        )}

        {tab === 'gallery' && (
          <GalleryTab
            t={t}
            tenantId={tenantId}
            pyCtx={pyCtx}
            queryClient={queryClient}
            companyProfile={profile as CompanyProfile}
            initialGroup={galleryInitialGroup}
            onInitialGroupConsumed={() => setGalleryInitialGroup(null)}
          />
        )}
      </div>
      )}
    </div>
  );
}
