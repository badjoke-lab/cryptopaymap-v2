import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { BASE_URL, prepareAuditFiles, trackSubmissionRequests, updateSubmissionIds } from "./submit-helpers";

const fillCommunityForm = async (page: Page) => {
  await page.goto(`${BASE_URL}/submit/community`, { waitUntil: "domcontentloaded" });

  await page.getByText("Business name (required)").locator("..").locator("input").fill("Audit Community Bistro");
  await page.getByText("Country (required)").locator("..").locator("select").selectOption("US");
  await page.getByText("City (required)").locator("..").locator("select").selectOption("New York");
  await page.getByText("Address (required)").locator("..").locator("input").fill("456 Audit Ave");
  await page.getByText("Category (required)").locator("..").locator("select").selectOption("cafe");
  await page.getByRole("checkbox", { name: "BTC" }).check();

  await page.getByText("Verification method (required)").locator("..").locator("select").selectOption("domain");
  await page.getByText("Domain to verify (required)").locator("..").locator("input").fill("audit-community.example");

  const evidenceGroup = page.getByText("Community evidence URLs (required, at least 2)").locator("..");
  const evidenceInputs = evidenceGroup.locator('input[type="url"]');
  await evidenceInputs.nth(0).fill("https://example.com/community-evidence-1");
  await evidenceInputs.nth(1).fill("https://example.com/community-evidence-2");
  await page.getByRole("button", { name: "+ Add another URL" }).click();
  await evidenceInputs.nth(2).fill("https://example.com/community-evidence-3");

  const fixtures = await prepareAuditFiles();
  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.first().setInputFiles(fixtures.gallery);

  await page.getByText("Name (required)").locator("..").locator("input").fill("Audit Community Submitter");
  await page.getByText("Email (required)").locator("..").locator("input").fill("audit-community@example.com");
};

test("audit community submission (confirm-only POST)", async ({ page }) => {
  const requestUrls = trackSubmissionRequests(page);

  await fillCommunityForm(page);
  await page.getByRole("button", { name: "Confirm details" }).click();
  await page.waitForURL(/\\/submit\\/community\\/confirm/);
  expect(requestUrls).toHaveLength(0);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/submissions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Final submit" }).click();
  const response = await responsePromise;
  const payload = (await response.json()) as { submissionId?: string };

  await page.waitForURL(/\\/submit\\/done/);

  expect(requestUrls).toHaveLength(1);
  expect(requestUrls.every((url) => url.includes("/submit/community/confirm"))).toBe(true);
  expect(payload.submissionId).toBeTruthy();

  await updateSubmissionIds("community", payload.submissionId ?? "");
});
