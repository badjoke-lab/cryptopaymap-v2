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
