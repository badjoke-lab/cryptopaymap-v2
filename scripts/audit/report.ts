import { promises as fs } from "fs";
import path from "path";

export type AuditCheckStatus = "OK" | "NG" | "WARN" | "INFO";

export type AuditCheckItem = {
  id: string;
  title: string;
  status: AuditCheckStatus;
  details?: string[];
  evidence?: string[];
};

export type AuditCheckGroup = {
  id: string;
  title: string;
  items: AuditCheckItem[];
};

export type PlaywrightSummary = {
  status: "success" | "failed" | "skipped";
  exitCode: number | null;
};

export type AuditSummary = {
  ok: number;
  ng: number;
  warn: number;
  info: number;
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
  groups: AuditCheckGroup[];
};

const toStatusCounts = (groups: AuditCheckGroup[]): AuditSummary => {
  const summary = { ok: 0, ng: 0, warn: 0, info: 0, total: 0 };
  for (const group of groups) {
    for (const item of group.items) {
      summary.total += 1;
      if (item.status === "OK") summary.ok += 1;
      if (item.status === "NG") summary.ng += 1;
      if (item.status === "WARN") summary.warn += 1;
      if (item.status === "INFO") summary.info += 1;
    }
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

export const collectSubmitAuditChecks = async (rootDir: string): Promise<AuditCheckGroup[]> => {
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

  return [
    {
      id: "CHK-01",
      title: "submit/DB/map checklist baseline",
      items: [
        {
          id: "CHK-01-A",
          title: "Submit route pages exist",
          status: missingSubmitRoutes.length ? "NG" : "OK",
          details: missingSubmitRoutes.length
            ? ["Missing submit pages:", ...missingSubmitRoutes]
            : ["All submit route pages are present."],
        },
      ],
    },
    {
      id: "CHK-02",
      title: "submit/db/map gap audit",
      items: [
        {
          id: "CHK-02-A",
          title: "Submission media delivery routes exist",
          status: missingMediaRoutes.length ? "NG" : "OK",
          details: missingMediaRoutes.length
            ? ["Missing media routes:", ...missingMediaRoutes]
            : ["All submission media routes are present."],
        },
      ],
    },
    {
      id: "CHK-03",
      title: "Submit field mapping coverage",
      items: [
        {
          id: "CHK-03-A",
          title: "Mapping documents are available",
          status: missingMappingDocs.length ? "NG" : "OK",
          details: missingMappingDocs.length
            ? ["Missing mapping docs:", ...missingMappingDocs]
            : ["All mapping documents are present."],
        },
      ],
    },
  ];
};

const formatGroupMarkdown = (group: AuditCheckGroup) => {
  const lines: string[] = [];
  lines.push(`## ${group.id}: ${group.title}`);
  lines.push("");
  for (const item of group.items) {
    lines.push(`- **${item.id}** ${item.title} — ${item.status}`);
    if (item.details?.length) {
      for (const detail of item.details) {
        lines.push(`  - ${detail}`);
      }
    }
    if (item.evidence?.length) {
      lines.push("  - Evidence:");
      for (const evidence of item.evidence) {
        lines.push(`    - ${evidence}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
};

export const buildSubmitAuditReport = (
  baseUrl: string,
  startedAt: Date,
  finishedAt: Date,
  playwright: PlaywrightSummary,
  groups: AuditCheckGroup[],
): AuditReport => {
  const runId = startedAt.toISOString().replace(/[:.]/g, "-");
  const summary = toStatusCounts(groups);
  return {
    runId,
    baseUrl,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    playwright,
    summary,
    groups,
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
    `- Summary: OK=${report.summary.ok} / NG=${report.summary.ng} / WARN=${report.summary.warn} / INFO=${report.summary.info} (total ${report.summary.total})`,
  );
  lines.push("");
  for (const group of report.groups) {
    lines.push(formatGroupMarkdown(group));
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
