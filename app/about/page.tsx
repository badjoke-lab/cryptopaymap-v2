import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about CryptoPayMap, our data sources, and community-driven accuracy practices.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About CryptoPayMap',
    description: 'Learn about CryptoPayMap, our data sources, and community-driven accuracy practices.',
    url: '/about',
    images: ['/og.png'],
  },
  twitter: {
    title: 'About CryptoPayMap',
    description: 'Learn about CryptoPayMap, our data sources, and community-driven accuracy practices.',
    images: ['/og.png'],
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">About &amp; Disclaimer</p>
        <h1 className="text-3xl font-semibold text-gray-900 sm:text-4xl">About CryptoPayMap</h1>
        <p className="max-w-2xl text-base text-gray-600">
          CryptoPayMap is a community-driven directory that helps travelers and locals discover places accepting
          cryptocurrency payments.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Data sources</h2>
        <p className="mt-2 text-sm text-gray-600">
          Listings come from verified owner submissions, community contributions, and publicly available directories.
          We periodically review and update entries as new information arrives.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Accuracy disclaimer</h2>
        <p className="mt-2 text-sm text-gray-600">
          Information on this site is provided as-is and may change without notice. Always confirm payment methods and
          availability directly with each venue before relying on it.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Contact &amp; issues</h2>
        <p className="mt-2 text-sm text-gray-600">
          Found an incorrect listing or want to request a feature? Please open an issue on GitHub.
        </p>
        <Link
          href="https://github.com/badjoke-lab/cryptopaymap-v2/issues"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
        >
          Visit GitHub Issues
        </Link>
      </section>
    </div>
  );
}
