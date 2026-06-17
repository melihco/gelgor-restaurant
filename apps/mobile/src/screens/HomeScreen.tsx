import { useEffect, useState } from 'react';
import type { PlatformAdminOverview } from '@smartagency/contracts';
import { mobileApiClient } from '../api/client';
import { InfoCard, ScreenFrame } from './shared';

export function HomeScreen({
  session,
}: {
  session: { token: string; tenantId: string; displayName: string };
}) {
  const [overview, setOverview] = useState<PlatformAdminOverview | null>(null);

  useEffect(() => {
    void mobileApiClient.getAdminOverview(session.token).then(setOverview).catch(() => setOverview(null));
  }, [session.token]);

  return (
    <ScreenFrame
      title={`Merhaba, ${session.displayName}`}
      subtitle="Bu ekran yeni native uygulamanın command center başlangıç sürümüdür."
    >
      <InfoCard label="Tenant" value={overview?.currentUser.tenantName ?? session.tenantId} />
      <InfoCard label="Agent Runs 24h" value={String(overview?.health.agentRuns24h ?? 0)} />
      <InfoCard label="Failed Jobs 24h" value={String(overview?.health.failedExecutionJobs24h ?? 0)} />
    </ScreenFrame>
  );
}
