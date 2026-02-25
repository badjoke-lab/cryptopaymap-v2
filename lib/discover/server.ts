import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { buildDataSourceHeaders } from "@/lib/dataSource";
import { ensureHistoryTable } from "@/lib/history";
import { hasColumn, tableExists } from "@/lib/internal-submissions";

import type {
  DiscoverActivityItem,
  DiscoverActivityTab,
  DiscoverAssetListItem,
  DiscoverAssetPanel,
  DiscoverEnvelope,
  DiscoverFeaturedCity,
  DiscoverMonthlyStory,
  DiscoverStoryCard,
  DiscoverTrendingCountry,
  DiscoverVerificationLevel,
} from "@/lib/discover/types";

const CACHE_CONTROL = "public, s-maxage=180, stale-while-revalidate=60";
const NO_STORE = "no-store";

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

const parseLimit = (request: Request, fallback = 8, max = 25) => {
  const limit = Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "", 10);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(limit, max);
};

const jsonResponse = <T>(body: DiscoverEnvelope<T>, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": status >= 500 ? NO_STORE : CACHE_CONTROL,
      ...buildDataSourceHeaders("db", body.limited || !body.ok),
    },
  });

const makeEnvelope = <T>(data: T, options?: { limited?: boolean; reason?: string; ok?: boolean }): DiscoverEnvelope<T> => ({
  ok: options?.ok ?? true,
  limited: options?.limited ?? false,
  reason: options?.reason,
  data,
  lastUpdatedISO: new Date().toISOString(),
});

const normalizeVerification = (raw: string | null): DiscoverVerificationLevel => {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "owner" || value === "community" || value === "directory") return value;
  return "unverified";
};

const resolveVerificationColumn = async (route: string) => {
  const hasVerifications = await tableExists(route, "verifications");
  if (!hasVerifications) return null;
  if (await hasColumn(route, "verifications", "level")) return "level";
  if (await hasColumn(route, "verifications", "status")) return "status";
  return null;
};

const hasPromoteHistory = async (route: string) => {
  const { rows } = await dbQuery<{ total: string }>(
    `SELECT COUNT(*)::int AS total FROM public.history WHERE action = 'promote' AND place_id IS NOT NULL`,
    [],
    { route },
  );
  return Number(rows[0]?.total ?? 0) > 0;
};

