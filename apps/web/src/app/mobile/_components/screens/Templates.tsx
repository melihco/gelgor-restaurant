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
import { MobileStackHeader } from '../ui-primitives';

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
      <MobileStackHeader t={t} title="Story Şablonları" onBack={goBack} />

      <div style={{ padding: '12px 16px 0' }}>
        {tenantId ? (
          <BrandFalTemplateGalleryPanel tenantId={tenantId} sector={sector} t={t} />
        ) : (
          <p style={{ fontSize: 14, color: t.textMuted }}>Marka seçilmedi.</p>
        )}
      </div>
    </div>
  );
}
