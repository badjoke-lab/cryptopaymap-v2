'use client';

import Link from 'next/link';
import ActivityFeedSection from './sections/ActivityFeedSection';
import AssetExplorerSection from './sections/AssetExplorerSection';
import FeaturedCitiesSection from './sections/FeaturedCitiesSection';
import StoriesSection from './sections/StoriesSection';
import TrendingCountriesSection from './sections/TrendingCountriesSection';
import VerificationHubSection from './sections/VerificationHubSection';

export default function DiscoverPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Discover</p>
        <h1 className="mt-2 text-3xl font-semibold text-gray-900 sm:text-4xl">See what&apos;s happening in crypto acceptance worldwide.</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600 sm:text-base">Track recent additions, trends, stories, and verification context in one place.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/map" className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white">Open Map</Link>
          <Link href="/stats" className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">View Stats</Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ActivityFeedSection />
        <TrendingCountriesSection />
      </div>

      <StoriesSection />
      <FeaturedCitiesSection />
      <AssetExplorerSection />
      <VerificationHubSection />
    </div>
  );
}
