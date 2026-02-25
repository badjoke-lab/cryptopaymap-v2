import type { Metadata } from 'next';
import StatsPageClient from './StatsPageClient';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Crypto listing and growth stats',
  description:
    'Review CryptoPayMap totals, verification mix, and listing trends to understand ecosystem coverage over time.',
  path: '/stats',
});

export default function StatsPage() {
  return <StatsPageClient />;
}
