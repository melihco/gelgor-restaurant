'use client';
/**
 * Story Şablonları — markanın 5 slotluk story kütüphanesi.
 * Mission Hub / auto-produce bu seçimleri kullanır.
 */
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { productionSnapshotToLegacyBrandContext } from '@/lib/production-snapshot-compat';
import { BrandTemplateLibraryPanel } from '@/components/brand/BrandTemplateLibraryPanel';
import { useBrandStoryTemplates } from '@/hooks/useBrandStoryTemplates';
import { IcoBack } from '../Icons';

export function Templates() {
  const { t } = useTheme();
  const { goBack, navigate } = useMobileStore();
  const { tenantId } = useWorkspaceStore();

  const { data: productionSnapshot } = useQuery({
    queryKey: ['production-context-snapshot', tenantId],
    queryFn: () => apiClient.getProductionBrandContextSnapshot(tenantId!),
    enabled: Boolean(tenantId),
    staleTime: 120_000,
  });
  const brandCtx = productionSnapshotToLegacyBrandContext(productionSnapshot);

  const sector = brandCtx?.business_type ?? brandCtx?.industry ?? 'beach_club';
  const { isLocked, storySlots, isLoading } = useBrandStoryTemplates(tenantId, sector);

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100 }}>
      <div style={{
        padding: '56px 20px 16px',
        borderBottom: `0.5px solid ${t.separator}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <button
          type="button"
          onClick={goBack}
          aria-label="Geri"
          style={{
            marginTop: 4,
            width: 36,
            height: 36,
            borderRadius: 12,
            border: `0.5px solid ${t.separator}`,
            background: t.elevated,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IcoBack color={t.textPrimary} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 11,
            fontWeight: 600,
            color: t.labelColor,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            Üretim Kütüphanesi
          </p>
          <h1 style={{
            fontSize: 26,
            fontWeight: 800,
            color: t.textPrimary,
            letterSpacing: '-0.03em',
            marginBottom: 6,
          }}>
            Story Şablonları
          </h1>
          <p style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.45 }}>
            Mission Hub story üretimleri bu 5 slottan seçilir. Kaydettiğiniz şablonlar tüm otomatik üretimde kullanılır.
          </p>
          {!isLoading && (
            <div style={{
              marginTop: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 999,
              background: isLocked ? `${t.success}18` : `${t.warning}18`,
              border: `0.5px solid ${isLocked ? `${t.success}40` : `${t.warning}40`}`,
              fontSize: 11,
              fontWeight: 700,
              color: isLocked ? t.success : t.warning,
            }}>
              {isLocked ? '✓ Özel kütüphane aktif' : `${storySlots.length} story slot · otomatik seçim`}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 20px 0' }}>
        {!tenantId ? (
          <p style={{ fontSize: 13, color: t.textMuted }}>Marka seçilmedi.</p>
        ) : (
          <BrandTemplateLibraryPanel
            workspaceId={tenantId}
            sector={sector}
            variant="mobile"
            mobileTheme={{
              accent: t.accent,
              accentBorder: t.accentBorder,
              accentDim: t.accentDim,
              separator: t.separator,
              textPrimary: t.textPrimary,
              textMuted: t.textMuted,
              textTertiary: t.textTertiary,
              isDark: t.isDark,
            }}
          />
        )}

        <button
          type="button"
          onClick={() => navigate('missions')}
          style={{
            marginTop: 20,
            width: '100%',
            padding: '13px',
            borderRadius: 14,
            border: `0.5px solid ${t.separator}`,
            background: t.elevated,
            color: t.textSecondary,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Mission Hub'a dön →
        </button>
      </div>
    </div>
  );
}
