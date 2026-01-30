import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";

export const BASE_URL = (process.env.BASE_URL || process.env.PW_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

const OUTPUT_DIR = path.join(process.cwd(), "scripts", "audit", "out");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "submission-ids.json");
const LOCK_PATH = path.join(OUTPUT_DIR, "submission-ids.lock");

const JPG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeF9j/2wBDARATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeF9j/wAARCAAQABADASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAIEB//EABYBAQEBAAAAAAAAAAAAAAAAAAECA//aAAwDAQACEAMQAAAB+gD/xAAZEAEAAwEBAAAAAAAAAAAAAAABABEhAjH/2gAIAQEAAT8AhGJtgn//xAAWEQEBAQAAAAAAAAAAAAAAAAABABH/2gAIAQIBAT8AYf/EABURAQEAAAAAAAAAAAAAAAAAAAAR/9oACAEDAQE/AV//2Q==";

export const prepareAuditFiles = async () => {
  const dir = path.join(os.tmpdir(), "cryptopaymap-audit");
  await fs.mkdir(dir, { recursive: true });
  const proof = path.join(dir, "audit-proof.jpg");
  const gallery = path.join(dir, "audit-gallery.jpg");
  const buffer = Buffer.from(JPG_BASE64, "base64");
  await Promise.all([fs.writeFile(proof, buffer), fs.writeFile(gallery, buffer)]);
  return { proof, gallery };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const acquireLock = async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await fs.open(LOCK_PATH, "wx");
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") {
        throw error;
      }
      await sleep(100);
    }
  }
  throw new Error("Timed out waiting for submission id lock.");
};

export const updateSubmissionIds = async (
  kind: "owner" | "community" | "report",
  submissionId: string,
) => {
  const lock = await acquireLock();
  try {
    const raw = await fs.readFile(OUTPUT_PATH, "utf8").catch(() => "");
    const existing = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const next = {
      owner: existing.owner ?? "",
      community: existing.community ?? "",
      report: existing.report ?? "",
      ...existing,
      [kind]: submissionId,
    };
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } finally {
    await lock.close();
    await fs.unlink(LOCK_PATH).catch(() => undefined);
  }
};

export const trackSubmissionRequests = (page: Page) => {
  const requestUrls: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/submissions")) {
      requestUrls.push(page.url());
    }
  });
  return requestUrls;
};
