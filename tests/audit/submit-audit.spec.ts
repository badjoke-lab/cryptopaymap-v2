import fs from "node:fs/promises";
import path from "node:path";

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";

const PROOF_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X2LhQAAAAASUVORK5CYII=";

const nowTag = () => new Date().toISOString().replace(/[:.]/g, "-");

const buildOwnerPayload = () => {
  const tag = nowTag();
  return {
    kind: "owner",
    desiredStatusLabel: "Owner Verified",
    submitterName: "Audit Runner",
    submitterEmail: `audit-owner-${tag}@example.com`,
    placeName: `Audit Owner Place ${tag}`,
    country: "US",
    city: "New York",
    address: "123 Example St",
    ownerVerification: {
      method: "domain",
      domain: "example.com",
    },
    ownerPayment: {
      paymentUrl: "https://example.com/pay",
    },
  };
};

const buildCommunityPayload = () => {
  const tag = nowTag();
  return {
    kind: "community",
    desiredStatusLabel: "Community Verified",
    submitterName: "Audit Runner",
    submitterEmail: `audit-community-${tag}@example.com`,
    placeName: `Audit Community Place ${tag}`,
    country: "US",
    city: "Austin",
    address: "456 Example Ave",
    communityEvidenceUrls: ["https://example.com/community-1", "https://example.com/community-2"],
  };
};

const buildReportPayload = () => {
  const tag = nowTag();
  return {
    kind: "report",
    desiredStatusLabel: "Report（Takedown/修正）",
    submitterName: "Audit Runner",
    submitterEmail: `audit-report-${tag}@example.com`,
    placeName: `Audit Report Place ${tag}`,
    reportWrongWhat: "Incorrect payment details",
    reportEvidenceUrls: ["https://example.com/report-evidence"],
    reportAction: "hide",
  };
};

const submitPayload = async (
  request: any,
  payload: Record<string, unknown>,
  files?: Record<string, { name: string; mimeType: string; buffer: Buffer }>,
) => {
  const response = await request.post(`${BASE_URL}/api/submissions`, {
    multipart: {
      payload: JSON.stringify(payload),
      ...files,
    },
  });
  expect(response.status(), `Unexpected status for payload kind ${payload.kind}`).toBeGreaterThanOrEqual(200);
  expect(response.status(), `Unexpected status for payload kind ${payload.kind}`).toBeLessThan(300);
  const json = await response.json().catch(() => ({}));
  const submissionId = (json as { submissionId?: string }).submissionId;
  expect(typeof submissionId, `Missing submissionId for payload kind ${payload.kind}`).toBe("string");
  expect(
    submissionId?.length ?? 0,
    `Expected non-empty submissionId for payload kind ${payload.kind}`,
  ).toBeGreaterThan(0);
  return submissionId as string;
};

test.describe("Submit audit harness", () => {
  test("create owner/community/report submissions", async ({ request }) => {
    const proofBuffer = Buffer.from(PROOF_PNG_BASE64, "base64");
    const ownerId = await submitPayload(request, buildOwnerPayload(), {
      proof: {
        name: "proof.png",
        mimeType: "image/png",
        buffer: proofBuffer,
      },
    });
    const communityId = await submitPayload(request, buildCommunityPayload());
    const reportId = await submitPayload(request, buildReportPayload());

    const outputDir = path.join(process.cwd(), "scripts", "audit", "out");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "submission-ids.json");
    const payload = {
      owner: ownerId,
      community: communityId,
      report: reportId,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  });
});
