import type { Place } from "../../types/places";

export type PlaceViewModel = {
  accepted: string[];
  fullAddress: string;
  navigateLinks: { label: string; href: string; key: string }[];
  websiteLink: { label: string; href: string; key: string } | null;
  socialLinks: { label: string; href: string; key: string }[];
  phoneLink: { label: string; href: string; key: string } | null;
  media: string[];
  amenities: string[];
  amenitiesNotes: string | null;
  paymentNote: string | null;
};

const toWebsiteHref = (website: string) =>
  /^https?:\/\//i.test(website) ? website : `https://${website}`;

const normalizeText = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toAddressDestination = (place: Place): string | null => {
  const fullAddress = normalizeText(place.address_full);
  if (fullAddress) return fullAddress;
  const assembled = [place.address, place.city, place.country]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(", ");
  return assembled || null;
};

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

const normalizeNavigateLinks = (place: Place) => {
  const hasCoordinates =
    typeof place.lat === "number" &&
    Number.isFinite(place.lat) &&
    typeof place.lng === "number" &&
    Number.isFinite(place.lng);
  const destination = hasCoordinates ? `${place.lat},${place.lng}` : toAddressDestination(place);
  if (!destination) return [] as { label: string; href: string; key: string }[];

  return [
    {
      key: "google-maps",
      label: "Google Maps",
      href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    },
    {
      key: "apple-maps",
      label: "Apple Maps",
      href: `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`,
    },
  ];
};

const normalizeWebsiteLink = (place: Place) => {
  const website = normalizeText(place.website) || normalizeText(place.social_website);
  if (!website) return null;
  return {
    key: "website",
    label: website.replace(/^https?:\/\//i, ""),
    href: toWebsiteHref(website),
  };
};

const normalizeSocialLinks = (place: Place) => {
  const entries: { label: string; href: string; key: string }[] = [];
  const twitter = normalizeText(place.twitter) || normalizeText(place.social_twitter);
  const instagram = normalizeText(place.instagram) || normalizeText(place.social_instagram);
  const facebook = normalizeText(place.facebook);

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

  return Array.from(new Map(entries.map((entry) => [entry.href, entry])).values());
};

const normalizePhoneLink = (place: Place) => {
  const phone = normalizeText(place.phone);
  if (!phone) return null;

  return {
    key: "phone",
    label: phone,
    href: `tel:${phone.replace(/\s+/g, "")}`,
  };
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
      navigateLinks: [],
      websiteLink: null,
      socialLinks: [],
      phoneLink: null,
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
    navigateLinks: normalizeNavigateLinks(place),
    websiteLink: normalizeWebsiteLink(place),
    socialLinks: normalizeSocialLinks(place),
    phoneLink: normalizePhoneLink(place),
    media,
    amenities: normalizeAmenities(raw.amenities),
    amenitiesNotes: raw.amenities_notes ?? null,
    paymentNote: place.paymentNote ?? raw.payment_note ?? null,
  };
};
