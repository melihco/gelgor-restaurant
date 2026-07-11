import { deskFontClassName } from '../desk/desk-fonts';
import { DeskProviders } from '../providers';

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={deskFontClassName} style={{ minHeight: '100vh', background: '#07080f' }}>
      <DeskProviders>{children}</DeskProviders>
    </div>
  );
}
