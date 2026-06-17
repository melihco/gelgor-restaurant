import { InfoCard, ScreenFrame } from './shared';

export function MissionsScreen({
  session,
}: {
  session: { tenantId: string };
}) {
  return (
    <ScreenFrame
      title="Missions"
      subtitle="MissionHub, Outputs ve production lifecycle bu native akışa bölünerek taşınacak."
    >
      <InfoCard label="Workspace" value={session.tenantId} />
      <InfoCard label="Scope" value="Mission list, execution state, outputs, retry actions" />
    </ScreenFrame>
  );
}
