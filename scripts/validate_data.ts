import { promises as fs } from "fs";
import path from "path";

import { dbQuery, hasDatabaseUrl } from "../lib/db";

type DataSource = "auto" | "db" | "json";

type ValidationIssue = {
  source: string;
  recordId?: string;
  field?: string;
  message: string;
};

type DbPlace = {
  id: string;
  name: string | null;
  country: string | null;
  city: string | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  verification: string | null;
  mediaCount: number;
};

const submissionsDir = path.join(process.cwd(), "data", "submissions");

const REQUIRED_PLACE_FIELDS = ["id", "name", "country", "city", "category"] as const;

const VERIFICATION_LEVELS = ["owner", "community", "directory", "unverified"] as const;

const MEDIA_LIMITS: Record<(typeof VERIFICATION_LEVELS)[number], { min: number; max: number }> = {
  owner: { min: 1, max: 8 },
  community: { min: 1, max: 8 },
  directory: { min: 0, max: 0 },
  unverified: { min: 0, max: 0 },
};

const MAX_LENGTHS = {
  name: 160,
  country: 3,
  city: 120,
  address: 200,
  category: 60,
  contactEmail: 200,
  contactName: 120,
  role: 40,
  about: 600,
  paymentNote: 150,
  website: 200,
  twitter: 200,
  instagram: 200,
  facebook: 200,
  notesForAdmin: 300,
  chain: 40,
  amenity: 40,
};

const MAX_ACCEPTED_CHAINS = 12;
const MAX_AMENITIES = 20;

const emailRegex = /[^@]+@[^.]+\..+/;

const getDataSource = (): DataSource => {
  const normalize = (value: string | undefined) => value?.trim().toLowerCase() ?? "";
  const envValue = normalize(process.env.DATA_SOURCE);
  if (envValue === "auto" || envValue === "db" || envValue === "json") {
    return envValue;
  }
  const publicValue = normalize(process.env.NEXT_PUBLIC_DATA_SOURCE);
  if (publicValue === "auto" || publicValue === "db" || publicValue === "json") {
    return publicValue;
  }
  return "auto";
};

const isNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const isValidHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const validateMaxLength = (issues: ValidationIssue[], context: ValidationIssue, label: string, value: string | null, max: number) => {
  if (!value) return;
  if (value.length > max) {
    issues.push({
      ...context,
      field: label,
      message: `${label} must be ${max} characters or fewer`,
    });
  }
};

const validateUrl = (issues: ValidationIssue[], context: ValidationIssue, label: string, value: string | null) => {
  if (!value) return;
  if (!isValidHttpUrl(value)) {
    issues.push({
      ...context,
      field: label,
      message: `${label} must be a http(s) URL`,
    });
  }
};

