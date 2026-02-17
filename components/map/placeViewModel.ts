import type { Place } from "../../types/places";

export type PlaceViewModel = {
  accepted: string[];
  fullAddress: string;
  socialLinks: { label: string; href: string; key: string }[];
  media: string[];
  amenities: string[];
  amenitiesNotes: string | null;
  paymentNote: string | null;
};

const toWebsiteHref = (website: string) =>
  /^https?:\/\//i.test(website) ? website : `https://${website}`;

const normalizeAccepted = (place: Place) => {
  const preferredOrder = ["BTC", "BTC@Lightning", "Lightning", "ETH", "USDT"];
  const raw = place.accepted?.length
    ? place.accepted
    : place.supported_crypto?.length
      ? place.supported_crypto
      : [];

  const sorted = [
    ...preferredOrder.filter((item) => raw.includes(item)),
    ...raw.filter((item) => !preferredOrder.includes(item)).sort((a, b) => a.localeCompare(b)),
  ];

  return Array.from(new Set(sorted));
};

const normalizeSocialLinks = (place: Place) => {
  const entries: { label: string; href: string; key: string }[] = [];
  const twitter = place.twitter || place.social_twitter;
  const instagram = place.instagram || place.social_instagram;
  const website = place.website || place.social_website;
  const facebook = place.facebook;

  if (twitter) {
    const handle = twitter.replace(/^@/, "");
    entries.push({ key: "twitter", label: `@${handle}`, href: `https://twitter.com/${handle}` });
  }
  if (instagram) {
    const handle = instagram.replace(/^@/, "");
    entries.push({ key: "instagram", label: `@${handle}`, href: `https://instagram.com/${handle}` });
  }
  if (facebook) {
    const handle = facebook.replace(/^@/, "");
    entries.push({ key: "facebook", label: handle, href: `https://facebook.com/${handle}` });
  }
  if (website) {
    entries.push({ key: "website", label: website.replace(/^https?:\/\//, ""), href: toWebsiteHref(website) });
  }

  return entries;
};

const normalizeAmenities = (amenities: Place["amenities"] | string | null | undefined): string[] => {
  if (!amenities) return [];
  if (Array.isArray(amenities)) return amenities;
  return [amenities];
};

export const getPlaceViewModel = (place: Place | null): PlaceViewModel => {
  if (!place) {
    return {
      accepted: [],
      fullAddress: "",
      socialLinks: [],
      media: [],
      amenities: [],
      amenitiesNotes: null,
      paymentNote: null,
    };
  }

  const raw = place as Place & {
    payment_note?: string | null;
    amenities?: string[] | string | null;
    amenities_notes?: string | null;
  };

  const mediaPool = place.images?.length ? place.images : place.photos?.length ? place.photos : [];
  const media = Array.from(new Set([place.coverImage, ...mediaPool].filter(Boolean) as string[]));
  const fullAddress =
    place.address_full?.trim() ||
    [place.address, place.city, place.country]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" / ");

  return {
    accepted: normalizeAccepted(place),
    fullAddress,
    socialLinks: normalizeSocialLinks(place),
    media,
    amenities: normalizeAmenities(raw.amenities),
    amenitiesNotes: raw.amenities_notes ?? null,
    paymentNote: place.paymentNote ?? raw.payment_note ?? null,
  };
};
