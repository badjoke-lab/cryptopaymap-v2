import type { Metadata } from 'next';
import MapClient from '../components/map/MapClient';

export const metadata: Metadata = {
  title: 'Map',
  description: 'Explore the CryptoPayMap to find nearby places that accept cryptocurrency payments.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'CryptoPayMap Map',
    description: 'Explore the CryptoPayMap to find nearby places that accept cryptocurrency payments.',
    url: '/',
    images: ['/og.png'],
  },
  twitter: {
    title: 'CryptoPayMap Map',
    description: 'Explore the CryptoPayMap to find nearby places that accept cryptocurrency payments.',
    images: ['/og.png'],
  },
};

export default function HomePage() {
  return <MapClient />;
}
