import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSubmission } from "../lib/submissions";

test("normalizeSubmission allows community payload without ownerVerification", () => {
  const result = normalizeSubmission({
    kind: "community",
    name: "Community Cafe",
    country: "US",
    city: "Austin",
    address: "123 Example St",
    category: "cafe",
    contactEmail: "community@example.com",
    acceptedChains: ["btc"],
    communityEvidenceUrls: ["https://example.com/evidence"],
  });

  assert.equal(result.ok, true);
});

test("normalizeSubmission requires ownerVerification for owner payloads", () => {
  const result = normalizeSubmission({
    kind: "owner",
    name: "Owner Cafe",
    country: "US",
    city: "Miami",
    address: "456 Example Ave",
    category: "cafe",
    contactEmail: "owner@example.com",
    acceptedChains: ["btc"],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors.ownerVerification, "Required");
  }
});
