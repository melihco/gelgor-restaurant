import { useEffect, useState } from 'react';
import type { BrandProfileSnapshot } from '@smartagency/contracts';
import { mobileApiClient } from '../api/client';
import { InfoCard, ScreenFrame } from './shared';

export function BrandScreen({
  session,
}: {
  session: { token: string; tenantId: string };
}) {
  const [brand, setBrand] = useState<BrandProfileSnapshot | null>(null);

  useEffect(() => {
    void mobileApiClient
      .getBrandSnapshot(session.tenantId, session.token)
      .then(setBrand)
      .catch(() => setBrand(null));
  }, [session.tenantId, session.token]);

  return (
    <ScreenFrame
      title="Brand"
      subtitle="BrandConstitution ekranının native alt kümesi ortak contract üzerinden beslenecek."
    >
      <InfoCard label="Brand" value={brand?.brandName ?? 'Not loaded'} />
      <InfoCard label="Business Type" value={brand?.businessType ?? 'Unknown'} />
      <InfoCard
        label="AI Visual"
        value={brand?.themeAi.aiPhotoEnhance ? 'Enabled' : 'Disabled'}
      />
    </ScreenFrame>
  );
}
