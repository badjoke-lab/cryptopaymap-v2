import type { Metadata } from 'next';
import MapClient from '@/components/map/MapClient';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Explore the crypto payment map',
  description:
    'Browse nearby crypto-accepting places on the interactive map with verification levels and listing context.',
  path: '/map',
});

export default function MapPage() {
  return <MapClient />;
}
