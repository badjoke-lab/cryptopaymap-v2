import { spawn } from "child_process";
import path from "path";

import {
  buildSubmitAuditReport,
  collectSubmitAuditChecks,
  writeSubmitAuditReport,
} from "./report";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUTPUT_DIR = path.join(process.cwd(), "docs", "audit", "runs");

const runCommand = (command: string, args: string[], env: NodeJS.ProcessEnv) =>
  new Promise<number>((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });

    child.on("exit", (code) => {
      resolve(code ?? 1);
    });

    child.on("error", () => {
      resolve(1);
    });
  });

const runPlaywright = async () => {
  const env = {
    ...process.env,
    BASE_URL,
    PW_BASE_URL: BASE_URL,
  };

  const exitCode = await runCommand(
    "pnpm",
    ["exec", "playwright", "test", "tests/audit/submit-audit.spec.ts"],
    env,
  );

  return {
    status: exitCode === 0 ? "success" : "failed",
    exitCode,
  } as const;
};

const main = async () => {
  const startedAt = new Date();
  const playwright = await runPlaywright();
  const groups = await collectSubmitAuditChecks(process.cwd());
  const finishedAt = new Date();

  const report = buildSubmitAuditReport(BASE_URL, startedAt, finishedAt, playwright, groups);
  await writeSubmitAuditReport(OUTPUT_DIR, report);

  console.log("\nSubmit audit summary:");
  console.log(`Base URL: ${report.baseUrl}`);
  console.log(
    `Checks: OK=${report.summary.ok} NG=${report.summary.ng} WARN=${report.summary.warn} INFO=${report.summary.info}`,
  );
  console.log(`Playwright: ${report.playwright.status} (exit ${report.playwright.exitCode ?? "n/a"})`);
  console.log(`Report: ${OUTPUT_DIR}/submit-audit-latest.md`);

  const hasNg = report.summary.ng > 0;
  const exitCode = hasNg || report.playwright.exitCode !== 0 ? 1 : 0;
  process.exit(exitCode);
};

void main();
