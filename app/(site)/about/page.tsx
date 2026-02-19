import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About',
  description:
    'CryptoPayMap is a map-based directory for finding places that accept cryptocurrency — with reliability levels that help you judge how trustworthy each listing is.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About CryptoPayMap',
    description:
      'CryptoPayMap is a map-based directory for finding places that accept cryptocurrency — with reliability levels that help you judge how trustworthy each listing is.',
    url: '/about',
    images: ['/og.png'],
  },
  twitter: {
    title: 'About CryptoPayMap',
    description:
      'CryptoPayMap is a map-based directory for finding places that accept cryptocurrency — with reliability levels that help you judge how trustworthy each listing is.',
    images: ['/og.png'],
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">About &amp; Disclaimer</p>
        <h1 className="text-3xl font-semibold text-gray-900 sm:text-4xl">About CryptoPayMap</h1>
        <p className="max-w-3xl text-base text-gray-600">
          CryptoPayMap is a map-based directory for finding places that accept cryptocurrency — with reliability levels
          that help you judge how trustworthy each listing is.
        </p>
      </header>

      {/* Core (Markdown content rendered as structured HTML) */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="max-w-none">
          <h2 className="text-xl font-semibold text-gray-900">What CryptoPayMap Is</h2>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            CryptoPayMap is a map-based directory to help you find <strong>places that accept cryptocurrency payments</strong>{' '}
            around the world.
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-700">
            Because crypto acceptance can change quickly (staff changes, POS setup, policy updates, temporary outages),
            “listed” does not always mean “true today.” That’s why CryptoPayMap focuses on making{' '}
            <strong>information reliability visible</strong>, not just collecting locations.
          </p>

          <hr className="my-6 border-gray-200" />

          <h2 className="text-xl font-semibold text-gray-900">Why Verification Levels Exist</h2>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Listings on CryptoPayMap include a verification level so you can judge how trustworthy each entry is:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">
            <li>
              <strong>Owner Verified</strong> — Submitted by the business owner/operator with supporting proof and
              reviewed.
            </li>
            <li>
              <strong>Community Verified</strong> — Submitted by the community with multiple independent sources and
              reviewed.
            </li>
            <li>
              <strong>Directory / Unverified</strong> — Imported or unreviewed entries that may contain outdated or
              incorrect info.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-gray-700">
            Use verified listings when you need confidence, and treat unverified entries as leads to double-check.
          </p>

          <hr className="my-6 border-gray-200" />

          <h2 className="text-xl font-semibold text-gray-900">How You Can Help (Submit &amp; Report)</h2>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            CryptoPayMap improves through submissions and corrections:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">
            <li>
              <strong>Owner Verified submission</strong>: for owners/operators who can provide proof.
            </li>
            <li>
              <strong>Community Verified submission</strong>: for community members who can provide multiple reliable
              sources.
            </li>
            <li>
              <strong>Report (Fix/Remove)</strong>: if you find incorrect details, closures, misleading claims, or risky
              information, you can report it with evidence.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-gray-700">
            Submissions follow a <strong>two-step flow</strong>: <em>Fill → Review → Final Submit</em> (final submission
            happens only from the review screen).
          </p>

          <hr className="my-6 border-gray-200" />

          <h2 id="privacy" className="text-xl font-semibold text-gray-900">Images &amp; Privacy</h2>
          <p className="mt-2 text-sm leading-6 text-gray-700">We separate images strictly by purpose:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">
            <li>
              <strong>Gallery</strong>: general place photos (may be publicly shown).
            </li>
            <li>
              <strong>Proof</strong>: used only to verify owner/operator status (not public).
            </li>
            <li>
              <strong>Evidence</strong>: used only for reports and moderation (not public).
            </li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-gray-700">
            Only <strong>Gallery</strong> images may appear publicly. <strong>Proof/Evidence</strong> materials are for
            review only and are not published.
          </p>

          <hr className="my-6 border-gray-200" />

          <h2 id="disclaimer" className="text-xl font-semibold text-gray-900">Disclaimer</h2>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            We work to keep data accurate, but acceptance can change at any time. Before visiting, consider confirming
            via the venue’s official channels or on-site signage.
          </p>
        </div>
      </section>

      {/* Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Data sources</h2>
          <p className="mt-2 text-sm text-gray-600">
            Listings come from owner submissions, community contributions, and publicly available directories. Each
            entry is labeled with a verification level so you can understand how the information was obtained and
            reviewed.
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Verification levels</h2>
          <p className="mt-2 text-sm text-gray-600">
            Owner Verified and Community Verified listings have been reviewed with supporting proof or multiple
            independent sources. Directory/Unverified listings may be outdated — please double-check before you rely on
            them.
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Accuracy disclaimer</h2>
          <p className="mt-2 text-sm text-gray-600">
            Information is provided as-is and may change without notice. Payment availability can vary by staff, policy,
            or temporary conditions. Always confirm directly with the venue when possible.
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 id="contact" className="text-xl font-semibold text-gray-900">Contact</h2>
          <p className="mt-2 text-sm text-gray-600">
            Found an incorrect listing, a closed venue, or a misleading claim? Use the contact form for quick reports
            and questions. For bugs and feature requests, GitHub Issues helps us track and discuss changes publicly.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="https://docs.google.com/forms/d/e/1FAIpQLScdv3WFVHmQO_mz-p4_HJv1RyJItghrG6A0SGQ5ec4R2NBNOw/viewform?usp=pp_url&entry.148248220=CryptoPayMap"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Contact Form
            </Link>

            <Link
              href="https://github.com/badjoke-lab/cryptopaymap-v2/issues"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              GitHub Issues
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
