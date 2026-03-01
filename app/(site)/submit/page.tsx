import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Submit a place or listing update',
  description:
    'Send owner verification requests, community additions, or listing issue reports to keep CryptoPayMap accurate.',
  path: '/submit',
});

const SubmitCard = ({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) => (
  <Link
    href={href}
    className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:border-blue-500 hover:shadow-md transition"
  >
    <div className="space-y-2">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-600">{description}</p>
      <span className="text-sm font-semibold text-blue-600">Start</span>
    </div>
  </Link>
);

export default function SubmitPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-wide text-gray-500">Submit</p>
          <h1 className="text-3xl font-bold text-gray-900">Choose what you want to submit</h1>
          <p className="text-gray-600">Select the flow that matches your request.</p>
        </div>
        <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-5 sm:p-6 text-gray-800 shadow-sm">
          <div className="space-y-4 text-sm sm:text-base leading-relaxed">
            <h2 className="text-xl font-semibold text-gray-900">Submit</h2>

            <p>
              Submitting a listing to CryptoPayMap is <strong>free</strong>.<br />
              All submissions are reviewed. Listings appear on the Map <strong>only after
              approval</strong> (no automatic publishing).
            </p>

            <hr className="border-blue-100" />

            <section className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">Owner Verification</h3>
              <p>Official submission by the business owner or authorized representative.</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>About: up to 600 characters</li>
                <li>Gallery images: up to 8 images (max 2MB each)</li>
                <li>Proof: required (image or URL, selectable type)</li>
                <li>Payment note: up to 150 characters</li>
                <li>Amenities notes: up to 150 characters</li>
              </ul>
            </section>

            <hr className="border-blue-100" />

            <section className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">Community Suggestion</h3>
              <p>Submission by a community member.</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>About: up to 300 characters</li>
                <li>Gallery images: up to 4 images (max 2MB each)</li>
                <li>Proof URLs: minimum 2 required</li>
                <li>Payment note: up to 150 characters</li>
                <li>Amenities notes: up to 150 characters</li>
              </ul>
            </section>

            <hr className="border-blue-100" />

            <section className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">Report a Listing</h3>
              <p>Request correction for incorrect, closed, or misleading listings.</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Evidence URLs: one per line</li>
                <li>Evidence images: up to 4 images (max 2MB each)</li>
              </ul>
            </section>

            <hr className="border-blue-100" />

            <section className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">General</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Accepted image formats: JPEG / PNG / WebP</li>
                <li>Maximum file size: 2MB per image</li>
                <li>
                  False, insufficient, or inappropriate submissions will not be approved
                </li>
              </ul>
            </section>
          </div>
        </section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SubmitCard
            title="Owner verification"
            description="Owners or staff requesting a verified listing or updates."
            href="/submit/owner"
          />
          <SubmitCard
            title="Community suggestion"
            description="Recommend a place to add or update."
            href="/submit/community"
          />
          <SubmitCard
            title="Report a listing"
            description="Report incorrect, closed, or fraudulent listings."
            href="/submit/report"
          />
        </div>
      </div>
    </div>
  );
}