const validatePlaceRecord = (issues: ValidationIssue[], source: string, place: Record<string, unknown>) => {
  const id = isNonEmptyString(place.id);
  const context = { source, recordId: id ?? "unknown" };

  for (const field of REQUIRED_PLACE_FIELDS) {
    const value = isNonEmptyString(place[field]);
    if (!value) {
      issues.push({
        ...context,
        field,
        message: "Required",
      });
    }
  }

  const verification = isNonEmptyString(place.verification);
  if (!verification || !VERIFICATION_LEVELS.includes(verification as (typeof VERIFICATION_LEVELS)[number])) {
    issues.push({
      ...context,
      field: "verification",
      message: `Must be one of ${VERIFICATION_LEVELS.join(", ")}`,
    });
  }

  const lat = asNumber(place.lat);
  const lng = asNumber(place.lng);
  if (lat === null) {
    issues.push({
      ...context,
      field: "lat",
      message: "Latitude must be a number",
    });
  } else if (lat < -90 || lat > 90) {
    issues.push({
      ...context,
      field: "lat",
      message: "Latitude out of range",
    });
  }

  if (lng === null) {
    issues.push({
      ...context,
      field: "lng",
      message: "Longitude must be a number",
    });
  } else if (lng < -180 || lng > 180) {
    issues.push({
      ...context,
      field: "lng",
      message: "Longitude out of range",
    });
  }

  if (verification === "unverified") {
    const about = isNonEmptyString(place.about);
    if (about) {
      issues.push({
        ...context,
        field: "about",
        message: "Unverified places must not include about text",
      });
    }
  }

  const imagesValue = place.images;
  let images: string[] | null = null;
  if (imagesValue === undefined || imagesValue === null) {
    images = null;
  } else if (Array.isArray(imagesValue)) {
    images = imagesValue.map((entry) => String(entry));
    images.forEach((entry, index) => {
      if (!isValidHttpUrl(entry)) {
        issues.push({
          ...context,
          field: `images[${index}]`,
          message: "Image URL must be a http(s) URL",
        });
      }
    });
  } else {
    issues.push({
      ...context,
      field: "images",
      message: "Images must be an array",
    });
  }

  if (verification && VERIFICATION_LEVELS.includes(verification as (typeof VERIFICATION_LEVELS)[number])) {
    const limits = MEDIA_LIMITS[verification as (typeof VERIFICATION_LEVELS)[number]];
    const count = images?.length ?? 0;
    if (count < limits.min || count > limits.max) {
      issues.push({
        ...context,
        field: "images",
        message: `Images must include ${limits.min}-${limits.max} items for ${verification} verification`,
      });
    }
  }

  validateUrl(issues, context, "website", isNonEmptyString(place.website));
  validateUrl(issues, context, "coverImage", isNonEmptyString(place.coverImage));
  validateUrl(issues, context, "social_website", isNonEmptyString(place.social_website));

  const photos = place.photos;
  if (Array.isArray(photos)) {
    photos.forEach((entry, index) => {
      const value = String(entry);
      if (!isValidHttpUrl(value)) {
        issues.push({
          ...context,
          field: `photos[${index}]`,
          message: "Photo URL must be a http(s) URL",
        });
      }
    });
  } else if (photos !== undefined && photos !== null) {
    issues.push({
      ...context,
      field: "photos",
      message: "Photos must be an array",
    });
  }
};

const validatePlacesFromJson = async (): Promise<{ count: number; issues: ValidationIssue[] }> => {
  const issues: ValidationIssue[] = [];
  const filePath = path.join(process.cwd(), "data", "places.json");
  const source = path.relative(process.cwd(), filePath);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      issues.push({ source, message: "places.json must be a JSON array" });
      return { count: 0, issues };
    }

    parsed.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        issues.push({ source, message: "Place entry must be an object" });
        return;
      }
      validatePlaceRecord(issues, source, entry as Record<string, unknown>);
    });

    return { count: parsed.length, issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    issues.push({ source, message });
    return { count: 0, issues };
  }
};

