import { hasDatabaseUrl } from "@/lib/db";
import {
  deleteSubmissionMediaRetentionRows,
  findSubmissionMediaRetentionCandidates,
  type SubmissionMediaRetentionRow,
} from "@/lib/db/retention";
import { resolveSubmissionMediaId, resolveSubmissionMediaKey } from "@/lib/r2/submissionMediaRetention";
import { deleteSubmissionMediaObject, type SubmissionMediaKind } from "@/lib/storage/r2";

type RetentionConfig = {
  kind: SubmissionMediaKind;
  days: number;
  requireUnadoptedGallery?: boolean;
};

const DEFAULT_RETENTION_DAYS: Record<SubmissionMediaKind, number> = {
  proof: 90,
  evidence: 180,
  gallery: 365,
};

const parseBooleanFlag = (args: string[], flag: string) => args.includes(flag);

const parseNumberOption = (args: string[], flag: string) => {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseKinds = (args: string[]) => {
  const index = args.indexOf("--kind");
  if (index === -1) return null;
  const raw = args[index + 1];
  if (!raw) return null;
  return raw.split(",").map((kind) => kind.trim()).filter(Boolean) as SubmissionMediaKind[];
};

const renderCandidate = (row: SubmissionMediaRetentionRow) => ({
  id: row.id,
  submissionId: row.submissionId,
  kind: row.kind,
  createdAt: row.createdAt,
  mediaId: resolveSubmissionMediaId(row),
  r2Key: row.r2Key,
  url: row.url,
  status: row.status,
  publishedPlaceId: row.publishedPlaceId,
});

const buildConfigs = (args: string[]): RetentionConfig[] => {
  const proofDays = parseNumberOption(args, "--proof-days") ?? Number(process.env.RETENTION_PROOF_DAYS);
  const evidenceDays =
    parseNumberOption(args, "--evidence-days") ?? Number(process.env.RETENTION_EVIDENCE_DAYS);
  const galleryDays =
    parseNumberOption(args, "--gallery-days") ?? Number(process.env.RETENTION_GALLERY_DAYS);

  return [
    {
      kind: "proof",
      days: Number.isFinite(proofDays) ? proofDays : DEFAULT_RETENTION_DAYS.proof,
    },
    {
      kind: "evidence",
      days: Number.isFinite(evidenceDays) ? evidenceDays : DEFAULT_RETENTION_DAYS.evidence,
    },
    {
      kind: "gallery",
      days: Number.isFinite(galleryDays) ? galleryDays : DEFAULT_RETENTION_DAYS.gallery,
      requireUnadoptedGallery: true,
    },
  ];
};

const buildCutoff = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const runRetention = async () => {
  const args = process.argv.slice(2);
  const isDryRun = !parseBooleanFlag(args, "--execute");
  const route = "retention_submission_media";

  if (!hasDatabaseUrl()) {
    console.error("[retention] DATABASE_URL is not configured");
    process.exitCode = 1;
    return;
  }

  const configuredKinds = parseKinds(args);
  const configs = buildConfigs(args).filter((config) =>
    configuredKinds ? configuredKinds.includes(config.kind) : true,
  );

  console.log(
    `[retention] mode=${isDryRun ? "dry-run" : "execute"} kinds=${configs
      .map((config) => config.kind)
      .join(",")}`,
  );

  for (const config of configs) {
    const cutoff = buildCutoff(config.days);
    const { rows, warnings } = await findSubmissionMediaRetentionCandidates({
      route,
      kind: config.kind,
      before: cutoff,
      requireUnadoptedGallery: config.requireUnadoptedGallery,
    });

    warnings.forEach((warning) => {
      console.warn(`[retention] ${config.kind}: ${warning}`);
    });

    console.log(
      `[retention] ${config.kind}: cutoff=${cutoff.toISOString()} candidates=${rows.length}`,
    );

    if (!rows.length) {
      continue;
    }

    if (isDryRun) {
      rows.forEach((row) => {
        console.log(`[retention] ${config.kind} candidate`, renderCandidate(row));
      });
      continue;
    }

    const deletedIds: number[] = [];
    for (const row of rows) {
      const mediaId = resolveSubmissionMediaId(row);
      const key = resolveSubmissionMediaKey(row);
      if (!key || !mediaId) {
        console.warn(
          `[retention] ${config.kind} skip id=${row.id} submission=${row.submissionId} missing key`,
        );
        continue;
      }

      try {
        await deleteSubmissionMediaObject(key);
        deletedIds.push(row.id);
        console.log(
          `[retention] ${config.kind} deleted r2 id=${row.id} submission=${row.submissionId} media=${mediaId}`,
        );
      } catch (error) {
        console.error(
          `[retention] ${config.kind} failed r2 delete id=${row.id} submission=${row.submissionId}`,
          error,
        );
      }
    }

    if (deletedIds.length) {
      await deleteSubmissionMediaRetentionRows({ route, ids: deletedIds });
      console.log(`[retention] ${config.kind} deleted db rows=${deletedIds.length}`);
    }
  }
};

runRetention().catch((error) => {
  console.error("[retention] failed", error);
  process.exitCode = 1;
});

