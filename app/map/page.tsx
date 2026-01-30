import type { Metadata } from 'next';
import MapClient from '../../components/map/MapClient';

export const metadata: Metadata = {
  title: 'Map',
  description: 'Use the map view to browse crypto-friendly venues and discover payment-ready locations.',
  alternates: {
    canonical: '/map',
  },
  openGraph: {
    title: 'CryptoPayMap Map',
    description: 'Use the map view to browse crypto-friendly venues and discover payment-ready locations.',
    url: '/map',
    images: ['/og.png'],
  },
  twitter: {
    title: 'CryptoPayMap Map',
    description: 'Use the map view to browse crypto-friendly venues and discover payment-ready locations.',
    images: ['/og.png'],
  },
};

export default function MapPage() {
  return <MapClient />;
}
