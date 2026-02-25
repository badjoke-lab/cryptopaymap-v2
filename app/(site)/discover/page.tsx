import type { Metadata } from 'next';
import DiscoverPage from '@/components/discover/DiscoverPage';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Discover crypto acceptance highlights',
  description: 'Explore activity updates, trending countries, stories, city spotlights, and asset-level insights with the Discover v0.1 shell.',
  path: '/discover',
});

export default function DiscoverRoutePage() {
  return <DiscoverPage />;
}
