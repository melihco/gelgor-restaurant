import { InfoCard, ScreenFrame } from './shared';

export function FeedScreen({
  session,
}: {
  session: { tenantId: string };
}) {
  return (
    <ScreenFrame
      title="Feed"
      subtitle="PlatformFeed ve approval akışının native karşılığı bu modül altında yeniden kurulacak."
    >
      <InfoCard label="Workspace" value={session.tenantId} />
      <InfoCard label="Scope" value="Pending approvals, publish queue, latest artifacts" />
    </ScreenFrame>
  );
}