const queryActivity = async (route: string, tab: DiscoverActivityTab, limit: number): Promise<DiscoverEnvelope<DiscoverActivityItem[]>> => {
  const placesExists = await tableExists(route, "places");
  if (!placesExists) {
    return makeEnvelope([], { limited: true, reason: "places table unavailable" });
  }

  await ensureHistoryTable(route);
  const verificationColumn = await resolveVerificationColumn(route);

  const hasPayments = await tableExists(route, "payment_accepts");
  const [hasPaymentAsset, hasPaymentPlaceId] = hasPayments
    ? await Promise.all([hasColumn(route, "payment_accepts", "asset"), hasColumn(route, "payment_accepts", "place_id")])
    : [false, false];

  const historyAction =
    tab === "owner" || tab === "community" ? "approve"
    : tab === "promoted" ? "promote"
    : "added";

  let allowedActions: Array<"promote" | "approve"> = ["promote"];
  let limited = false;
  let reason: string | undefined;

  if (tab === "owner" || tab === "community") {
    allowedActions = ["approve"];
  } else if (tab === "promoted") {
    allowedActions = ["promote"];
    const hasPromote = await hasPromoteHistory(route);
    if (!hasPromote) {
      return makeEnvelope([], { limited: true, reason: "promote history unavailable" });
    }
  } else {
    const hasPromote = await hasPromoteHistory(route);
    if (!hasPromote) {
      const { rows } = await dbQuery<{ total: string }>(
        `SELECT COUNT(*)::int AS total FROM public.history WHERE action = 'approve' AND place_id IS NOT NULL`,
        [],
        { route },
      );
      const approveCount = Number(rows[0]?.total ?? 0);
      if (approveCount <= 0) {
        return makeEnvelope([], { limited: true, reason: "visibility history unavailable for added tab" });
      }
      allowedActions = ["approve"];
      limited = true;
      reason = "using approve fallback because promote history is unavailable";
    }
  }

  const verificationJoin = verificationColumn
    ? `LEFT JOIN LATERAL (
         SELECT CASE
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'owner' THEN 'owner'
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'community' THEN 'community'
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'directory' THEN 'directory'
           ELSE 'unverified'
         END AS level
         FROM verifications v
         WHERE v.place_id = p.id
         ORDER BY CASE
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'owner' THEN 1
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'community' THEN 2
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'directory' THEN 3
           ELSE 4
         END
         LIMIT 1
       ) vr ON TRUE`
    : "";

  const assetsJoin = hasPaymentAsset && hasPaymentPlaceId
    ? `LEFT JOIN LATERAL (
         SELECT ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(BTRIM(pa.asset), '')), NULL)::text[] AS assets
         FROM payment_accepts pa
         WHERE pa.place_id = p.id
       ) a ON TRUE`
    : "";

  const params: unknown[] = [allowedActions, limit];
  let whereVerification = "";
  if ((tab === "owner" || tab === "community") && verificationColumn) {
    params.push(tab);
    whereVerification = ` AND coalesce(vr.level, 'unverified') = $${params.length}`;
  }

  const { rows } = await dbQuery<{
    place_id: string;
    name: string;
    city: string | null;
    country: string | null;
    verification_level: string | null;
    assets: string[] | null;
    created_at: string;
    action: "promote" | "approve";
  }>(
    `WITH latest_events AS (
       SELECT DISTINCT ON (h.place_id) h.place_id, h.created_at, h.action
       FROM public.history h
       WHERE h.place_id IS NOT NULL
         AND h.action = ANY($1::text[])
       ORDER BY h.place_id, h.created_at DESC
     )
     SELECT le.place_id, p.name, p.city, p.country,
            ${verificationColumn ? "coalesce(vr.level, 'unverified')" : "'unverified'"} AS verification_level,
            ${hasPaymentAsset && hasPaymentPlaceId ? "coalesce(a.assets, ARRAY[]::text[])" : "ARRAY[]::text[]"} AS assets,
            le.created_at,
            le.action
     FROM latest_events le
     INNER JOIN places p ON p.id = le.place_id
     ${verificationJoin}
     ${assetsJoin}
     WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
     ${whereVerification}
     ORDER BY le.created_at DESC
     LIMIT $2`,
    params,
    { route },
  );

  return makeEnvelope(rows.map((row) => ({
    placeId: row.place_id,
    name: row.name,
    city: row.city ?? "",
    country: row.country ?? "",
    verificationLevel: normalizeVerification(row.verification_level),
    assets: (row.assets ?? []).filter(Boolean),
    timeLabelISO: row.created_at,
    eventType: row.action,
  })), { limited, reason });
};

const queryTrendingCountries = async (route: string): Promise<DiscoverEnvelope<DiscoverTrendingCountry[]>> => {
  await ensureHistoryTable(route);

  const hasPromote = await hasPromoteHistory(route);
  let action: "promote" | "approve" = "promote";
  let limited = false;
  let reason: string | undefined;

  if (!hasPromote) {
    const { rows: approveRows } = await dbQuery<{ total: string }>(
      `SELECT COUNT(*)::int AS total FROM public.history WHERE action = 'approve' AND place_id IS NOT NULL`,
      [],
      { route },
    );
    if (Number(approveRows[0]?.total ?? 0) <= 0) {
      return makeEnvelope([], {
        limited: true,
        reason: "insufficient history visibility events for 30d trending countries",
      });
    }
    action = "approve";
    limited = true;
    reason = "using approve fallback because promote history is unavailable";
  }

  const { rows } = await dbQuery<{ country_code: string; delta_30d: string }>(
    `WITH scoped AS (
       SELECT h.place_id, h.created_at
       FROM public.history h
       WHERE h.action = $1
         AND h.place_id IS NOT NULL
         AND h.created_at >= NOW() - INTERVAL '60 day'
     )
     SELECT p.country AS country_code,
       COUNT(*) FILTER (WHERE s.created_at >= NOW() - INTERVAL '30 day')::int
       - COUNT(*) FILTER (WHERE s.created_at < NOW() - INTERVAL '30 day')::int AS delta_30d
     FROM scoped s
     INNER JOIN places p ON p.id = s.place_id
     WHERE p.country IS NOT NULL AND BTRIM(p.country) <> ''
     GROUP BY p.country
     HAVING COUNT(*) FILTER (WHERE s.created_at >= NOW() - INTERVAL '30 day') > 0
     ORDER BY delta_30d DESC, p.country ASC
     LIMIT 5`,
    [action],
    { route },
  );

  return makeEnvelope(
    rows.map((row) => ({
      countryCode: row.country_code,
      countryName: countryNames.of(row.country_code) ?? undefined,
      delta30d: Number(row.delta_30d ?? 0),
    })),
    { limited, reason },
  );
};

