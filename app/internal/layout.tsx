import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import GlobalHeader from '@/components/GlobalHeader';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function InternalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <GlobalHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
