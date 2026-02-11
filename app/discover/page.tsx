import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Discover',
  description: 'Discover crypto-friendly destinations and upcoming directory highlights — curated collections are coming soon.',
  alternates: {
    canonical: '/discover',
  },
  openGraph: {
    title: 'Discover | CryptoPayMap',
    description: 'Discover crypto-friendly destinations and upcoming directory highlights — curated collections are coming soon.',
    url: '/discover',
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
    title: 'Discover | CryptoPayMap',
    description: 'Discover crypto-friendly destinations and upcoming directory highlights — curated collections are coming soon.',
    images: ['/og.png'],
  },
};

export default function DiscoverPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">Discover</p>
        <h1 className="text-3xl font-semibold text-gray-900 sm:text-4xl">Find crypto-friendly destinations</h1>
        <p className="max-w-2xl text-base text-gray-600">
          We are building a curated directory of neighborhoods and travel clusters that accept cryptocurrency.
          This space will soon feature themed collections and guides.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Directory highlights (coming soon)</h2>
        <ul className="mt-4 space-y-3 text-sm text-gray-600">
          <li>• City hubs with the highest concentration of crypto-friendly venues.</li>
          <li>• Merchants verified by owners and the community.</li>
          <li>• Suggested routes and trip planning tips.</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Explore the map
          </Link>
          <Link
            href="/submit"
            className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
          >
            Submit a place
          </Link>
        </div>
      </section>
    </div>
  );
}