const queryFeaturedCities = async (route: string): Promise<DiscoverEnvelope<DiscoverFeaturedCity[]>> => {
  const placesExists = await tableExists(route, "places");
  if (!placesExists) return makeEnvelope([], { limited: true, reason: "places table unavailable" });

  const verificationColumn = await resolveVerificationColumn(route);
  const hasPayments = await tableExists(route, "payment_accepts");
  const [hasPaymentAsset, hasPaymentPlaceId] = hasPayments
    ? await Promise.all([hasColumn(route, "payment_accepts", "asset"), hasColumn(route, "payment_accepts", "place_id")])
    : [false, false];

  const verificationJoin = verificationColumn
    ? `LEFT JOIN LATERAL (
         SELECT CASE
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'owner' THEN 'owner'
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'community' THEN 'community'
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'directory' THEN 'directory'
           ELSE 'unverified'
         END AS level
         FROM verifications v
         WHERE v.place_id = p.id
         ORDER BY CASE
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'owner' THEN 1
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'community' THEN 2
           WHEN lower(coalesce(v.${verificationColumn}, '')) = 'directory' THEN 3
           ELSE 4
         END
         LIMIT 1
       ) vr ON TRUE`
    : "";

  const { rows } = await dbQuery<{
    country_code: string;
    city: string;
    total_places: string;
    top_category: string | null;
    owner_count: string;
    community_count: string;
    directory_count: string;
    unverified_count: string;
    top_assets: string[] | null;
  }>(
    `WITH base AS (
       SELECT p.id, p.country, p.city, p.category,
              ${verificationColumn ? "coalesce(vr.level, 'unverified')" : "'unverified'"} AS level
       FROM places p
       ${verificationJoin}
       WHERE p.lat IS NOT NULL
         AND p.lng IS NOT NULL
         AND NULLIF(BTRIM(p.country), '') IS NOT NULL
         AND NULLIF(BTRIM(p.city), '') IS NOT NULL
     ), ranked AS (
       SELECT country, city, COUNT(*)::int AS total_places
       FROM base
       GROUP BY country, city
       ORDER BY COUNT(*) DESC, country ASC, city ASC
       LIMIT 6
     )
     SELECT r.country AS country_code,
            r.city,
            r.total_places,
            (
              SELECT b.category
              FROM base b
              WHERE b.country = r.country AND b.city = r.city AND NULLIF(BTRIM(b.category), '') IS NOT NULL
              GROUP BY b.category
              ORDER BY COUNT(*) DESC, b.category ASC
              LIMIT 1
            ) AS top_category,
            COUNT(*) FILTER (WHERE b.level = 'owner')::int AS owner_count,
            COUNT(*) FILTER (WHERE b.level = 'community')::int AS community_count,
            COUNT(*) FILTER (WHERE b.level = 'directory')::int AS directory_count,
            COUNT(*) FILTER (WHERE b.level = 'unverified')::int AS unverified_count,
            ${hasPayments && hasPaymentAsset && hasPaymentPlaceId
              ? `(
                SELECT ARRAY(
                  SELECT pa.asset
                  FROM payment_accepts pa
                  INNER JOIN base bb ON bb.id = pa.place_id
                  WHERE bb.country = r.country
                    AND bb.city = r.city
                    AND NULLIF(BTRIM(pa.asset), '') IS NOT NULL
                  GROUP BY pa.asset
                  ORDER BY COUNT(*) DESC, pa.asset ASC
                  LIMIT 3
                )
              )`
              : "ARRAY[]::text[]"} AS top_assets
     FROM ranked r
     INNER JOIN base b ON b.country = r.country AND b.city = r.city
     GROUP BY r.country, r.city, r.total_places
     ORDER BY r.total_places DESC, r.country ASC, r.city ASC`,
    [],
    { route },
  );

  return makeEnvelope(rows.map((row) => ({
    countryCode: row.country_code,
    city: row.city,
    totalPlaces: Number(row.total_places ?? 0),
    topCategory: row.top_category ?? "Uncategorized",
    topAssets: (row.top_assets ?? []).filter(Boolean),
    verificationBreakdown: {
      owner: Number(row.owner_count ?? 0),
      community: Number(row.community_count ?? 0),
      directory: Number(row.directory_count ?? 0),
      unverified: Number(row.unverified_count ?? 0),
    },
  })));
};

