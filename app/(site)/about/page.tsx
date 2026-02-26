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
          CryptoPayMap is an independent project that maps places where you can pay with crypto — and helps you understand which
          assets, on which networks, and how well each listing has been verified.
        </p>
        {/* Donation CTA (above the fold) */}
        <div className="mt-4 max-w-3xl rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm leading-6 text-sky-900">
            <strong>Funding:</strong> CryptoPayMap is supported by donations. If you find it useful, please consider supporting
            the project so it can continue.
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/donate"
              className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Support CryptoPayMap
            </Link>
            <p className="text-xs text-sky-800">Donations are optional. The site is free to use.</p>
          </div>
        </div>
      </header>

      {/* Core (Markdown content rendered as structured HTML) */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="max-w-none">
          <h2 className="text-xl font-semibold text-gray-900">What CryptoPayMap Is</h2>

          <p className="mt-2 text-sm leading-6 text-gray-700">
            CryptoPayMap is an independent project that maps <strong>places where crypto payments are accepted</strong>.
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-700">
            It’s not just about <em>where</em> you can use crypto — it also aims to show <strong>which assets</strong>,{' '}
            <strong>on which networks</strong>, and <strong>how well each claim has been verified</strong>.
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-700">
            We prioritize presenting the data as neutrally and transparently as possible.
          </p>

          <h3 className="mt-5 text-lg font-semibold text-gray-900">Map</h3>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Map lets you explore places reported to accept crypto payments. You can filter by country, city, category, asset,
            network, and verification level.
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-700">On each place page, you can check:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">
            <li>Accepted assets</li>
            <li>Network details (e.g., Lightning)</li>
            <li>Verification status</li>
            <li>Update history</li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-gray-700">
            Map is the main entry point for finding where crypto can be used right now.
          </p>

          <h3 className="mt-5 text-lg font-semibold text-gray-900">Stats</h3>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Stats aggregates CryptoPayMap’s place data to provide a high-level view of crypto payment adoption — including how
            widely each asset is accepted, how often networks are specified, and breakdowns by verification level.
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            If a place lists an asset but doesn’t specify the network, it may be counted as “unspecified” to highlight missing
            detail rather than an error.
          </p>

          <h3 className="mt-5 text-lg font-semibold text-gray-900">Discover</h3>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Discover visualizes how crypto payments are spreading and changing over time based on registered data and history —
            including recently added places, verification updates, promoted places, city-level growth, and monthly reports.
          </p>

          <hr className="my-6 border-gray-200" />

          <h2 className="text-xl font-semibold text-gray-900">Why Verification Levels Exist</h2>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Verification levels exist to clarify how each listing has been confirmed. The goal is to make reliability visible —
            not to claim every listing is accurate at all times.
          </p>

          <p className="mt-3 text-sm leading-6 text-gray-700">Place pages show one of the following verification statuses:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">
            <li>
              <strong>Owner verified</strong> — Confirmed directly by the business owner/operator.
            </li>
            <li>
              <strong>Community</strong> — Submitted and confirmed by community members.
            </li>
            <li>
              <strong>Unverified</strong> — Data derived from OpenStreetMap where crypto-related tags exist, but no verification
              has been performed by the project yet.
            </li>
          </ul>

          <p className="mt-3 text-sm leading-6 text-gray-700">
            “Unverified” does <em>not</em> mean a place does not accept crypto — it means independent confirmation has not yet
            happened.
          </p>

          <hr className="my-6 border-gray-200" />

          <h2 className="text-xl font-semibold text-gray-900">How You Can Help (Submit &amp; Report)</h2>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Submit is the form used to add, update, or correct place information on CryptoPayMap.
          </p>

          <p className="mt-3 text-sm leading-6 text-gray-700">There are three submission types:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">
            <li>
              <strong>Owner</strong> (owner submission)
            </li>
            <li>
              <strong>Community</strong> (community submission)
            </li>
            <li>
              <strong>Report</strong> (correction report)
            </li>
          </ul>

          <p className="mt-3 text-sm leading-6 text-gray-700">
            Submissions are not applied instantly. They are recorded and reviewed before being reflected in the map.
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-700">
            Submitting and listing are free. For detailed instructions and requirements, please refer to the Submit page.
          </p>

          <hr className="my-6 border-gray-200" />

          <h2 id="privacy" className="text-xl font-semibold text-gray-900">
            Images &amp; Privacy
          </h2>
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
            Only <strong>Gallery</strong> images may appear publicly. <strong>Proof/Evidence</strong> materials are for review
            only and are not published.
          </p>

          <hr className="my-6 border-gray-200" />

          <h2 id="disclaimer" className="text-xl font-semibold text-gray-900">
            Disclaimer
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            We work to keep data accurate, but acceptance can change at any time. Before visiting, consider confirming via the
            venue’s official channels or on-site signage.
          </p>
          <hr className="my-6 border-gray-200" />

          <div className="rounded-lg bg-sky-50 p-5">
          <h2 className="text-xl font-semibold text-gray-900">Funding</h2>

          <p className="mt-2 text-sm leading-6 text-gray-700">
            CryptoPayMap is supported by donations.
          </p>

          <p className="mt-3 text-sm leading-6 text-gray-700">
            Maintaining the project involves ongoing costs such as:
          </p>

          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">
            <li>Server and infrastructure</li>
            <li>Data updates</li>
            <li>Review and moderation</li>
            <li>Product development</li>
          </ul>

          <p className="mt-3 text-sm leading-6 text-gray-700">
            If you find CryptoPayMap useful, please consider supporting the project.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/donate"
              className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Support CryptoPayMap
            </Link>

            <p className="text-xs text-gray-600">Donations are optional. The site remains free to use.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Data sources</h2>
          <p className="mt-2 text-sm text-gray-600">
            The dataset includes OpenStreetMap crypto-related tags, owner submissions, community submissions, and report-based
            corrections. Entries are labeled with a verification status to indicate how the information was obtained and confirmed.
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Verification levels</h2>
          <p className="mt-2 text-sm text-gray-600">
            Verification levels indicate confirmation state, not a payment guarantee. They help distinguish between unverified
            directory data, community-confirmed listings, and owner-confirmed listings.
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">Accuracy disclaimer</h2>
          <p className="mt-2 text-sm text-gray-600">
            Crypto payment availability can vary by staff, policy, network, or temporary conditions. If an asset is listed without
            a network, it may be shown as “unspecified” to reflect missing detail. Always confirm directly with the venue when
            possible.
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 id="contact" className="text-xl font-semibold text-gray-900">
            Contact
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Found an incorrect listing, a closed venue, or a misleading claim? Use the contact form for quick reports and
            questions. For bugs and feature requests, GitHub Issues helps us track and discuss changes publicly.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">

            {/* Contact (outline) */}
            <Link
              href="https://docs.google.com/forms/d/e/1FAIpQLScdv3WFVHmQO_mz-p4_HJv1RyJItghrG6A0SGQ5ec4R2NBNOw/viewform?usp=pp_url&entry.148248220=CryptoPayMap"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
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