import type { ReactNode } from 'react';
import GlobalHeader from '@/components/GlobalHeader';

export default function MapLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <GlobalHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
