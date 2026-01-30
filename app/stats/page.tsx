import type { Metadata } from 'next';
import StatsPageClient from './StatsPageClient';

export const metadata: Metadata = {
  title: 'Stats',
  description: 'Track CryptoPayMap growth with live counts and recent listing trends.',
  alternates: {
    canonical: '/stats',
  },
  openGraph: {
    title: 'CryptoPayMap Stats',
    description: 'Track CryptoPayMap growth with live counts and recent listing trends.',
    url: '/stats',
    images: ['/og.png'],
  },
  twitter: {
    title: 'CryptoPayMap Stats',
    description: 'Track CryptoPayMap growth with live counts and recent listing trends.',
    images: ['/og.png'],
  },
};

export default function StatsPage() {
  return <StatsPageClient />;
}
