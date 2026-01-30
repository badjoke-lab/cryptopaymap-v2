import { test, expect } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL || process.env.PW_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

const nowTag = () => new Date().toISOString().replace(/[:.]/g, "-");

const buildOwnerPayload = () => ({
  kind: "owner",
  verificationRequest: "owner",
  name: `Audit Owner Place ${nowTag()}`,
  placeName: `Audit Owner Place ${nowTag()}`,
  country: "US",
  city: "New York",
  address: "123 Example St",
  category: "cafe",
  acceptedChains: ["BTC"],
  contactEmail: `audit-owner-${nowTag()}@example.com`,
  contactName: "Audit Runner",
  submitterName: "Audit Runner",
  ownerVerification: "domain",
  communityEvidenceUrls: ["https://example.com/owner-evidence-1"],
  termsAccepted: true,
});

const buildCommunityPayload = () => ({
  kind: "community",
  verificationRequest: "community",
  name: `Audit Community Place ${nowTag()}`,
  placeName: `Audit Community Place ${nowTag()}`,
  country: "US",
  city: "Austin",
  address: "456 Example Ave",
  category: "restaurant",
  acceptedChains: ["BTC", "USDT"],
  contactEmail: `audit-community-${nowTag()}@example.com`,
  contactName: "Audit Runner",
  submitterName: "Audit Runner",
  ownerVerification: "domain",
  communityEvidenceUrls: ["https://example.com/community-1", "https://example.com/community-2"],
  termsAccepted: true,
});

const buildReportPayload = () => ({
  kind: "report",
  verificationRequest: "report",
  placeName: `Audit Report Place ${nowTag()}`,
  reportReason: "Incorrect payment details",
  reportAction: "hide",
  reportDetails: "Audit runner created report submission.",
});

const submitPayload = async (request: any, payload: Record<string, unknown>) => {
  const response = await request.post(`${BASE_URL}/api/submissions`, { data: payload });
  expect(response.status(), `Unexpected status for payload kind ${payload.kind}`).toBeGreaterThanOrEqual(200);
  expect(response.status(), `Unexpected status for payload kind ${payload.kind}`).toBeLessThan(500);
};

test.describe("Submit audit harness", () => {
  test("create owner/community/report submissions", async ({ request }) => {
    await submitPayload(request, buildOwnerPayload());
    await submitPayload(request, buildCommunityPayload());
    await submitPayload(request, buildReportPayload());
  });
});
