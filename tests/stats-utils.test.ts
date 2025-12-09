import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { categoryTrends, countryRankings } from "../lib/stats/dashboard";
import { filterCategoryTrends, formatPeriodLabel, getCategoryNames, sortCountries } from "../lib/stats/utils";

describe("sortCountries", () => {
  it("sorts by the chosen metric and limits results", () => {
    const topTwo = sortCountries(countryRankings, "owner", 2);

    assert.equal(topTwo.length, 2);
    assert.ok(topTwo[0].owner >= topTwo[1].owner);
    assert.equal(topTwo[0].country, "United States");
  });

  it("defaults to total count when no sort key is provided", () => {
    const sorted = sortCountries(countryRankings);
    const totals = sorted.map((item) => item.total);

    assert.deepEqual([...totals].sort((a, b) => b - a), totals);
  });
});

describe("category trends helpers", () => {
  it("lists unique category names", () => {
    const categories = getCategoryNames(categoryTrends.weekly);

    assert.ok(categories.includes("Dining"));
    assert.ok(categories.includes("Retail"));
    assert.ok(categories.includes("Services"));
  });

  it("filters weekly and monthly entries for a category", () => {
    const diningWeekly = filterCategoryTrends(categoryTrends.weekly, "Dining");
    const diningMonthly = filterCategoryTrends(categoryTrends.monthly, "Dining");

    assert.equal(diningWeekly.length, 7);
    assert.equal(diningMonthly.length, 5);
    assert.ok(diningWeekly.every((entry) => entry.category === "Dining"));
    assert.ok(diningMonthly.every((entry) => entry.category === "Dining"));
  });
});

describe("formatPeriodLabel", () => {
  it("formats monthly periods", () => {
    assert.equal(formatPeriodLabel("2024-10"), "Oct 2024");
  });

  it("formats weekly date labels", () => {
    assert.equal(formatPeriodLabel("2024-10-07"), "Oct 7");
  });
});
