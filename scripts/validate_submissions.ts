import { promises as fs } from "fs";
import path from "path";

const submissionsDir = path.join(process.cwd(), "data", "submissions");

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
};

const MAX_ACCEPTED_CHAINS = 12;

const emailRegex = /[^@]+@[^.]+\..+/;

type ValidationError = {
  file: string;
  errors: string[];
};

const ensureString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const ensureStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return cleaned.length ? cleaned : undefined;
};

const validateMaxLength = (errors: string[], label: string, value: string | undefined, max: number) => {
  if (!value) return;
  if (value.length > max) {
    errors.push(`${label} must be ${max} characters or fewer`);
  }
};

const validateUrl = (errors: string[], label: string, value: string | undefined) => {
  if (!value) return;
  try {
    const url = new URL(value);
    if (!url.protocol.startsWith("http")) {
      errors.push(`${label} must be a http(s) URL`);
    }
  } catch {
    errors.push(`${label} must be a valid URL`);
  }
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

const validateSubmission = (file: string, raw: unknown): ValidationError | null => {
  if (!raw || typeof raw !== "object") {
    return { file, errors: ["Submission must be a JSON object"] };
  }

  const record = raw as Record<string, unknown>;
  const payload =
    record.payload && typeof record.payload === "object" ? (record.payload as Record<string, unknown>) : record;

  const errors: string[] = [];
  const name = ensureString(payload.name);
  const contactName = ensureString(payload.contactName ?? payload.submitterName);
  const contactEmail = ensureString(payload.contactEmail ?? payload.submitterEmail);
  const country = ensureString(payload.country);
  const city = ensureString(payload.city);
  const address = ensureString(payload.address);
  const category = ensureString(payload.category);
  const acceptedChains = ensureStringArray(payload.acceptedChains ?? payload.accepted);
  const verificationRequest = ensureString(payload.verificationRequest);
  const role = ensureString(payload.role);
  const about = ensureString(payload.about);
  const paymentNote = ensureString(payload.paymentNote);
  const website = ensureString(payload.website);
  const twitter = ensureString(payload.twitter);
  const instagram = ensureString(payload.instagram);
  const facebook = ensureString(payload.facebook);
  const notesForAdmin = ensureString(payload.notesForAdmin);
  const evidenceUrl = ensureString(payload.evidenceUrl);

  if (!contactName) errors.push("SubmitterName is required");
  if (!contactEmail) errors.push("SubmitterEmail is required");
  if (!name) errors.push("BusinessName is required");
  if (!country) errors.push("Country is required");
  if (!city) errors.push("City is required");
  if (!address) errors.push("Address is required");
  if (!category) errors.push("Category is required");
  if (!acceptedChains?.length) errors.push("Accepted chains is required");

  if (verificationRequest && verificationRequest !== "owner" && verificationRequest !== "community") {
    errors.push("VerificationRequest must be owner or community");
  }

  if (contactEmail && (!emailRegex.test(contactEmail) || contactEmail.length > MAX_LENGTHS.contactEmail)) {
    errors.push("SubmitterEmail must be a valid email");
  }

  validateMaxLength(errors, "BusinessName", name, MAX_LENGTHS.name);
  validateMaxLength(errors, "Country", country, MAX_LENGTHS.country);
  validateMaxLength(errors, "City", city, MAX_LENGTHS.city);
  validateMaxLength(errors, "Address", address, MAX_LENGTHS.address);
  validateMaxLength(errors, "Category", category, MAX_LENGTHS.category);
  validateMaxLength(errors, "SubmitterName", contactName, MAX_LENGTHS.contactName);
  validateMaxLength(errors, "Role", role, MAX_LENGTHS.role);
  validateMaxLength(errors, "About", about, MAX_LENGTHS.about);
  validateMaxLength(errors, "PaymentNote", paymentNote, MAX_LENGTHS.paymentNote);
  validateMaxLength(errors, "Website", website, MAX_LENGTHS.website);
  validateMaxLength(errors, "Twitter", twitter, MAX_LENGTHS.twitter);
  validateMaxLength(errors, "Instagram", instagram, MAX_LENGTHS.instagram);
  validateMaxLength(errors, "Facebook", facebook, MAX_LENGTHS.facebook);
  validateMaxLength(errors, "NotesForAdmin", notesForAdmin, MAX_LENGTHS.notesForAdmin);

  if (acceptedChains) {
    if (acceptedChains.length > MAX_ACCEPTED_CHAINS) {
      errors.push(`Accepted chains must be ${MAX_ACCEPTED_CHAINS} items or fewer`);
    }
    if (acceptedChains.some((entry) => entry.length > MAX_LENGTHS.chain)) {
      errors.push(`Accepted chains entries must be ${MAX_LENGTHS.chain} characters or fewer`);
    }
  }

  validateUrl(errors, "EvidenceUrl", evidenceUrl);

  if (!errors.length) return null;
  return { file, errors };
};

const main = async () => {
  try {
    await fs.access(submissionsDir);
  } catch {
    console.log("No submissions directory found, skipping validation.");
    return;
  }

  const files = await findJsonFiles(submissionsDir);
  if (!files.length) {
    console.log("No submissions to validate.");
    return;
  }

  const failures: ValidationError[] = [];

  for (const file of files) {
    try {
      const contents = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(contents) as unknown;
      const result = validateSubmission(path.relative(process.cwd(), file), parsed);
      if (result) failures.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      failures.push({ file: path.relative(process.cwd(), file), errors: [message] });
    }
  }

  if (failures.length) {
    console.error("Submission validation failed:");
    for (const failure of failures) {
      console.error(`- ${failure.file}`);
      for (const error of failure.errors) {
        console.error(`  - ${error}`);
      }
    }
    process.exit(1);
  }

  console.log(`Validated ${files.length} submission file(s).`);
};

void main();
