'use client';

import type { ResolvedTenantOperatingProfile } from '@/lib/tenant-operating-policy';

const POLICY_LABEL: Record<string, string> = {
  allow: 'Serbest',
  approval_required: 'Onay gerekli',
  blocked: 'Kapalı',
};

type Variant = 'desktop' | 'mobile';

type ThemeTokens = {
  textMuted: string;
  textPrimary: string;
  warning: string;
  success: string;
  danger: string;
  separator: string;
  isDark?: boolean;
};

export function TenantGalleryPolicyBanner({
  profile,
  variant = 'desktop',
  theme,
}: {
  profile: ResolvedTenantOperatingProfile;
  variant?: Variant;
  theme?: ThemeTokens;
}) {
  const gp = profile.galleryPolicy;
  const clientLabel = POLICY_LABEL[gp.clientPhotoPolicy] ?? gp.clientPhotoPolicy;
  const beforeLabel = POLICY_LABEL[gp.beforeAfterPolicy] ?? gp.beforeAfterPolicy;

  if (variant === 'mobile' && theme) {
    return (
      <div
        style={{
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 12,
          background: theme.isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.06)',
          border: `0.5px solid ${theme.separator}`,
          fontSize: 12,
          lineHeight: 1.5,
          color: theme.textMuted,
        }}
      >
        <div style={{ fontWeight: 700, color: theme.textPrimary, marginBottom: 6 }}>Galeri politikası</div>
        <div>Müşteri fotoğrafı: <span style={{ color: theme.textPrimary }}>{clientLabel}</span></div>
        <div>Önce/sonra: <span style={{ color: theme.textPrimary }}>{beforeLabel}</span></div>
        <div>Maks. fotoğraf: {gp.maxGalleryPhotos}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-xs leading-relaxed text-zinc-400">
      <p className="mb-1 font-semibold text-zinc-200">Galeri politikası ({profile.playbookId})</p>
      <ul className="list-inside list-disc space-y-0.5">
        <li>Müşteri / hizmet sonucu fotoğrafı: <span className="text-zinc-200">{clientLabel}</span></li>
        <li>Önce / sonra: <span className="text-zinc-200">{beforeLabel}</span></li>
        <li>Maksimum galeri: {gp.maxGalleryPhotos} · Onaylı asset resolver&apos;da kullanılır</li>
      </ul>
    </div>
  );
}
