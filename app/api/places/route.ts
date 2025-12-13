import { NextRequest, NextResponse } from "next/server";

import { places } from "@/lib/data/places";
import { normalizeCommaParams } from "@/lib/filters";
import type { Place } from "@/types/places";

const getPlaceChains = (place: Place) =>
  place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? [];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const category = searchParams.get("category");
  const country = searchParams.get("country");
  const city = searchParams.get("city");
  const chainFilters = normalizeCommaParams(searchParams.getAll("chain")).map((chain) => chain.toLowerCase());
  const verificationFilters = normalizeCommaParams(searchParams.getAll("verification")) as Place["verification"][];

  const hasChainFilters = chainFilters.length > 0;
  const hasVerificationFilters = verificationFilters.length > 0;

  const filtered = places.filter((place) => {
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
