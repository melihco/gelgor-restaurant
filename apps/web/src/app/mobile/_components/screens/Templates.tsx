'use client';
/**
 * fal.ai şablon galerisi — sektör slot kataloğundan marka bazlı üretim şablonları.
 */
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { productionSnapshotToLegacyBrandContext } from '@/lib/production-snapshot-compat';
import { BrandFalTemplateGalleryPanel } from '@/components/brand/BrandFalTemplateGalleryPanel';
import { IcoBack } from '../Icons';

export function Templates() {
  const { t } = useTheme();
  const { goBack } = useMobileStore();
  const { tenantId } = useWorkspaceStore();

  const { data: productionSnapshot } = useQuery({
    queryKey: ['production-context-snapshot', tenantId],
    queryFn: () => apiClient.getProductionBrandContextSnapshot(tenantId!),
    enabled: Boolean(tenantId),
    staleTime: 120_000,
  });
  const brandCtx = productionSnapshotToLegacyBrandContext(productionSnapshot);
  const sector = brandCtx?.business_type ?? brandCtx?.industry ?? 'beach_club';

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
            background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
            color: t.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IcoBack size={18} />
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: t.textPrimary }}>
            Şablon Galerisi
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: t.textMuted, lineHeight: 1.45 }}>
            fal.ai slot şablonları — mission üretimi bu katalogdan beslenir.
          </p>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {tenantId ? (
          <BrandFalTemplateGalleryPanel tenantId={tenantId} sector={sector} t={t} />
        ) : (
          <p style={{ fontSize: 14, color: t.textMuted }}>Marka seçilmedi.</p>
        )}
      </div>
    </div>
  );
}
