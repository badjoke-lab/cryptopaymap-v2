import { promises as fs } from "fs";
import path from "path";

export type AuditCheckStatus = "OK" | "NG" | "UNKNOWN";

export type AuditCheckItem = {
  id: string;
  title: string;
  status: AuditCheckStatus;
  layer: string;
  detail: string;
  paths: string[];
};

export type PlaywrightSummary = {
  status: "success" | "failed" | "skipped";
  exitCode: number | null;
};

export type AuditSummary = {
  ok: number;
  ng: number;
  unknown: number;
  total: number;
};

export type AuditReport = {
  runId: string;
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  playwright: PlaywrightSummary;
  summary: AuditSummary;
  checks: AuditCheckItem[];
};

const toStatusCounts = (checks: AuditCheckItem[]): AuditSummary => {
  const summary = { ok: 0, ng: 0, unknown: 0, total: 0 };
  for (const item of checks) {
    summary.total += 1;
    if (item.status === "OK") summary.ok += 1;
    if (item.status === "NG") summary.ng += 1;
    if (item.status === "UNKNOWN") summary.unknown += 1;
  }
  return summary;
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const checkPaths = async (rootDir: string, targets: string[]) => {
  const missing: string[] = [];
  for (const target of targets) {
    const fullPath = path.join(rootDir, target);
    if (!(await fileExists(fullPath))) {
      missing.push(target);
    }
  }
  return missing;
};

const readSubmissionIds = async (rootDir: string) => {
  const outputPath = path.join(rootDir, "scripts", "audit", "out", "submission-ids.json");
  if (!(await fileExists(outputPath))) {
    return { path: outputPath, exists: false, data: null };
  }
  const raw = await fs.readFile(outputPath, "utf8");
  try {
    const data = JSON.parse(raw) as Record<string, string>;
    return { path: outputPath, exists: true, data };
  } catch {
    return { path: outputPath, exists: true, data: null };
  }
};

type CollectOptions = {
  playwright: PlaywrightSummary;
};

export const collectSubmitAuditChecks = async (
  rootDir: string,
  options: CollectOptions,
): Promise<AuditCheckItem[]> => {
  const submitRoutes = [
    "app/submit/page.tsx",
    "app/submit/done/page.tsx",
    "app/submit/owner/page.tsx",
    "app/submit/owner/confirm/page.tsx",
    "app/submit/community/page.tsx",
    "app/submit/community/confirm/page.tsx",
    "app/submit/report/page.tsx",
    "app/submit/report/confirm/page.tsx",
  ];
  const missingSubmitRoutes = await checkPaths(rootDir, submitRoutes);

  const mediaRoutes = [
    "app/api/media/submissions/[submissionId]/gallery/[mediaId]/route.ts",
    "app/api/internal/media/submissions/[submissionId]/[kind]/[mediaId]/route.ts",
  ];
  const missingMediaRoutes = await checkPaths(rootDir, mediaRoutes);

  const mappingDocs = [
    "docs/audit/submit-db-map-checklist.md",
    "docs/audit/submit-db-map-gaps.md",
    "docs/audit/field-mapping-submit-db-api-ui.md",
  ];
  const missingMappingDocs = await checkPaths(rootDir, mappingDocs);

  const submissionIds = await readSubmissionIds(rootDir);
  const submissionValues = submissionIds.data ?? {};
  const missingSubmissionIds = ["owner", "community", "report"].filter(
    (kind) => !submissionValues[kind],
  );

  const playwrightStatus: AuditCheckStatus =
    options.playwright.exitCode === 0
      ? "OK"
      : submissionIds.exists
        ? "NG"
        : "UNKNOWN";
  const playwrightDetail =
    options.playwright.exitCode === 0
      ? "Playwright submit audit completed successfully."
      : submissionIds.exists
        ? `Playwright exited with ${options.playwright.exitCode ?? "n/a"}. Review test output.`
        : `Playwright exited with ${options.playwright.exitCode ?? "n/a"} and no submission id output was found. This can happen when required environment access (e.g. internal auth) is missing.`;

  const submissionIdsStatus: AuditCheckStatus =
    !submissionIds.exists && options.playwright.exitCode !== 0
      ? "UNKNOWN"
      : missingSubmissionIds.length
        ? "NG"
        : "OK";
  const submissionIdsDetail = !submissionIds.exists
    ? "Submission id artifact is missing."
    : missingSubmissionIds.length
      ? `Missing submission ids: ${missingSubmissionIds.join(", ")}.`
      : "Submission ids are recorded for owner, community, and report flows.";

  return [
    {
      id: "CHK-01",
      title: "Submit route pages exist",
      status: missingSubmitRoutes.length ? "NG" : "OK",
      layer: "repo",
      detail: missingSubmitRoutes.length
        ? `Missing submit pages: ${missingSubmitRoutes.join(", ")}.`
        : "All submit route pages are present.",
      paths: missingSubmitRoutes.length ? missingSubmitRoutes : submitRoutes,
    },
    {
      id: "CHK-02",
      title: "Submission media delivery routes exist",
      status: missingMediaRoutes.length ? "NG" : "OK",
      layer: "repo",
      detail: missingMediaRoutes.length
        ? `Missing media routes: ${missingMediaRoutes.join(", ")}.`
        : "All submission media routes are present.",
      paths: missingMediaRoutes.length ? missingMediaRoutes : mediaRoutes,
    },
    {
      id: "CHK-03",
      title: "Mapping documents are available",
      status: missingMappingDocs.length ? "NG" : "OK",
      layer: "docs",
      detail: missingMappingDocs.length
        ? `Missing mapping docs: ${missingMappingDocs.join(", ")}.`
        : "All mapping documents are present.",
      paths: missingMappingDocs.length ? missingMappingDocs : mappingDocs,
    },
    {
      id: "CHK-04",
      title: "Playwright submit audit run",
      status: playwrightStatus,
      layer: "playwright",
      detail: playwrightDetail,
      paths: ["tests/audit/submit-audit.spec.ts"],
    },
    {
      id: "CHK-05",
      title: "Submission ids recorded",
      status: submissionIdsStatus,
      layer: "artifact",
      detail: submissionIdsDetail,
      paths: submissionIds.exists ? ["scripts/audit/out/submission-ids.json"] : [],
    },
  ];
};

const formatCheckMarkdown = (check: AuditCheckItem) => {
  const lines: string[] = [];
  lines.push(`- **${check.id}** ${check.title} — ${check.status}`);
  lines.push(`  - Layer: ${check.layer}`);
  lines.push(`  - Detail: ${check.detail}`);
  if (check.paths.length) {
    lines.push("  - Paths:");
    for (const item of check.paths) {
      lines.push(`    - ${item}`);
    }
  }
  return lines.join("\n");
};

const formatRunId = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
};