const queryAssets = async (route: string): Promise<DiscoverEnvelope<DiscoverAssetListItem[]>> => {
  const hasPayments = await tableExists(route, "payment_accepts");
  if (!hasPayments) return makeEnvelope([], { limited: true, reason: "payment_accepts table unavailable" });

  const [hasAsset, hasPlaceId] = await Promise.all([
    hasColumn(route, "payment_accepts", "asset"),
    hasColumn(route, "payment_accepts", "place_id"),
  ]);

  if (!hasAsset || !hasPlaceId) {
    return makeEnvelope([], { limited: true, reason: "payment_accepts columns unavailable" });
  }

  await ensureHistoryTable(route);
  const hasPromote = await hasPromoteHistory(route);

  const { rows } = await dbQuery<{ asset: string; count_total: string; delta_30d: string }>(
    `SELECT pa.asset,
            COUNT(*)::int AS count_total,
            ${hasPromote
              ? `COUNT(*) FILTER (
                   WHERE pa.place_id IN (
                     SELECT DISTINCT h.place_id
                     FROM public.history h
                     WHERE h.action = 'promote'
                       AND h.created_at >= NOW() - INTERVAL '30 day'
                       AND h.place_id IS NOT NULL
                   )
                 )::int`
              : "0::int"} AS delta_30d
     FROM payment_accepts pa
     INNER JOIN places p ON p.id = pa.place_id
     WHERE p.lat IS NOT NULL
       AND p.lng IS NOT NULL
       AND NULLIF(BTRIM(pa.asset), '') IS NOT NULL
     GROUP BY pa.asset
     ORDER BY COUNT(*) DESC, pa.asset ASC
     LIMIT 12`,
    [],
    { route },
  );

  return makeEnvelope(rows.map((row) => ({
    asset: row.asset,
    countTotal: Number(row.count_total ?? 0),
    ...(hasPromote ? { delta30d: Number(row.delta_30d ?? 0) } : {}),
  })), {
    limited: !hasPromote,
    reason: hasPromote ? undefined : "delta30d omitted because promote history is unavailable",
  });
};

const queryAssetPanel = async (route: string, asset: string): Promise<DiscoverEnvelope<DiscoverAssetPanel>> => {
  const panel: DiscoverAssetPanel = {
    asset,
    countriesTop5: [],
    categoriesTop5: [],
    recent5: [],
  };

  const hasPayments = await tableExists(route, "payment_accepts");
  if (!hasPayments) return makeEnvelope(panel, { limited: true, reason: "payment_accepts table unavailable" });

  const [hasAsset, hasPlaceId] = await Promise.all([
    hasColumn(route, "payment_accepts", "asset"),
    hasColumn(route, "payment_accepts", "place_id"),
  ]);
  if (!hasAsset || !hasPlaceId) {
    return makeEnvelope(panel, { limited: true, reason: "payment_accepts columns unavailable" });
  }

  const [countriesRows, categoriesRows] = await Promise.all([
    dbQuery<{ country_code: string; total: string }>(
      `SELECT p.country AS country_code, COUNT(*)::int AS total
       FROM payment_accepts pa
       INNER JOIN places p ON p.id = pa.place_id
       WHERE pa.asset = $1
         AND p.lat IS NOT NULL
         AND p.lng IS NOT NULL
         AND NULLIF(BTRIM(p.country), '') IS NOT NULL
       GROUP BY p.country
       ORDER BY COUNT(*) DESC, p.country ASC
       LIMIT 5`,
      [asset],
      { route },
    ),
    dbQuery<{ category: string; total: string }>(
      `SELECT p.category, COUNT(*)::int AS total
       FROM payment_accepts pa
       INNER JOIN places p ON p.id = pa.place_id
       WHERE pa.asset = $1
         AND p.lat IS NOT NULL
         AND p.lng IS NOT NULL
         AND NULLIF(BTRIM(p.category), '') IS NOT NULL
       GROUP BY p.category
       ORDER BY COUNT(*) DESC, p.category ASC
       LIMIT 5`,
      [asset],
      { route },
    ),
  ]);

  panel.countriesTop5 = countriesRows.rows.map((row) => ({
    countryCode: row.country_code,
    total: Number(row.total ?? 0),
  }));
  panel.categoriesTop5 = categoriesRows.rows.map((row) => ({
    category: row.category,
    total: Number(row.total ?? 0),
  }));

  await ensureHistoryTable(route);
  const hasPromote = await hasPromoteHistory(route);
  let limited = false;
  let reason: string | undefined;

  if (hasPromote) {
    const { rows } = await dbQuery<{
      place_id: string;
      name: string;
      city: string | null;
      country: string | null;
      created_at: string;
      action: "promote" | "approve";
    }>(
      `SELECT h.place_id, p.name, p.city, p.country, h.created_at, h.action
       FROM public.history h
       INNER JOIN places p ON p.id = h.place_id
       WHERE h.action = 'promote'
         AND h.place_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM payment_accepts pa
           WHERE pa.place_id = h.place_id
             AND pa.asset = $1
         )
       ORDER BY h.created_at DESC
       LIMIT 5`,
      [asset],
      { route },
    );

    panel.recent5 = rows.map((row) => ({
      placeId: row.place_id,
      name: row.name,
      city: row.city ?? "",
      country: row.country ?? "",
      timeLabelISO: row.created_at,
      eventType: row.action,
    }));
  } else {
    limited = true;
    reason = "recent5 unavailable because promote history is unavailable";
  }

  return makeEnvelope(panel, { limited, reason });
};

