import { normalizeAccepted } from "@/lib/accepted";
import type { Place } from "@/types/places";

export type FilterMeta = {
  categories: string[];
  chains: string[];
  countries: string[];
  cities: Record<string, string[]>;
};

export const deriveFilterMeta = (places: Place[]): FilterMeta => {
  const categorySet = new Set<string>();
  const chainSet = new Set<string>();
  const countrySet = new Set<string>();
  const citiesMap = new Map<string, Set<string>>();

  places.forEach((place) => {
    const category = place.category?.trim();
    if (category) categorySet.add(category);
    const acceptedPayments =
      place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? [];
    const normalizedPayments = normalizeAccepted([], acceptedPayments);
    normalizedPayments.forEach((payment) => {
      chainSet.add(payment);
    });
    const country = place.country?.trim();
    if (country) {
      countrySet.add(country);
      if (!citiesMap.has(country)) {
        citiesMap.set(country, new Set());
      }
      const city = place.city?.trim();
      if (city) {
        citiesMap.get(country)?.add(city);
      }
    }
  });

  const countries = Array.from(countrySet).sort((a, b) => a.localeCompare(b));

  const cities: Record<string, string[]> = {};
  citiesMap.forEach((values, code) => {
    cities[code] = Array.from(values).sort((a, b) => a.localeCompare(b));
  });

  return {
    categories: Array.from(categorySet).sort((a, b) => a.localeCompare(b)),
    chains: Array.from(chainSet).sort((a, b) => a.localeCompare(b)),
    countries,
    cities,
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
  const appendValues = (key: string, values: string[]) => {
    Array.from(new Set(values.filter(Boolean))).forEach((value) => {
      params.append(key, value);
    });
  };

  if (filters.category) {
    params.set("category", filters.category);
  }
  if (filters.chains.length) {
    appendValues("chain", filters.chains);
  }
  if (filters.verifications.length) {
    appendValues("verification", filters.verifications);
  }
  if (filters.payments.length) {
    appendValues("payment", filters.payments);
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
  const availableCountries = new Set(meta?.countries ?? []);

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
  const filteredPayments = payments;
  const filteredVerifications = verifications as FilterState["verifications"];

  const filteredCity =
    city && filteredCountry && (!meta?.cities[filteredCountry] || meta.cities[filteredCountry].includes(city))
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
