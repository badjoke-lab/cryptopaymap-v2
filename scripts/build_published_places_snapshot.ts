import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

type PlaceSummaryPlus = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  verification: "owner" | "community" | "directory" | "unverified";
  category: string;
  city: string;
  country: string;
  accepted: string[];
  address_full: string | null;
  about_short: string | null;
  paymentNote: string | null;
  amenities: string[] | null;
  phone: string | null;
  website: string | null;
  twitter: string | null;
  instagram: string | null;
  facebook: string | null;
  coverImage: string | null;
};

type Snapshot = {
  meta: {
    last_updated: string;
    source: "db";
    notes: string;
  };
  places: PlaceSummaryPlus[];
};

const OUTPUT_PATH = path.join(process.cwd(), "data", "fallback", "published_places_snapshot.json");

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeAmenities = (raw: unknown): string[] | null => {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const out = raw.map((item) => normalizeText(item)).filter((item): item is string => Boolean(item));
    return out.length ? out : null;
  }

  if (typeof raw === "string") {
    const parsed = raw.trim();
    if (!parsed) return null;
    try {
      const json = JSON.parse(parsed);
      if (Array.isArray(json)) {
        const out = json.map((item) => normalizeText(item)).filter((item): item is string => Boolean(item));
        return out.length ? out : null;
      }
    } catch {
      const out = parsed.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
      return out.length ? out : null;
    }
  }

  return null;
};

const sanitizeVerification = (value: unknown): PlaceSummaryPlus["verification"] => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "owner" || normalized === "community" || normalized === "directory") {
    return normalized;
  }
  return "unverified";
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[build_published_places_snapshot] DATABASE_URL is required.");
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{
      id: string;
      name: string;
      lat: number;
      lng: number;
      verification: string | null;
      category: string | null;
      city: string | null;
      country: string | null;
      accepted: string[];
      address_full: string | null;
      about_short: string | null;
      payment_note: string | null;
      amenities: string[] | string | null;
      phone: string | null;
      website: string | null;
      twitter: string | null;
      instagram: string | null;
      facebook: string | null;
      cover_image: string | null;
    }>(
      `SELECT
         p.id,
         p.name,
         p.lat,
         p.lng,
         COALESCE(v.level, 'unverified') AS verification,
         p.category,
         p.city,
         p.country,
         COALESCE(
           (
             SELECT ARRAY_AGG(DISTINCT UPPER(pa.asset) ORDER BY UPPER(pa.asset))
             FROM payment_accepts pa
             WHERE pa.place_id = p.id
               AND pa.asset IS NOT NULL
               AND BTRIM(pa.asset) <> ''
           ),
           ARRAY[]::text[]
         ) AS accepted,
         COALESCE(NULLIF(BTRIM(p.address_full), ''), NULLIF(BTRIM(p.address), '')) AS address_full,
         NULLIF(BTRIM(p.about), '') AS about_short,
         NULLIF(BTRIM(p.payment_note), '') AS payment_note,
         p.amenities,
         (
           SELECT NULLIF(BTRIM(s.handle), '')
           FROM socials s
           WHERE s.place_id = p.id
             AND LOWER(COALESCE(s.platform, '')) = 'phone'
           ORDER BY s.id ASC
           LIMIT 1
         ) AS phone,
         (
           SELECT COALESCE(NULLIF(BTRIM(s.url), ''), NULLIF(BTRIM(s.handle), ''))
           FROM socials s
           WHERE s.place_id = p.id
             AND LOWER(COALESCE(s.platform, '')) = 'website'
           ORDER BY s.id ASC
           LIMIT 1
         ) AS website,
         (
           SELECT COALESCE(NULLIF(BTRIM(s.url), ''), NULLIF(BTRIM(s.handle), ''))
           FROM socials s
           WHERE s.place_id = p.id
             AND LOWER(COALESCE(s.platform, '')) IN ('twitter', 'x')
           ORDER BY s.id ASC
           LIMIT 1
         ) AS twitter,
         (
           SELECT COALESCE(NULLIF(BTRIM(s.url), ''), NULLIF(BTRIM(s.handle), ''))
           FROM socials s
           WHERE s.place_id = p.id
             AND LOWER(COALESCE(s.platform, '')) = 'instagram'
           ORDER BY s.id ASC
           LIMIT 1
         ) AS instagram,
         (
           SELECT COALESCE(NULLIF(BTRIM(s.url), ''), NULLIF(BTRIM(s.handle), ''))
           FROM socials s
           WHERE s.place_id = p.id
             AND LOWER(COALESCE(s.platform, '')) = 'facebook'
           ORDER BY s.id ASC
           LIMIT 1
         ) AS facebook,
         (
           SELECT NULLIF(BTRIM(m.url), '')
           FROM media m
           WHERE m.place_id = p.id
           ORDER BY m.id ASC
           LIMIT 1
         ) AS cover_image
       FROM places p
       LEFT JOIN verifications v ON v.place_id = p.id
       WHERE p.lat IS NOT NULL
         AND p.lng IS NOT NULL
         AND isfinite(p.lat)
         AND isfinite(p.lng)
         AND COALESCE(p.is_demo, false) = false
         AND COALESCE(p.status, 'published') = 'published'
       ORDER BY p.updated_at DESC NULLS LAST, p.id ASC`
    );

    const places: PlaceSummaryPlus[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      lat: Number(row.lat),
      lng: Number(row.lng),
      verification: sanitizeVerification(row.verification),
      category: row.category ?? "unknown",
      city: row.city ?? "",
      country: row.country ?? "",
      accepted: row.accepted ?? [],
      address_full: normalizeText(row.address_full),
      about_short: normalizeText(row.about_short),
      paymentNote: normalizeText(row.payment_note),
      amenities: normalizeAmenities(row.amenities),
      phone: normalizeText(row.phone),
      website: normalizeText(row.website),
      twitter: normalizeText(row.twitter),
      instagram: normalizeText(row.instagram),
      facebook: normalizeText(row.facebook),
      coverImage: normalizeText(row.cover_image),
    }));

    const snapshot: Snapshot = {
      meta: {
        last_updated: new Date().toISOString(),
        source: "db",
        notes: "approved/published snapshot for map fallback",
      },
      places,
    };

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

    console.log("[build_published_places_snapshot] wrote snapshot", {
      output: OUTPUT_PATH,
      count: places.length,
      last_updated: snapshot.meta.last_updated,
    });
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[build_published_places_snapshot] failed", error);
  process.exitCode = 1;
});