const hasColumn = async (table: string, column: string) => {
  const { rows } = await dbQuery<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS exists`,
    [table, column],
    { route: "validate_data" },
  );
  return rows[0]?.exists ?? false;
};

const loadPlacesFromDb = async (): Promise<DbPlace[]> => {
  const { rows: tableChecks } = await dbQuery<{
    places: string | null;
    verifications: string | null;
    media: string | null;
  }>(
    `SELECT
      to_regclass('public.places') AS places,
      to_regclass('public.verifications') AS verifications,
      to_regclass('public.media') AS media`,
    [],
    { route: "validate_data" },
  );

  if (!tableChecks[0]?.places) {
    throw new Error("places table missing");
  }

  const hasVerifications = Boolean(tableChecks[0]?.verifications);
  const hasMedia = Boolean(tableChecks[0]?.media);

  let verificationField: string | null = null;
  if (hasVerifications) {
    if (await hasColumn("verifications", "level")) {
      verificationField = "level";
    } else if (await hasColumn("verifications", "status")) {
      verificationField = "status";
    }
  }

  const verificationSelect = verificationField
    ? `COALESCE(v.${verificationField}, 'unverified') AS verification`
    : "'unverified'::text AS verification";
  const verificationJoin = verificationField ? "LEFT JOIN verifications v ON v.place_id = p.id" : "";

  const mediaSelect = hasMedia
    ? "COALESCE(m.media_count, 0) AS media_count"
    : "0::int AS media_count";
  const mediaJoin = hasMedia
    ? "LEFT JOIN (SELECT place_id, COUNT(*)::int AS media_count FROM media GROUP BY place_id) m ON m.place_id = p.id"
    : "";

  const { rows } = await dbQuery<DbPlace>(
    `SELECT p.id, p.name, p.country, p.city, p.category, p.lat, p.lng,
        ${verificationSelect},
        ${mediaSelect}
     FROM places p
     ${verificationJoin}
     ${mediaJoin}`,
    [],
    { route: "validate_data" },
  );

  return rows;
};

const validatePlacesFromDb = async (): Promise<{ count: number; issues: ValidationIssue[] }> => {
  const issues: ValidationIssue[] = [];
  const source = "db:places";

  const rows = await loadPlacesFromDb();

  rows.forEach((place) => {
    const context = { source, recordId: place.id };

    for (const field of REQUIRED_PLACE_FIELDS) {
      const value = isNonEmptyString(place[field as keyof DbPlace]);
      if (!value) {
        issues.push({
          ...context,
          field,
          message: "Required",
        });
      }
    }

    const verification = isNonEmptyString(place.verification);
    if (!verification || !VERIFICATION_LEVELS.includes(verification as (typeof VERIFICATION_LEVELS)[number])) {
      issues.push({
        ...context,
        field: "verification",
        message: `Must be one of ${VERIFICATION_LEVELS.join(", ")}`,
      });
    }

    if (place.lat === null || place.lat === undefined || !Number.isFinite(place.lat)) {
      issues.push({
        ...context,
        field: "lat",
        message: "Latitude must be a number",
      });
    } else if (place.lat < -90 || place.lat > 90) {
      issues.push({
        ...context,
        field: "lat",
        message: "Latitude out of range",
      });
    }

    if (place.lng === null || place.lng === undefined || !Number.isFinite(place.lng)) {
      issues.push({
        ...context,
        field: "lng",
        message: "Longitude must be a number",
      });
    } else if (place.lng < -180 || place.lng > 180) {
      issues.push({
        ...context,
        field: "lng",
        message: "Longitude out of range",
      });
    }

    if (verification && VERIFICATION_LEVELS.includes(verification as (typeof VERIFICATION_LEVELS)[number])) {
      const limits = MEDIA_LIMITS[verification as (typeof VERIFICATION_LEVELS)[number]];
      if (place.mediaCount < limits.min || place.mediaCount > limits.max) {
        issues.push({
          ...context,
          field: "media",
          message: `Media must include ${limits.min}-${limits.max} items for ${verification} verification`,
        });
      }
    }
  });

  return { count: rows.length, issues };
};

const findJsonFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findJsonFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
};

const validateSubmissionPayload = (issues: ValidationIssue[], context: ValidationIssue, payload: Record<string, unknown>) => {
  const name = isNonEmptyString(payload.name);
  const contactName = isNonEmptyString(payload.contactName ?? payload.submitterName);
  const contactEmail = isNonEmptyString(payload.contactEmail ?? payload.submitterEmail);
  const country = isNonEmptyString(payload.country);
  const city = isNonEmptyString(payload.city);
  const address = isNonEmptyString(payload.address);
  const category = isNonEmptyString(payload.category);
  const acceptedChains = Array.isArray(payload.acceptedChains ?? payload.accepted)
    ? (payload.acceptedChains ?? payload.accepted).map((entry) => String(entry).trim()).filter(Boolean)
    : null;
  const verificationRequest = isNonEmptyString(payload.verificationRequest);
  const role = isNonEmptyString(payload.role);
  const about = isNonEmptyString(payload.about);
  const paymentNote = isNonEmptyString(payload.paymentNote);
  const website = isNonEmptyString(payload.website);
  const twitter = isNonEmptyString(payload.twitter);
  const instagram = isNonEmptyString(payload.instagram);
  const facebook = isNonEmptyString(payload.facebook);
  const notesForAdmin = isNonEmptyString(payload.notesForAdmin);
  const evidenceUrl = isNonEmptyString(payload.evidenceUrl);
  const amenities = Array.isArray(payload.amenities)
    ? payload.amenities.map((entry) => String(entry).trim()).filter(Boolean)
    : null;

  if (!contactName) {
    issues.push({ ...context, field: "contactName", message: "Required" });
  }
  if (!contactEmail) {
    issues.push({ ...context, field: "contactEmail", message: "Required" });
  }
  if (!name) issues.push({ ...context, field: "name", message: "Required" });
  if (!country) issues.push({ ...context, field: "country", message: "Required" });
  if (!city) issues.push({ ...context, field: "city", message: "Required" });
  if (!address) issues.push({ ...context, field: "address", message: "Required" });
  if (!category) issues.push({ ...context, field: "category", message: "Required" });
  if (!acceptedChains?.length) {
    issues.push({ ...context, field: "acceptedChains", message: "Select at least one" });
  }

  if (verificationRequest && verificationRequest !== "owner" && verificationRequest !== "community") {
    issues.push({
      ...context,
      field: "verificationRequest",
      message: "Must be owner or community",
    });
  }

  if (contactEmail && (!emailRegex.test(contactEmail) || contactEmail.length > MAX_LENGTHS.contactEmail)) {
    issues.push({
      ...context,
      field: "contactEmail",
      message: "Must be a valid email",
    });
  }

  validateMaxLength(issues, context, "name", name, MAX_LENGTHS.name);
  validateMaxLength(issues, context, "country", country, MAX_LENGTHS.country);
  validateMaxLength(issues, context, "city", city, MAX_LENGTHS.city);
  validateMaxLength(issues, context, "address", address, MAX_LENGTHS.address);
  validateMaxLength(issues, context, "category", category, MAX_LENGTHS.category);
  validateMaxLength(issues, context, "contactName", contactName, MAX_LENGTHS.contactName);
  validateMaxLength(issues, context, "role", role, MAX_LENGTHS.role);
  validateMaxLength(issues, context, "about", about, MAX_LENGTHS.about);
  validateMaxLength(issues, context, "paymentNote", paymentNote, MAX_LENGTHS.paymentNote);
  validateMaxLength(issues, context, "website", website, MAX_LENGTHS.website);
  validateMaxLength(issues, context, "twitter", twitter, MAX_LENGTHS.twitter);
  validateMaxLength(issues, context, "instagram", instagram, MAX_LENGTHS.instagram);
  validateMaxLength(issues, context, "facebook", facebook, MAX_LENGTHS.facebook);
  validateMaxLength(issues, context, "notesForAdmin", notesForAdmin, MAX_LENGTHS.notesForAdmin);

  if (acceptedChains) {
    if (acceptedChains.length > MAX_ACCEPTED_CHAINS) {
      issues.push({
        ...context,
        field: "acceptedChains",
        message: `Must include ${MAX_ACCEPTED_CHAINS} items or fewer`,
      });
    }
    if (acceptedChains.some((entry) => entry.length > MAX_LENGTHS.chain)) {
      issues.push({
        ...context,
        field: "acceptedChains",
        message: `Entries must be ${MAX_LENGTHS.chain} characters or fewer`,
      });
    }
  }

  if (amenities) {
    if (amenities.length > MAX_AMENITIES) {
      issues.push({
        ...context,
        field: "amenities",
        message: `Must include ${MAX_AMENITIES} items or fewer`,
      });
    }
    if (amenities.some((entry) => entry.length > MAX_LENGTHS.amenity)) {
      issues.push({
        ...context,
        field: "amenities",
        message: `Entries must be ${MAX_LENGTHS.amenity} characters or fewer`,
      });
    }
  }

  validateUrl(issues, context, "website", website);
  validateUrl(issues, context, "evidenceUrl", evidenceUrl);

  const lat = asNumber(payload.lat);
  const lng = asNumber(payload.lng);
  if ((lat !== null && lng === null) || (lat === null && lng !== null)) {
    issues.push({ ...context, field: "lat", message: "Lat/Lng must be provided together" });
    issues.push({ ...context, field: "lng", message: "Lat/Lng must be provided together" });
  }
  if (lat !== null && (lat < -90 || lat > 90)) {
    issues.push({ ...context, field: "lat", message: "Latitude out of range" });
  }
  if (lng !== null && (lng < -180 || lng > 180)) {
    issues.push({ ...context, field: "lng", message: "Longitude out of range" });
  }

  if (payload.termsAccepted === false) {
    issues.push({
      ...context,
      field: "termsAccepted",
      message: "Terms must be accepted",
    });
  }
};

const validateSubmissions = async (): Promise<{ count: number; issues: ValidationIssue[] }> => {
  const issues: ValidationIssue[] = [];

  try {
    await fs.access(submissionsDir);
  } catch {
    return { count: 0, issues };
  }

  const files = await findJsonFiles(submissionsDir);
  for (const file of files) {
    const source = path.relative(process.cwd(), file);
    try {
      const contents = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(contents) as unknown;
      if (!parsed || typeof parsed !== "object") {
        issues.push({ source, message: "Submission must be a JSON object" });
        continue;
      }
      const record = parsed as Record<string, unknown>;
      const payload =
        record.payload && typeof record.payload === "object"
          ? (record.payload as Record<string, unknown>)
          : record;
      const recordId = isNonEmptyString(record.submissionId) ?? isNonEmptyString(record.suggestedPlaceId) ?? source;
      const context = { source, recordId };

      if (record.status) {
        const status = isNonEmptyString(record.status);
        if (!status || !["pending", "approved", "rejected"].includes(status)) {
          issues.push({
            ...context,
            field: "status",
            message: "Status must be pending, approved, or rejected",
          });
        }
      }

      if (record.createdAt) {
        const createdAt = isNonEmptyString(record.createdAt);
        if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
          issues.push({
            ...context,
            field: "createdAt",
            message: "createdAt must be an ISO timestamp",
          });
        }
      }

      validateSubmissionPayload(issues, context, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      issues.push({ source, message });
    }
  }

  return { count: files.length, issues };
};

const formatIssue = (issue: ValidationIssue) => {
  const record = issue.recordId ? ` (id=${issue.recordId})` : "";
  const field = issue.field ? ` field=${issue.field}` : "";
  return `- ${issue.source}${record}${field}: ${issue.message}`;
};

const main = async () => {
  const source = getDataSource();
  const issues: ValidationIssue[] = [];

  let placesCount = 0;
  let placesSource = source;

  if (source === "db" || (source === "auto" && hasDatabaseUrl())) {
    if (!hasDatabaseUrl()) {
      issues.push({
        source: "db:places",
        message: "DATABASE_URL is not configured for db validation",
      });
    } else {
      placesSource = "db";
      try {
        const result = await validatePlacesFromDb();
        placesCount = result.count;
        issues.push(...result.issues);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        issues.push({ source: "db:places", message });
      }
    }
  } else {
    placesSource = "json";
    const result = await validatePlacesFromJson();
    placesCount = result.count;
    issues.push(...result.issues);
  }

  const submissionResult = await validateSubmissions();
  issues.push(...submissionResult.issues);

  if (issues.length) {
    console.error("Data validation failed:");
    issues.forEach((issue) => {
      console.error(formatIssue(issue));
    });
    process.exit(1);
  }

  console.log(
    `Validated ${placesCount} place(s) from ${placesSource} and ${submissionResult.count} submission file(s).`,
  );
};

void main();
