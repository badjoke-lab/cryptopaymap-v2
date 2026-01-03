import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import GlobalHeader from '@/components/GlobalHeader';

const description = 'CryptoPayMap — discover places that accept cryptocurrency payments.';

export const metadata: Metadata = {
  title: 'CryptoPayMap',
  description,
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'CryptoPayMap',
    description,
    images: ['/og.svg'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <div className="flex min-h-screen flex-col">
          <GlobalHeader />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
