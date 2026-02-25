export type DiscoverEnvelope<T> = {
  ok: boolean;
  limited: boolean;
  reason?: string;
  data: T;
  lastUpdatedISO: string;
};

export type DiscoverActivityTab = "added" | "owner" | "community" | "promoted";
export type DiscoverVerificationLevel = "owner" | "community" | "directory" | "unverified";

export type DiscoverActivityItem = {
  placeId: string;
  name: string;
  city: string;
  country: string;
  verificationLevel: DiscoverVerificationLevel;
  assets: string[];
  timeLabelISO: string;
  eventType: "promote" | "approve";
};

export type DiscoverTrendingCountry = {
  countryCode: string;
  countryName?: string;
  delta30d: number;
};

export type DiscoverFeaturedCity = {
  countryCode: string;
  city: string;
  totalPlaces: number;
  topCategory: string;
  topAssets: string[];
  verificationBreakdown: {
    owner: number;
    community: number;
    directory: number;
    unverified: number;
  };
};

export type DiscoverAssetListItem = {
  asset: string;
  countTotal: number;
  delta30d?: number;
};

export type DiscoverAssetPanel = {
  asset: string;
  countriesTop5: Array<{ countryCode: string; total: number }>;
  categoriesTop5: Array<{ category: string; total: number }>;
  recent5: Array<{
    placeId: string;
    name: string;
    city: string;
    country: string;
    timeLabelISO: string;
    eventType: "promote" | "approve";
  }>;
};

export type DiscoverStoryCard = {
  id: string;
  title: string;
  summary: string;
  badges: string[];
  dateISO: string;
  cta: {
    kind: "map" | "stats";
    href: string;
  };
  metricsPreview: Array<{ label: string; value: string }>;
};

export type DiscoverMonthlyStory = {
  id: string;
  month: string;
  title: string;
  highlights: string[];
  dateISO: string;
};
