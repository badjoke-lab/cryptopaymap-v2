import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPlaceDetail } from '@/lib/places/detail';
import { buildPlaceMetadata } from '@/lib/seo/metadata';

type PlacePageProps = {
  params: { id: string };
};

const formatLocation = (city: string | null | undefined, country: string | null | undefined) => {
  const location = [city, country].map((value) => value?.trim()).filter(Boolean).join(', ');
  return location.length ? location : null;
};

export async function generateMetadata({ params }: PlacePageProps): Promise<Metadata> {
  const { id } = params;
  const { place } = await getPlaceDetail(id);

  return buildPlaceMetadata({
    id,
    placeName: place?.name ?? null,
  });
}

export default async function PlaceDetailPage({ params }: PlacePageProps) {
  const { id } = params;
  const { place } = await getPlaceDetail(id);

  if (!place) {
    notFound();
  }

  const location = formatLocation(place.city, place.country);
  const heading = location ? `${place.name} — ${location}` : place.name;
  const address = place.address_full?.trim() || formatLocation(place.city, place.country);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-semibold text-gray-900 sm:text-4xl">{heading}</h1>

        <dl className="mt-8 grid gap-5">
          {place.category?.trim() ? (
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-gray-500">Category</dt>
              <dd className="mt-1 text-base text-gray-900">{place.category}</dd>
            </div>
          ) : null}

          {place.accepted?.length ? (
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-gray-500">Accepted</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {place.accepted.map((asset) => (
                  <span
                    key={asset}
                    className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800"
                  >
                    {asset}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}

          {place.paymentNote?.trim() ? (
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-gray-500">Note</dt>
              <dd className="mt-1 text-base text-gray-900">{place.paymentNote}</dd>
            </div>
          ) : null}

          {address ? (
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-gray-500">Address</dt>
              <dd className="mt-1 text-base text-gray-900">{address}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-8">
          <Link
            href={`/map?place=${encodeURIComponent(place.id)}`}
            className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            Open on Map
          </Link>
        </div>
      </article>
    </main>
  );
}