export const buildSubmitAuditReport = (
  baseUrl: string,
  startedAt: Date,
  finishedAt: Date,
  playwright: PlaywrightSummary,
  checks: AuditCheckItem[],
): AuditReport => {
  const runId = formatRunId(startedAt);
  const summary = toStatusCounts(checks);
  return {
    runId,
    baseUrl,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    playwright,
    summary,
    checks,
  };
};

export const renderSubmitAuditMarkdown = (report: AuditReport): string => {
  const lines: string[] = [];
  lines.push(`# Submit Audit Report (${report.runId})`);
  lines.push("");
  lines.push(`- Base URL: ${report.baseUrl}`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push(`- Duration: ${report.durationMs} ms`);
  lines.push(`- Playwright: ${report.playwright.status} (exit ${report.playwright.exitCode ?? "n/a"})`);
  lines.push(
    `- Summary: OK=${report.summary.ok} / NG=${report.summary.ng} / UNKNOWN=${report.summary.unknown} (total ${report.summary.total})`,
  );
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  for (const check of report.checks) {
    lines.push(formatCheckMarkdown(check));
  }
  return lines.join("\n");
};

export const writeSubmitAuditReport = async (outputDir: string, report: AuditReport) => {
  await fs.mkdir(outputDir, { recursive: true });
  const latestMd = path.join(outputDir, "submit-audit-latest.md");
  const latestJson = path.join(outputDir, "submit-audit-latest.json");
  const stampMd = path.join(outputDir, `submit-audit-${report.runId}.md`);
  const stampJson = path.join(outputDir, `submit-audit-${report.runId}.json`);
  const markdown = renderSubmitAuditMarkdown(report);
  const json = JSON.stringify(report, null, 2);

  await fs.writeFile(latestMd, markdown, "utf8");
  await fs.writeFile(latestJson, json, "utf8");
  await fs.writeFile(stampMd, markdown, "utf8");
  await fs.writeFile(stampJson, json, "utf8");
};
