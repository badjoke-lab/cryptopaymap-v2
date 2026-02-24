import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeAcceptanceChainKey } from "../lib/stats/acceptance";

describe("normalizeAcceptanceChainKey", () => {
  it("maps empty chain values to unknown", () => {
    assert.equal(normalizeAcceptanceChainKey(""), "unknown");
    assert.equal(normalizeAcceptanceChainKey("   "), "unknown");
    assert.equal(normalizeAcceptanceChainKey(null), "unknown");
  });

  it("keeps existing chain values for top_chains and matrix rows", () => {
    const topChains = [{ key: normalizeAcceptanceChainKey(""), count: 4 }];
    const matrixRows = [{ asset: "btc", counts: { [normalizeAcceptanceChainKey("")]: 2 } }];

    assert.equal(topChains[0]?.key, "unknown");
    assert.equal(matrixRows[0]?.counts.unknown, 2);
  });
});
