import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Home',
  description: 'CryptoPayMap helps you find places that accept cryptocurrency, with verification signals and transparent listing sources.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'CryptoPayMap',
    description: 'Find crypto-friendly places worldwide with map search, verification levels, and community-driven updates.',
    url: '/',
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
    title: 'CryptoPayMap',
    description: 'Find crypto-friendly places worldwide with map search, verification levels, and community-driven updates.',
    images: ['/og.png'],
  },
};

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <section className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">CryptoPayMap</p>
        <h1 className="max-w-3xl text-3xl font-semibold text-gray-900 sm:text-5xl">
          Find places that accept cryptocurrency payments
        </h1>
        <p className="max-w-2xl text-base text-gray-600 sm:text-lg">
          Explore global locations, check listing verification levels, and help the directory stay current by
          submitting updates.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/map" className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white">
            Open Map
          </Link>
          <Link
            href="/submit"
            className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700"
          >
            Submit a place
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Verification labels</h2>
          <p className="mt-2 text-sm text-gray-600">Understand whether each listing is owner-confirmed, community-reported, or directory-imported.</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Fast filtering</h2>
          <p className="mt-2 text-sm text-gray-600">Narrow the map by country, city, category, and accepted assets to quickly find relevant places.</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Community updates</h2>
          <p className="mt-2 text-sm text-gray-600">Contribute new venues and report stale data so the map remains useful for everyone.</p>
        </div>
      </section>
    </div>
  );
}
