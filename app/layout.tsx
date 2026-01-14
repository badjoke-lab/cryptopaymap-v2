import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import GlobalHeader from '@/components/GlobalHeader';

const description = 'CryptoPayMap — discover places that accept cryptocurrency payments.';
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'CryptoPayMap',
    template: '%s | CryptoPayMap',
  },
  description,
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'CryptoPayMap',
    description,
    url: siteUrl,
    siteName: 'CryptoPayMap',
    images: ['/og.svg'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
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
