import { deskFontClassName } from './desk-fonts';
import { DeskProviders } from '../providers';

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={deskFontClassName} style={{ minHeight: '100vh' }}>
      <DeskProviders>{children}</DeskProviders>
    </div>
  );
}
