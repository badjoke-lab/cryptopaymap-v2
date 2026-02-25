import type { Metadata } from 'next';

const SITE_NAME = 'CryptoPayMap';
const OG_IMAGE = '/og.png';

export const DEFAULT_DESCRIPTION =
  'CryptoPayMap helps you find places that accept cryptocurrency, with verification signals and transparent listing sources.';

const buildOgTitle = (title: string) => `${title} | ${SITE_NAME}`;

type PageMetadataInput = {
  title: string;
  description: string;
  path: `/${string}` | '/';
};

export const buildPageMetadata = ({ title, description, path }: PageMetadataInput): Metadata => ({
  title,
  description,
  alternates: {
    canonical: path,
  },
  openGraph: {
    title: buildOgTitle(title),
    description,
    url: path,
    siteName: SITE_NAME,
    type: 'website',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: buildOgTitle(title),
    description,
    images: [OG_IMAGE],
  },
});

type PlaceMetadataInput = {
  id: string;
  placeName?: string | null;
};

export const buildPlaceMetadata = ({ id, placeName }: PlaceMetadataInput): Metadata => {
  const title = placeName?.trim().length ? `${placeName.trim()} details` : `Place ${id} details`;
  return buildPageMetadata({
    title,
    description:
      'Check this place’s verification level, supported crypto assets, and key listing details on CryptoPayMap.',
    path: `/place/${id}`,
  });
};
