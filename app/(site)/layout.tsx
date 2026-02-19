import type { ReactNode } from 'react';
import GlobalHeader from '@/components/GlobalHeader';
import SiteFooter from '@/components/SiteFooter';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <GlobalHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
