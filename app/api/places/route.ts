import { NextRequest, NextResponse } from "next/server";

import { getDbPool, hasDatabaseUrl } from "@/lib/db";
import { places } from "@/lib/data/places";
import { normalizeCommaParams } from "@/lib/filters";
import type { Place } from "@/types/places";

const getPlaceChains = (place: Place) =>
  place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? [];

const loadPlacesFromDb = async (
  filters: {
    category: string | null;
    country: string | null;
    city: string | null;
  },
  chainFilters: string[],
): Promise<Place[] | null> => {
  if (!hasDatabaseUrl()) return null;

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    const { rows: tableChecks } = await client.query<{
      present: string | null;
      verifications: string | null;
      payments: string | null;
    }>(
      `SELECT
        to_regclass('public.places') AS present,
        to_regclass('public.verifications') AS verifications,
        to_regclass('public.payment_accepts') AS payments`,
    );

    if (!tableChecks[0]?.present) {
      return null;
    }

    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.category) {
      params.push(filters.category);
      where.push(`p.category = $${params.length}`);
    }
    if (filters.country) {
      params.push(filters.country);
      where.push(`p.country = $${params.length}`);
    }
    if (filters.city) {
      params.push(filters.city);
      where.push(`p.city = $${params.length}`);
    }

    const hasVerifications = Boolean(tableChecks[0]?.verifications);
    const hasPayments = Boolean(tableChecks[0]?.payments);

    const verificationSelect = hasVerifications ? ", COALESCE(v.status, 'unverified') AS verification" : ", 'unverified'::text AS verification";
    const paymentsSelect = hasPayments ? ", array_agg(DISTINCT pa.asset) FILTER (WHERE pa.asset IS NOT NULL) AS accepted_chains" : "";
    const joinVerification = hasVerifications ? " LEFT JOIN verifications v ON v.place_id = p.id" : "";
    const joinPayments = hasPayments ? " LEFT JOIN payment_accepts pa ON pa.place_id = p.id" : "";
    const groupBy = hasPayments
      ? `GROUP BY p.id, p.name, p.category, p.city, p.country, p.lat, p.lng, p.address, p.about${hasVerifications ? ", v.status" : ""}`
      : "";

    const query = `SELECT p.id, p.name, p.category, p.city, p.country, p.lat, p.lng, p.address, p.about${verificationSelect}${paymentsSelect}
      FROM places p${joinVerification}${joinPayments}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ${groupBy}`;

    const { rows } = await client.query<{
      id: string;
      name: string;
      category: string | null;
      city: string | null;
      country: string | null;
      lat: number;
      lng: number;
      address: string | null;
      about: string | null;
      verification: Place["verification"];
      accepted_chains?: string[] | null;
    }>(query, params);

    const mapped = rows.map((row) => {
      const base: Place = {
        id: row.id,
        name: row.name,
        category: row.category ?? "unknown",
        verification: row.verification ?? "unverified",
        lat: Number(row.lat),
        lng: Number(row.lng),
        country: row.country ?? "",
        city: row.city ?? "",
        address: row.address ?? undefined,
        address_full: row.address ?? undefined,
        about: row.about ?? undefined,
      };

      if (hasPayments) {
        base.accepted = row.accepted_chains ?? undefined;
      }

      return base;
    });

    if (chainFilters.length === 0 || !hasPayments) {
      return mapped;
    }

    const normalizedChains = chainFilters.map((chain) => chain.toLowerCase());
    return mapped.filter((place) => {
      const accepted = place.accepted ?? [];
      const normalized = accepted.map((value) => value.toLowerCase());
      return normalizedChains.some((chain) => normalized.includes(chain));
    });
  } catch (error) {
    console.error("[places] failed to load from database", error);
    return null;
  } finally {
    client.release();
  }
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const category = searchParams.get("category");
  const country = searchParams.get("country");
  const city = searchParams.get("city");
  const chainFilters = normalizeCommaParams(searchParams.getAll("chain")).map((chain) => chain.toLowerCase());
  const verificationFilters = normalizeCommaParams(searchParams.getAll("verification")) as Place["verification"][];

  const dbPlaces = await loadPlacesFromDb({ category, country, city }, chainFilters);
  const sourcePlaces = dbPlaces ?? places;

  const hasChainFilters = chainFilters.length > 0;
  const hasVerificationFilters = verificationFilters.length > 0;

  const filtered = sourcePlaces.filter((place) => {
    if (category && place.category !== category) {
      return false;
    }

    if (country && place.country !== country) {
      return false;
    }

    if (city && place.city !== city) {
      return false;
    }

    if (hasChainFilters) {
      const placeChains = getPlaceChains(place).map((chain) => chain.toLowerCase());
      if (!chainFilters.some((chain) => placeChains.includes(chain))) {
        return false;
      }
    }

    if (hasVerificationFilters && !verificationFilters.includes(place.verification)) {
      return false;
    }

    return true;
  });

  return NextResponse.json(filtered);
}