const queryAutoStories = async (route: string): Promise<DiscoverEnvelope<DiscoverStoryCard[]>> => {
  const [trending, featured, assets] = await Promise.all([
    queryTrendingCountries(route),
    queryFeaturedCities(route),
    queryAssets(route),
  ]);

  const cards: DiscoverStoryCard[] = [];
  const topCountry = trending.data[0];
  if (topCountry) {
    cards.push({
      id: `country-${topCountry.countryCode.toLowerCase()}`,
      title: `${topCountry.countryName ?? topCountry.countryCode} is leading 30d Discover growth`,
      summary: `${topCountry.delta30d} net visibility events in the last 30 days.`,
      badges: ["Country", "Growth"],
      dateISO: new Date().toISOString().slice(0, 10),
      cta: { kind: "map", href: `/map?country=${encodeURIComponent(topCountry.countryCode)}` },
      metricsPreview: [
        { label: "30d delta", value: String(topCountry.delta30d) },
        { label: "Rank", value: "#1" },
      ],
    });
  }

  const topCity = featured.data[0];
  if (topCity) {
    cards.push({
      id: `city-${topCity.countryCode.toLowerCase()}-${topCity.city.toLowerCase().replace(/\s+/g, "-")}`,
      title: `${topCity.city} is a featured crypto city`,
      summary: `${topCity.totalPlaces} map-ready places with ${topCity.topCategory} leading categories.`,
      badges: ["City", "Featured"],
      dateISO: new Date().toISOString().slice(0, 10),
      cta: { kind: "map", href: `/map?country=${encodeURIComponent(topCity.countryCode)}&city=${encodeURIComponent(topCity.city)}` },
      metricsPreview: [
        { label: "Total places", value: String(topCity.totalPlaces) },
        { label: "Top category", value: topCity.topCategory },
      ],
    });
  }

  const topAsset = assets.data[0];
  if (topAsset) {
    cards.push({
      id: `asset-${topAsset.asset.toLowerCase()}`,
      title: `${topAsset.asset} has the widest Discover footprint`,
      summary: `${topAsset.countTotal} tracked accepts across map-ready places.`,
      badges: ["Asset", "Coverage"],
      dateISO: new Date().toISOString().slice(0, 10),
      cta: { kind: "stats", href: "/stats" },
      metricsPreview: [
        { label: "Total accepts", value: String(topAsset.countTotal) },
        ...(typeof topAsset.delta30d === "number" ? [{ label: "30d delta", value: String(topAsset.delta30d) }] : []),
      ],
    });
  }

  const limited = trending.limited || featured.limited || assets.limited;
  const reasons = [trending.reason, featured.reason, assets.reason].filter(Boolean).join("; ");

  return makeEnvelope(cards, {
    limited,
    reason: reasons || (cards.length ? undefined : "insufficient aggregate data for auto stories"),
  });
};

