import type { Metadata } from 'next';
import MapClient from '@/components/map/MapClient';

export const metadata: Metadata = {
  title: 'Map',
  description: 'Browse the map to find places that accept cryptocurrency payments, with reliability levels for each listing.',
  alternates: {
    canonical: '/map',
  },
  openGraph: {
    title: 'Map | CryptoPayMap',
    description: 'Browse the map to find places that accept cryptocurrency payments, with reliability levels for each listing.',
    url: '/map',
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
    title: 'Map | CryptoPayMap',
    description: 'Browse the map to find places that accept cryptocurrency payments, with reliability levels for each listing.',
    images: ['/og.png'],
  },
};

export default function MapPage() {
  return <MapClient />;
}
