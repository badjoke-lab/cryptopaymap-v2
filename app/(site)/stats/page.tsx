import type { Metadata } from 'next';
import StatsPageClient from './StatsPageClient';

export const metadata: Metadata = {
  title: 'Stats',
  description: 'Track CryptoPayMap growth with live counts and recent listing trends across verification levels.',
  alternates: {
    canonical: '/stats',
  },
  openGraph: {
    title: 'Stats | CryptoPayMap',
    description: 'Track CryptoPayMap growth with live counts and recent listing trends across verification levels.',
    url: '/stats',
    siteName: 'CryptoPayMap',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'CryptoPayMap',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stats | CryptoPayMap',
    description: 'Track CryptoPayMap growth with live counts and recent listing trends across verification levels.',
    images: ['/og.png'],
  },
};

export default function StatsPage() {
  return <StatsPageClient />;
}