const queryMonthlyStories = async (): Promise<DiscoverEnvelope<{ hasContent: boolean; items: DiscoverMonthlyStory[] }>> => {
  const monthlyDir = path.join(process.cwd(), "content", "monthly");
  try {
    const entries = await fs.readdir(monthlyDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort().reverse();

    const items: DiscoverMonthlyStory[] = [];
    for (const file of files) {
      const fullPath = path.join(monthlyDir, file);
      const raw = await fs.readFile(fullPath, "utf8");
      const lines = raw.split(/\r?\n/).map((line) => line.trim());
      const title = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "") ?? file.replace(/\.md$/, "");
      const highlights = lines.filter((line) => line.startsWith("- ")).slice(0, 3).map((line) => line.replace(/^-\s+/, ""));
      const id = file.replace(/\.md$/, "");
      const month = id.slice(0, 7);
      const dateISO = /^\d{4}-\d{2}/.test(month) ? `${month}-01` : new Date().toISOString().slice(0, 10);
      items.push({ id, month, title, highlights, dateISO });
    }

    return makeEnvelope({ hasContent: items.length > 0, items }, { limited: items.length === 0 });
  } catch {
    return makeEnvelope({ hasContent: false, items: [] }, {
      limited: true,
      reason: "monthly content directory not found",
    });
  }
};

export const discoverHandlers = {
  async activity(request: Request) {
    const route = "api_discover_activity";
    const tab = (new URL(request.url).searchParams.get("tab") ?? "added") as DiscoverActivityTab;
    const limit = parseLimit(request, 8, 32);
    if (!["added", "owner", "community", "promoted"].includes(tab)) {
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason: "invalid tab" }), 400);
    }

    if (!hasDatabaseUrl()) {
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason: "db unavailable" }), 503);
    }

    try {
      return jsonResponse(await queryActivity(route, tab, limit));
    } catch (error) {
      const reason = error instanceof DbUnavailableError ? "db unavailable" : "internal error";
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason }), 500);
    }
  },

  async trendingCountries(request: Request) {
    const route = "api_discover_trending_countries";
    const window = new URL(request.url).searchParams.get("window") ?? "30d";
    if (window !== "30d") {
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason: "unsupported window" }), 400);
    }
    if (!hasDatabaseUrl()) {
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason: "db unavailable" }), 503);
    }

    try {
      return jsonResponse(await queryTrendingCountries(route));
    } catch (error) {
      const reason = error instanceof DbUnavailableError ? "db unavailable" : "internal error";
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason }), 500);
    }
  },

  async featuredCities() {
    const route = "api_discover_featured_cities";
    if (!hasDatabaseUrl()) {
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason: "db unavailable" }), 503);
    }
    try {
      return jsonResponse(await queryFeaturedCities(route));
    } catch (error) {
      const reason = error instanceof DbUnavailableError ? "db unavailable" : "internal error";
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason }), 500);
    }
  },

  async assets() {
    const route = "api_discover_assets";
    if (!hasDatabaseUrl()) {
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason: "db unavailable" }), 503);
    }
    try {
      return jsonResponse(await queryAssets(route));
    } catch (error) {
      const reason = error instanceof DbUnavailableError ? "db unavailable" : "internal error";
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason }), 500);
    }
  },

  async assetPanel(asset: string) {
    const route = "api_discover_asset_panel";
    if (!hasDatabaseUrl()) {
      return jsonResponse(makeEnvelope({ asset, countriesTop5: [], categoriesTop5: [], recent5: [] }, { ok: false, limited: true, reason: "db unavailable" }), 503);
    }
    try {
      return jsonResponse(await queryAssetPanel(route, asset));
    } catch (error) {
      const reason = error instanceof DbUnavailableError ? "db unavailable" : "internal error";
      return jsonResponse(makeEnvelope({ asset, countriesTop5: [], categoriesTop5: [], recent5: [] }, { ok: false, limited: true, reason }), 500);
    }
  },

  async storiesAuto() {
    const route = "api_discover_stories_auto";
    if (!hasDatabaseUrl()) {
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason: "db unavailable" }), 503);
    }
    try {
      return jsonResponse(await queryAutoStories(route));
    } catch (error) {
      const reason = error instanceof DbUnavailableError ? "db unavailable" : "internal error";
      return jsonResponse(makeEnvelope([], { ok: false, limited: true, reason }), 500);
    }
  },

  async storiesMonthly() {
    try {
      return jsonResponse(await queryMonthlyStories());
    } catch {
      return jsonResponse(makeEnvelope({ hasContent: false, items: [] }, { ok: false, limited: true, reason: "internal error" }), 500);
    }
  },
};

