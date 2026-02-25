import type { Metadata } from 'next';
import { buildPlaceMetadata } from '@/lib/seo/metadata';

type PlacePageProps = {
  params: { id: string };
};

export async function generateMetadata({ params }: PlacePageProps): Promise<Metadata> {
  const { id } = params;
  return buildPlaceMetadata({ id });
}

export default function PlaceDetailPlaceholderPage({ params }: PlacePageProps) {
  const { id } = params;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-4xl items-center px-4 py-10 sm:px-6 sm:py-14">
      <section className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">Place Detail (Preview)</p>
        <h1 className="mt-3 text-3xl font-semibold text-gray-900 sm:text-5xl">Place ID: {id}</h1>
        <p className="mt-5 max-w-2xl text-base text-gray-600 sm:text-lg">
          Detailed place pages are being prepared in a follow-up task.
        </p>
      </section>
    </main>
  );
}
