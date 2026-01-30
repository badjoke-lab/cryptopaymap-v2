import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { BASE_URL, prepareAuditFiles, trackSubmissionRequests, updateSubmissionIds } from "./submit-helpers";

const fillOwnerForm = async (page: Page) => {
  await page.goto(`${BASE_URL}/submit/owner`, { waitUntil: "domcontentloaded" });

  await page.getByText("Business name (required)").locator("..").locator("input").fill("Audit Owner Cafe");
  await page.getByText("Country (required)").locator("..").locator("select").selectOption("US");
  await page.getByText("City (required)").locator("..").locator("select").selectOption("New York");
  await page.getByText("Address (required)").locator("..").locator("input").fill("123 Audit St");
  await page.getByText("Category (required)").locator("..").locator("select").selectOption("cafe");
  await page.getByRole("checkbox", { name: "BTC" }).check();

  await page.getByText("Verification method (required)").locator("..").locator("select").selectOption("domain");
  await page.getByText("Domain to verify (required)").locator("..").locator("input").fill("audit-owner.example");

  await page.getByText("Payment URL (required: URL or screenshot)")
    .locator("..")
    .locator("input")
    .fill("https://audit-owner.example/pay");

  const fixtures = await prepareAuditFiles();
  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.nth(0).setInputFiles(fixtures.proof);
  await fileInputs.nth(1).setInputFiles(fixtures.gallery);

  await page.getByText("Name (required)").locator("..").locator("input").fill("Audit Owner Submitter");
  await page.getByText("Email (required)").locator("..").locator("input").fill("audit-owner@example.com");
};

test("audit owner submission (confirm-only POST)", async ({ page }) => {
  const requestUrls = trackSubmissionRequests(page);

  await fillOwnerForm(page);
  await page.getByRole("button", { name: "Confirm details" }).click();
  await page.waitForURL(/\\/submit\\/owner\\/confirm/);
  expect(requestUrls).toHaveLength(0);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/submissions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Final submit" }).click();
  const response = await responsePromise;
  const payload = (await response.json()) as { submissionId?: string };

  await page.waitForURL(/\\/submit\\/done/);

  expect(requestUrls).toHaveLength(1);
  expect(requestUrls.every((url) => url.includes("/submit/owner/confirm"))).toBe(true);
  expect(payload.submissionId).toBeTruthy();

  await updateSubmissionIds("owner", payload.submissionId ?? "");
});
