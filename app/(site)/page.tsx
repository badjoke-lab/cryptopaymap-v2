import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Find crypto-friendly places worldwide',
  description:
    'Discover cafes, shops, and services that accept cryptocurrency, then review listing trust signals before you visit.',
  path: '/',
});

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-4xl items-center px-4 py-10 sm:px-6 sm:py-14">
      <section className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">CryptoPayMap</p>
        <h1 className="mt-3 text-3xl font-semibold text-gray-900 sm:text-5xl">Find places that accept crypto</h1>
        <div className="mt-5 max-w-2xl space-y-3 text-base text-gray-600 sm:text-lg">
          <p>Discover crypto-friendly cafes, shops, and services around the world.</p>
          <p>Check trusted listing signals before visiting and compare options by area.</p>
          <p>Help keep the map fresh by submitting new places and updates.</p>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/map" className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white">
            Open Map
          </Link>
          <Link
            href="/discover"
            className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700"
          >
            Discover
          </Link>
          <Link
            href="/submit"
            className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700"
          >
            Submit
          </Link>
        </div>
      </section>
    </main>
  );
}
