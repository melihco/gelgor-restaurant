import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kurulum & keşif — SmartAgency',
  description:
    'Web sitenizi analiz edin, sektöre özel kurulum adımlarını tamamlayın. Ana platformdan bağımsız demo akışı.',
};

export default function CustomerSetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
