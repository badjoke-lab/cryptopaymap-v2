import { normalizeAccepted } from "@/lib/accepted";
import type { Place } from "@/types/places";

type CountryNameMap = Record<string, string>;

const COUNTRY_NAMES: CountryNameMap = {
  JP: "Japan",
  US: "United States",
  FR: "France",
  AU: "Australia",
  CA: "Canada",
};

export type FilterMeta = {
  categories: string[];
  chains: string[];
  payments: string[];
  countries: { code: string; name: string }[];
  citiesByCountry: Record<string, string[]>;
  verificationStatuses: Place["verification"][];
};

export const deriveFilterMeta = (places: Place[]): FilterMeta => {
  const categorySet = new Set<string>();
  const chainSet = new Set<string>();
  const paymentSet = new Set<string>();
  const countrySet = new Set<string>();
  const citiesMap = new Map<string, Set<string>>();
  const verificationSet = new Set<Place["verification"]>();

  places.forEach((place) => {
    if (place.category) categorySet.add(place.category);
    const acceptedPayments =
      place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? [];
    acceptedPayments.forEach((chain) => {
      chainSet.add(chain);
    });
    const normalizedPayments = normalizeAccepted([], acceptedPayments);
    normalizedPayments.forEach((payment) => {
      paymentSet.add(payment);
    });
    if (place.country) {
      countrySet.add(place.country);
      if (!citiesMap.has(place.country)) {
        citiesMap.set(place.country, new Set());
      }
      if (place.city) {
        citiesMap.get(place.country)?.add(place.city);
      }
    }
    verificationSet.add(place.verification);
  });

  const countries = Array.from(countrySet)
    .sort()
    .map((code) => ({ code, name: COUNTRY_NAMES[code] ?? code }));

  const citiesByCountry: Record<string, string[]> = {};
  citiesMap.forEach((cities, code) => {
    citiesByCountry[code] = Array.from(cities).sort((a, b) => a.localeCompare(b));
  });

  return {
    categories: Array.from(categorySet).sort((a, b) => a.localeCompare(b)),
    chains: Array.from(chainSet).sort((a, b) => a.localeCompare(b)),
    payments: Array.from(paymentSet).sort((a, b) => a.localeCompare(b)),
    countries,
    citiesByCountry,
    verificationStatuses: Array.from(verificationSet).sort(),
  };
};

export type FilterState = {
  category: string | null;
  chains: string[];
  payments: string[];
  verifications: Place["verification"][];
  country: string | null;
  city: string | null;
  search: string;
};

export const defaultFilterState: FilterState = {
  category: null,
  chains: [],
  payments: [],
  verifications: [],
  country: null,
  city: null,
  search: "",
};

export const normalizeCommaParams = (values: string[]): string[] =>
  values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

export const buildQueryFromFilters = (filters: FilterState): string => {
  const params = new URLSearchParams();

  if (filters.category) {
    params.set("category", filters.category);
  }
  if (filters.chains.length) {
    params.set("chain", filters.chains.join(","));
  }
  if (filters.verifications.length) {
    params.set("verification", filters.verifications.join(","));
  }
  if (filters.payments.length) {
    params.set("payment", filters.payments.join(","));
  }
  if (filters.country) {
    params.set("country", filters.country);
  }
  if (filters.city) {
    params.set("city", filters.city);
  }
  if (filters.search.trim()) {
    params.set("q", filters.search.trim());
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
};

export const parseFiltersFromSearchParams = (
  searchParams: URLSearchParams,
  meta?: FilterMeta,
): FilterState => {
  const availableCategories = new Set(meta?.categories ?? []);
  const availableChains = new Set(meta?.chains ?? []);
  const availablePayments = new Set(meta?.payments ?? []);
  const availableVerifications = new Set(meta?.verificationStatuses ?? []);
  const availableCountries = new Set((meta?.countries ?? []).map((c) => c.code));

  const category = searchParams.get("category");
  const country = searchParams.get("country");
  const city = searchParams.get("city");
  const search = searchParams.get("q")?.trim() ?? "";

  const chains = normalizeCommaParams(searchParams.getAll("chain"));
  const payments = normalizeCommaParams(searchParams.getAll("payment"));
  const verifications = normalizeCommaParams(searchParams.getAll("verification")) as FilterState["verifications"];

  const filteredCategory = category && (!availableCategories.size || availableCategories.has(category)) ? category : null;
  const filteredCountry = country && (!availableCountries.size || availableCountries.has(country)) ? country : null;
  const filteredChains = chains.filter((chain) => !availableChains.size || availableChains.has(chain));
  const filteredPayments = payments.filter(
    (payment) => !availablePayments.size || availablePayments.has(payment),
  );
  const filteredVerifications = verifications.filter(
    (verification) => !availableVerifications.size || availableVerifications.has(verification),
  ) as FilterState["verifications"];

  const filteredCity =
    city && filteredCountry && (!meta?.citiesByCountry[filteredCountry] || meta.citiesByCountry[filteredCountry].includes(city))
      ? city
      : null;

  return {
    category: filteredCategory,
    chains: filteredChains,
    verifications: filteredVerifications,
    payments: filteredPayments,
    country: filteredCountry,
    city: filteredCity,
    search,
  };
};
