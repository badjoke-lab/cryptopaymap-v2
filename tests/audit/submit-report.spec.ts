import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { BASE_URL, trackSubmissionRequests, updateSubmissionIds } from "./submit-helpers";

const fillReportForm = async (page: Page) => {
  await page.goto(`${BASE_URL}/submit/report`, { waitUntil: "domcontentloaded" });

  await page.getByText("Place name (required)").locator("..").locator("input").fill("Audit Report Place");
  await page.getByText("Reason (required)").locator("..").locator("input").fill("Incorrect payment details");
  await page
    .getByText("Requested action (required)")
    .locator("..")
    .locator("select")
    .selectOption("hide");
  await page
    .getByText("What is incorrect? (required)")
    .locator("..")
    .locator("textarea")
    .fill("Audit report notes: payment address does not work.");
  await page
    .getByText("Evidence URLs (required, one per line)")
    .locator("..")
    .locator("textarea")
    .fill("https://example.com/report-evidence-1");
};

test("audit report submission (confirm-only POST)", async ({ page }) => {
  const requestUrls = trackSubmissionRequests(page);

  await fillReportForm(page);
  await page.getByRole("button", { name: "Confirm details" }).click();
  await page.waitForURL(/\\/submit\\/report\\/confirm/);
  expect(requestUrls).toHaveLength(0);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/submissions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Final submit" }).click();
  const response = await responsePromise;
  const payload = (await response.json()) as { submissionId?: string };

  await page.waitForURL(/\\/submit\\/done/);

  expect(requestUrls).toHaveLength(1);
  expect(requestUrls.every((url) => url.includes("/submit/report/confirm"))).toBe(true);
  expect(payload.submissionId).toBeTruthy();

  await updateSubmissionIds("report", payload.submissionId ?? "");
});
