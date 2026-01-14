import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.PW_BASE_URL || "http://127.0.0.1:3201";

const FIXTURE_PATH = path.join(__dirname, "fixtures", "submission.min.json");
const SUBMISSION_FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

const META_FIXTURE = {
  categories: [SUBMISSION_FIXTURE.category],
  chains: SUBMISSION_FIXTURE.acceptedChains,
  payments: [],
  countries: [{ code: SUBMISSION_FIXTURE.country, name: "Japan" }],
  citiesByCountry: {
    [SUBMISSION_FIXTURE.country]: [SUBMISSION_FIXTURE.city],
  },
  verificationStatuses: ["unverified"],
};

test("submit smoke: minimal required fields submit and POST once", async ({ page }) => {
  let submissionCount = 0;
  let submissionPayload: Record<string, unknown> | null = null;

  await page.route("**/api/filters/meta", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/filters/meta") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(META_FIXTURE),
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/submissions", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/submissions" && request.method() === "POST") {
      submissionCount += 1;
      const payload = request.postDataJSON() as Record<string, unknown>;
      submissionPayload = payload;

      expect(payload.name).toBeTruthy();
      expect(payload.country).toBeTruthy();
      expect(payload.city).toBeTruthy();
      expect(payload.address).toBeTruthy();
      expect(payload.category).toBeTruthy();
      expect(payload.contactName).toBeTruthy();
      expect(payload.contactEmail).toBeTruthy();
      expect(payload.role).toBeTruthy();
      expect(payload.verificationRequest).toBeTruthy();

      const acceptedChains = payload.acceptedChains as unknown[] | undefined;
      expect(Array.isArray(acceptedChains)).toBe(true);
      expect(acceptedChains?.length).toBeGreaterThan(0);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, suggestedPlaceId: "smoke-id" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`${BASE_URL}/submit`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Submit a crypto-friendly place")).toBeVisible();

  const nameInput = page.getByText("Store name / 店舗名 (required)").locator("..").locator("input");
  await nameInput.fill(SUBMISSION_FIXTURE.name);

  const countrySelect = page.getByText("Country / 国 (required)").locator("..").locator("select");
  await countrySelect.selectOption(SUBMISSION_FIXTURE.country);

  const citySelect = page.getByText("City / 市区町村 (required)").locator("..").locator("select");
  await expect(citySelect).toBeVisible();
  await citySelect.selectOption(SUBMISSION_FIXTURE.city);

  const addressInput = page.getByText("Address / 住所 (required)").locator("..").locator("input");
  await addressInput.fill(SUBMISSION_FIXTURE.address);

  const categorySelect = page.getByText("Category / カテゴリー (required)").locator("..").locator("select");
  await categorySelect.selectOption(SUBMISSION_FIXTURE.category);

  const acceptedChain = page.getByLabel(SUBMISSION_FIXTURE.acceptedChains[0]);
  await acceptedChain.check();

  const submitterNameInput = page.getByText("Name / お名前 (required)").locator("..").locator("input");
  await submitterNameInput.fill(SUBMISSION_FIXTURE.submitterName);

  const submitterEmailInput = page.getByText("Email (required)").locator("..").locator("input");
  await submitterEmailInput.fill(SUBMISSION_FIXTURE.submitterEmail);

  const submissionResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().includes("/api/submissions"),
    { timeout: 20000 }
  );

  await page.getByRole("button", { name: "Submit / 送信" }).click();
  await submissionResponsePromise;

  await expect(page.getByText("Thanks for your submission!", { exact: false })).toBeVisible({
    timeout: 20000,
  });
  await expect.poll(() => submissionCount).toBe(1);
  expect(submissionPayload).not.toBeNull();
});
