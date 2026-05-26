import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kurulum laboratuvarı — SmartAgency',
  description:
    'Marka keşfi, şirket profili kaydı ve sosyal analiz. Oturum gerektirir; ana shell’den bağımsız tam sayfa.',
};

export default function SetupLabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
