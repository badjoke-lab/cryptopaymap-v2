import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { places as fallbackPlaces } from '@/lib/data/places';
import { getPlaceDetail } from '@/lib/places/detail';
import { buildPlaceMetadata } from '@/lib/seo/metadata';
import { safeDecode } from '@/lib/utils/safeDecode';

type PlacePageProps = {
  params: { id: string };
};

const formatLocation = (city: string | null | undefined, country: string | null | undefined) => {
  const location = [city, country].map((value) => value?.trim()).filter(Boolean).join(', ');
  return location.length ? location : null;
};

const siteUrl = 'https://www.cryptopaymap.com';
const relatedLinksLimit = 6;

const normalizeText = (value: string | null | undefined) => value?.trim().toLowerCase() ?? '';

export async function generateMetadata({ params }: PlacePageProps): Promise<Metadata> {
  const rawId = params.id;
  const id = safeDecode(rawId);
  const { place } = await getPlaceDetail(id);

  return buildPlaceMetadata({
    id,
    placeName: place?.name ?? null,
  });
}

export default async function PlaceDetailPage({ params }: PlacePageProps) {
  const rawId = params.id;
  const id = safeDecode(rawId);
  const { place } = await getPlaceDetail(id);

  if (!place) {
    notFound();
  }

  const location = formatLocation(place.city, place.country);
  const heading = location ? `${place.name} — ${location}` : place.name;
  const address = place.address_full?.trim() || formatLocation(place.city, place.country);
  const placeUrl = `${siteUrl}/place/${encodeURIComponent(place.id)}`;

  const relatedByCountry = normalizeText(place.country)
    ? fallbackPlaces
        .filter(
          (candidate) =>
            candidate.id !== place.id &&
            normalizeText(candidate.country) === normalizeText(place.country),
        )
        .slice(0, relatedLinksLimit)
    : [];

  const relatedByCategory = normalizeText(place.category)
    ? fallbackPlaces
        .filter(
          (candidate) =>
            candidate.id !== place.id &&
            normalizeText(candidate.category) === normalizeText(place.category),
        )
        .slice(0, relatedLinksLimit)
    : [];

  const localBusinessJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': placeUrl,
    url: placeUrl,
    name: place.name,
    ...(place.category?.trim() ? { category: place.category.trim() } : {}),
    ...(address ? { address } : {}),
    ...(place.lat != null && place.lng != null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: place.lat,
            longitude: place.lng,
          },
        }
      : {}),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Map',
        item: `${siteUrl}/map`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: place.name,
        item: placeUrl,
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([localBusinessJsonLd, breadcrumbJsonLd]),
          }}
        />

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

        {relatedByCountry.length > 0 || relatedByCategory.length > 0 ? (
          <section className="mt-10 border-t border-gray-100 pt-6">
            <h2 className="text-lg font-semibold text-gray-900">Related places</h2>

            {relatedByCountry.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Same country
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {relatedByCountry.map((candidate) => (
                    <li key={`country-${candidate.id}`}>
                      <Link href={`/place/${encodeURIComponent(candidate.id)}`} className="text-sky-700 hover:underline">
                        {candidate.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {relatedByCategory.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Same category
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {relatedByCategory.map((candidate) => (
                    <li key={`category-${candidate.id}`}>
                      <Link href={`/place/${encodeURIComponent(candidate.id)}`} className="text-sky-700 hover:underline">
                        {candidate.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </article>
    </main>
  );
}
